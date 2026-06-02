/**
 * Blockchain Service (Real Blockchain + GenosDB Integration)
 * Executes real blockchain transactions and updates GenosDB reactively
 * @module marketplace/services/blockchain
 */

import { showToast } from './toast.js'

/** @type {object|null} Cached BlockchainManager instance */
let _blockchainManager = null

/** @type {object|null} Cached PinataService instance */
let _pinataService = null

/**
 * Lazy-load and cache BlockchainManager singleton
 * Uses same pattern as production marketplace (lib/ui/marketplace/utils.js)
 * @returns {Promise<object>} BlockchainManager instance
 */
async function getBlockchainManager() {
  if (!_blockchainManager) {
    const { getBlockchainManager: getBM } = await import('../../../../lib/blockchain/BlockchainManager.js')
    _blockchainManager = await getBM()
  }
  return _blockchainManager
}

/**
 * Lazy-load and initialize PinataService
 * @returns {Promise<object>} PinataService instance
 */
async function getPinataService() {
  if (!_pinataService) {
    const PinataService = await import('../../../../lib/blockchain/pinataService.js')
    const { PINATA_CONFIG } = await import('../../../../lib/config/marketplaceConfig.js')
    PinataService.init(PINATA_CONFIG.jwt)
    _pinataService = PinataService
  }
  return _pinataService
}

/**
 * Upload files to Pinata IPFS as folder structure
 *
 * Folder structure: ovgrid-nft-{tokenId}/
 *   ├── image.{ext}
 *   ├── metadata.json
 *   └── asset.{ext} (optional)
 *
 * @param {object} options - Upload options
 * @param {File} options.imageFile - Image file to upload
 * @param {string} options.imageUrl - Or use existing image URL
 * @param {File} options.assetFile - Optional asset file (3D model, etc.)
 * @param {string} options.assetUrl - Or use existing asset URL
 * @param {string} options.name - NFT name
 * @param {string} options.description - NFT description
 * @param {number} options.tokenId - Token ID for folder name
 * @param {string} options.collection - Collection name
 * @returns {Promise<object>} Upload result with URLs
 */
async function uploadToPinata({ imageFile, imageUrl, assetFile, assetUrl, tokenId }) {
  const pinata = await getPinataService()

  // Upload only image + asset (NO metadata.json - stored on-chain)
  return await pinata.uploadNFTFiles({
    imageFile,
    imageUrl,
    assetFile,
    assetUrl,
    tokenId
  })
}

/**
 * Get GenosDB instance
 * @returns {object} Database instance
 */
function getDb() {
  return window.db
}

// Track assets with pending offers from current user (in-memory, rebuilt on sync)
window.pendingOfferAssets = window.pendingOfferAssets ?? new Set()

/**
 * Get current user address
 * @returns {string} User wallet address
 */
function getCurrentUser() {
  return window.CURRENT_USER
}

/**
 * Get node value from db.get() result
 * According to GenosDB docs, db.get() returns { result } where result is:
 * { id, value, edges, timestamp } - the node object
 * We need result.value which contains the data saved with db.put()
 * @param {string} id - Node ID
 * @returns {Promise<object|null>} Node value or null
 */
async function getNodeValue(id) {
  const db = getDb()
  if (!db) return null

  const { result } = await db.get(id)
  if (!result) return null

  // result is the node object { id, value, edges, timestamp }
  return result.value ?? result
}

/**
 * Parse blockchain errors into user-friendly messages
 * @param {Error} error - Raw error from blockchain/ethers
 * @returns {string} User-friendly error message
 */
function parseBlockchainError(error) {
  const msg = error?.message || error?.toString() || 'Unknown error'
  const code = error?.code

  // Insufficient funds for gas
  if (code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds')) {
    return 'Insufficient funds. You need POL (MATIC) for gas fees.'
  }

  // User rejected transaction
  if (code === 'ACTION_REJECTED' || code === 4001 || msg.includes('user rejected')) {
    return 'Transaction cancelled by user'
  }

  // Insufficient token balance (ERC-20)
  if (msg.includes('ERC20InsufficientBalance') || msg.includes('transfer amount exceeds balance')) {
    return 'Insufficient OVG token balance'
  }

  // Not enough allowance
  if (msg.includes('ERC20InsufficientAllowance')) {
    return 'Token approval required. Please try again.'
  }

  // Asset not owned
  if (msg.includes('ERC1155InsufficientBalance') || msg.includes('insufficient balance')) {
    return 'You do not own this asset or insufficient quantity'
  }

  // Listing not found or already sold
  if (msg.includes('listing not found') || msg.includes('not active')) {
    return 'Listing not found or already sold'
  }

  // Already listed
  if (msg.includes('already listed')) {
    return 'This asset is already listed'
  }

  // Network issues
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return 'Network error. Please check your connection and try again.'
  }

  // AccessControl - unauthorized account (OpenZeppelin custom error 0xe2517d3f)
  if (msg.includes('0xe2517d3f') || msg.includes('AccessControlUnauthorizedAccount')) {
    return 'Permission denied. Your account does not have the required role for this action.'
  }

  // Contract revert with reason
  const revertMatch = msg.match(/reverted with reason string '([^']+)'/)
  if (revertMatch) {
    return revertMatch[1]
  }

  // Generic revert
  if (msg.includes('reverted') || msg.includes('revert')) {
    return 'Transaction reverted. Please try again.'
  }

  // Nonce issues
  if (msg.includes('nonce')) {
    return 'Transaction nonce error. Please refresh and try again.'
  }

  // Gas estimation failed
  if (msg.includes('cannot estimate gas') || msg.includes('gas required exceeds')) {
    return 'Transaction would fail. Check your balance or asset status.'
  }

  // Return shortened version of technical message
  if (msg.length > 100) {
    return msg.substring(0, 80) + '...'
  }

  return msg
}

/**
 * Execute blockchain transaction with loading overlay and GenosDB update
 * Blockchain-first: TX executes on-chain, then GenosDB is updated locally
 * Toast order: 1) Blockchain saving, 2) Local saving, 3) Complete
 * @param {string} action - Action name mapping to BlockchainManager method
 * @param {object} params - Transaction parameters
 * @param {object} options - Options { successMsg, errorMsg }
 * @param {Function} onSuccess - Callback to update GenosDB on success
 * @returns {Promise<object>} Transaction result
 */
export async function executeTx(action, params = {}, options = {}, onSuccess = null) {
  const { successMsg = 'Transaction successful!' } = options

  const overlay = document.getElementById('loadingOverlay')
  overlay?.classList.add('active')

  try {
    // Step 1: Blockchain operation
    showToast('info', 'Processing', 'Saving to blockchain...')

    const bm = await getBlockchainManager()

    // Resolve tokenId from GenosDB if assetId is a non-numeric string
    let tokenId = params.tokenId ?? params.assetId
    if (params.assetId && typeof params.assetId === 'string' && !/^\d+$/.test(params.assetId)) {
      const asset = await getNodeValue(params.assetId)
      if (asset?.tokenId) {
        tokenId = asset.tokenId
      } else {
        throw new Error('Asset has no tokenId. Sync from blockchain first.')
      }
    }

    // Resolve targetTokenId for global offers
    let targetTokenId = params.targetTokenId
    if (params.targetAssetId && typeof params.targetAssetId === 'string' && !/^\d+$/.test(params.targetAssetId)) {
      const targetAsset = await getNodeValue(params.targetAssetId)
      targetTokenId = targetAsset?.tokenId
    }
    params.targetTokenId = targetTokenId ?? params.targetAssetId

    // Build on-chain metadata if provided
    const hasMetadata = params.title || params.description || params.imageUrl || params.assetUrl
    const metadata = hasMetadata ? {
      title: params.title || '',
      description: params.description || '',
      imageUrl: params.imageUrl || params.image || '',
      assetUrl: params.assetUrl || ''
    } : null

    /** @type {Record<string, () => Promise<any>>} */
    const methods = {
      // Purchase & Sales
      purchase: () => bm.purchaseAsset(params.listingId),
      list: () => {
        const durationSec = (params.duration ?? 0) * 86400
        return metadata
          ? bm.createListingWithMetadata(tokenId, params.price, durationSec, metadata, params.paymentToken)
          : bm.createListing(tokenId, params.price, durationSec)
      },
      cancelListing: () => bm.cancelListing(params.listingId ?? params.id),
      updateListing: () => {
        const durationSeconds = (params.duration ?? 0) * 86400
        return bm.updateListing(params.listingId, params.price, durationSeconds)
      },

      // Rentals
      rent: () => bm.rentAsset(params.listingId),
      listForRent: () => metadata
        ? bm.createRentalListingWithMetadata(tokenId, params.dailyRate, (params.duration ?? 30) * 86400, metadata, params.paymentToken)
        : bm.createRentalListing(tokenId, params.dailyRate, (params.duration ?? 30) * 86400),
      updateRental: () => {
        const durationSeconds = (params.duration ?? 0) * 86400
        return bm.updateListing(params.listingId, params.dailyRate ?? 0, durationSeconds)
      },
      extendRental: () => bm.extendRental(params.rentalId ?? params.listingId),

      // Bids on listings
      placeBid: () => bm.placeBid(params.listingId ?? tokenId, params.amount),
      acceptBid: () => bm.acceptBid(params.listingId, params.bidder),
      withdrawBid: () => bm.withdrawBid(params.listingId),

      // Global offers (bids on assets, not listings)
      placeOffer: () => bm.placeGlobalBid(tokenId, params.amount),
      placeGlobalOffer: () => bm.placeGlobalBid(tokenId, params.amount),
      acceptOffer: () => bm.acceptGlobalBid(params.targetTokenId ?? tokenId, params.owner ?? params.bidder),
      rejectOffer: () => bm.withdrawGlobalBid(params.targetTokenId ?? tokenId),
      withdrawOffer: () => bm.withdrawGlobalBid(params.targetTokenId ?? tokenId),

      // Bundles
      createBundle: () => metadata
        ? bm.listBundleWithMetadata(params.tokenIds ?? params.assetIds, params.amounts ?? (params.tokenIds ?? params.assetIds).map(() => 1), params.price, metadata, params.paymentToken)
        : bm.listBundle(params.tokenIds ?? params.assetIds, params.amounts ?? (params.tokenIds ?? params.assetIds).map(() => 1), params.price, params.name),
      buyBundle: () => bm.purchaseBundle(params.bundleId),
      cancelBundle: () => bm.cancelBundle(params.bundleId ?? params.id),

      // Auctions
      createAuction: () => metadata
        ? bm.createAuctionWithMetadata(tokenId, 1, params.startPrice, (params.duration ?? 24) * 3600, params.paymentToken ?? bm.contracts?.token?.target, metadata)
        : bm.createAuction(tokenId, 1, params.startPrice, (params.duration ?? 24) * 3600, params.paymentToken ?? bm.contracts?.token?.target),
      cancelAuction: () => bm.cancelAuction(params.auctionId),
      updateAuction: () => {
        const durationSeconds = (params.duration ?? 1) * 86400
        return bm.updateAuction(params.auctionId, durationSeconds)
      },

      // Metadata updates
      setListingMetadata: () => bm.setListingMetadata(params.listingId, metadata),
      setBundleMetadata: () => bm.setBundleMetadata(params.bundleId, metadata),
      setAuctionMetadata: () => bm.setAuctionMetadata(params.auctionId, metadata),

      // Minting (land). Asset minting runs through MarketplaceService.mint() directly (uploads + mintAsset + on-chain metadata), not via executeTx.
      mintLand: () => bm.claimLand?.(params.x, params.z) ?? Promise.reject(new Error('Land claim not available')),

      // Royalties
      setRoyalty: () => bm.setRoyalty(tokenId, getCurrentUser(), params.percentage),

      // Transfer (ERC-1155 safeTransferFrom)
      transfer: async () => {
        const signer = await bm.getSigner()
        if (!signer) throw new Error('No signer available')
        const from = await signer.getAddress()
        const assetsWithSigner = bm.contracts.assets.connect(signer)
        const amount = params.amount || 1
        const tx = await assetsWithSigner.safeTransferFrom(from, params.recipient, BigInt(tokenId), BigInt(amount), '0x')
        return tx.wait()
      },

      // Batch operations
      batchBuy: async () => {
        for (const id of params.listingIds) await bm.purchaseAsset(id)
        return { hash: 'batch' }
      },
      batchList: async () => {
        const receipts = []
        for (const item of params.items) {
          let itemTokenId = item.tokenId ?? item.id
          if (typeof item.id === 'string' && !/^\d+$/.test(item.id)) {
            const asset = await getNodeValue(item.id)
            if (asset?.tokenId) itemTokenId = asset.tokenId
          }
          const tx = await bm.createListing(itemTokenId, item.price, (item.duration ?? 0) * 86400)
          const receipt = await tx.wait()
          receipts.push(receipt)
        }
        return { hash: 'batch', receipts }
      },

      // Admin actions
      toggleTrading: () => params.paused ? bm.pauseMarketplace() : bm.unpauseMarketplace(),
      toggleMarketplace: () => params.paused ? bm.pauseMarketplace() : bm.unpauseMarketplace(),
      withdrawFees: () => bm.withdrawMarketplaceFees()
    }

    const method = methods[action]
    if (!method) throw new Error(`Blockchain action not mapped: ${action}`)

    const receipt = await method()
    const result = {
      success: true,
      txHash: receipt?.hash ?? receipt?.transactionHash ?? `0x${Date.now().toString(16)}`,
      action,
      params,
      receipt
    }

    // Step 2: GenosDB local write (only if blockchain succeeded)
    if (onSuccess && typeof onSuccess === 'function') {
      showToast('info', 'Processing', 'Saving local data...')
      await onSuccess(result, params)
    }

    // Step 3: Complete
    overlay?.classList.remove('active')
    showToast('success', 'Complete', successMsg)

    if (typeof window.refreshCurrentView === 'function') {
      setTimeout(() => window.refreshCurrentView(), 100)
    }

    return result
  } catch (error) {
    console.error(`[executeTx] ${action} failed:`, error)
    overlay?.classList.remove('active')
    showToast('error', 'Error', parseBlockchainError(error))
    throw error
  }
}

/**
 * Create activity record
 * @param {string} type - Activity type (mint, purchase, sale, transfer, listing, bid, rental, batch_listing)
 * @param {object} data - Activity data
 */
async function createActivity(type, data) {
  const db = getDb()
  if (!db) return

  const currentUser = getCurrentUser()
  const timestamp = Date.now()
  const activityId = `activity_${timestamp}_${Math.random().toString(36).slice(2, 8)}`

  // Generate title based on type
  const titles = {
    mint: `Minted <strong>${data.title || 'Asset'}</strong>`,
    purchase: `Purchased <strong>${data.title || 'Asset'}</strong>`,
    sale: `Sold <strong>${data.title || 'Asset'}</strong>`,
    transfer: `Transferred <strong>${data.title || 'Asset'}</strong>`,
    listing: `Listed <strong>${data.title || 'Asset'}</strong>`,
    bid: `Placed bid on <strong>${data.title || 'Asset'}</strong>`,
    rental: `Rented <strong>${data.title || 'Asset'}</strong>`,
    batch_listing: `<strong>${data.title || 'Multiple items'}</strong>`
  }

  // Generate subtitle
  const counterpartyShort = data.counterparty
    ? `${data.counterparty.slice(0, 6)}...${data.counterparty.slice(-4)}`
    : null
  const subtitles = {
    transfer: counterpartyShort ? `To ${counterpartyShort}` : '',
    purchase: counterpartyShort ? `From ${counterpartyShort}` : '',
    sale: counterpartyShort ? `To ${counterpartyShort}` : '',
    rental: counterpartyShort ? `From ${counterpartyShort}` : ''
  }

  // Determine price display and class
  const isPositive = ['sale'].includes(type)
  const isNegative = ['purchase', 'rental', 'bid'].includes(type)
  const pricePrefix = isPositive ? '+' : isNegative ? '-' : ''

  await db.put({
    type,
    assetName: data.title || data.assetName,
    title: titles[type] || `${type} <strong>${data.title || 'Asset'}</strong>`,
    subtitle: subtitles[type] || '',
    price: data.price ? `${pricePrefix}${data.price}` : '--',
    priceClass: isPositive ? 'positive' : isNegative ? 'negative' : '',
    image: data.image,
    timestamp,
    // Fields for Personal filter
    owner: currentUser,
    from: type === 'transfer' ? currentUser : null,
    to: type === 'transfer' ? data.counterparty : null,
    buyer: type === 'purchase' ? currentUser : null,
    seller: type === 'sale' ? currentUser : (data.counterparty || null)
  }, activityId)
}

/** Blockchain service with GenosDB integration */
export const blockchain = {

  /**
   * Buy a listing - transfers asset to buyer (ERC-1155 style)
   * In the new model, listing.supply = quantity available for sale
   * @param {string} listingId - Listing ID
   * @param {number} price - Price per unit
   * @param {number} amount - Number of copies to buy (default: all available)
   */
  async buy(listingId, price, amount = null) {
    return executeTx('purchase', { listingId, price, amount }, {
      loadingMsg: 'Processing purchase...',
      successMsg: 'Purchase complete!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const listing = await getNodeValue(params.listingId)
      if (!listing) return

      const seller = listing.seller || listing.owner
      const availableSupply = listing.supply || 1
      const buyAmount = Math.min(params.amount || availableSupply, availableSupply)
      const currentUser = getCurrentUser()

      if (buyAmount >= availableSupply) {
        // Buying all copies - consolidate into buyer's record
        const buyerAssetId = `asset_${listing.tokenId}`
        const existingOwned = await getNodeValue(buyerAssetId)

        if (existingOwned) {
          // User already owns some - add to existing supply
          await db.put({
            ...existingOwned,
            supply: (existingOwned.supply || 0) + buyAmount,
            lastPurchase: Date.now()
          }, buyerAssetId)
        } else {
          // First purchase - create new record with consistent ID
          await db.put({
            ...listing,
            tokenId: listing.tokenId,
            owner: currentUser,
            supply: buyAmount,
            status: 'unlisted',
            price: null,
            priceNum: null,
            priceUsd: null,
            seller: null,
            originalAssetId: null,
            listingId: null,
            soldAt: Date.now(),
            buyer: currentUser
          }, buyerAssetId)
        }

        // Remove the original listing record
        await db.remove(params.listingId)
      } else {
        // Partial purchase - reduce listing supply, create buyer record
        const remainingSupply = availableSupply - buyAmount

        // Update listing with reduced supply
        await db.put({
          ...listing,
          tokenId: listing.tokenId,  // Preserve ERC-1155 tokenId
          supply: remainingSupply
        }, params.listingId)

        // Create or update buyer's record for this tokenId
        // ERC-1155: one balance per user/tokenId, consolidated
        if (!listing.tokenId) {
          console.warn('[Blockchain] Listing has no tokenId, buyer record may be inconsistent')
        }
        const buyerAssetId = `asset_${listing.tokenId}`
        const existingOwned = await getNodeValue(buyerAssetId)

        if (existingOwned) {
          // User already owns some of this tokenId - add to existing supply
          await db.put({
            ...existingOwned,
            supply: (existingOwned.supply || 0) + buyAmount,
            lastPurchase: Date.now()
          }, buyerAssetId)
        } else {
          // First purchase of this tokenId by user
          await db.put({
            ...listing,
            tokenId: listing.tokenId,
            owner: currentUser,
            supply: buyAmount,
            status: 'unlisted',
            price: null,
            priceNum: null,
            priceUsd: null,
            seller: null,
            originalAssetId: null,
            listingId: null,
            soldAt: Date.now(),
            buyer: currentUser
          }, buyerAssetId)
        }
      }

      // Invalidate pending offers if all copies sold
      if (buyAmount >= availableSupply) {
        const targetId = listing.originalAssetId || params.listingId
        const { results: pendingOffers } = await db.map({
          query: {
            status: 'offer',
            targetAssetId: targetId,
            offerStatus: 'pending'
          }
        })
        for (const offer of pendingOffers) {
          await db.put({
            ...offer.value,
            status: 'unlisted',
            offerStatus: 'expired'
          }, offer.id)
        }
      }

      await createActivity('purchase', {
        title: listing.title,
        price: listing.price,
        image: listing.image,
        counterparty: seller
      })
    })
  },

  /**
   * Rent a listing - creates rental agreement
   * In unified model, assetId has listing info directly
   */
  async rent(assetId, price, duration) {
    return executeTx('rent', { assetId, price, duration }, {
      loadingMsg: 'Processing rental...',
      successMsg: 'Rental confirmed!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const asset = await getNodeValue(params.assetId)
      if (!asset) return

      // Update asset with rental info
      await db.put({
        ...asset,
        status: 'rented',
        renter: getCurrentUser(),
        rentalStart: Date.now(),
        rentalEnd: Date.now() + (params.duration * 24 * 60 * 60 * 1000)
      }, params.assetId)

      await createActivity('rental', {
        title: asset.title,
        price: asset.price,
        image: asset.image,
        counterparty: asset.seller || asset.owner
      })
    })
  },

  /**
   * Place a bid on an auction
   * In unified model, assetId has auction info directly
   */
  async placeBid(assetId, amount) {
    return executeTx('placeBid', { assetId, amount }, {
      loadingMsg: 'Placing bid...',
      successMsg: 'Bid placed!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const asset = await getNodeValue(params.assetId)
      if (!asset) return

      // Update asset with new bid
      const bids = asset.bids || []
      bids.push({
        bidder: getCurrentUser(),
        amount: params.amount,
        timestamp: Date.now()
      })

      await db.put({
        ...asset,
        currentBid: params.amount,
        topBidder: getCurrentUser(),
        bids
      }, params.assetId)

      await createActivity('bid', {
        title: asset.title,
        price: `${params.amount} OVG`,
        image: asset.image
      })
    })
  },

  /**
   * Place an offer on an asset
   * Creates an asset with status='offer' (unified model)
   * Prevents duplicate offers from same user on same asset
   */
  async placeOffer(assetId, amount) {
    const db = getDb()
    if (!db) throw new Error('Database not available')

    const currentUser = getCurrentUser()

    // Resolve asset - try direct lookup, then with asset_ prefix (nodeId format)
    const asset = await getNodeValue(assetId) ?? await getNodeValue(`asset_${assetId}`)
    const tokenId = String(asset?.tokenId ?? assetId)

    // Check if user already has a pending offer on this asset
    if (window.pendingOfferAssets?.has(String(tokenId))) {
      showToast('warning', 'Offer Exists', 'You already have a pending offer on this asset')
      return { success: false, reason: 'duplicate_offer' }
    }

    return executeTx('placeOffer', { assetId, amount }, {
      loadingMsg: 'Placing offer...',
      successMsg: 'Offer sent!'
    }, async (result, params) => {
      // Use asset from closure (already resolved above)
      const nodeId = `offer_${tokenId}_${currentUser}`

      await db.put({
        id: nodeId,
        status: 'offer',
        owner: currentUser,
        assetId: tokenId,
        tokenId,
        targetOwner: asset?.owner || '',
        title: asset?.title || asset?.name || `Asset #${tokenId}`,
        image: asset?.image || '',
        collection: asset?.collection || 'Marketplace',
        category: asset?.category || '',
        rarity: asset?.rarity || '',
        price: `${params.amount} OVG`,
        priceNum: parseFloat(params.amount),
        offerStatus: 'pending',
        timestamp: Date.now(),
        isGlobal: true
      }, nodeId)

      window.pendingOfferAssets?.add(String(tokenId))

      // Update buyWizard offer button immediately
      const offerBtn = document.getElementById('buyOfferBtn')
      if (offerBtn) {
        offerBtn.disabled = true
        offerBtn.textContent = 'Offer Pending'
        offerBtn.classList.add('mp-btn-disabled')
        offerBtn.onclick = null
      }

      window.refreshCurrentView?.()
    })
  },

  /**
   * List an asset for sale (ERC-1155 style with partial listing)
   * @param {string} assetId - Asset ID
   * @param {number} price - Price per unit in OVG
   * @param {string} type - Listing type (sale, rent, auction)
   * @param {object} options - Optional parameters
   * @param {string} options.title - Custom title for listing
   * @param {string} options.description - Asset description
   * @param {number} options.amount - Number of copies to list (default: all)
   */
  async list(assetId, price, type = 'sale', options = {}) {
    return executeTx('list', { assetId, price, type, ...options }, {
      loadingMsg: 'Creating listing...',
      successMsg: 'Asset listed!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const asset = await getNodeValue(assetId)
      if (!asset) return

      // Extract blockchain listingId from transaction receipt
      let blockchainListingId = null
      if (result?.receipt?.logs) {
        try {
          const { getBlockchainManager } = await import('../../../../lib/blockchain/BlockchainManager.js')
          const bm = await getBlockchainManager()
          const listedEvent = result.receipt.logs.find(log => {
            try {
              const parsed = bm.contracts.marketplace.interface.parseLog(log)
              return parsed?.name === 'Listed'
            } catch { return false }
          })
          if (listedEvent) {
            const parsed = bm.contracts.marketplace.interface.parseLog(listedEvent)
            blockchainListingId = Number(parsed.args.listingId)
          }
        } catch (e) {
          console.warn('[Blockchain] Could not extract listingId from receipt:', e.message)
        }
      }

      // Normalize asset data - avoid using hash as title
      const isHash = (str) => str && (str.length > 30 || /^[a-f0-9-]{20,}$/i.test(str))
      const customTitle = params.title?.trim()
      const assetTitle = (asset.title && !isHash(asset.title)) ? asset.title
        : (asset.name && !isHash(asset.name)) ? asset.name
        : null
      const title = customTitle || assetTitle || 'Untitled Item'
      const collection = (asset.collection && !isHash(asset.collection)) ? asset.collection : 'Marketplace'
      const category = asset.category || 'objects'
      const rarity = asset.rarity || 'common'
      const image = asset.image || `https://picsum.photos/seed/${assetId}/400/400`
      const description = params.description ?? asset.description ?? ''

      // ERC-1155: amount to list (default: all available supply)
      const totalSupply = asset.supply || 1
      const listAmount = Math.min(params.amount || totalSupply, totalSupply)
      const royaltyPct = params.royalty ?? asset.royaltyPct ?? 5
      const currentUser = getCurrentUser()

      // Listing data for the new or updated record
      // Preserve tokenId for ERC-1155 asset identification
      // Include blockchain listingId for cancel/update operations
      const listingData = {
        ...asset,
        tokenId: asset.tokenId,  // Preserve ERC-1155 tokenId
        listingId: blockchainListingId,  // Blockchain listing ID for cancel/update
        status: params.type,  // 'sale', 'rent', 'auction'
        price: `${params.price} OVG`,
        priceNum: parseFloat(params.price),
        priceUsd: `~$${Math.floor(parseFloat(params.price) * 1900)}`,
        royalty: `${royaltyPct}%`,
        royaltyPct,
        supply: listAmount,
        title,
        description,
        collection,
        category,
        rarity,
        image,
        seller: currentUser,
        listedAt: Date.now(),
        duration: (params.duration ?? 0) * 86400 // Store seconds (contract unit)
      }

      // Validate tokenId exists (required - comes from blockchain sync)
      if (!asset.tokenId) {
        throw new Error('Asset has no tokenId. Sync from blockchain first.')
      }

      if (listAmount < totalSupply) {
        // Partial listing: split into two records
        // 1. Update original asset with remaining supply (stays unlisted)
        const remainingSupply = totalSupply - listAmount
        await db.put({
          ...asset,
          tokenId: asset.tokenId,  // Preserve ERC-1155 tokenId
          supply: remainingSupply,
          title,
          description,
          collection,
          category,
          rarity,
          image
        }, assetId)

        // 2. Create new listing record for the listed amount
        // Use blockchain listingId as primary identifier (source of truth)
        const nodeId = blockchainListingId
          ? `listing_${blockchainListingId}`
          : `${asset.tokenId}_listing_${Date.now()}`  // Fallback only if receipt parsing failed
        await db.put({
          ...listingData,
          tokenId: asset.tokenId,  // Preserve ERC-1155 tokenId
          originalAssetId: assetId  // Reference to parent record (for cancel)
        }, nodeId)
      } else {
        // Full listing: update the original asset
        await db.put(listingData, assetId)
      }

      await createActivity('listing', { title, price: `${params.price} OVG`, image })
    })
  },

  /**
   * Cancel a listing - follows GenosDB pattern: db.get(id) → db.put(updated, id)
   * For partial listings, returns supply to original asset
   * @param {string} id - Asset hash or listing ID
   */
  async cancelListing(id) {
    // Get the listing first to extract the blockchain listingId
    const listing = await getNodeValue(id)
    if (!listing) {
      throw new Error('Listing not found')
    }

    // Get the numeric listingId - if not stored, look it up from blockchain
    let blockchainListingId = listing.listingId
    if (!blockchainListingId || typeof blockchainListingId !== 'number') {
      // Extract tokenId from the asset
      const tokenId = listing.tokenId ?? listing.assetId
      if (tokenId) {
        const { getBlockchainManager } = await import('../../../../lib/blockchain/BlockchainManager.js')
        const bm = await getBlockchainManager()
        const activeListing = await bm.getActiveListingForAsset(tokenId)
        if (activeListing?.listingId) {
          blockchainListingId = activeListing.listingId
        }
      }
    }

    if (!blockchainListingId || typeof blockchainListingId !== 'number') {
      throw new Error('Could not find active listing on blockchain')
    }

    return executeTx('cancelListing', { id, listingId: blockchainListingId }, {
      loadingMsg: 'Canceling listing...',
      successMsg: 'Listing canceled!'
    }, async () => {
      const db = getDb()
      if (!db) return

      // listing already fetched above
      const listedSupply = listing.supply || 1

      // Check if this is a partial listing (has originalAssetId)
      if (listing.originalAssetId) {
        // Return supply to original asset
        const originalAsset = await getNodeValue(listing.originalAssetId)
        if (originalAsset) {
          const newSupply = (originalAsset.supply || 0) + listedSupply
          await db.put({
            ...originalAsset,
            supply: newSupply
          }, listing.originalAssetId)
        }
        // Remove the listing record
        await db.remove(id)
      } else {
        // Full listing: just update status to unlisted
        await db.put({
          ...listing,
          status: 'unlisted',
          price: null,
          priceNum: null,
          priceUsd: null,
          seller: null
        }, id)
      }
    })
  },

  /**
   * Update listing price and/or name
   * @param {string} id - Asset hash
   * @param {number|object} priceOrOptions - Price number or { price, name }
   */
  async updateListing(id, priceOrOptions) {
    const { price, title, description, royalty, duration } = typeof priceOrOptions === 'object'
      ? priceOrOptions
      : { price: priceOrOptions, title: null, description: null, royalty: null, duration: null }

    // Resolve blockchain listingId from stored asset
    const asset = await getNodeValue(id)
    const listingId = asset?.listingId

    return executeTx('updateListing', { id, price, title, description, royalty, duration, listingId }, {
      loadingMsg: 'Updating listing...',
      successMsg: 'Listing updated!'
    }, async () => {
      const db = getDb()
      if (!db || !asset) return

      const updates = { ...asset }
      if (price) {
        updates.price = `${price} OVG`
        updates.priceNum = parseFloat(price)
        updates.priceUsd = `~$${Math.floor(parseFloat(price) * 1900)}`
      }
      if (title) {
        updates.title = title
      }
      if (description !== null && description !== undefined) {
        updates.description = description
      }
      if (royalty !== null && royalty !== undefined) {
        updates.royalty = `${royalty}%`
        updates.royaltyPct = royalty
      }
      if (duration !== null && duration !== undefined) {
        updates.duration = duration * 86400 // Store seconds (contract unit)
      }

      await db.put(updates, id)
    })
  },

  /**
   * Accept an offer (unified model: offer is asset with status='offer')
   */
  async acceptOffer(offerId) {
    // Get offer data first to extract targetAssetId and bidder (required for blockchain call)
    const offer = await getNodeValue(offerId)
    if (!offer) {
      throw new Error('Offer not found')
    }

    const targetAssetId = offer.targetAssetId ?? offer.assetId ?? offer.tokenId
    if (!targetAssetId) {
      throw new Error('Offer has no target asset ID')
    }

    // The bidder is the offer owner (the one who made the offer)
    const bidder = offer.owner ?? offer.bidder
    if (!bidder) {
      throw new Error('Offer has no bidder address')
    }

    return executeTx('acceptOffer', { offerId, targetAssetId, bidder }, {
      loadingMsg: 'Accepting offer...',
      successMsg: 'Offer accepted!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      // Remove the offer record
      await db.remove(params.offerId)

      // Transfer target asset to offer owner (buyer)
      const assetNodeId = offer.targetAssetId ?? offer.assetId ?? offer.tokenId
      if (assetNodeId) {
        const asset = await getNodeValue(assetNodeId)
        if (asset) {
          await db.put({
            ...asset,
            owner: offer.owner,
            status: 'unlisted'
          }, assetNodeId)

          await createActivity('sale', {
            title: asset.title,
            price: `${offer.price || offer.offerAmount} OVG`,
            image: asset.image,
            counterparty: offer.owner
          })
        }
      }

      window.refreshCurrentView?.()
    })
  },

  /**
   * Reject an offer (unified model)
   */
  async rejectOffer(offerId) {
    // Get offer data first to extract targetAssetId (required for blockchain call)
    const offer = await getNodeValue(offerId)
    if (!offer) {
      throw new Error('Offer not found')
    }

    const targetAssetId = offer.targetAssetId ?? offer.assetId ?? offer.tokenId
    if (!targetAssetId) {
      throw new Error('Offer has no target asset ID')
    }

    return executeTx('rejectOffer', { offerId, targetAssetId }, {
      loadingMsg: 'Rejecting offer...',
      successMsg: 'Offer rejected!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      await db.remove(params.offerId)
      window.refreshCurrentView?.()
    })
  },

  /**
   * Withdraw/Cancel an offer (unified model)
   */
  async withdrawOffer(offerId) {
    // Get offer data first to extract targetAssetId (required for blockchain call)
    const offer = await getNodeValue(offerId)
    if (!offer) {
      throw new Error('Offer not found')
    }

    const targetAssetId = offer.targetAssetId ?? offer.assetId ?? offer.tokenId
    if (!targetAssetId) {
      throw new Error('Offer has no target asset ID')
    }

    return executeTx('withdrawOffer', { offerId, targetAssetId }, {
      loadingMsg: 'Canceling offer...',
      successMsg: 'Offer canceled!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      window.pendingOfferAssets?.delete(String(targetAssetId))
      await db.remove(params.offerId)
      window.refreshCurrentView?.()
    })
  },

  /**
   * Transfer asset to another user (ERC-1155 safeTransferFrom)
   * @param {string} assetId - Asset GenosDB ID
   * @param {string} recipient - Recipient wallet address
   * @param {number} amount - Number of units to transfer (default: 1)
   */
  async transfer(assetId, recipient, amount = 1) {
    return executeTx('transfer', { assetId, recipient, amount }, {
      loadingMsg: 'Transferring asset...',
      successMsg: 'Asset transferred!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const asset = await getNodeValue(params.assetId)
      if (!asset) return

      const currentSupply = asset.supply || 1
      const transferAmount = Math.min(params.amount || 1, currentSupply)
      const remainingSupply = currentSupply - transferAmount

      if (remainingSupply > 0) {
        // Partial transfer: reduce supply of original asset
        await db.put({
          ...asset,
          supply: remainingSupply
        }, params.assetId)
      } else {
        // Full transfer: remove from current owner's inventory
        await db.remove(params.assetId)
      }

      await createActivity('transfer', {
        title: asset.title,
        image: asset.image,
        counterparty: params.recipient
      })
    })
  },

  /**
   * Buy a bundle
   */
  async buyBundle(bundleId, price) {
    return executeTx('buyBundle', { bundleId, price }, {
      loadingMsg: 'Purchasing bundle...',
      successMsg: 'Bundle purchased!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const bundle = await getNodeValue(params.bundleId)
      if (!bundle) return

      // Mark bundle as sold
      await db.put({
        ...bundle,
        status: 'sold',
        buyer: getCurrentUser()
      }, params.bundleId)

      // Transfer all assets in bundle to buyer
      if (bundle.assetIds) {
        for (const assetId of bundle.assetIds) {
          const asset = await getNodeValue(assetId)
          if (asset) {
            await db.put({
              ...asset,
              owner: getCurrentUser(),
              status: 'unlisted',
              bundleId: null
            }, assetId)
          }
        }
      }

      await createActivity('purchase', {
        title: bundle.title,
        price: bundle.price,
        image: bundle.image,
        counterparty: bundle.seller
      })
    })
  },

  /**
   * Create a bundle from multiple assets
   * @param {Array} assetIds - Array of asset IDs to include
   * @param {string} name - Bundle name
   * @param {number} price - Bundle price in OVG
   * @param {string} description - Bundle description
   */
  async createBundle(assetIds, name, price, description = '') {
    // Resolve tokenIds for blockchain (ERC-1155 requires numeric IDs)
    const tokenIds = []
    for (const assetId of assetIds) {
      const asset = await getNodeValue(assetId)
      if (asset?.tokenId) {
        tokenIds.push(asset.tokenId)
      } else {
        throw new Error(`Asset has no tokenId. Sync from blockchain first.`)
      }
    }

    return executeTx('createBundle', { assetIds, tokenIds, name, price, description }, {
      loadingMsg: 'Creating bundle...',
      successMsg: 'Bundle created!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      // Extract blockchain bundleId from transaction receipt
      let blockchainBundleId = null
      if (result?.receipt?.logs) {
        try {
          const { getBlockchainManager } = await import('../../../../lib/blockchain/BlockchainManager.js')
          const bm = await getBlockchainManager()
          const bundleEvent = result.receipt.logs.find(log => {
            try {
              const parsed = bm.contracts.marketplace.interface.parseLog(log)
              return parsed?.name === 'BundleListed'
            } catch { return false }
          })
          if (bundleEvent) {
            const parsed = bm.contracts.marketplace.interface.parseLog(bundleEvent)
            blockchainBundleId = Number(parsed.args.bundleId)
          }
        } catch (e) {
          console.warn('[Blockchain] Could not extract bundleId from receipt:', e.message)
        }
      }

      // Gather bundle items
      const bundleItems = []
      for (const assetId of params.assetIds) {
        const asset = await getNodeValue(assetId)
        if (asset) {
          bundleItems.push({
            title: asset.title,
            image: asset.image
          })
        }
      }

      // Create bundle as a new asset (groups multiple assets)
      // Use blockchain bundleId as primary identifier (source of truth)
      const bundleId = blockchainBundleId
        ? `bundle_${blockchainBundleId}`
        : `bundle_${Date.now()}`  // Fallback only if receipt parsing failed
      await db.put({
        status: 'bundle',
        isBundle: true,
        bundleId: blockchainBundleId,  // Blockchain bundle ID for cancel/update
        assetIds: params.assetIds,
        bundleItems,
        title: params.name,
        description: params.description || '',
        collection: 'My Bundles',
        category: 'collections',
        rarity: 'epic',
        price: `${params.price} OVG`,
        priceNum: parseFloat(params.price),
        priceUsd: `~$${Math.floor(parseFloat(params.price) * 1900)}`,
        image: bundleItems[0]?.image || 'https://picsum.photos/seed/bundle/400/400',
        owner: getCurrentUser(),
        seller: getCurrentUser(),
        listedAt: Date.now(),
        timestamp: Date.now()
      }, bundleId)

      // Count how many units of each asset are used in the bundle
      const assetUsageCount = new Map()
      for (const assetId of params.assetIds) {
        assetUsageCount.set(assetId, (assetUsageCount.get(assetId) || 0) + 1)
      }

      // Update assets: reduce supply or mark as bundled
      for (const [assetId, usedUnits] of assetUsageCount) {
        const asset = await getNodeValue(assetId)
        if (asset) {
          const currentSupply = asset.supply || 1
          const remainingSupply = currentSupply - usedUnits

          if (remainingSupply > 0) {
            // Keep asset with reduced supply
            await db.put({
              ...asset,
              supply: remainingSupply
            }, assetId)
          } else {
            // All units used, mark as bundled
            await db.put({
              ...asset,
              status: 'bundled',
              bundleId
            }, assetId)
          }
        }
      }
    })
  },

  /**
   * Create an auction
   */
  async createAuction(assetId, startPrice, reservePrice, duration) {
    return executeTx('createAuction', { assetId, startPrice, reservePrice, duration }, {
      loadingMsg: 'Creating auction...',
      successMsg: 'Auction created!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const asset = await getNodeValue(params.assetId)
      if (!asset) return

      // Normalize asset data - avoid using hash as title
      const isHash = (str) => str && (str.length > 30 || /^[a-f0-9-]{20,}$/i.test(str))
      const title = (asset.title && !isHash(asset.title)) ? asset.title
        : (asset.name && !isHash(asset.name)) ? asset.name
        : 'Untitled Item'
      const collection = (asset.collection && !isHash(asset.collection)) ? asset.collection : 'Marketplace'
      const category = asset.category || 'objects'
      const rarity = asset.rarity || 'common'
      const image = asset.image || `https://picsum.photos/seed/${params.assetId}/400/400`

      const durationSeconds = (params.duration ?? 0) * 3600 // Auction params in hours → seconds
      const endsAt = Date.now() + (durationSeconds * 1000)

      // Update asset directly with auction info (no separate listing record)
      // CRITICAL: Save auctionId from blockchain result for cancelAuction to work
      // Note: BlockchainManager.createAuction returns { receipt, auctionId }, so result.receipt contains { receipt, auctionId }
      const auctionId = result.receipt?.auctionId ?? result.auctionId
      await db.put({
        ...asset,
        status: 'auction',
        auctionId,  // From blockchain event - required for cancel
        price: `${params.startPrice} OVG`,
        priceNum: parseFloat(params.startPrice),
        reservePrice: params.reservePrice,
        currentBid: null,
        topBidder: null,
        bids: [],
        duration: durationSeconds, // Seconds (contract unit)
        endsAt,
        title,
        collection,
        category,
        rarity,
        image,
        seller: getCurrentUser(),
        listedAt: Date.now()
      }, params.assetId)
    })
  },

  /**
   * Cancel an auction - follows GenosDB pattern
   * Handles "Listing already inactive" by syncing GenosDB state
   * @param {string} id - Asset ID or Listing ID
   */
  async cancelAuction(id) {
    const asset = await getNodeValue(id)
    if (!asset) throw new Error('Auction not found')

    const db = getDb()
    const tokenId = asset.tokenId ?? asset.assetId

    // Get auctionId - auctions have their own ID system separate from listings
    // CRITICAL: auctionId must be saved when creating auction (see createAuction)
    let auctionId = asset.auctionId
    if (!auctionId || typeof auctionId !== 'number') {
      if (tokenId) {
        const { getBlockchainManager } = await import('../../../../lib/blockchain/BlockchainManager.js')
        const bm = await getBlockchainManager()
        // Find active auction for this asset by comparing tokenId (convert to Number for safe comparison)
        const activeAuctions = await bm.getActiveAuctions({ forceRefresh: true })
        const numericTokenId = Number(tokenId)
        const auction = activeAuctions.find(a => Number(a.assetId) === numericTokenId)
        auctionId = auction?.auctionId
      }
    }

    if (!auctionId) throw new Error('No active auction found for this asset')

    return executeTx('cancelAuction', { id, auctionId }, {
      loadingMsg: 'Cancelling auction...',
      successMsg: 'Auction cancelled!'
    }, async () => {
      if (!db) return
      // Same pattern as cancelListing - just update status to unlisted
      await db.put({
        ...asset,
        status: 'unlisted',
        price: null,
        priceNum: null,
        seller: null,
        endsAt: null,
        auctionId: null
      }, id)
    })
  },

  /**
   * Update auction duration (requires blockchain tx if auctionId exists)
   * @param {string} id - Asset hash (GenosDB node ID)
   * @param {object} options - { reserve, duration, title, description }
   */
  async updateAuction(id, { reserve, duration, title, description }) {
    // Get asset to find auctionId
    const auction = await getNodeValue(id)
    if (!auction) {
      throw new Error('Auction not found')
    }

    // Validate auctionId exists (required for blockchain tx)
    if (!auction.auctionId && auction.auctionId !== 0) {
      throw new Error('Auction has no auctionId - cannot update on blockchain. Try canceling and creating a new auction.')
    }

    // Pass auctionId for blockchain tx (duration is in days, convert to seconds for contract)
    return executeTx('updateAuction', {
      id,
      auctionId: auction.auctionId,
      reserve,
      duration,
      title,
      description
    }, {
      loadingMsg: 'Updating auction...',
      successMsg: 'Auction updated!'
    }, async (result) => {
      const db = getDb()
      if (!db) return

      // Build update object
      const updates = { ...auction }
      if (reserve !== undefined) {
        updates.reservePrice = reserve
      }
      if (duration !== undefined) {
        const durationSeconds = duration * 86400 // Wizards pass days → store seconds
        updates.duration = durationSeconds
        // Update endsAt from blockchain newEndTime or calculate locally
        if (result?.receipt?.newEndTime) {
          updates.endsAt = result.receipt.newEndTime * 1000 // Convert to ms
        } else if (auction.listedAt) {
          updates.endsAt = auction.listedAt + (durationSeconds * 1000)
        }
      }
      if (title) {
        updates.title = title
      }
      if (description !== undefined) {
        updates.description = description
      }

      await db.put(updates, id)
    })
  },

  /**
   * List for rent
   * @param {string} assetId - Asset hash
   * @param {number} dailyRate - Daily rental rate in OVG
   * @param {number} duration - Rental duration in days
   * @param {object} options - Optional { title, description }
   */
  async listForRent(assetId, dailyRate, duration, options = {}) {
    return executeTx('listForRent', { assetId, dailyRate, duration, ...options }, {
      loadingMsg: 'Creating rental listing...',
      successMsg: 'Asset listed for rent!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const asset = await getNodeValue(params.assetId)
      if (!asset) return

      // Normalize asset data
      const isHash = (str) => str && (str.length > 30 || /^[a-f0-9-]{20,}$/i.test(str))
      const customTitle = params.title?.trim()
      const assetTitle = (asset.title && !isHash(asset.title)) ? asset.title
        : (asset.name && !isHash(asset.name)) ? asset.name
        : null
      const title = customTitle || assetTitle || 'Untitled Item'
      const description = params.description ?? asset.description ?? ''

      // Update asset directly with rental info
      await db.put({
        ...asset,
        status: 'rent',
        price: `${params.dailyRate} OVG/day`,
        priceNum: parseFloat(params.dailyRate),
        dailyRate: params.dailyRate,
        duration: (params.duration ?? 0) * 86400, // Seconds (contract unit)
        title,
        description,
        seller: getCurrentUser(),
        listedAt: Date.now()
      }, params.assetId)
    })
  },

  // Batch operations
  async batchBuy(listingIds) {
    return executeTx('batchBuy', { listingIds }, {
      loadingMsg: 'Processing batch purchase...',
      successMsg: 'All items purchased!'
    }, async (result, params) => {
      for (const listingId of params.listingIds) {
        await blockchain.buy(listingId, 0)
      }
    })
  },

  /**
   * Batch list multiple assets for sale
   * @param {Array} items - Array of {id, price} objects
   */
  async batchList(items) {
    return executeTx('batchList', { items }, {
      loadingMsg: 'Listing items...',
      successMsg: 'All items listed!'
    }, async (result, { items }) => {
      const db = getDb()
      if (!db) return

      const isHash = (str) => str && (str.length > 30 || /^[a-f0-9-]{20,}$/i.test(str))

      // Count how many units of each asset are being listed
      const assetUsageCount = new Map()
      for (const item of items) {
        assetUsageCount.set(item.id, (assetUsageCount.get(item.id) || 0) + 1)
      }

      // First, reduce supply of all affected assets
      for (const [assetId, usedUnits] of assetUsageCount) {
        const asset = await getNodeValue(assetId)
        if (!asset) continue

        const currentSupply = asset.supply || 1
        const remainingSupply = currentSupply - usedUnits

        if (remainingSupply > 0) {
          // Reduce original supply
          await db.put({
            ...asset,
            supply: remainingSupply
          }, assetId)
        }
      }

      // Extract listingIds from blockchain receipts
      const blockchainListingIds = []
      if (result?.receipts) {
        const { getBlockchainManager } = await import('../../../../lib/blockchain/BlockchainManager.js')
        const bm = await getBlockchainManager()
        for (const receipt of result.receipts) {
          try {
            const listedEvent = receipt.logs?.find(log => {
              try {
                const parsed = bm.contracts.marketplace.interface.parseLog(log)
                return parsed?.name === 'Listed'
              } catch { return false }
            })
            if (listedEvent) {
              const parsed = bm.contracts.marketplace.interface.parseLog(listedEvent)
              blockchainListingIds.push(Number(parsed.args.listingId))
            } else {
              blockchainListingIds.push(null)
            }
          } catch {
            blockchainListingIds.push(null)
          }
        }
      }

      // Then, create individual listings for each selected unit (each with supply=1)
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const asset = await getNodeValue(item.id)
        if (!asset) continue

        const title = (asset.title && !isHash(asset.title)) ? asset.title
          : (asset.name && !isHash(asset.name)) ? asset.name
          : 'Untitled Item'
        const collection = (asset.collection && !isHash(asset.collection)) ? asset.collection : 'Marketplace'
        const price = parseFloat(item.price)

        // Use blockchain listingId if available, fallback to local ID
        const blockchainListingId = blockchainListingIds[i]
        const nodeId = blockchainListingId
          ? `listing_${blockchainListingId}`
          : `listing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

        const { supply: _omit, ...assetWithoutSupply } = asset
        await db.put({
          ...assetWithoutSupply,
          tokenId: asset.tokenId,
          listingId: blockchainListingId,  // Store blockchain listingId
          supply: 1,  // Each listing is for 1 unit
          status: 'sale',
          originalAssetId: item.id,
          price: `${price.toFixed(2)} OVG`,
          priceNum: price,
          priceUsd: `~$${Math.floor(price * 355)}`,
          title,
          collection,
          seller: getCurrentUser(),
          listedAt: Date.now()
        }, nodeId)
      }

      await createActivity('batch_listing', {
        title: `${items.length} items listed`,
        price: `${items.reduce((sum, i) => sum + parseFloat(i.price), 0).toFixed(2)} OVG total`
      })
    })
  },

  /**
   * Update rental listing (requires blockchain tx if listingId exists)
   * @param {string} id - Asset hash
   * @param {object} options - { dailyRate, duration, title, description }
   */
  async updateRental(id, options) {
    const { dailyRate, duration, title, description } = options

    // Get asset to find listingId
    const rental = await getNodeValue(id)
    if (!rental) {
      throw new Error('Rental not found')
    }

    // Validate listingId exists (required for blockchain tx)
    if (!rental.listingId && rental.listingId !== 0) {
      throw new Error('Rental has no listingId - cannot update on blockchain. Try canceling and creating a new listing.')
    }

    // Pass listingId for blockchain tx
    return executeTx('updateRental', {
      id,
      listingId: rental.listingId,
      dailyRate,
      duration,
      title,
      description
    }, {
      loadingMsg: 'Updating rental...',
      successMsg: 'Rental updated!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const updates = {
        ...rental,
        dailyRate: params.dailyRate,
        duration: (params.duration ?? 0) * 86400, // Seconds (contract unit)
        price: `${params.dailyRate} OVG/day`,
        priceNum: parseFloat(params.dailyRate)
      }

      if (params.title) {
        updates.title = params.title
      }
      if (params.description !== null && params.description !== undefined) {
        updates.description = params.description
      }

      await db.put(updates, params.id)
    })
  },

  /**
   * Cancel a bundle listing
   * @param {string} id - Bundle GenosDB hash
   */
  async cancelBundle(id) {
    // Get the bundle first to extract the blockchain bundleId
    const bundle = await getNodeValue(id)
    if (!bundle) {
      throw new Error('Bundle not found')
    }

    // Get the numeric bundleId from stored data
    const blockchainBundleId = bundle.bundleId
    if (!blockchainBundleId || typeof blockchainBundleId !== 'number') {
      throw new Error('Bundle has no blockchain ID. May be a local-only bundle.')
    }

    return executeTx('cancelBundle', { id, bundleId: blockchainBundleId }, {
      loadingMsg: 'Cancelling bundle...',
      successMsg: 'Bundle cancelled!'
    }, async (result, { id }) => {
      const db = getDb()
      if (!db) return

      // bundle already fetched above

      // Count how many units of each asset are in the bundle
      const assetUsageCount = new Map()
      for (const assetId of (bundle.assetIds || [])) {
        assetUsageCount.set(assetId, (assetUsageCount.get(assetId) || 0) + 1)
      }

      // Remove bundle listing
      await db.remove(id)

      // Release all assets in bundle, restoring their supply
      for (const [assetId, bundledUnits] of assetUsageCount) {
        const asset = await getNodeValue(assetId)
        if (asset) {
          const currentSupply = asset.supply || 0
          const restoredSupply = currentSupply + bundledUnits
          await db.put({
            ...asset,
            supply: restoredSupply,
            status: 'unlisted',
            bundleId: null
          }, assetId)
        }
      }
    })
  },

  /**
   * Update bundle title, description, and/or price
   * @param {string} id - Bundle hash
   * @param {object} options - { title, description, price }
   */
  async updateBundle(id, { title, description, price }) {
    return executeTx('updateBundle', { id, title, description, price }, {
      loadingMsg: 'Updating bundle...',
      successMsg: 'Bundle updated!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const bundle = await getNodeValue(params.id)
      if (!bundle) return

      const updates = { ...bundle }
      if (params.title) {
        updates.title = params.title
      }
      if (params.description !== null && params.description !== undefined) {
        updates.description = params.description
      }
      if (params.price) {
        updates.price = `${params.price} OVG`
        updates.priceNum = parseFloat(params.price)
      }

      await db.put(updates, params.id)
    })
  },

  async extendRental(rentalId, days) {
    return executeTx('extendRental', { rentalId, days }, {
      loadingMsg: 'Extending rental...',
      successMsg: 'Rental extended!'
    })
  },

  async setRoyalty(assetId, percentage, recipient) {
    return executeTx('setRoyalty', { assetId, percentage, recipient }, {
      loadingMsg: 'Setting royalty...',
      successMsg: 'Royalty configured!'
    })
  },

  /**
   * Toggle trading status (pause/resume)
   * @param {boolean} paused - New paused state
   */
  async toggleTrading(paused) {
    return executeTx('toggleTrading', { paused }, {
      loadingMsg: paused ? 'Pausing trading...' : 'Resuming trading...',
      successMsg: paused ? 'Trading paused!' : 'Trading resumed!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const settingsId = 'marketplace-settings'
      const existing = await getNodeValue(settingsId)

      await db.put({
        ...(existing || {}),
        recordType: 'settings',
        tradingPaused: params.paused,
        tradingUpdatedAt: Date.now(),
        tradingUpdatedBy: getCurrentUser()
      }, settingsId)
    })
  },

  /**
   * Toggle marketplace status (pause/resume all operations)
   * @param {boolean} paused - New paused state
   */
  async toggleMarketplace(paused) {
    return executeTx('toggleMarketplace', { paused }, {
      loadingMsg: paused ? 'Pausing marketplace...' : 'Resuming marketplace...',
      successMsg: paused ? 'Marketplace paused!' : 'Marketplace resumed!'
    }, async (result, params) => {
      const db = getDb()
      if (!db) return

      const settingsId = 'marketplace-settings'
      const existing = await getNodeValue(settingsId)

      await db.put({
        ...(existing || {}),
        recordType: 'settings',
        marketplacePaused: params.paused,
        marketplaceUpdatedAt: Date.now(),
        marketplaceUpdatedBy: getCurrentUser()
      }, settingsId)
    })
  },

  /**
   * Get accumulated marketplace fees from contract
   * @returns {Promise<string>} Fees in OVG (formatted)
   */
  async getAccumulatedFees() {
    const bm = await getBlockchainManager()
    return bm.getAccumulatedFees()
  },

  /**
   * Withdraw accumulated marketplace fees (owner only)
   */
  async withdrawFees() {
    return executeTx('withdrawFees', {}, {
      loadingMsg: 'Withdrawing marketplace fees...',
      successMsg: 'Fees withdrawn successfully!'
    })
  },

  /**
   * Switch network environment (testnet/mainnet)
   * Real blockchain connection switch - same as production
   * @param {string} network - 'testnet' or 'mainnet'
   */
  async switchNetwork(network) {
    const overlay = document.getElementById('loadingOverlay')
    overlay?.classList.add('active')

    try {
      const networkKey = network.toUpperCase() === 'MAINNET' ? 'MAINNET' : 'TESTNET'
      showToast('info', 'Processing', `Switching to ${network}...`)

      // Step 1: Change global network configuration
      const { setActiveNetwork, getActiveNetwork } = await import('../../../../lib/config/marketplaceConfig.js')
      setActiveNetwork(networkKey)

      // Step 2: Reset and reinitialize BlockchainManager with new network
      _blockchainManager = null
      const { resetBlockchainManager } = await import('../../../../lib/blockchain/BlockchainManager.js')
      await resetBlockchainManager()
      _blockchainManager = await getBlockchainManager()

      // Step 3: Save preference to GenosDB
      const db = getDb()
      if (db) {
        const settingsId = 'marketplace-settings'
        const existing = await getNodeValue(settingsId)
        await db.put({
          ...(existing || {}),
          recordType: 'settings',
          network: networkKey,
          networkUpdatedAt: Date.now(),
          networkUpdatedBy: getCurrentUser()
        }, settingsId)
      }

      // Step 4: Force sync to load data from new network
      if (typeof window.forceFullSync === 'function') {
        await window.forceFullSync()
      }

      overlay?.classList.remove('active')
      showToast('success', 'Complete', `Connected to ${getActiveNetwork().name}!`)

      return { success: true, network: networkKey }
    } catch (error) {
      overlay?.classList.remove('active')
      showToast('error', 'Error', parseBlockchainError(error))
      throw error
    }
  },

  async placeGlobalOffer(assetId, amount, expiry) {
    return executeTx('placeGlobalOffer', { assetId, amount, expiry }, {
      loadingMsg: 'Placing global offer...',
      successMsg: 'Global offer submitted!'
    })
  },

  /**
   * Mint a new NFT asset with Pinata IPFS metadata (V2.3.0)
   * Orchestrates: 1) Upload to Pinata, 2) Mint on blockchain, 3) Set metadata + attributes, 4) Save to GenosDB
   * @param {object} params - Mint parameters
   * @param {string} params.name - Asset name (max 64 chars)
   * @param {string} params.description - Asset description (max 160 chars)
   * @param {string} params.collection - Collection name
   * @param {string} params.category - Category (Objects, Wearables, Land, etc.)
   * @param {string} params.rarity - Rarity (Common, Uncommon, Rare, Epic, Legendary)
   * @param {number} params.royalty - Creator royalty percentage (0-25)
   * @param {number} params.supply - Number of copies to mint
   * @param {File} params.imageFile - Image file to upload to Pinata
   * @param {string} params.imageUrl - Or use existing image URL
   * @param {File} params.assetFile - Asset file to upload (optional)
   * @param {string} params.assetUrl - Or use existing asset URL (optional)
   * @returns {Promise<object>} Result with tokenId, pinata URLs, etc.
   */
  async mint({ name, description, collection, category = 'Objects', rarity = 'Common', royalty, supply, imageFile, imageUrl, assetFile, assetUrl }) {
    const tokenId = Date.now()
    const overlay = document.getElementById('loadingOverlay')
    overlay?.classList.add('active')

    try {
      // Step 1: Upload files to Pinata IPFS (image + asset only, NO metadata.json)
      showToast('info', 'Processing', 'Uploading to IPFS...')
      const pinataResult = await uploadToPinata({
        imageFile,
        imageUrl,
        assetFile,
        assetUrl,
        tokenId
      })

      // Step 2: Mint on blockchain
      showToast('info', 'Processing', 'Minting on blockchain...')
      const bm = await getBlockchainManager()
      const currentUser = getCurrentUser()

      // Validate user is logged in
      if (!currentUser) {
        throw new Error('Not logged in - please login first')
      }

      // Verify signer is available before minting
      const signer = await bm.getSigner()
      if (!signer) {
        throw new Error('No signer available - please login with mnemonic')
      }
      const signerAddress = await signer.getAddress()

      const mintTx = await bm.mintAsset(currentUser, tokenId, supply, '0x')

      // Wait for TX confirmation with timeout (60 seconds)
      const TX_TIMEOUT = 60000
      const waitWithTimeout = Promise.race([
        mintTx.wait(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timeout - check your wallet for pending TX')), TX_TIMEOUT))
      ])
      await waitWithTimeout

      // Step 3: Set metadata on-chain via OVGMetadata contract (if available)
      showToast('info', 'Processing', 'Setting metadata on-chain...')
      try {
        if (bm.contracts.metadata) {
          const metadataWithSigner = bm.contracts.metadata.connect(signer)
          const metaParams = [
            tokenId,
            name || 'Untitled',
            description || '',
            pinataResult.imageUrl || '',
            pinataResult.assetUrl || ''
          ]

          // Try setAssetMetadataByTokenOwner first (V2.2.0 - works for any token owner)
          // Falls back to setAssetMetadata (V2.1.0 - requires owner/marketplace)
          let metaTx
          try {
            metaTx = await metadataWithSigner.setAssetMetadataByTokenOwner(...metaParams)
          } catch {
            metaTx = await metadataWithSigner.setAssetMetadata(...metaParams)
          }
          const metaWaitWithTimeout = Promise.race([
            metaTx.wait(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Metadata TX timeout')), TX_TIMEOUT))
          ])
          await metaWaitWithTimeout

          // V2.3.0: Set attributes (rarity, category, collection)
          try {
            const attrParams = [tokenId, rarity || 'Common', category || 'Objects', collection || 'OVGrid']
            let attrTx
            try {
              attrTx = await metadataWithSigner.setAssetAttributesByTokenOwner(...attrParams)
            } catch {
              attrTx = await metadataWithSigner.setAssetAttributes(...attrParams)
            }
            await attrTx.wait()
          } catch (attrError) {
            console.warn('[Mint] setAssetAttributes failed:', attrError.message)
          }
        }
      } catch (metaError) {
        console.warn('[Mint] setAssetMetadata failed:', metaError.message)
      }

      // Step 4: Save to GenosDB
      // Use consistent ID based on tokenId (matches sync pattern in app-core.js)
      showToast('info', 'Processing', 'Saving local data...')
      const db = getDb()
      if (db) {
        const assetId = `asset_${tokenId}`
        await db.put({
          tokenId,
          status: 'unlisted',
          title: name,
          name,
          description: description || '',
          collection: collection || 'OVGrid',
          category: category || 'Objects',
          rarity: rarity || 'Common',
          image: pinataResult.imageUrl || imageUrl,
          imageUrl: pinataResult.imageUrl || imageUrl,
          assetUrl: pinataResult.assetUrl || assetUrl || '',
          folderCid: pinataResult.folderCid,
          royalty: `${royalty}%`,
          royaltyPct: royalty,
          supply,
          owner: currentUser,
          creator: currentUser,
          mintedAt: Date.now(),
          timestamp: Date.now()
        }, assetId)

        await createActivity('mint', { title: name, image: pinataResult.imageGatewayUrl || imageUrl })
      }

      overlay?.classList.remove('active')
      showToast('success', 'Complete', 'Asset minted successfully!')
      window.refreshCurrentView?.()

      // Return result for success modal
      return {
        success: true,
        tokenId,
        txHash: mintTx.hash,
        ...pinataResult
      }
    } catch (error) {
      overlay?.classList.remove('active')
      showToast('error', 'Error', parseBlockchainError(error))
      throw error
    }
  },

  /**
   * Update asset metadata and attributes on-chain
   * Calls OVGMetadata.setAssetMetadata() and setAssetAttributes()
   * @param {number} tokenId - Token ID to update
   * @param {object} metadata - { name, description, imageUrl, assetUrl, rarity, category, collection }
   */
  async updateAssetMetadata(tokenId, { name, description, imageUrl, assetUrl, rarity, category, collection }) {
    const overlay = document.getElementById('loadingOverlay')
    overlay?.classList.add('active')
    showToast('info', 'Processing', 'Updating metadata on-chain...')

    try {
      const bm = await getBlockchainManager()
      const signer = await bm.getSigner()

      if (!signer) {
        throw new Error('No signer available - please login with mnemonic')
      }

      // Check if OVGMetadata contract is available
      if (!bm.contracts.metadata) {
        throw new Error('OVGMetadata contract not deployed on this network. Metadata updates only available on mainnet.')
      }

      const metadataWithSigner = bm.contracts.metadata.connect(signer)
      const TX_TIMEOUT = 60000

      let metaTx
      try {
        metaTx = await metadataWithSigner.setAssetMetadataByTokenOwner(
          BigInt(tokenId),
          name || 'Untitled',
          description || '',
          imageUrl || '',
          assetUrl || ''
        )
      } catch {
        metaTx = await metadataWithSigner.setAssetMetadata(
          BigInt(tokenId),
          name || 'Untitled',
          description || '',
          imageUrl || '',
          assetUrl || ''
        )
      }
      await Promise.race([
        metaTx.wait(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Metadata TX timeout')), TX_TIMEOUT))
      ])

      if (rarity || category || collection) {
        showToast('info', 'Processing', 'Updating attributes on-chain...')

        try {
          const attrTx = await metadataWithSigner.setAssetAttributesByTokenOwner(
            BigInt(tokenId),
            rarity || 'Common',
            category || 'Objects',
            collection || 'OVGrid'
          )
          await Promise.race([
            attrTx.wait(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Attributes TX timeout')), TX_TIMEOUT))
          ])
        } catch (attrError) {
          // Try fallback to setAssetAttributes (for contract owner)
          console.warn('[UpdateMetadata] setAssetAttributesByTokenOwner failed, trying setAssetAttributes:', attrError.message)
          const attrTx = await metadataWithSigner.setAssetAttributes(
            BigInt(tokenId),
            rarity || 'Common',
            category || 'Objects',
            collection || 'OVGrid'
          )
          await attrTx.wait()
        }
      }

      overlay?.classList.remove('active')
      showToast('success', 'Updated', 'Metadata saved on-chain')

      return { success: true, txHash: metaTx.hash }
    } catch (error) {
      overlay?.classList.remove('active')
      console.error('[UpdateMetadata] Failed:', error)
      showToast('error', 'Error', parseBlockchainError(error))
      throw error
    }
  },

  /**
   * Extract CID from Pinata gateway URL
   * @param {string} url - Gateway URL (https://gateway.pinata.cloud/ipfs/Qm...)
   * @returns {string|null} CID or null if not a Pinata URL
   */
  extractCidFromUrl(url) {
    if (!url) return null
    const match = url.match(/\/ipfs\/([a-zA-Z0-9]+)/)
    return match ? match[1] : null
  },

  /**
   * Unpin file from Pinata
   * @param {string} cid - IPFS CID to unpin
   * @returns {Promise<boolean>} Success status
   */
  async unpinFromPinata(cid) {
    if (!cid) return false

    try {
      const { PINATA_CONFIG } = await import('../../../../lib/config/marketplaceConfig.js')

      const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${PINATA_CONFIG.jwt}`
        }
      })

      if (response.ok) {
        return true
      } else {
        console.warn(`[Pinata] Unpin failed for ${cid}: ${response.status}`)
        return false
      }
    } catch (e) {
      console.warn(`[Pinata] Unpin error for ${cid}:`, e.message)
      return false
    }
  },

  /**
   * Burn an asset (destroy permanently)
   * Also unpins associated files from Pinata
   * @param {number} tokenId - Token ID to burn
   * @param {number} amount - Amount to burn (default: 1)
   * @param {object} assetData - Asset data with imageUrl/metadataUrl for unpin
   */
  async burn(tokenId, amount = 1, assetData = null) {
    try {
      const bm = await getBlockchainManager()
      const signer = await bm.getSigner()

      if (!signer) {
        throw new Error('No signer available - please login with mnemonic')
      }

      const address = await signer.getAddress()
      const assetsWithSigner = bm.contracts.assets.connect(signer)

      const burnTx = await assetsWithSigner.burn(address, BigInt(tokenId), BigInt(amount))

      // Wait for confirmation with timeout
      const TX_TIMEOUT = 60000
      await Promise.race([
        burnTx.wait(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timeout')), TX_TIMEOUT))
      ])

      // Unpin from Pinata (non-blocking)
      if (assetData) {
        const imageCid = this.extractCidFromUrl(assetData.image || assetData.imageUrl)
        const metadataCid = this.extractCidFromUrl(assetData.metadataUrl)

        if (imageCid || metadataCid) {
          const unpinPromises = []
          if (imageCid) unpinPromises.push(this.unpinFromPinata(imageCid))
          if (metadataCid) unpinPromises.push(this.unpinFromPinata(metadataCid))
          await Promise.all(unpinPromises)
        }
      }

      return { success: true, txHash: burnTx.hash }
    } catch (error) {
      console.error('[Burn] Failed:', error)
      throw error
    }
  },

  /**
   * Mint a land parcel at specific face + grid coordinates.
   * Encodes face into x for smart contract: x = face * 1000 + localX, z = localY.
   * Uploads terrain preview image to Pinata IPFS before minting.
   * @param {object} params - Land parameters
   * @param {number} params.face - Cube face (0-5)
   * @param {number} params.localX - Local X on face (0-122)
   * @param {number} params.localY - Local Y on face (0-122)
   * @param {string} [params.name] - Land name
   * @param {string} [params.description] - Land description
   * @param {File} [params.imageFile] - Baked terrain preview image file
   */
  async mintLand({ face = 0, localX, localY, name, description, imageFile }) {
    const x = face * 1000 + localX
    const z = localY
    // Compute landId matching contract formula (v1.1.0): LAND_ID_OFFSET + (x+10000)*100000 + (z+10000)
    const landId = 10000 + (x + 10000) * 100000 + (z + 10000)
    const landTitle = name || `F${face}:${localX},${localY}`

    // Upload terrain image to Pinata if provided
    let imageUrl = ''
    if (imageFile) {
      try {
        showToast('info', 'Processing', 'Uploading terrain image...')
        const pinataResult = await uploadToPinata({ imageFile, tokenId: landId })
        imageUrl = pinataResult.imageUrl || ''
      } catch (err) {
        console.warn('[MintLand] Pinata upload failed, continuing without image:', err)
      }
    }

    return executeTx('mintLand', {
      x, z, face, localX, localY, name, description, imageUrl,
      title: landTitle, landId
    }, {
      loadingMsg: 'Claiming land parcel...',
      successMsg: `Land F${face}:${localX},${localY} claimed!`
    }, async (result, params) => {
      // Set metadata on OVGMetadata contract so sync can recover it
      try {
        const bm = await getBlockchainManager()
        if (bm.contracts?.metadata) {
          const signer = await bm.getSigner()
          if (signer) {
            const metadataWithSigner = bm.contracts.metadata.connect(signer)

            // Set title, description, imageUrl on-chain
            let metaTx
            try {
              metaTx = await metadataWithSigner.setAssetMetadataByTokenOwner(
                landId, landTitle, params.description || '', params.imageUrl || '', ''
              )
            } catch {
              metaTx = await metadataWithSigner.setAssetMetadata(
                landId, landTitle, params.description || '', params.imageUrl || '', ''
              )
            }
            await metaTx.wait()

            // Set attributes (rarity, category, collection)
            try {
              let attrTx
              try {
                attrTx = await metadataWithSigner.setAssetAttributesByTokenOwner(
                  landId, 'Common', 'Land', 'OVGrid'
                )
              } catch {
                attrTx = await metadataWithSigner.setAssetAttributes(
                  landId, 'Common', 'Land', 'OVGrid'
                )
              }
              await attrTx.wait()
            } catch (e) {
              console.warn('[MintLand] setAssetAttributes failed:', e.message)
            }

          }
        }
      } catch (e) {
        console.warn('[MintLand] Failed to set on-chain metadata:', e.message)
      }

      const db = getDb()
      if (!db) return

      const currentUser = getCurrentUser()

      const assetNodeId = `asset_${landId}`
      const assetRecord = {
        id: landId,
        assetId: landId,
        tokenId: String(landId),
        category: 'land',
        status: 'unlisted',
        title: landTitle,
        name: landTitle,
        description: params.description || '',
        image: params.imageUrl || '',
        imageUrl: params.imageUrl || '',
        owner: currentUser,
        creator: currentUser,
        mintedAt: Date.now(),
        timestamp: Date.now(),
        supply: 1,
        rarity: 'Common',
        collection: 'OVGrid',
        royalty: '0%',
        royaltyPct: 0
      }
      await db.put(assetRecord, assetNodeId)

      await createActivity('mint', {
        title: landTitle,
        image: params.imageUrl,
        description: 'Land parcel claimed'
      })

      window.refreshCurrentView?.()
    })
  },

  /**
   * Get collection metadata from contractURI
   * Reads and decodes base64 JSON from the contract
   * @returns {Promise<object|null>} Collection metadata or null
   */
  async getContractURI() {
    try {
      const bm = await getBlockchainManager()

      if (!bm.contracts.assets) return null

      // Try to call contractURI - will throw if not available
      let uri
      try {
        uri = await bm.contracts.assets.contractURI()
      } catch {
        return null
      }

      if (!uri) return null

      // Decode base64 JSON from data: URI
      if (uri.startsWith('data:application/json;base64,')) {
        const base64 = uri.replace('data:application/json;base64,', '')
        const json = atob(base64)
        return JSON.parse(json)
      }

      // If it's a URL, fetch it
      if (uri.startsWith('http') || uri.startsWith('ipfs://')) {
        const fetchUrl = uri.startsWith('ipfs://')
          ? `https://gateway.pinata.cloud/ipfs/${uri.replace('ipfs://', '')}`
          : uri
        const response = await fetch(fetchUrl)
        return await response.json()
      }

      return null
    } catch (error) {
      console.error('[ContractURI] Failed to get:', error)
      return null
    }
  },

  /**
   * Update collection metadata (contractURI)
   * Uploads image to Pinata if file provided, builds JSON, calls setContractURI
   * @param {object} params - Collection settings
   * @param {string} params.name - Collection name
   * @param {string} params.description - Collection description
   * @param {string} params.externalLink - External website URL
   * @param {number} params.royalty - Royalty percentage (0-10)
   * @param {string} params.feeRecipient - Royalty recipient address
   * @param {string} params.imageUrl - Existing image URL (if not uploading)
   * @param {File} params.imageFile - Image file to upload to Pinata
   * @returns {Promise<object>} Result with txHash
   */
  async updateContractURI({ name, description, externalLink, royalty, feeRecipient, imageUrl, imageFile }) {
    const overlay = document.getElementById('loadingOverlay')
    overlay?.classList.add('active')

    try {
      const bm = await getBlockchainManager()
      const signer = await bm.getSigner()

      if (!signer) {
        throw new Error('No signer available - please login with mnemonic')
      }

      // Check if setContractURI is available
      if (!bm.contracts.assets?.setContractURI) {
        throw new Error('setContractURI not available on this contract version')
      }

      let finalImageUrl = imageUrl

      // Upload image to Pinata if file provided
      if (imageFile) {
        showToast('info', 'Processing', 'Uploading collection image...')
        const pinata = await getPinataService()
        const result = await pinata.uploadFile(
          imageFile,
          `collection-image-${Date.now()}`,
          { fileType: 'collection-image' }
        )
        finalImageUrl = result.gatewayUrl || `https://gateway.pinata.cloud/ipfs/${result.cid}`
      }

      // Build OpenSea-compatible collection metadata
      const metadata = {
        name: name || 'OVGrid Assets',
        description: description || '',
        image: finalImageUrl || '',
        external_link: externalLink || ''
      }

      // Add royalty info if provided (OpenSea format)
      if (royalty > 0 && feeRecipient) {
        metadata.seller_fee_basis_points = Math.round(royalty * 100) // Convert % to basis points
        metadata.fee_recipient = feeRecipient
      }

      // Encode as base64 data URI
      showToast('info', 'Processing', 'Setting collection metadata...')
      const base64 = btoa(JSON.stringify(metadata))
      const contractURI = `data:application/json;base64,${base64}`

      const assetsWithSigner = bm.contracts.assets.connect(signer)
      const tx = await assetsWithSigner.setContractURI(contractURI)
      const TX_TIMEOUT = 60000
      await Promise.race([
        tx.wait(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timeout')), TX_TIMEOUT))
      ])

      overlay?.classList.remove('active')
      showToast('success', 'Complete', 'Collection settings updated!')

      return { success: true, txHash: tx.hash, metadata }
    } catch (error) {
      overlay?.classList.remove('active')
      console.error('[ContractURI] Update failed:', error)
      showToast('error', 'Error', parseBlockchainError(error))
      throw error
    }
  },

}

// Expose blockchain to window for global access
window.blockchain = blockchain

export default blockchain
