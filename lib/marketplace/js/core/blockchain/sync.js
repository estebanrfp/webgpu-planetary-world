/**
 * Blockchain Sync Module
 * @module core/blockchain/sync
 *
 * EXACT COPY of app-core.js blockchain sync functions.
 * Dependencies are passed via init function.
 */

import { appState } from '../../store/appState.js'
import { NO_IMAGE } from '../constants.js'
import { clearDataType } from '../subscriptions.js'
import { resetPaginationState } from '../pagination/persistence.js'

// Dependencies set via init
let db = null
let loadViewDataFn = null

/**
 * Initialize blockchain sync module
 * @param {object} deps - Dependencies
 * @param {object} deps.db - GenosDB instance
 * @param {function} deps.loadViewData - Function to load view data
 */
export function initBlockchainSync(deps) {
  db = deps.db
  loadViewDataFn = deps.loadViewData
}

/**
 * Load data from blockchain and save to GenosDB
 */
export async function loadBlockchainData() {
  try {
    const { getBlockchainManager } = await import('../../../../../lib/blockchain/BlockchainManager.js')
    const { AuthManager } = await import('../../../../../lib/network/AuthManager.js')
    const bm = await getBlockchainManager()

    const signer = await bm.getSigner?.()
    const userAddress = (signer ? await signer.getAddress() : AuthManager.getState()?.address)?.toLowerCase() || ''

    if (userAddress) window.updateCurrentUser?.(userAddress)

    window.showToast?.('info', 'Syncing', 'Loading from blockchain...')

    // Load all data in parallel
    const [listings, ownedAssets, activeAuctions] = await Promise.all([
      bm.getActiveListings({ forceRefresh: true }).catch(() => []),
      bm.getOwnedAssets({ forceRefresh: true }).catch(() => []),
      bm.getActiveAuctions({ forceRefresh: true }).catch(() => [])
    ])

    // Track listings by assetId
    const listingsByAsset = new Map()

    // 1. Save listings (now includes metadata from blockchain)
    for (const listing of listings) {
      if (listing.isBundle) {
        await db.put({
          id: listing.id,
          bundleId: listing.bundleId,
          isBundle: true,
          status: 'bundle',
          seller: listing.seller,
          owner: listing.seller,
          price: `${listing.price} OVG`,
          priceNum: parseFloat(listing.price),
          assetIds: listing.assetIds,
          title: listing.title || listing.name || `Bundle #${listing.bundleId}`,
          image: listing.image || NO_IMAGE,
          description: listing.description || '',
          category: 'collections',
          timestamp: Date.now()
        })
      } else {
        listingsByAsset.set(listing.assetId, listing)
        const nodeId = `asset_${listing.assetId}`
        const status = listing.isRental ? 'rent' : 'sale'
        const cat = listing.category || ''
        const listingRecord = {
          id: listing.assetId,
          assetId: listing.assetId,
          tokenId: String(listing.assetId),
          listingId: listing.listingId,
          status,
          seller: listing.seller,
          owner: listing.seller,
          price: `${listing.price} OVG`,
          priceNum: parseFloat(listing.price),
          supply: listing.amount,
          isRental: listing.isRental,
          duration: listing.duration ?? 0, // Seconds from contract (0 = no limit)
          title: listing.title || `Asset #${listing.assetId}`,
          image: listing.image || NO_IMAGE,
          description: listing.description || '',
          collection: listing.collection || 'Marketplace',
          rarity: listing.rarity || '',
          category: cat,
          timestamp: Date.now()
        }
        await db.put(listingRecord, nodeId)
      }
    }

    // 2. Save owned assets (now includes metadata from blockchain)
    for (const asset of ownedAssets) {
      const nodeId = `asset_${asset.assetId}`
      const activeListing = listingsByAsset.get(asset.assetId)

      const cat = asset.category || activeListing?.category || ''
      const assetStatus = activeListing ? (activeListing.isRental ? 'rent' : 'sale') : 'unlisted'
      const assetRecord = {
        id: asset.assetId,
        assetId: asset.assetId,
        tokenId: String(asset.assetId),
        owner: userAddress,
        supply: asset.balance,
        status: assetStatus,
        listingId: activeListing?.listingId,
        isRental: activeListing?.isRental,
        duration: activeListing?.duration,
        price: activeListing ? `${activeListing.price} OVG` : '',
        priceNum: activeListing ? parseFloat(activeListing.price) : 0,
        title: asset.title || `Asset #${asset.assetId}`,
        image: asset.image || NO_IMAGE,
        description: asset.description || '',
        collection: asset.collection || activeListing?.collection || 'Marketplace',
        rarity: asset.rarity || activeListing?.rarity || '',
        category: cat,
        timestamp: Date.now()
      }
      await db.put(assetRecord, nodeId)
    }

    // 3. Save auctions (now includes metadata from blockchain)
    const userAuctions = activeAuctions.filter(a => a.seller?.toLowerCase() === userAddress)
    for (const auction of userAuctions) {
      const nodeId = `asset_${auction.assetId}`
      const durationSeconds = (auction.endTime - auction.startTime) || 0
      const cat = auction.category || ''
      const auctionRecord = {
        id: auction.assetId,
        assetId: auction.assetId,
        tokenId: String(auction.assetId),
        auctionId: auction.auctionId,
        status: 'auction',
        owner: userAddress,
        seller: userAddress,
        price: `${auction.minBid} OVG`,
        priceNum: parseFloat(auction.minBid),
        currentBid: auction.highestBid !== '0' ? `${auction.highestBid} OVG` : null,
        highestBidder: auction.highestBidder,
        duration: durationSeconds, // Seconds (consistent with contract)
        endsAt: auction.endTime * 1000,
        isAuction: true,
        title: auction.title || `Asset #${auction.assetId}`,
        image: auction.image || NO_IMAGE,
        description: auction.description || '',
        collection: auction.collection || 'Marketplace',
        rarity: auction.rarity || '',
        category: cat,
        timestamp: Date.now()
      }
      await db.put(auctionRecord, nodeId)
    }

    // 4. Load and save user's sent offers (global bids)
    const sentOffers = await bm.getUserGlobalBids(userAddress).catch(() => [])
    window.pendingOfferAssets = new Set(sentOffers.map(o => String(o.assetId)))
    for (const offer of sentOffers) {
      const nodeId = `offer_${offer.assetId}_${userAddress}`
      const assetListing = listingsByAsset.get(offer.assetId) || listings.find(l => l.assetId === offer.assetId)
      const assetOwner = assetListing?.seller || assetListing?.owner || ''

      await db.put({
        id: `offer_${offer.assetId}_${userAddress}`,
        assetId: offer.assetId,
        tokenId: String(offer.assetId),
        status: 'offer',
        offerStatus: 'pending',
        owner: userAddress,
        targetOwner: assetOwner,
        price: `${offer.price} OVG`,
        priceNum: offer.price,
        title: assetListing?.title || `Asset #${offer.assetId}`,
        image: assetListing?.image || NO_IMAGE,
        collection: assetListing?.collection || 'Marketplace',
        rarity: assetListing?.rarity || '',
        category: assetListing?.category || '',
        timestamp: offer.timestamp * 1000 || Date.now(),
        isGlobal: true
      }, nodeId)
    }

    // 5. Load and save received offers on user's assets (exclude own bids)
    const receivedOffers = await bm.getReceivedGlobalBids(userAddress, ownedAssets).catch(() => [])
    for (const offer of receivedOffers) {
      // Skip own bids — already saved in Step 4 as sent offers
      if (offer.bidder?.toLowerCase() === userAddress) continue

      const nodeId = `offer_${offer.assetId}_${offer.bidder}`
      const ownedAsset = ownedAssets.find(a => a.assetId === offer.assetId)

      await db.put({
        id: `offer_${offer.assetId}_${offer.bidder}`,
        assetId: offer.assetId,
        tokenId: String(offer.assetId),
        status: 'offer',
        offerStatus: 'pending',
        owner: offer.bidder,
        targetOwner: userAddress,
        price: `${offer.price} OVG`,
        priceNum: offer.price,
        title: ownedAsset?.title || `Asset #${offer.assetId}`,
        image: ownedAsset?.image || NO_IMAGE,
        collection: ownedAsset?.collection || 'Marketplace',
        rarity: ownedAsset?.rarity || '',
        category: ownedAsset?.category || '',
        timestamp: offer.timestamp * 1000 || Date.now(),
        isGlobal: true
      }, nodeId)
    }

    window.showToast?.('success', 'Synced', `${listings.length} listings, ${ownedAssets.length} assets, ${sentOffers.length + receivedOffers.length} offers`)
    return true
  } catch (e) {
    console.error('[Sync] Failed:', e.message)
    window.showToast?.('error', 'Sync Error', e.message)
    return false
  }
}

/**
 * Force full sync with blockchain
 * EXACT COPY of app-core.js forceFullSync
 */
export async function forceFullSync() {
  const viewPagination = appState.viewPagination
  const overlay = document.getElementById('loadingOverlay')
  overlay?.classList.add('active')

  window.showToast?.('info', 'Syncing', 'Connecting to blockchain...')

  try {
    // Clear ALL data for a fresh sync from blockchain
    await clearDataType('asset')
    await clearDataType('offer')
    await clearDataType('activity')
    await clearDataType('collection')

    // Load data from blockchain
    const blockchainLoaded = await loadBlockchainData()

    if (!blockchainLoaded) {
      window.showToast?.('warning', 'Warning', 'Could not connect to blockchain')
    }

    // Reset pagination states
    resetPaginationState()
    Object.keys(viewPagination).forEach(view => {
      viewPagination[view].currentPage = 1
      viewPagination[view].maxKnownPage = 1
      viewPagination[view].cursors = {}
      viewPagination[view].noMoreItems = false
    })

    // Reload current view
    const currentView = window.getCurrentView?.() || 'explore'
    await loadViewDataFn(currentView, true)

    overlay?.classList.remove('active')
    window.showToast?.('success', 'Sync Complete', 'All data refreshed from blockchain')
  } catch (error) {
    overlay?.classList.remove('active')
    window.showToast?.('error', 'Sync Failed', error.message || 'Failed to sync with blockchain')
  }
}
