/**
 * Blockchain Manager - Polygon Smart Contracts API
 * 
 * @module BlockchainManager
 */

import { AuthManager } from '../network/AuthManager.js'
import { createGenosDBSigner } from './GenosDBSigner.js'
import { MarketplaceCache } from './MarketplaceCache.js'
import { DEPLOYMENTS, OVG_TOKEN_ABI, OVG_ASSETS_ABI, OVG_MARKETPLACE_ABI, OVG_LAND_CLAIM_ABI, OVG_METADATA_ABI, MULTICALL3_ADDRESS, MULTICALL3_ABI } from './contracts.js'
import { ACTIVE_NETWORK, MARKETPLACE_CONFIG, PINATA_CONFIG } from '../config/marketplaceConfig.js'
import { ErrorLogger } from '../utils/ErrorLogger.js'
import { withTimeout } from '../utils/withRetry.js'
import * as PinataService from './pinataService.js'

// Chunk size for paginated event queries (avoids RPC timeout on large ranges)
const EVENT_QUERY_CHUNK_SIZE = 10000

/**
 * Query events in paginated chunks to avoid RPC timeouts
 * @param {object} contract - Ethers contract instance
 * @param {object} filter - Event filter
 * @param {number} fromBlock - Start block
 * @param {number} toBlock - End block (defaults to 'latest')
 * @returns {Promise<Array>} Combined events from all chunks
 */
async function queryEventsPaginated(contract, filter, fromBlock, toBlock = 'latest') {
  const provider = contract.runner?.provider || contract.provider
  const endBlock = toBlock === 'latest' ? await provider.getBlockNumber() : toBlock
  const events = []

  for (let start = fromBlock; start <= endBlock; start += EVENT_QUERY_CHUNK_SIZE) {
    const end = Math.min(start + EVENT_QUERY_CHUNK_SIZE - 1, endBlock)
    try {
      const chunk = await contract.queryFilter(filter, start, end)
      events.push(...chunk)
    } catch (e) {
      // Log but continue - partial results are better than none
      ErrorLogger.debug('Event query chunk failed', { start, end, error: e.message })
    }
  }

  return events
}

/**
 * Execute batched calls via Multicall3
 * @param {Array} calls - Array of {target, callData} objects
 * @returns {Promise<Array>} Array of {success, returnData} results
 */
async function multicall(calls) {
  const multicall3 = BlockchainManager.contracts.multicall3
  if (!multicall3 || calls.length === 0) return []

  const formattedCalls = calls.map(c => ({
    target: c.target,
    allowFailure: true,
    callData: c.callData
  }))

  return multicall3.aggregate3.staticCall(formattedCalls)
}

/**
 * Encode a contract call for multicall
 * @param {object} contract - Ethers contract instance
 * @param {string} method - Method name
 * @param {Array} args - Method arguments
 * @returns {object} {target, callData}
 */
function encodeCall(contract, method, args = []) {
  return {
    target: contract.target,
    callData: contract.interface.encodeFunctionData(method, args)
  }
}

/**
 * Decode multicall result
 * @param {object} contract - Ethers contract instance
 * @param {string} method - Method name
 * @param {string} returnData - Raw return data
 * @returns {any} Decoded result
 */
function decodeResult(contract, method, returnData) {
  return contract.interface.decodeFunctionResult(method, returnData)
}

export const BlockchainManager = {
  ethers: null,
  provider: null,
  contracts: {},
  initPromise: null,

  init: async () => {
    // Already fully initialized (ethers loaded AND contracts ready)
    if (BlockchainManager.ethers && BlockchainManager.contracts.marketplace) return true
    if (BlockchainManager.initPromise) return BlockchainManager.initPromise

    BlockchainManager.initPromise = (async () => {
      console.log('[Blockchain] Starting initialization...')
      window.appSpinner?.show('Loading blockchain…')

      try {
        // Load Ethers.js if not present
        if (!window.ethers) {
          console.log('[Blockchain] Injecting ethers.js script tag...')
          await new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.1/ethers.umd.min.js'
            script.integrity = 'sha384-xeyyvbIlX+FahWHIZR6gjoC4A1i44cTBxZ330euRbtiXZwfcVDWVeOuJ4sGx8R2d'
            script.crossOrigin = 'anonymous'
            script.async = true
            script.onload = () => {
              console.log('[Blockchain] Ethers.js script loaded into DOM')
              resolve()
            }
            script.onerror = (err) => {
              console.error('[Blockchain] Script load error:', err)
              reject(new Error('Failed to load ethers.js'))
            }
            document.head.appendChild(script)
          })
        }
        
        // Wait a tiny bit for window.ethers to be fully ready
        if (!window.ethers) {
            console.log('[Blockchain] Waiting for window.ethers...')
            await new Promise(r => setTimeout(r, 500))
        }

        BlockchainManager.ethers = window.ethers
        if (!BlockchainManager.ethers) throw new Error('window.ethers is null after load')
        console.log('[Blockchain] Ethers library detected version:', BlockchainManager.ethers.version)

        // RPC Connection with fallback
        let connected = false
        for (const rpc of ACTIVE_NETWORK.rpcs) {
          try {
            console.log(`[Blockchain] Connecting to: ${rpc}`)
            const provider = new BlockchainManager.ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true })
            
            // Critical: Simple network test
            const network = await Promise.race([
              provider.getNetwork(),
              new Promise((_, rj) => setTimeout(() => rj(new Error('RPC Timeout')), MARKETPLACE_CONFIG.RPC_TIMEOUT_MS))
            ])
            
            console.log(`[Blockchain] Network confirmed: ${network.name} (${network.chainId})`)
            BlockchainManager.provider = provider
            connected = true
            break
          } catch (e) {
            console.warn(`[Blockchain] RPC ${rpc} failed:`, e.message)
          }
        }

        if (!connected) throw new Error('All RPCs failed')

        // Contract setup
        const addresses = DEPLOYMENTS[ACTIVE_NETWORK.chainId]
        if (addresses) {
          console.log('[Blockchain] Initializing contract instances...')
          const { Contract } = BlockchainManager.ethers
          const p = BlockchainManager.provider
          
          BlockchainManager.contracts.token = new Contract(addresses.OVGToken, OVG_TOKEN_ABI, p)
          BlockchainManager.contracts.assets = new Contract(addresses.OVGAssets, OVG_ASSETS_ABI, p)
          BlockchainManager.contracts.marketplace = new Contract(addresses.OVGMarketplace, OVG_MARKETPLACE_ABI, p)
          
          // LandClaim contract (only if deployed)
          if (addresses.OVGLandClaim && addresses.OVGLandClaim !== "0x0000000000000000000000000000000000000000") {
            BlockchainManager.contracts.landClaim = new Contract(addresses.OVGLandClaim, OVG_LAND_CLAIM_ABI, p)
            console.log('[Blockchain] LandClaim contract connected')
          }

          // Metadata contract (V2.0.0 - external storage)
          if (addresses.OVGMetadata && addresses.OVGMetadata !== "0x0000000000000000000000000000000000000000") {
            BlockchainManager.contracts.metadata = new Contract(addresses.OVGMetadata, OVG_METADATA_ABI, p)
            console.log('[Blockchain] Metadata contract connected')
          }

          // Multicall3 - universal batching for RPC optimization
          BlockchainManager.contracts.multicall3 = new Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, p)
          console.log('[Blockchain] Multicall3 connected')

          console.log('[Blockchain] Contracts connected')
        }

        // Initialize Pinata for IPFS uploads (V2.2.0)
        if (PINATA_CONFIG?.jwt) {
          PinataService.init(PINATA_CONFIG.jwt)
          console.log('[Blockchain] Pinata IPFS initialized for uploads')
        }

        return true
      } catch (e) {
        console.error('[Blockchain] FATAL INIT ERROR:', e.message)
        BlockchainManager.initPromise = null // Allow retry
        return false
      } finally {
        window.appSpinner?.hide()
      }
    })()

    return BlockchainManager.initPromise
  },

  getOVGBalance: async () => {
    const address = AuthManager.getState().address
    if (!address) {
      console.warn('[Blockchain] No address for balance check')
      return '0.0'
    }
    
    console.log('[Blockchain] Fetching balance for:', address)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) {
        console.error('[Blockchain] Init failed, cannot fetch balance')
        return '0.0'
      }

      if (!BlockchainManager.contracts.token) {
        console.error('[Blockchain] Token contract not found')
        return '0.0'
      }

      const balance = await BlockchainManager.contracts.token.balanceOf(address)
      const formatted = BlockchainManager.ethers.formatUnits(balance, 18)
      console.log('[Blockchain] Balance success:', formatted)
      return formatted
    } catch (e) {
      console.error('[Blockchain] getOVGBalance error:', e.message)
      return '0.0'
    }
  },

  /**
   * Mint test tokens (only works on testnet if use holds MINTER_ROLE or public minting is enabled)
   */
  mintTestTokens: async () => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')
      
      const address = await signer.getAddress()
      const tokenWithSigner = BlockchainManager.contracts.token.connect(signer)
      
      console.log('[Blockchain] Requesting mint for:', address)
      const amount = BlockchainManager.ethers.parseUnits('100.0', 18)
      const tx = await tokenWithSigner.mint(address, amount)
      await tx.wait()
      
      console.log('[Blockchain] Mint successful!')
      return true
    } catch (e) {
      console.error('[Blockchain] Mint failed:', e.message)
      throw e
    }
  },

  /**
   * Mint a new ERC-1155 asset (only works if user holds MINTER_ROLE)
   * @param {string} to - Recipient address
   * @param {number} assetId - Asset ID to mint
   * @param {number} amount - Amount to mint
   * @param {string} data - Optional extra data
   */
  mintAsset: async (to, assetId, amount, data = "0x") => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)

      console.log(`[Blockchain] Requesting mint of ${amount} for asset #${assetId} to:`, to)
      const tx = await assetsWithSigner.mint(to, BigInt(assetId), BigInt(amount), data)

      console.log('[Blockchain] Asset mint TX:', tx.hash)
      return tx
    } catch (e) {
      console.error('[Blockchain] Asset mint failed:', e.message)
      throw e
    }
  },

  /**
   * Set metadata for an ERC-1155 asset (V2.1.0 - external contract)
   * Used by Polygonscan/OpenSea to display token info via uri() function
   * @param {number} assetId - Asset/token ID
   * @param {object} metadata - Metadata object
   * @returns {Promise<any>}
   */
  setAssetMetadata: async (assetId, metadata) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        throw new Error('Metadata contract not deployed on this network')
      }

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}

      const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
      const tx = await metadataWithSigner.setAssetMetadata(
        BigInt(assetId),
        title,
        description,
        imageUrl,
        assetUrl
      )
      const receipt = await tx.wait()

      console.log('[Blockchain] Asset metadata updated on external contract')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setAssetMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Get metadata for an ERC-1155 asset (V2.1.0 - external contract)
   * @param {number} assetId - Asset/token ID
   * @returns {Promise<{title: string, description: string, imageUrl: string, assetUrl: string}>}
   */
  getAssetMetadata: async (assetId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        return { title: '', description: '', imageUrl: '', assetUrl: '' }
      }

      const [title, description, imageUrl, assetUrl] = await BlockchainManager.contracts.metadata.getAssetMetadata(BigInt(assetId))
      return { title, description, imageUrl, assetUrl }
    } catch (e) {
      console.error('[Blockchain] getAssetMetadata failed:', e.message)
      return { title: '', description: '', imageUrl: '', assetUrl: '' }
    }
  },

  /**
   * Get Native (POL) balance
   * @returns {Promise<string>} Formatted balance
   */
  getNativeBalance: async () => {
    const address = AuthManager.getState().address
    if (!address) return '0.0'

    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.provider) return '0.0'

      const balance = await BlockchainManager.provider.getBalance(address)
      return BlockchainManager.ethers.formatEther(balance)
    } catch (e) {
      console.error('[Blockchain] Native balance error:', e.message)
      return '0.0'
    }
  },

  hasAsset: async (assetId) => {
    const address = AuthManager.getState().address
    if (!address) return false
    
    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.contracts.assets) return false
      
      const balance = await BlockchainManager.contracts.assets.balanceOf(address, BigInt(assetId))
      return balance > 0n
    } catch (e) {
      console.error('[Blockchain] Asset check error:', e.message)
      return false
    }
  },

  /**
   * Send OVG tokens to another address
   * @param {string} to - Destination address
   * @param {string} amount - Amount in OVG (human readable)
   * @returns {Promise<any>} Transaction receipt
   */
  sendOVG: async (to, amount) => {
    console.log(`[Blockchain] Sending ${amount} OVG to ${to}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const tokenWithSigner = BlockchainManager.contracts.token.connect(signer)
      const amountWei = BlockchainManager.ethers.parseUnits(amount, 18)

      const tx = await tokenWithSigner.transfer(to, amountWei)
      console.log('[Blockchain] Processing transaction:', tx.hash)
      
      const receipt = await tx.wait()
      console.log('[Blockchain] Transfer successful')
      return receipt
    } catch (e) {
      console.error('[Blockchain] Transfer failed:', e.message)
      throw e
    }
  },

  /**
   * Send native POL to another address
   * @param {string} to - Destination address
   * @param {string} amount - Amount in POL (human readable)
   * @returns {Promise<any>} Transaction receipt
   */
  sendPol: async (to, amount) => {
    console.log(`[Blockchain] Sending ${amount} POL to ${to}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const amountWei = BlockchainManager.ethers.parseEther(amount)

      const tx = await signer.sendTransaction({
        to,
        value: amountWei
      })
      console.log('[Blockchain] Processing transaction:', tx.hash)
      
      const receipt = await tx.wait()
      console.log('[Blockchain] POL transfer successful')
      return receipt
    } catch (e) {
      console.error('[Blockchain] POL transfer failed:', e.message)
      throw e
    }
  },

  /**
   * Get owned ERC-1155 assets for the current user
   * Uses TransferSingle/TransferBatch events to discover all owned asset IDs
   * @returns {Promise<Array>} Array of { id, balance }
   */
  getOwnedAssets: async (options = {}) => {
    // Force get latest signer to avoid stale state from AuthManager
    const signer = await BlockchainManager.getSigner()
    const address = (signer ? await signer.getAddress() : AuthManager.getState()?.address)?.toLowerCase()
    
    if (!address) return []

    const cacheKey = `owned_assets_${address}`
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.contracts.assets) return []

      const assets = BlockchainManager.contracts.assets
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE) // Last ~500k blocks
      const discoveredIds = new Set()

      // 1. Discover asset IDs from TransferSingle events (received)
      try {
        const singleReceived = await assets.queryFilter(
          assets.filters.TransferSingle(null, null, address),
          fromBlock
        ).catch(() => [])
        
        for (const e of singleReceived) {
          discoveredIds.add(Number(e.args.id))
        }
      } catch (e) {
        console.warn('[Blockchain] TransferSingle query failed:', e.message)
      }

      // 2. Discover from TransferBatch events (received)
      try {
        const batchReceived = await assets.queryFilter(
          assets.filters.TransferBatch(null, null, address),
          fromBlock
        ).catch(() => [])
        
        for (const e of batchReceived) {
          for (const id of e.args.ids) {
            discoveredIds.add(Number(id))
          }
        }
      } catch (e) {
        console.warn('[Blockchain] TransferBatch query failed:', e.message)
      }

      // 3. Also check common known IDs (licenses 1-5, land samples)
      for (const id of MARKETPLACE_CONFIG.KNOWN_ASSET_IDS) {
        discoveredIds.add(id)
      }

      // 4. Check balance for each discovered ID via Multicall3
      const owned = []
      const idsToCheck = Array.from(discoveredIds)

      // Batch balance checks using Multicall3 (1 RPC call for all balances)
      const balanceCalls = idsToCheck.map(id => encodeCall(assets, 'balanceOf', [address, id]))
      const balanceResults = await multicall(balanceCalls)

      for (let i = 0; i < idsToCheck.length; i++) {
        const result = balanceResults[i]
        if (result?.success && result.returnData !== '0x') {
          try {
            const [balance] = decodeResult(assets, 'balanceOf', result.returnData)
            if (balance > 0n) {
              owned.push({ id: idsToCheck[i], assetId: Number(idsToCheck[i]), balance: Number(balance) })
            }
          } catch (e) { ErrorLogger.debug('Balance decode failed', { assetId: idsToCheck[i], error: e.message }) }
        }
      }
      console.log(`[Blockchain] Checked ${idsToCheck.length} balances in 1 multicall`)

      // Fetch all metadata in ONE batch call
      if (owned.length > 0 && BlockchainManager.contracts.metadata) {
        try {
          const assetIds = owned.map(a => BigInt(a.assetId))
          const metadataBatch = await BlockchainManager.contracts.metadata.getFullMetadataBatch(assetIds)
          owned.forEach((asset, i) => {
            const meta = metadataBatch[i] || {}
            asset.title = meta.title || `Asset #${asset.assetId}`
            asset.image = meta.imageUrl || ''
            asset.description = meta.description || ''
            asset.assetUrl = meta.assetUrl || ''
            asset.rarity = meta.rarity || ''
            asset.category = meta.category || ''
            asset.collection = meta.collection || ''
          })
          console.log(`[Blockchain] Fetched metadata for ${owned.length} owned assets in 1 batch call`)
        } catch (e) {
          console.warn('[Blockchain] Batch metadata fetch failed for owned assets:', e.message)
        }
      }

      console.log(`[Blockchain] getOwnedAssets: Found ${owned.length} assets for ${address.slice(0,8)}...`)
      MarketplaceCache.set(cacheKey, owned, MARKETPLACE_CONFIG.OWNED_ASSETS_CACHE_TTL)
      return owned
    } catch (e) {
      console.error('[Blockchain] getOwnedAssets error:', e.message)
      return []
    }
  },

  /**
   * Get info about a specific asset by ID
   * @param {number} assetId - The asset ID to look up
   * @returns {object|null} Asset info including totalSupply and if it exists
   */
  getAssetInfo: async (assetId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return null

      const assets = BlockchainManager.contracts.assets
      
      // Check if asset exists (has been minted)
      const exists = await assets.exists(BigInt(assetId))
      if (!exists) return null

      // Get total supply
      const totalSupply = await assets.totalSupply(BigInt(assetId))

      return {
        assetId: Number(assetId),
        exists: true,
        totalSupply: Number(totalSupply)
      }
    } catch (e) {
      console.error('[Blockchain] getAssetInfo error:', e.message)
      return null
    }
  },

  /**
   * Check if an asset has any active listing
   * @param {number} assetId 
   * @returns {object|null} Active listing if found, null otherwise
   */
  getActiveListingForAsset: async (assetId) => {
    try {
      const listings = await BlockchainManager.getActiveListings()
      return listings.find(l => l.assetId === assetId && !l.isBundle) || null
    } catch {
      return null
    }
  },

  getActiveListings: async (options = {}) => {
    const cacheKey = `active_listings_${JSON.stringify(options.filters || {})}`
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.contracts.marketplace) return []

      const nextId = await BlockchainManager.contracts.marketplace.nextListingId()
      const nextBundleId = await BlockchainManager.contracts.marketplace.nextBundleId()
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)
      const listings = []

      // 1. Read all listings via Multicall3 (1 RPC call)
      const marketplace = BlockchainManager.contracts.marketplace
      const listingIds = Array.from({ length: Number(nextId) }, (_, i) => i)
      const listingCalls = listingIds.map(id => encodeCall(marketplace, 'listings', [id]))
      const listingResults = await multicall(listingCalls)

      // Parse listings and identify rentals
      const activeListings = []
      const rentalListingIds = []

      for (let i = 0; i < listingIds.length; i++) {
        const result = listingResults[i]
        if (!result?.success || result.returnData === '0x') continue

        try {
          const [seller, assetId, amount, price, isRental, duration] = decodeResult(marketplace, 'listings', result.returnData)
          if (amount > 0n) {
            activeListings.push({
              listingId: listingIds[i],
              id: Number(assetId),
              assetId: Number(assetId),
              seller,
              amount: Number(amount),
              price: BlockchainManager.ethers.formatUnits(price, 18),
              isRental: !!isRental,
              duration: Number(duration), // Raw seconds from contract (0 = no limit)
              rentalStatus: null,
              isListing: true
            })
            if (isRental) rentalListingIds.push(listingIds[i])
          }
        } catch { /* skip invalid listing */ }
      }

      // 2. Fetch rental statuses via Multicall3 (1 RPC call)
      if (rentalListingIds.length > 0) {
        const rentalCalls = rentalListingIds.map(id => encodeCall(marketplace, 'activeRentals', [id]))
        const rentalResults = await multicall(rentalCalls)
        const now = Math.floor(Date.now() / 1000)

        for (let i = 0; i < rentalListingIds.length; i++) {
          const result = rentalResults[i]
          if (!result?.success || result.returnData === '0x') continue

          try {
            const [renter, expiresAt] = decodeResult(marketplace, 'activeRentals', result.returnData)
            if (Number(expiresAt) > now) {
              const listing = activeListings.find(l => l.listingId === rentalListingIds[i])
              if (listing) listing.rentalStatus = { renter, expiresAt: Number(expiresAt) }
            }
          } catch { /* skip invalid rental */ }
        }
      }

      listings.push(...activeListings)
      console.log(`[Blockchain] Fetched ${listingIds.length} listings + ${rentalListingIds.length} rentals in 2 multicalls`)

      // Fetch all metadata in ONE batch call
      const assetIds = [...new Set(listings.filter(l => !l.isBundle).map(l => l.assetId))]
      const metadataMap = new Map()
      if (assetIds.length > 0 && BlockchainManager.contracts.metadata) {
        try {
          const metadataBatch = await BlockchainManager.contracts.metadata.getFullMetadataBatch(assetIds.map(id => BigInt(id)))
          assetIds.forEach((id, i) => metadataMap.set(id, metadataBatch[i]))
          console.log(`[Blockchain] Fetched metadata for ${assetIds.length} assets in 1 batch call`)
        } catch (e) {
          console.warn('[Blockchain] Batch metadata fetch failed, using fallback:', e.message)
        }
      }

      // Enrich listings with metadata
      for (const listing of listings) {
        if (!listing.isBundle) {
          const meta = metadataMap.get(listing.assetId) || {}
          listing.title = meta.title || `Asset #${listing.assetId}`
          listing.image = meta.imageUrl || ''
          listing.description = meta.description || ''
          listing.assetUrl = meta.assetUrl || ''
          listing.rarity = meta.rarity || ''
          listing.category = meta.category || ''
          listing.collection = meta.collection || ''
        }
      }

      // 2. Read bundle listings in batches
      for (let i = 0; i < Number(nextBundleId); i += MARKETPLACE_CONFIG.LISTING_FETCH_BATCH_SIZE) {
        const batchIds = []
        for (let j = i; j < Math.min(i + MARKETPLACE_CONFIG.LISTING_FETCH_BATCH_SIZE, Number(nextBundleId)); j++) {
          batchIds.push(j)
        }

        const batchResults = await Promise.all(batchIds.map(async (id) => {
          try {
            const bundle = await BlockchainManager.contracts.marketplace.bundleListings(id)
            if (bundle.active) {
              // Use limited block range to avoid RPC timeout
              const events = await BlockchainManager.contracts.marketplace.queryFilter(
                BlockchainManager.contracts.marketplace.filters.BundleListed(id),
                fromBlock
              ).catch(() => [])

              const event = events[0]
              if (!event) return null

              const assetIds = event.args.assetIds.map(aid => Number(aid))

              // Fetch bundle name (V1.1.0+)
              let bundleName = ''
              try {
                bundleName = await BlockchainManager.contracts.marketplace.getBundleName(id)
              } catch { /* Contract may not support names yet */ }

              // Fetch bundle metadata
              let metadata = { title: '', description: '', imageUrl: '', assetUrl: '' }
              if (BlockchainManager.contracts.metadata) {
                try {
                  const [title, description, imageUrl, assetUrl] = await BlockchainManager.contracts.metadata.getBundleMetadata(BigInt(id))
                  metadata = { title, description, imageUrl, assetUrl }
                } catch { /* skip metadata */ }
              }

              return {
                bundleId: id,
                isBundle: true,
                seller: bundle.seller,
                price: BlockchainManager.ethers.formatUnits(bundle.price, 18),
                assetIds: assetIds,
                id: `bundle_${id}`,
                status: 'active',
                name: bundleName || metadata.title || '',
                title: metadata.title || bundleName || `Bundle #${id}`,
                image: metadata.imageUrl || '',
                description: metadata.description || '',
                assetUrl: metadata.assetUrl || ''
              }
            }
          } catch (err) {
            console.warn(`[Blockchain] Failed to read bundle ${id}:`, err.message)
          }
          return null
        }))

        listings.push(...batchResults.filter(Boolean))

        if (i + MARKETPLACE_CONFIG.LISTING_FETCH_BATCH_SIZE < Number(nextBundleId)) {
          await new Promise(r => setTimeout(r, MARKETPLACE_CONFIG.BATCH_DELAY_MS))
        }
      }

      MarketplaceCache.set(cacheKey, listings)
      return listings
    } catch (e) {
      console.error('[Blockchain] getActiveListings error:', e.message)
      return []
    }
  },

  /**
   * Purchase an asset from the marketplace
   * @param {number} listingId 
   * @returns {Promise<any>} Transaction receipt
   */
  purchaseAsset: async (listingId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Get listing price
      const listing = await BlockchainManager.contracts.marketplace.listings(BigInt(listingId))
      if (!listing || listing.amount === 0n) throw new Error('Listing not available')

      // Approve OVG spending
      const tokenWithSigner = BlockchainManager.contracts.token.connect(signer)
      const approveTx = await tokenWithSigner.approve(
        BlockchainManager.contracts.marketplace.target,
        listing.price
      )
      await withTimeout(approveTx.wait(), MARKETPLACE_CONFIG.TX_WAIT_TIMEOUT_MS, 'Approval timed out')

      // Execute purchase
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const purchaseTx = await marketplaceWithSigner.purchase(BigInt(listingId))
      const receipt = await withTimeout(purchaseTx.wait(), MARKETPLACE_CONFIG.TX_WAIT_TIMEOUT_MS, 'Purchase timed out')

      console.log('[Blockchain] Purchase successful')
      return receipt
    } catch (e) {
      console.error('[Blockchain] Purchase failed:', e.message)
      throw e
    }
  },

  /**
   * Create a new listing on the marketplace
   * @param {number} assetId
   * @param {string} price - Price in OVG
   * @param {number} [durationSeconds=0] - Listing duration in seconds (0 = no limit)
   * @returns {Promise<any>} Transaction receipt
   */
  createListing: async (assetId, price, durationSeconds = 0) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Ensure marketplace is approved as operator
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)

      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator...')
        const approveTx = await assetsWithSigner.setApprovalForAll(
          BlockchainManager.contracts.marketplace.target,
          true
        )
        await approveTx.wait()
      }

      // Create listing
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), 18)
      const listTx = await marketplaceWithSigner.listAsset(BigInt(assetId), 1, priceWei, false, BigInt(durationSeconds))
      const receipt = await listTx.wait()

      console.log('[Blockchain] Listing created')
      return receipt
    } catch (e) {
      console.error('[Blockchain] createListing failed:', e.message)
      throw e
    }
  },

  /**
   * Create a listing with on-chain metadata (V2.0.0)
   * @param {number} assetId - Asset ID to list
   * @param {string} price - Price in OVG
   * @param {number} [durationSeconds=0] - Listing duration in seconds (0 = no limit)
   * @param {object} metadata - Metadata object
   * @param {string} metadata.title - Title (max 64 chars)
   * @param {string} metadata.description - Description (max 160 chars)
   * @param {string} metadata.imageUrl - Image URL (max 128 chars)
   * @param {string} metadata.assetUrl - Asset URL (max 128 chars)
   * @param {string} [paymentToken] - Payment token address (defaults to OVG)
   * @returns {Promise<any>} Transaction receipt
   */
  createListingWithMetadata: async (assetId, price, durationSeconds = 0, metadata, paymentToken = null) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}

      // Ensure marketplace is approved
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)

      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator...')
        const approveTx = await assetsWithSigner.setApprovalForAll(
          BlockchainManager.contracts.marketplace.target,
          true
        )
        await approveTx.wait()
      }

      // Step 1: Create listing
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), 18)

      const listTx = await marketplaceWithSigner.listAsset(
        BigInt(assetId),
        1,
        priceWei,
        false, // isRental
        BigInt(durationSeconds)
      )
      const receipt = await listTx.wait()

      // Step 2: Extract listingId from Listed event
      const listedEvent = receipt.logs.find(log => {
        try {
          const parsed = BlockchainManager.contracts.marketplace.interface.parseLog(log)
          return parsed?.name === 'Listed'
        } catch { return false }
      })

      if (!listedEvent) {
        console.warn('[Blockchain] Listed event not found, metadata not set')
        return receipt
      }

      const parsed = BlockchainManager.contracts.marketplace.interface.parseLog(listedEvent)
      const listingId = parsed.args[0]

      // Step 3: Set metadata on external contract
      if (BlockchainManager.contracts.metadata && (title || description || imageUrl || assetUrl)) {
        const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
        const metaTx = await metadataWithSigner.setListingMetadata(
          listingId,
          title,
          description,
          imageUrl,
          assetUrl
        )
        await metaTx.wait()
        console.log('[Blockchain] Listing metadata set on external contract')
      }

      console.log('[Blockchain] Listing with metadata created, ID:', listingId.toString())
      return receipt
    } catch (e) {
      console.error('[Blockchain] createListingWithMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Update metadata for an existing listing (V2.0.0 - external contract)
   * @param {number} listingId - Listing ID to update
   * @param {object} metadata - New metadata
   * @returns {Promise<any>}
   */
  setListingMetadata: async (listingId, metadata) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        throw new Error('Metadata contract not deployed on this network')
      }

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}

      const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
      const tx = await metadataWithSigner.setListingMetadata(
        BigInt(listingId),
        title,
        description,
        imageUrl,
        assetUrl
      )
      const receipt = await tx.wait()

      console.log('[Blockchain] Listing metadata updated on external contract')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setListingMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Get metadata for a listing (V2.0.0 - external contract)
   * @param {number} listingId - Listing ID
   * @returns {Promise<{title: string, description: string, imageUrl: string, assetUrl: string}>}
   */
  getListingMetadata: async (listingId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        return { title: '', description: '', imageUrl: '', assetUrl: '' }
      }

      const [title, description, imageUrl, assetUrl] = await BlockchainManager.contracts.metadata.getListingMetadata(BigInt(listingId))
      return { title, description, imageUrl, assetUrl }
    } catch (e) {
      console.error('[Blockchain] getListingMetadata failed:', e.message)
      return { title: '', description: '', imageUrl: '', assetUrl: '' }
    }
  },

  /**
   * Create a rental listing on the marketplace
   * @param {number} assetId - Asset to rent out
   * @param {string} pricePerPeriod - Price in OVG per rental period
   * @param {number} durationSeconds - Rental duration in seconds
   * @returns {Promise<any>}
   */
  createRentalListing: async (assetId, pricePerPeriod, durationSeconds) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Ensure marketplace is approved as operator
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)
      
      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator...')
        const approveTx = await assetsWithSigner.setApprovalForAll(
          BlockchainManager.contracts.marketplace.target,
          true
        )
        await approveTx.wait()
      }

      // Create rental listing (isRental = true)
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const priceWei = BlockchainManager.ethers.parseUnits(pricePerPeriod.toString(), 18)
      const listTx = await marketplaceWithSigner.listAsset(
        BigInt(assetId),
        1,
        priceWei,
        true, // isRental
        BigInt(durationSeconds)
      )
      const receipt = await listTx.wait()

      console.log('[Blockchain] Rental listing created')
      return receipt
    } catch (e) {
      console.error('[Blockchain] createRentalListing failed:', e.message)
      throw e
    }
  },

  /**
   * Create a rental listing with on-chain metadata (V2.0.0 - external contract)
   * @param {number} assetId - Asset to rent out
   * @param {string} pricePerPeriod - Price in OVG per rental period
   * @param {number} durationSeconds - Rental duration in seconds
   * @param {object} metadata - Metadata object
   * @param {string} [paymentToken] - Payment token address (unused - kept for API compatibility)
   * @returns {Promise<any>}
   */
  createRentalListingWithMetadata: async (assetId, pricePerPeriod, durationSeconds, metadata, paymentToken = null) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}

      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)

      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator...')
        const approveTx = await assetsWithSigner.setApprovalForAll(
          BlockchainManager.contracts.marketplace.target,
          true
        )
        await approveTx.wait()
      }

      // Step 1: Create rental listing without metadata
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const priceWei = BlockchainManager.ethers.parseUnits(pricePerPeriod.toString(), 18)

      const listTx = await marketplaceWithSigner.listAsset(
        BigInt(assetId),
        1,
        priceWei,
        true, // isRental
        BigInt(durationSeconds)
      )
      const receipt = await listTx.wait()

      // Step 2: Extract listingId from Listed event
      const listedEvent = receipt.logs.find(log => {
        try {
          const parsed = BlockchainManager.contracts.marketplace.interface.parseLog(log)
          return parsed?.name === 'Listed'
        } catch { return false }
      })

      if (!listedEvent) {
        console.warn('[Blockchain] Listed event not found, metadata not set')
        return receipt
      }

      const parsed = BlockchainManager.contracts.marketplace.interface.parseLog(listedEvent)
      const listingId = parsed.args[0]

      // Step 3: Set metadata on external contract
      if (BlockchainManager.contracts.metadata && (title || description || imageUrl || assetUrl)) {
        const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
        const metaTx = await metadataWithSigner.setListingMetadata(
          listingId,
          title,
          description,
          imageUrl,
          assetUrl
        )
        await metaTx.wait()
        console.log('[Blockchain] Rental listing metadata set on external contract')
      }

      console.log('[Blockchain] Rental listing with metadata created, ID:', listingId.toString())
      return receipt
    } catch (e) {
      console.error('[Blockchain] createRentalListingWithMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Rent an asset from the marketplace
   * @param {number} listingId - The listing ID to rent
   * @returns {Promise<any>}
   */
  rentAsset: async (listingId) => {
    console.log(`[Blockchain] Renting asset listing #${listingId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Get listing info to know the price
      const listing = await BlockchainManager.contracts.marketplace.listings(BigInt(listingId))
      
      // Approve OVG token spend
      const tokenWithSigner = BlockchainManager.contracts.token.connect(signer)
      const approveTx = await tokenWithSigner.approve(
        BlockchainManager.contracts.marketplace.target,
        listing.price
      )
      await approveTx.wait()

      // Call rent function
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.rent(BigInt(listingId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Asset rented successfully!')
      return receipt
    } catch (e) {
      console.error('[Blockchain] rentAsset failed:', e.message)
      throw e
    }
  },

  /**
   * Cancel a listing
   * @param {number} listingId
   */
  cancelListing: async (listingId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.cancelListing(BigInt(listingId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Listing cancelled')
      return receipt
    } catch (e) {
      console.error('[Blockchain] cancelListing failed:', e.message)
      throw e
    }
  },

  /**
   * Update a listing's price and/or duration
   * @param {number} listingId - The listing ID
   * @param {number} newPrice - New price in token units (0 to keep current)
   * @param {number} newDuration - New duration in seconds (0 to keep current)
   * @returns {Promise<any>} Transaction receipt
   */
  updateListing: async (listingId, newPrice, newDuration) => {
    console.log('[Blockchain] updateListing called:', { listingId, newPrice, newDuration })
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Convert price to wei (18 decimals)
      const priceWei = newPrice > 0
        ? BlockchainManager.ethers.parseUnits(newPrice.toString(), 18)
        : 0n

      console.log('[Blockchain] updateListing params:', { listingId, priceWei: priceWei.toString(), newDuration })

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.updateListing(
        BigInt(listingId),
        priceWei,
        BigInt(newDuration)
      )

      console.log('[Blockchain] updateListing tx sent:', tx.hash)

      const receipt = await tx.wait()

      console.log('[Blockchain] Listing updated successfully, txHash:', receipt.hash)
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] updateListing failed:', e.message)
      throw e
    }
  },

  /**
   * Place a bid on a listing
   * @param {number} listingId 
   * @param {string} price - Price in OVG
   */
  placeBid: async (listingId, price) => {
    console.log(`[Blockchain] Placing bid of ${price} OVG on listing #${listingId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), 18)

      // Approve OVG spending for escrow
      const tokenWithSigner = BlockchainManager.contracts.token.connect(signer)
      const approveTx = await tokenWithSigner.approve(
        BlockchainManager.contracts.marketplace.target,
        priceWei
      )
      await approveTx.wait()

      // Execute place bid
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const bidTx = await marketplaceWithSigner.placeBid(BigInt(listingId), priceWei)
      const receipt = await bidTx.wait()

      console.log('[Blockchain] Bid placed successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] placeBid failed:', e.message)
      throw e
    }
  },

  /**
   * Accept a bid as a seller
   * @param {number} listingId 
   * @param {string} bidder - Bidder address
   */
  acceptBid: async (listingId, bidder) => {
    console.log(`[Blockchain] Accepting bid from ${bidder} on listing #${listingId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Fix: Ensure address is checksummed to prevent ethers v6 from treating it as an ENS name
      // This fixes the "network does not support ENS" error on Amoy
      const checksumBidder = BlockchainManager.ethers.getAddress(bidder)

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.acceptBid(BigInt(listingId), checksumBidder)
      const receipt = await tx.wait()

      console.log('[Blockchain] Bid accepted successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] acceptBid failed:', e.message)
      throw e
    }
  },

  /**
   * Withdraw a bid
   * @param {number} listingId 
   */
  withdrawBid: async (listingId) => {
    console.log(`[Blockchain] Withdrawing bid on listing #${listingId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.withdrawBid(BigInt(listingId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Bid withdrawn successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] withdrawBid failed:', e.message)
      throw e
    }
  },

  // ==================== GLOBAL BIDS (Offers for non-listed NFTs) ====================

  /**
   * Place a global bid (offer) on an asset that is NOT listed
   * @param {number} assetId - The asset ID to make an offer on
   * @param {string} price - Offer price in OVG
   */
  placeGlobalBid: async (assetId, price) => {
    console.log(`[Blockchain] Placing global bid on asset #${assetId} for ${price} OVG...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), 18)
      
      // Approve OVG token spending if needed
      const address = await signer.getAddress()
      const tokenWithSigner = BlockchainManager.contracts.token.connect(signer)
      const currentAllowance = await tokenWithSigner.allowance(address, BlockchainManager.contracts.marketplace.target)
      
      if (currentAllowance < priceWei) {
        console.log('[Blockchain] Approving OVG spending for global bid...')
        const approveTx = await tokenWithSigner.approve(BlockchainManager.contracts.marketplace.target, priceWei)
        await approveTx.wait()
      }

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.placeGlobalBid(BigInt(assetId), priceWei)
      const receipt = await tx.wait()

      console.log('[Blockchain] Global bid placed successfully')
      MarketplaceCache.clear() // Clear cache to refresh offers
      return receipt
    } catch (e) {
      console.error('[Blockchain] placeGlobalBid failed:', e.message)
      throw e
    }
  },

  /**
   * Accept a global bid (as the asset owner)
   * @param {number} assetId - The asset ID
   * @param {string} bidder - Address of the bidder to accept
   */
  acceptGlobalBid: async (assetId, bidder) => {
    console.log(`[Blockchain] Accepting global bid on asset #${assetId} from ${bidder}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Ensure marketplace is approved to transfer the asset
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)
      
      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator...')
        const approveTx = await assetsWithSigner.setApprovalForAll(BlockchainManager.contracts.marketplace.target, true)
        await approveTx.wait()
      }

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const checksumBidder = BlockchainManager.ethers.getAddress(bidder)
      const tx = await marketplaceWithSigner.acceptGlobalBid(BigInt(assetId), checksumBidder)
      const receipt = await tx.wait()

      console.log('[Blockchain] Global bid accepted successfully')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] acceptGlobalBid failed:', e.message)
      throw e
    }
  },

  /**
   * Withdraw a global bid (as the bidder)
   * @param {number} assetId - The asset ID to withdraw bid from
   */
  withdrawGlobalBid: async (assetId) => {
    console.log(`[Blockchain] Withdrawing global bid on asset #${assetId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.withdrawGlobalBid(BigInt(assetId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Global bid withdrawn successfully')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] withdrawGlobalBid failed:', e.message)
      throw e
    }
  },

  /**
   * Get global bids for an asset
   * @param {number} assetId - The asset ID
   * @returns {Array} Array of global bids with bidder, price, timestamp
   */
  getGlobalBidsForAsset: async (assetId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)

      // Query GlobalBidPlaced events for this asset (paginated to avoid RPC timeout)
      const events = await queryEventsPaginated(
        marketplace,
        marketplace.filters.GlobalBidPlaced(assetId),
        fromBlock,
        currentBlock
      )

      const bids = []

      // Get unique bidders from events
      const bidders = [...new Set(events.map(e => e.args.bidder))]
      const eventByBidder = new Map(events.map(e => [e.args.bidder, e]))

      if (bidders.length > 0) {
        // Fetch all bids via Multicall3 (1 RPC call)
        const bidCalls = bidders.map(bidder => encodeCall(marketplace, 'globalBids', [BigInt(assetId), bidder]))
        const bidResults = await multicall(bidCalls)

        for (let i = 0; i < bidders.length; i++) {
          const result = bidResults[i]
          if (!result?.success || result.returnData === '0x') continue

          try {
            const [, price, timestamp] = decodeResult(marketplace, 'globalBids', result.returnData)
            if (price > 0n) {
              const event = eventByBidder.get(bidders[i])
              bids.push({
                assetId: Number(assetId),
                bidder: bidders[i],
                price: parseFloat(BlockchainManager.ethers.formatUnits(price, 18)),
                timestamp: Number(timestamp),
                block: event?.blockNumber || 0,
                isGlobal: true
              })
            }
          } catch (e) { ErrorLogger.debug('Bid decode failed', { bidder: bidders[i], error: e.message }) }
        }
      }

      console.log(`[Blockchain] getGlobalBidsForAsset #${assetId}: ${bids.length} active bids (${bidders.length} checked in 1 multicall)`)
      return bids
    } catch (e) {
      console.error('[Blockchain] getGlobalBidsForAsset failed:', e.message)
      return []
    }
  },

  /**
   * Get all global bids placed by a user
   * @param {string} userAddress 
   * @returns {Array} Array of global bids placed by user
   */
  getUserGlobalBids: async (userAddress) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)

      // Query GlobalBidPlaced events by this user (paginated to avoid RPC timeout)
      const events = await queryEventsPaginated(
        marketplace,
        marketplace.filters.GlobalBidPlaced(null, userAddress),
        fromBlock,
        currentBlock
      )

      const bids = []
      const checkedAssets = new Set()
      const eventsByAsset = new Map()

      // Deduplicate events by assetId
      for (const e of events) {
        const assetId = Number(e.args.assetId)
        if (!checkedAssets.has(assetId)) {
          checkedAssets.add(assetId)
          eventsByAsset.set(assetId, e)
        }
      }

      // Fetch all bids via Multicall3 (1 RPC call)
      const assetIds = Array.from(checkedAssets)
      if (assetIds.length > 0) {
        const bidCalls = assetIds.map(id => encodeCall(marketplace, 'globalBids', [BigInt(id), userAddress]))
        const bidResults = await multicall(bidCalls)

        for (let i = 0; i < assetIds.length; i++) {
          const result = bidResults[i]
          if (!result?.success || result.returnData === '0x') continue

          try {
            const [bidder, price, timestamp] = decodeResult(marketplace, 'globalBids', result.returnData)
            if (price > 0n) {
              const event = eventsByAsset.get(assetIds[i])
              bids.push({
                assetId: assetIds[i],
                bidder: userAddress,
                price: parseFloat(BlockchainManager.ethers.formatUnits(price, 18)),
                timestamp: Number(timestamp),
                block: event?.blockNumber || 0,
                isGlobal: true
              })
            }
          } catch (e) { ErrorLogger.debug('Bid decode failed', { assetId: assetIds[i], error: e.message }) }
        }
      }

      console.log(`[Blockchain] getUserGlobalBids for ${userAddress.slice(0,8)}...: ${bids.length} active bids (${assetIds.length} checked in 1 multicall)`)
      return bids
    } catch (e) {
      console.error('[Blockchain] getUserGlobalBids failed:', e.message)
      return []
    }
  },

  /**
   * Get all global bids received on assets owned by user
   * @param {string} userAddress - The owner's address
   * @param {Array} ownedAssets - Array of owned asset IDs
   * @returns {Array} Array of global bids received
   */
  getReceivedGlobalBids: async (userAddress, ownedAssets) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      if (!ownedAssets || ownedAssets.length === 0) return []

      const allBids = []
      
      // Check global bids for each owned asset (skip bundles - they don't have global bids)
      for (const asset of ownedAssets) {
        const assetId = asset.assetId || asset.id
        
        // Skip bundles and non-numeric IDs (global bids only work with numeric asset IDs)
        if (asset.isBundle || typeof assetId === 'string' && assetId.includes('bundle')) {
          continue
        }
        
        const numericId = Number(assetId)
        if (isNaN(numericId)) continue
        
        const bids = await BlockchainManager.getGlobalBidsForAsset(numericId)
        allBids.push(...bids)
      }

      console.log(`[Blockchain] getReceivedGlobalBids for ${userAddress.slice(0,8)}...: ${allBids.length} bids on ${ownedAssets.length} assets`)
      return allBids
    } catch (e) {
      console.error('[Blockchain] getReceivedGlobalBids failed:', e.message)
      return []
    }
  },

  // ==================== END GLOBAL BIDS ====================

  /**
   * List a bundle of assets
   * @param {number[]} assetIds 
   * @param {number[]} amounts 
   * @param {string} price - Total price in OVG
   * @param {string} [name] - Optional bundle name (max 32 chars)
   */
  listBundle: async (assetIds, amounts, price, name = '') => {
    console.log(`[Blockchain] Listing bundle of ${assetIds.length} assets for ${price} OVG${name ? ` named "${name}"` : ''}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), 18)
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      
      // Ensure marketplace is approved to transfer the assets in the bundle
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, marketplaceWithSigner.target)
      
      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator for bundle...')
        const approveTx = await assetsWithSigner.setApprovalForAll(marketplaceWithSigner.target, true)
        await approveTx.wait()
      }
      
      let tx
      if (name && name.trim()) {
        tx = await marketplaceWithSigner.listBundleWithName(
          assetIds.map(id => BigInt(id)), 
          amounts.map(a => BigInt(a)), 
          priceWei,
          name.trim()
        )
      } else {
        tx = await marketplaceWithSigner.listBundle(
          assetIds.map(id => BigInt(id)), 
          amounts.map(a => BigInt(a)), 
          priceWei
        )
      }
      const receipt = await tx.wait()

      console.log('[Blockchain] Bundle listed successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] listBundle failed:', e.message)
      throw e
    }
  },

  /**
   * List a bundle with on-chain metadata (V2.0.0 - external contract)
   * @param {Array<number>} assetIds - Asset IDs in bundle
   * @param {Array<number>} amounts - Amounts for each asset
   * @param {string} price - Price in OVG
   * @param {object} metadata - Metadata object
   * @param {string} [paymentToken] - Payment token address (unused - kept for API compatibility)
   * @returns {Promise<any>}
   */
  listBundleWithMetadata: async (assetIds, amounts, price, metadata, paymentToken = null) => {
    console.log(`[Blockchain] Listing bundle with metadata...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}
      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), 18)

      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, marketplaceWithSigner.target)

      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator for bundle...')
        const approveTx = await assetsWithSigner.setApprovalForAll(marketplaceWithSigner.target, true)
        await approveTx.wait()
      }

      // Step 1: Create bundle without metadata (use name from title)
      const tx = title
        ? await marketplaceWithSigner.listBundleWithName(
            assetIds.map(id => BigInt(id)),
            amounts.map(a => BigInt(a)),
            priceWei,
            title
          )
        : await marketplaceWithSigner.listBundle(
            assetIds.map(id => BigInt(id)),
            amounts.map(a => BigInt(a)),
            priceWei
          )
      const receipt = await tx.wait()

      // Step 2: Extract bundleId from BundleListed event
      const bundleEvent = receipt.logs.find(log => {
        try {
          const parsed = BlockchainManager.contracts.marketplace.interface.parseLog(log)
          return parsed?.name === 'BundleListed'
        } catch { return false }
      })

      if (!bundleEvent) {
        console.warn('[Blockchain] BundleListed event not found, metadata not set')
        return receipt
      }

      const parsed = BlockchainManager.contracts.marketplace.interface.parseLog(bundleEvent)
      const bundleId = parsed.args[0]

      // Step 3: Set metadata on external contract
      if (BlockchainManager.contracts.metadata && (title || description || imageUrl || assetUrl)) {
        const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
        const metaTx = await metadataWithSigner.setBundleMetadata(
          bundleId,
          title,
          description,
          imageUrl,
          assetUrl
        )
        await metaTx.wait()
        console.log('[Blockchain] Bundle metadata set on external contract')
      }

      console.log('[Blockchain] Bundle with metadata listed, ID:', bundleId.toString())
      return receipt
    } catch (e) {
      console.error('[Blockchain] listBundleWithMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Update metadata for an existing bundle (V2.0.0 - external contract)
   * @param {number} bundleId - Bundle ID
   * @param {object} metadata - New metadata
   * @returns {Promise<any>}
   */
  setBundleMetadata: async (bundleId, metadata) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        throw new Error('Metadata contract not deployed on this network')
      }

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}

      const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
      const tx = await metadataWithSigner.setBundleMetadata(
        BigInt(bundleId),
        title,
        description,
        imageUrl,
        assetUrl
      )
      const receipt = await tx.wait()

      console.log('[Blockchain] Bundle metadata updated on external contract')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setBundleMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Get metadata for a bundle (V2.0.0 - external contract)
   * @param {number} bundleId - Bundle ID
   * @returns {Promise<{title: string, description: string, imageUrl: string, assetUrl: string}>}
   */
  getBundleMetadata: async (bundleId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        return { title: '', description: '', imageUrl: '', assetUrl: '' }
      }

      const [title, description, imageUrl, assetUrl] = await BlockchainManager.contracts.metadata.getBundleMetadata(BigInt(bundleId))
      return { title, description, imageUrl, assetUrl }
    } catch (e) {
      console.error('[Blockchain] getBundleMetadata failed:', e.message)
      return { title: '', description: '', imageUrl: '', assetUrl: '' }
    }
  },

  /**
   * Purchase a bundle
   * @param {number} bundleId
   */
  purchaseBundle: async (bundleId) => {
    console.log(`[Blockchain] Purchasing bundle #${bundleId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const bundle = await BlockchainManager.contracts.marketplace.bundleListings(BigInt(bundleId))
      
      // Approve OVG token spend
      const tokenWithSigner = BlockchainManager.contracts.token.connect(signer)
      const approveTx = await tokenWithSigner.approve(
        BlockchainManager.contracts.marketplace.target,
        bundle.price
      )
      await approveTx.wait()

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.purchaseBundle(BigInt(bundleId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Bundle purchased successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] purchaseBundle failed:', e.message)
      throw e
    }
  },

  /**
   * Cancel a bundle listing
   * @param {number} bundleId 
   */
  cancelBundle: async (bundleId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.cancelBundle(BigInt(bundleId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Bundle cancelled')
      return receipt
    } catch (e) {
      console.error('[Blockchain] cancelBundle failed:', e.message)
      throw e
    }
  },

  /**
   * Set or update the name of a bundle (on-chain)
   * @param {number} bundleId - The bundle ID
   * @param {string} name - New name (max 32 characters)
   * @returns {Promise<object>} Transaction receipt
   */
  setBundleName: async (bundleId, name) => {
    console.log(`[Blockchain] Setting bundle #${bundleId} name to "${name}"...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      if (name.length > 32) throw new Error('Name too long (max 32 characters)')

      const marketplace = BlockchainManager.contracts.marketplace
      const userAddress = await signer.getAddress()

      // Pre-validate bundle state before sending transaction
      const bundle = await marketplace.bundleListings(BigInt(bundleId))
      console.log(`[Blockchain] Bundle #${bundleId} info:`, {
        seller: bundle.seller,
        active: bundle.active,
        userAddress
      })

      if (!bundle.active) {
        throw new Error('Bundle not active')
      }
      if (bundle.seller.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error('Only seller can rename')
      }

      const marketplaceWithSigner = marketplace.connect(signer)
      const tx = await marketplaceWithSigner.setBundleName(BigInt(bundleId), name)
      const receipt = await tx.wait()

      console.log('[Blockchain] Bundle renamed successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setBundleName failed:', e.message)
      throw e
    }
  },

  /**
   * Get the name of a bundle
   * @param {number} bundleId - The bundle ID
   * @returns {Promise<string>} Bundle name (empty string if not set)
   */
  getBundleName: async (bundleId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return ''

      const name = await BlockchainManager.contracts.marketplace.getBundleName(BigInt(bundleId))
      return name || ''
    } catch (e) {
      console.warn('[Blockchain] getBundleName failed:', e.message)
      return ''
    }
  },

  // ==================== MARKETPLACE ADMIN (V1.2.0) ====================

  /**
   * Get current marketplace fee in basis points (e.g., 250 = 2.5%)
   * @returns {Promise<number>} Fee in basis points
   */
  getMarketplaceFee: async () => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return 0

      const fee = await BlockchainManager.contracts.marketplace.marketplaceFee()
      return Number(fee)
    } catch (e) {
      console.warn('[Blockchain] getMarketplaceFee failed:', e.message)
      return 0
    }
  },

  /**
   * Get fee recipient address
   * @returns {Promise<string|null>} Fee recipient address
   */
  getFeeRecipient: async () => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return null

      const recipient = await BlockchainManager.contracts.marketplace.feeRecipient()
      return recipient === '0x0000000000000000000000000000000000000000' ? null : recipient
    } catch (e) {
      console.warn('[Blockchain] getFeeRecipient failed:', e.message)
      return null
    }
  },

  /**
   * Get accumulated fees (when feeRecipient was not set)
   * @returns {Promise<string>} Accumulated fees in OVG
   */
  getAccumulatedFees: async () => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return '0'

      const fees = await BlockchainManager.contracts.marketplace.accumulatedFees()
      return BlockchainManager.ethers.formatUnits(fees, 18)
    } catch (e) {
      console.warn('[Blockchain] getAccumulatedFees failed:', e.message)
      return '0'
    }
  },

  /**
   * Check if marketplace is paused
   * @returns {Promise<boolean>}
   */
  isMarketplacePaused: async () => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return false

      return await BlockchainManager.contracts.marketplace.paused()
    } catch (e) {
      console.warn('[Blockchain] isMarketplacePaused failed:', e.message)
      return false
    }
  },

  /**
   * Set marketplace fee (owner only)
   * @param {number} feeBasisPoints - Fee in basis points (e.g., 250 = 2.5%, max 1000 = 10%)
   * @returns {Promise<object>} Transaction receipt
   */
  setMarketplaceFee: async (feeBasisPoints) => {
    console.log(`[Blockchain] Setting marketplace fee to ${feeBasisPoints} basis points (${feeBasisPoints / 100}%)...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      if (feeBasisPoints > 1000) throw new Error('Fee cannot exceed 10% (1000 basis points)')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.setMarketplaceFee(BigInt(feeBasisPoints))
      const receipt = await tx.wait()

      console.log('[Blockchain] Marketplace fee updated successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setMarketplaceFee failed:', e.message)
      throw e
    }
  },

  /**
   * Set fee recipient address (owner only)
   * @param {string} recipientAddress - Address to receive marketplace fees
   * @returns {Promise<object>} Transaction receipt
   */
  setFeeRecipient: async (recipientAddress) => {
    console.log(`[Blockchain] Setting fee recipient to ${recipientAddress}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.setFeeRecipient(recipientAddress)
      const receipt = await tx.wait()

      console.log('[Blockchain] Fee recipient updated successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setFeeRecipient failed:', e.message)
      throw e
    }
  },

  /**
   * Withdraw accumulated marketplace fees (owner only)
   * @returns {Promise<object>} Transaction receipt
   */
  withdrawMarketplaceFees: async () => {
    console.log('[Blockchain] Withdrawing accumulated marketplace fees...')
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.withdrawFees()
      const receipt = await tx.wait()

      console.log('[Blockchain] Marketplace fees withdrawn successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] withdrawMarketplaceFees failed:', e.message)
      throw e
    }
  },

  /**
   * Pause the marketplace (owner only, emergency stop)
   * @returns {Promise<object>} Transaction receipt
   */
  pauseMarketplace: async () => {
    console.log('[Blockchain] Pausing marketplace...')
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.pause()
      const receipt = await tx.wait()

      console.log('[Blockchain] Marketplace paused successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] pauseMarketplace failed:', e.message)
      throw e
    }
  },

  /**
   * Unpause the marketplace (owner only)
   * @returns {Promise<object>} Transaction receipt
   */
  unpauseMarketplace: async () => {
    console.log('[Blockchain] Unpausing marketplace...')
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.unpause()
      const receipt = await tx.wait()

      console.log('[Blockchain] Marketplace unpaused successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] unpauseMarketplace failed:', e.message)
      throw e
    }
  },

  /**
   * Initialize V1.2.0 upgrade (call after upgrading the contract)
   * @param {string} feeRecipientAddress - Address to receive marketplace fees
   * @returns {Promise<object>} Transaction receipt
   */
  initializeMarketplaceV1_2: async (feeRecipientAddress) => {
    console.log(`[Blockchain] Initializing marketplace V1.2 with fee recipient ${feeRecipientAddress}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.initializeV1_2(feeRecipientAddress)
      const receipt = await tx.wait()

      console.log('[Blockchain] Marketplace V1.2 initialized successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] initializeMarketplaceV1_2 failed:', e.message)
      throw e
    }
  },

  // ==================== END MARKETPLACE ADMIN ====================

  extendRental: async (listingId) => {
    console.log(`[Blockchain] Extending rental for listing ${listingId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const marketplace = BlockchainManager.contracts.marketplace
      const signer = await BlockchainManager.getSigner()
      const marketplaceWithSigner = marketplace.connect(signer)

      // Get listing info for price
      const listing = await marketplace.listings(listingId)
      const price = listing.price

      // Approve OVG tokens for extension fee
      const token = BlockchainManager.contracts.token
      const tokenWithSigner = token.connect(signer)
      
      console.log('[Blockchain] Approving OVG for extension fee...')
      const approveTx = await tokenWithSigner.approve(marketplace.target, price)
      await approveTx.wait()

      const tx = await marketplaceWithSigner.extendRental(listingId)
      const receipt = await tx.wait()

      console.log('[Blockchain] Rental extended successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] extendRental failed:', e.message)
      throw e
    }
  },

  /**
   * Set royalty for an asset (Authorized creators only)
   * @param {number} assetId 
   * @param {string} creator 
   * @param {number} percentage - Royalty percentage (e.g., 5 = 5%)
   */
  setRoyalty: async (assetId, creator, percentage) => {
    console.log(`[Blockchain] Setting royalty for asset #${assetId} to ${percentage}% for ${creator}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      // Convert percentage to basis points (e.g., 5% = 500 basis points, 0.08% = 8 basis points)
      // Contract uses 10000 basis points = 100%
      const basisPoints = Math.round(percentage * 100)
      const tx = await assetsWithSigner.setRoyalty(BigInt(assetId), creator, BigInt(basisPoints))
      const receipt = await tx.wait()

      console.log('[Blockchain] Royalty set successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setRoyalty failed:', e.message)
      throw e
    }
  },

  /**
   * Get royalty info for an asset
   * @param {number} assetId
   * @param {number} salePrice - Sale price to calculate royalty amount (default 10000 for percentage calc)
   * @returns {object} { receiver: address, percentage: number }
   */
  getRoyaltyInfo: async (assetId, salePrice = 10000) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return { receiver: null, percentage: 0 }
      
      const assets = BlockchainManager.contracts.assets
      const [receiver, royaltyAmount] = await assets.getRoyaltyInfo(BigInt(assetId), BigInt(salePrice))
      
      // Calculate percentage from royalty amount
      const percentage = salePrice > 0 ? (Number(royaltyAmount) / salePrice) * 100 : 0
      
      return {
        receiver: receiver === '0x0000000000000000000000000000000000000000' ? null : receiver,
        percentage: Math.round(percentage * 100) / 100 // Round to 2 decimals
      }
    } catch (e) {
      console.error('[Blockchain] getRoyaltyInfo failed:', e.message)
      return { receiver: null, percentage: 0 }
    }
  },

  /**
   * Check if user has creator role
   */
  checkCreatorRole: async (address) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return false
      
      const assets = BlockchainManager.contracts.assets
      const role = await assets.MINTER_ROLE()
      return await assets.hasRole(role, address)
    } catch (e) {
      return false
    }
  },

  // ==================== TOKEN NAMING ====================

  /**
   * Set a custom name for a token (owner only, max 32 chars)
   * @param {number} tokenId - The token ID to rename
   * @param {string} newName - New name (max 32 characters)
   * @returns {Promise<any>} Transaction receipt
   */
  setTokenName: async (tokenId, newName) => {
    console.log(`[Blockchain] Setting name for token #${tokenId} to "${newName}"...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Validate name length
      if (newName.length > 32) {
        throw new Error('Name too long (max 32 characters)')
      }

      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const tx = await assetsWithSigner.setTokenName(BigInt(tokenId), newName)
      const receipt = await tx.wait()

      console.log('[Blockchain] Token name set successfully')
      MarketplaceCache.clear() // Clear cache to refresh asset names
      return receipt
    } catch (e) {
      console.error('[Blockchain] setTokenName failed:', e.message)
      throw e
    }
  },

  /**
   * Get the custom name for a token
   * @param {number} tokenId - The token ID to look up
   * @returns {Promise<string>} Custom name or empty string if not set
   */
  getTokenName: async (tokenId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return ''

      const assets = BlockchainManager.contracts.assets
      const name = await assets.getTokenName(BigInt(tokenId))
      return name || ''
    } catch (e) {
      console.error('[Blockchain] getTokenName failed:', e.message)
      return ''
    }
  },

  // ==================== END TOKEN NAMING ====================

  getMarketplaceActivity: async (options = {}) => {
    const { $limit: limit = 20 } = options
    const cacheKey = `activity_${limit}`
    
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      
      // Calculate actual fromBlock (ethers v6 doesn't support negative block numbers)
      // Use a very large range to catch all historical events (Polygon Amoy ~2s blocks)
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE) // ~500k blocks back (~12 days on Polygon)
      console.log(`[Blockchain] Activity query from block ${fromBlock} to ${currentBlock} (contract: ${await marketplace.getAddress()})`)

      // Fetch all relevant events in parallel with error handling
      const [listed, purchased, rented, cancelled, bidPlaced, bidAccepted, bundleListed, bundlePurchased, bundleCancelled] = await Promise.all([
        marketplace.queryFilter('Listed', fromBlock).catch(e => { console.warn('[Blockchain] Listed query failed:', e.message); return [] }),
        marketplace.queryFilter('Purchased', fromBlock).catch(e => { console.warn('[Blockchain] Purchased query failed:', e.message); return [] }),
        marketplace.queryFilter('Rented', fromBlock).catch(e => { console.warn('[Blockchain] Rented query failed:', e.message); return [] }),
        marketplace.queryFilter('Cancelled', fromBlock).catch(e => { console.warn('[Blockchain] Cancelled query failed:', e.message); return [] }),
        marketplace.queryFilter('BidPlaced', fromBlock).catch(e => { console.warn('[Blockchain] BidPlaced query failed:', e.message); return [] }),
        marketplace.queryFilter('BidAccepted', fromBlock).catch(e => { console.warn('[Blockchain] BidAccepted query failed:', e.message); return [] }),
        marketplace.queryFilter('BundleListed', fromBlock).catch(e => { console.warn('[Blockchain] BundleListed query failed:', e.message); return [] }),
        marketplace.queryFilter('BundlePurchased', fromBlock).catch(e => { console.warn('[Blockchain] BundlePurchased query failed:', e.message); return [] }),
        marketplace.queryFilter('BundleCancelled', fromBlock).catch(e => { console.warn('[Blockchain] BundleCancelled query failed:', e.message); return [] })
      ])

      console.log(`[Blockchain] Activity events: Listed=${listed.length}, Purchased=${purchased.length}, BidAccepted=${bidAccepted.length}, Rented=${rented.length}, Cancelled=${cancelled.length}, BidPlaced=${bidPlaced.length}, BundleListed=${bundleListed.length}, BundlePurchased=${bundlePurchased.length}, BundleCancelled=${bundleCancelled.length}`)

      // Build a map of listingId -> assetId from Listed events
      const listingToAssetMap = new Map()
      for (const e of listed) {
        listingToAssetMap.set(Number(e.args.listingId), Number(e.args.assetId))
      }

      // Deduplicate BidPlaced events - only show most recent bid per listingId+bidder
      const seenBids = new Set()
      const sortedBidPlaced = [...bidPlaced].sort((a, b) => b.blockNumber - a.blockNumber)
      const uniqueBidPlaced = sortedBidPlaced.filter(e => {
        const key = `${Number(e.args.listingId)}_${e.args.bidder.toLowerCase()}`
        if (seenBids.has(key)) return false
        seenBids.add(key)
        return true
      })

      const allEvents = [
        ...listed.map(e => ({ 
          type: 'listed', 
          listingId: Number(e.args.listingId), 
          seller: e.args.seller,
          price: BlockchainManager.ethers.formatUnits(e.args.price, 18), 
          assetId: Number(e.args.assetId), 
          block: e.blockNumber, 
          txHash: e.transactionHash, 
          timestamp: Date.now(),
          isActivity: true
        })),
        ...purchased.map(e => {
          const listingId = Number(e.args.listingId)
          return { 
            type: 'purchased', 
            listingId, 
            assetId: listingToAssetMap.get(listingId),
            buyer: e.args.buyer,
            price: BlockchainManager.ethers.formatUnits(e.args.price || 0, 18),
            block: e.blockNumber, 
            txHash: e.transactionHash, 
            timestamp: Date.now(),
            isActivity: true
          }
        }),
        ...bidAccepted.map(e => {
          const listingId = Number(e.args.listingId)
          return { 
            type: 'bidaccepted', 
            listingId, 
            assetId: listingToAssetMap.get(listingId),
            seller: e.args.seller,
            buyer: e.args.bidder,
            price: BlockchainManager.ethers.formatUnits(e.args.price || 0, 18),
            block: e.blockNumber, 
            txHash: e.transactionHash, 
            timestamp: Date.now(),
            isActivity: true
          }
        }),
        ...rented.map(e => {
          const listingId = Number(e.args.listingId)
          return { 
            type: 'rented', 
            listingId, 
            assetId: listingToAssetMap.get(listingId),
            renter: e.args.renter,
            block: e.blockNumber, 
            txHash: e.transactionHash, 
            timestamp: Date.now(),
            isActivity: true
          }
        }),
        ...cancelled.map(e => {
          const listingId = Number(e.args.listingId)
          return { 
            type: 'cancelled', 
            listingId, 
            assetId: listingToAssetMap.get(listingId),
            seller: e.args.seller,
            block: e.blockNumber, 
            txHash: e.transactionHash, 
            timestamp: Date.now(),
            isActivity: true
          }
        }),
        ...uniqueBidPlaced.map(e => {
          const listingId = Number(e.args.listingId)
          return { 
            type: 'bidplaced', 
            listingId, 
            assetId: listingToAssetMap.get(listingId),
            bidder: e.args.bidder,
            price: BlockchainManager.ethers.formatUnits(e.args.price, 18),
            block: e.blockNumber, 
            txHash: e.transactionHash, 
            timestamp: Date.now(),
            isActivity: true
          }
        }),
        // Bundle events
        ...bundleListed.map(e => ({
          type: 'bundlelisted',
          bundleId: Number(e.args.bundleId),
          seller: e.args.seller,
          price: BlockchainManager.ethers.formatUnits(e.args.price, 18),
          assetCount: e.args.assetIds?.length || 0,
          isBundle: true,
          block: e.blockNumber,
          txHash: e.transactionHash,
          timestamp: Date.now(),
          isActivity: true
        })),
        ...bundlePurchased.map(e => ({
          type: 'bundlepurchased',
          bundleId: Number(e.args.bundleId),
          buyer: e.args.buyer,
          price: BlockchainManager.ethers.formatUnits(e.args.price, 18),
          isBundle: true,
          block: e.blockNumber,
          txHash: e.transactionHash,
          timestamp: Date.now(),
          isActivity: true
        })),
        ...bundleCancelled.map(e => ({
          type: 'bundlecancelled',
          bundleId: Number(e.args.bundleId),
          seller: e.args.seller,
          isBundle: true,
          block: e.blockNumber,
          txHash: e.transactionHash,
          timestamp: Date.now(),
          isActivity: true
        }))
      ]

      // Load bundle names for bundle events
      const bundleEvents = allEvents.filter(e => e.isBundle && e.bundleId !== undefined)
      const uniqueBundleIds = [...new Set(bundleEvents.map(e => e.bundleId))]
      
      if (uniqueBundleIds.length > 0) {
        const bundleNames = await Promise.all(
          uniqueBundleIds.map(id => marketplace.getBundleName(BigInt(id)).catch(() => ''))
        )
        const bundleNameMap = new Map(uniqueBundleIds.map((id, i) => [id, bundleNames[i]]))
        
        for (const event of bundleEvents) {
          event.bundleName = bundleNameMap.get(event.bundleId) || ''
        }
      }

      const results = allEvents.sort((a, b) => b.block - a.block).slice(0, limit)
      console.log(`[Blockchain] getMarketplaceActivity: ${results.length} total events`)
      MarketplaceCache.set(cacheKey, results, MARKETPLACE_CONFIG.ACTIVITY_CACHE_TTL)
      return results
    } catch (e) {
      console.error('[Blockchain] getMarketplaceActivity failed:', e.message)
      return []
    }
  },

  getUserBids: async (userAddress, options = {}) => {
    if (!userAddress) return []

    const cacheKey = `user_bids_${userAddress.toLowerCase()}`
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)
      const bids = []

      // Query BidPlaced events where bidder is the user (paginated to avoid RPC timeout)
      try {
        console.log(`[Blockchain] getUserBids: Querying BidPlaced events for ${userAddress} from block ${fromBlock}`)
        const bidEvents = await queryEventsPaginated(
          marketplace,
          marketplace.filters.BidPlaced(null, userAddress),
          fromBlock,
          currentBlock
        )
        console.log(`[Blockchain] getUserBids: Found ${bidEvents.length} BidPlaced events`)

        // Track which listingIds we've already processed to avoid duplicates
        const processedListings = new Set()

        // Process regular bids (most recent event first to get latest txHash)
        const sortedBidEvents = [...bidEvents].sort((a, b) => b.blockNumber - a.blockNumber)
        for (const e of sortedBidEvents) {
          const listingId = Number(e.args.listingId)
          
          // Skip if we already processed this listing
          if (processedListings.has(listingId)) continue
          processedListings.add(listingId)
          
          try {
            // Check if bid is still active by querying the contract
            const bid = await marketplace.bids(listingId, userAddress)
            console.log(`[Blockchain] getUserBids: Listing #${listingId} bid price=${bid.price}`)
            if (bid.price > 0n) {
              bids.push({
                listingId,
                bidder: userAddress,
                price: BlockchainManager.ethers.formatUnits(bid.price, 18),
                timestamp: Number(bid.timestamp) * 1000,
                txHash: e.transactionHash,
                isBid: true
              })
            }
          } catch { /* Bid might have been withdrawn or accepted */ }
        }
      } catch (e) {
        console.warn('[Blockchain] BidPlaced query failed:', e.message)
      }

      console.log(`[Blockchain] getUserBids: Total ${bids.length} active bids found`, bids)
      MarketplaceCache.set(cacheKey, bids)
      return bids
    } catch (e) {
      console.error('[Blockchain] getUserBids failed:', e.message)
      return []
    }
  },

  getReceivedBids: async (userAddress, options = {}) => {
    if (!userAddress) return []
    
    const cacheKey = `received_bids_${userAddress.toLowerCase()}`
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)
      const receivedBids = []

      // Track processed bids to avoid duplicates (key: listingId_bidder)
      const processedBids = new Set()

      // 1. Get user's active listings and check for bids on them
      const activeListings = await BlockchainManager.getActiveListings().catch(() => [])
      const userListings = activeListings.filter(l => 
        l.seller?.toLowerCase() === userAddress.toLowerCase() && !l.isBundle
      )

      // Query BidPlaced events for user's listings
      for (const listing of userListings) {
        try {
          const bidEvents = await marketplace.queryFilter(
            marketplace.filters.BidPlaced(listing.listingId),
            fromBlock
          ).catch(() => [])
          
          // Sort by block number descending to get most recent events first
          const sortedEvents = [...bidEvents].sort((a, b) => b.blockNumber - a.blockNumber)
          
          for (const e of sortedEvents) {
            const bidder = e.args.bidder
            const bidKey = `${listing.listingId}_${bidder.toLowerCase()}`
            
            // Skip if already processed this bidder for this listing
            if (processedBids.has(bidKey)) continue
            processedBids.add(bidKey)
            
            try {
              const bid = await marketplace.bids(listing.listingId, bidder)
              if (bid.price > 0n) {
                receivedBids.push({
                  listingId: listing.listingId,
                  assetId: listing.assetId,
                  bidder,
                  seller: userAddress,
                  price: BlockchainManager.ethers.formatUnits(bid.price, 18),
                  timestamp: Number(bid.timestamp) * 1000,
                  txHash: e.transactionHash,
                  isBid: true,
                  isReceived: true
                })
              }
            } catch { /* Bid no longer active */ }
          }
        } catch { /* Skip listing */ }
      }

      MarketplaceCache.set(cacheKey, receivedBids)
      return receivedBids
    } catch (e) {
      console.error('[Blockchain] getReceivedBids failed:', e.message)
      return []
    }
  },

  /**
   * Get basic marketplace statistics
   * @param {string} userAddress - Optional user address for personal stats
   * @returns {Promise<Object>} Basic stats object
   */
  getBasicStats: async (userAddress, options = {}) => {
    const cacheKey = `stats_${userAddress?.toLowerCase() || 'global'}`
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready) return null

      const marketplace = BlockchainManager.contracts.marketplace
      const assets = BlockchainManager.contracts.assets
      
      // Calculate actual fromBlock (ethers v6 doesn't support negative block numbers)
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)

      const [purchased, rented, listed, bidAccepted] = await Promise.all([
        marketplace.queryFilter('Purchased', fromBlock).catch(() => []),
        marketplace.queryFilter('Rented', fromBlock).catch(() => []),
        marketplace.queryFilter('Listed', fromBlock).catch(() => []),
        marketplace.queryFilter('BidAccepted', fromBlock).catch(() => [])
      ])

      console.log(`[Blockchain] Stats events: Purchased=${purchased.length}, BidAccepted=${bidAccepted.length}, Rented=${rented.length}, Listed=${listed.length}`)

      let totalEarnings = 0
      let totalRoyalties = 0
      let totalSales = 0
      let totalRentals = 0
      let totalVolume = 0
      let totalPurchases = 0
      const recentTransactions = []

      // Process direct purchases
      for (const e of purchased) {
        try {
          const price = parseFloat(BlockchainManager.ethers.formatUnits(e.args.price || 0, 18))
          const royaltyAmount = parseFloat(BlockchainManager.ethers.formatUnits(e.args.royalty || 0, 18))
          totalVolume += price
          
          // If user is the buyer, count as purchase
          if (userAddress && e.args.buyer?.toLowerCase() === userAddress.toLowerCase()) {
            totalPurchases++
          }
          
          // If user is the seller (we need to look up the listing)
          if (userAddress) {
            const listingId = Number(e.args.listingId)
            const listingEvent = listed.find(l => Number(l.args.listingId) === listingId)
            if (listingEvent && listingEvent.args.seller.toLowerCase() === userAddress.toLowerCase()) {
              // Seller gets price minus royalty
              const sellerEarnings = price - royaltyAmount
              totalEarnings += sellerEarnings
              totalSales++
              recentTransactions.push({
                type: 'sale',
                price: sellerEarnings,
                buyer: e.args.buyer,
                assetId: Number(listingEvent.args.assetId),
                block: e.blockNumber,
                txHash: e.transactionHash
              })
            }
            
            // Check if user received royalty for this sale
            if (royaltyAmount > 0) {
              const assetId = listingEvent ? Number(listingEvent.args.assetId) : null
              if (assetId) {
                try {
                  const [royaltyReceiver] = await assets.getRoyaltyInfo(BigInt(assetId), BigInt(1))
                  if (royaltyReceiver.toLowerCase() === userAddress.toLowerCase()) {
                    totalRoyalties += royaltyAmount
                    recentTransactions.push({
                      type: 'royalty',
                      price: royaltyAmount,
                      buyer: e.args.buyer,
                      assetId,
                      block: e.blockNumber,
                      txHash: e.transactionHash
                    })
                  }
                } catch { /* Skip */ }
              }
            }
          }
        } catch { /* Skip */ }
      }

      // Process accepted bids (also counts as sales)
      for (const e of bidAccepted) {
        try {
          const price = parseFloat(BlockchainManager.ethers.formatUnits(e.args.price || 0, 18))
          const royaltyAmount = parseFloat(BlockchainManager.ethers.formatUnits(e.args.royalty || 0, 18))
          totalVolume += price
          
          // If user is the buyer (bidder), count as purchase
          if (userAddress && e.args.bidder?.toLowerCase() === userAddress.toLowerCase()) {
            totalPurchases++
          }
          
          // If user is the seller
          if (userAddress && e.args.seller?.toLowerCase() === userAddress.toLowerCase()) {
            const sellerEarnings = price - royaltyAmount
            totalEarnings += sellerEarnings
            totalSales++
            const listingId = Number(e.args.listingId)
            const listingEvent = listed.find(l => Number(l.args.listingId) === listingId)
            recentTransactions.push({
              type: 'sale',
              price: sellerEarnings,
              buyer: e.args.bidder,
              assetId: listingEvent ? Number(listingEvent.args.assetId) : null,
              block: e.blockNumber,
              txHash: e.transactionHash
            })
          }
          
          // Check if user received royalty
          if (userAddress && royaltyAmount > 0) {
            const listingId = Number(e.args.listingId)
            const listingEvent = listed.find(l => Number(l.args.listingId) === listingId)
            const assetId = listingEvent ? Number(listingEvent.args.assetId) : null
            if (assetId) {
              try {
                const [royaltyReceiver] = await assets.getRoyaltyInfo(BigInt(assetId), BigInt(1))
                if (royaltyReceiver.toLowerCase() === userAddress.toLowerCase()) {
                  totalRoyalties += royaltyAmount
                  recentTransactions.push({
                    type: 'royalty',
                    price: royaltyAmount,
                    buyer: e.args.bidder,
                    assetId,
                    block: e.blockNumber,
                    txHash: e.transactionHash
                  })
                }
              } catch { /* Skip */ }
            }
          }
        } catch { /* Skip */ }
      }

      // Process rentals
      for (const e of rented) {
        if (userAddress) {
          try {
            const listingId = Number(e.args.listingId)
            const listingEvent = listed.find(l => Number(l.args.listingId) === listingId)
            if (listingEvent && listingEvent.args.seller.toLowerCase() === userAddress.toLowerCase()) {
              const price = parseFloat(BlockchainManager.ethers.formatUnits(listingEvent.args.price || 0, 18))
              totalEarnings += price
              totalRentals++
            }
          } catch { /* Skip */ }
        }
      }

      // Count active listings for user
      let activeListings = 0
      if (userAddress) {
        const allListings = await BlockchainManager.getActiveListings().catch(() => [])
        activeListings = allListings.filter(l => 
          l.seller?.toLowerCase() === userAddress.toLowerCase()
        ).length
      }

      // Sort transactions by block (most recent first)
      recentTransactions.sort((a, b) => b.block - a.block)

      const stats = {
        totalEarnings: totalEarnings + totalRoyalties,
        totalSales,
        totalRentals,
        totalRoyalties,
        totalPurchases,
        activeListings,
        totalVolume,
        recentTransactions: recentTransactions.slice(0, 10),
        topAssets: []
      }

      console.log(`[Blockchain] getBasicStats for ${userAddress?.slice(0,8) || 'global'}:`, stats)
      MarketplaceCache.set(cacheKey, stats, MARKETPLACE_CONFIG.STATS_CACHE_TTL)
      return stats
    } catch (e) {
      console.error('[Blockchain] getBasicStats failed:', e.message)
      return null
    }
  },

  /**
   * Get price history for charts - aggregates transaction data by date and category
   * @returns {Promise<Object>} { land: [{date, avg, count}], other: [{date, avg, count}], summary: {totalTransactions} }
   */
  getPriceHistory: async (options = {}) => {
    const cacheKey = 'price_history'
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready) return null

      const marketplace = BlockchainManager.contracts.marketplace
      
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)

      // Get sale events (Purchased and BidAccepted) and Listed for asset mapping
      const [purchased, bidAccepted, listed] = await Promise.all([
        marketplace.queryFilter('Purchased', fromBlock).catch(() => []),
        marketplace.queryFilter('BidAccepted', fromBlock).catch(() => []),
        marketplace.queryFilter('Listed', fromBlock).catch(() => [])
      ])

      // Create a map of listingId -> assetId from Listed events
      const listingToAsset = new Map()
      for (const e of listed) {
        listingToAsset.set(Number(e.args.listingId), Number(e.args.assetId))
      }

      // Aggregate transactions by date and category
      const landByDate = new Map()
      const otherByDate = new Map()
      let totalTransactions = 0

      const processEvent = async (e, priceArg) => {
        try {
          const price = parseFloat(BlockchainManager.ethers.formatUnits(priceArg || 0, 18))
          if (price <= 0) return

          const listingId = Number(e.args.listingId)
          const assetId = listingToAsset.get(listingId)
          if (assetId === undefined) return

          // Get block timestamp for accurate date
          const block = await BlockchainManager.provider.getBlock(e.blockNumber)
          const date = new Date(block.timestamp * 1000).toISOString().split('T')[0]

          // Determine category: Land is assetId >= 1000 (matching MarketplaceUI logic)
          const isLand = assetId >= 1000
          const targetMap = isLand ? landByDate : otherByDate

          if (!targetMap.has(date)) {
            targetMap.set(date, { total: 0, count: 0 })
          }
          const entry = targetMap.get(date)
          entry.total += price
          entry.count++
          totalTransactions++
        } catch { /* Skip failed events */ }
      }

      // Process all events (limit concurrency to avoid rate limits)
      const allEvents = [
        ...purchased.map(e => ({ event: e, priceArg: e.args.price })),
        ...bidAccepted.map(e => ({ event: e, priceArg: e.args.price }))
      ]

      // Process in batches of 10
      for (let i = 0; i < allEvents.length; i += 10) {
        const batch = allEvents.slice(i, i + 10)
        await Promise.all(batch.map(({ event, priceArg }) => processEvent(event, priceArg)))
      }

      // Convert maps to sorted arrays
      const mapToArray = (map) => {
        return Array.from(map.entries())
          .map(([date, data]) => ({
            date,
            avg: data.count > 0 ? data.total / data.count : 0,
            count: data.count
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      }

      const result = {
        land: mapToArray(landByDate),
        license: mapToArray(otherByDate), // Using 'license' key for compatibility with chart
        summary: { totalTransactions }
      }

      console.log(`[Blockchain] getPriceHistory: ${totalTransactions} transactions, land=${result.land.length} days, other=${result.license.length} days`)
      MarketplaceCache.set(cacheKey, result, MARKETPLACE_CONFIG.PRICE_HISTORY_CACHE_TTL)
      return result
    } catch (e) {
      console.error('[Blockchain] getPriceHistory failed:', e.message)
      return null
    }
  },

  /**
   * Get current floor prices for each category
   * @returns {Promise<Object>} { land: {buy, rent}, other: {buy, rent} }
   */
  getFloorPrices: async (options = {}) => {
    const cacheKey = 'floor_prices'
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const listings = await BlockchainManager.getActiveListings()
      
      const floors = {
        land: { buy: null, rent: null },
        license: { buy: null, rent: null } // 'license' key used for 'other' assets for UI compatibility
      }

      for (const listing of listings) {
        const assetId = listing.assetId || listing.id
        const price = parseFloat(listing.price) || 0
        if (price <= 0) continue

        // Determine category: Land is assetId >= 1000 (matching MarketplaceUI logic)
        const isLand = assetId >= 1000
        const category = isLand ? 'land' : 'license' // 'license' used for other/non-land

        // Determine type
        const isRental = listing.isRental || (listing.duration && listing.duration > 0)
        const type = isRental ? 'rent' : 'buy'

        // Update floor if lower
        if (floors[category][type] === null || price < floors[category][type]) {
          floors[category][type] = price
        }
      }

      console.log('[Blockchain] getFloorPrices:', floors)
      MarketplaceCache.set(cacheKey, floors, MARKETPLACE_CONFIG.FLOOR_PRICES_CACHE_TTL)
      return floors
    } catch (e) {
      console.error('[Blockchain] getFloorPrices failed:', e.message)
      return { land: { buy: null, rent: null }, license: { buy: null, rent: null } }
    }
  },

  /**
   * Check if land at coordinates is available to claim
   * @param {number} x - X planetary coordinate
   * @param {number} z - Z planetary coordinate
   * @returns {Promise<boolean>}
   */
  isLandAvailable: async (x, z) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.contracts.landClaim) {
        console.warn('[Blockchain] LandClaim contract not available')
        return false
      }

      return await BlockchainManager.contracts.landClaim.isAvailable(
        Math.floor(x),
        Math.floor(z)
      )
    } catch (e) {
      console.error('[Blockchain] isLandAvailable error:', e.message)
      return false
    }
  },

  /**
   * Claim land at the specified coordinates
   * @param {number} x - X planetary coordinate
   * @param {number} z - Z planetary coordinate
   * @returns {Promise<any>} Transaction receipt
   */
  claimLand: async (x, z) => {
    console.log(`[Blockchain] Claiming land at (${x}, ${z})...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.landClaim) {
        throw new Error('LandClaim contract not deployed. Run deploy-land-claim.js first.')
      }

      // Pre-check availability to give clear error before sending TX
      const available = await BlockchainManager.contracts.landClaim.isAvailable(
        Math.floor(x), Math.floor(z)
      )
      if (!available) {
        const owner = await BlockchainManager.contracts.landClaim.getOwner(
          Math.floor(x), Math.floor(z)
        )
        throw new Error(`Land (${x}, ${z}) already claimed by ${owner}`)
      }

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const landClaimWithSigner = BlockchainManager.contracts.landClaim.connect(signer)

      // Get claim fee (may be 0)
      const claimFee = await BlockchainManager.contracts.landClaim.claimFee()

      const tx = await landClaimWithSigner.claimLand(
        Math.floor(x),
        Math.floor(z),
        { value: claimFee }
      )
      console.log('[Blockchain] Processing claim:', tx.hash)

      const receipt = await tx.wait()
      console.log('[Blockchain] Land claimed successfully!')
      return receipt
    } catch (e) {
      console.error('[Blockchain] claimLand failed:', e.message)
      throw e
    }
  },

  /**
   * Release (unclaim) a land plot. Callable by the land owner.
   * @param {number} x - X planetary coordinate
   * @param {number} z - Z planetary coordinate
   * @returns {Promise<object>} Transaction receipt
   */
  releaseLand: async (x, z) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('BlockchainManager not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('No signer available')

      if (!BlockchainManager.contracts.landClaim) {
        throw new Error('LandClaim contract not configured')
      }

      const landClaimWithSigner = BlockchainManager.contracts.landClaim.connect(signer)
      const tx = await landClaimWithSigner.releaseLand(
        Math.floor(x), Math.floor(z)
      )
      const receipt = await tx.wait()
      console.log(`[Blockchain] Land (${x}, ${z}) released successfully`)
      return receipt
    } catch (e) {
      console.error('[Blockchain] releaseLand failed:', e.message)
      throw e
    }
  },

  /**
   * Check if land at coordinates is available for claiming
   * @param {number} x - X planetary coordinate
   * @param {number} z - Z planetary coordinate
   * @returns {Promise<boolean>}
   */
  isLandAvailable: async (x, z) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.contracts.landClaim) return true
      return await BlockchainManager.contracts.landClaim.isAvailable(Math.floor(x), Math.floor(z))
    } catch (e) {
      console.warn('[Blockchain] isLandAvailable error:', e.message)
      return true // Assume available if check fails
    }
  },

  /**
   * Get the owner of land at coordinates
   * @param {number} x - X planetary coordinate
   * @param {number} z - Z planetary coordinate
   * @returns {Promise<string | null>}
   */
  getLandOwner: async (x, z) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.contracts.landClaim) return null

      const owner = await BlockchainManager.contracts.landClaim.getOwner(
        Math.floor(x),
        Math.floor(z)
      )
      return owner === "0x0000000000000000000000000000000000000000" ? null : owner
    } catch (e) {
      console.error('[Blockchain] getLandOwner error:', e.message)
      return null
    }
  },

  /**
   * Get all claimed lands from blockchain events
   * @returns {Promise<Array<{x: number, z: number, owner: string, face: number, localX: number, localY: number}>>}
   */
  getClaimedLands: async () => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready || !BlockchainManager.contracts.landClaim) return []

      const contract = BlockchainManager.contracts.landClaim

      // First check total — skip query if no claims exist
      const total = Number(await contract.totalClaimed())
      if (total === 0) return []
      console.log(`[Blockchain] Querying ${total} claimed lands...`)

      // Query LandClaimed events in chunks (RPC providers limit block range)
      const provider = contract.runner?.provider ?? BlockchainManager.provider
      const currentBlock = await provider.getBlockNumber()
      const filter = contract.filters.LandClaimed()
      const CHUNK = 45000 // Polygon RPC limit ~50k blocks
      const results = []

      for (let from = 0; from <= currentBlock; from += CHUNK) {
        const to = Math.min(from + CHUNK - 1, currentBlock)
        try {
          const events = await contract.queryFilter(filter, from, to)
          for (const e of events) {
            const x = Number(e.args.x)
            const z = Number(e.args.z)
            results.push({
              x, z,
              owner: e.args.claimer,
              face: Math.floor(x / 1000),
              localX: x % 1000,
              localY: z,
            })
          }
        } catch (chunkErr) {
          console.warn(`[Blockchain] Event query failed for blocks ${from}-${to}:`, chunkErr.message)
        }
        // Stop early if we found all claims
        if (results.length >= total) break
      }

      console.log(`[Blockchain] Found ${results.length} claimed lands`)
      return results
    } catch (e) {
      console.warn('[Blockchain] getClaimedLands error:', e.message)
      return []
    }
  },

  // ==================== MULTI-TOKEN SUPPORT (V1.3.0) ====================

  /**
   * Check if a token is allowed for marketplace payments
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<boolean>}
   */
  isTokenAllowed: async (tokenAddress) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return false

      return await BlockchainManager.contracts.marketplace.isTokenAllowed(tokenAddress)
    } catch (e) {
      console.warn('[Blockchain] isTokenAllowed failed:', e.message)
      return false
    }
  },

  /**
   * Set whether a token is allowed (owner only)
   * @param {string} tokenAddress - The token contract address
   * @param {boolean} allowed - Whether to allow or disallow
   * @returns {Promise<object>} Transaction receipt
   */
  setAllowedToken: async (tokenAddress, allowed) => {
    console.log(`[Blockchain] Setting token ${tokenAddress} allowed=${allowed}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.setAllowedToken(tokenAddress, allowed)
      const receipt = await tx.wait()

      console.log('[Blockchain] Token allowance updated successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setAllowedToken failed:', e.message)
      throw e
    }
  },

  /**
   * Get the payment token for a listing
   * @param {number} listingId
   * @returns {Promise<string>} Token address
   */
  getListingPaymentToken: async (listingId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return null

      return await BlockchainManager.contracts.marketplace.getListingPaymentToken(BigInt(listingId))
    } catch (e) {
      console.warn('[Blockchain] getListingPaymentToken failed:', e.message)
      return null
    }
  },

  /**
   * Get the payment token for a bundle
   * @param {number} bundleId
   * @returns {Promise<string>} Token address
   */
  getBundlePaymentToken: async (bundleId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return null

      return await BlockchainManager.contracts.marketplace.getBundlePaymentToken(BigInt(bundleId))
    } catch (e) {
      console.warn('[Blockchain] getBundlePaymentToken failed:', e.message)
      return null
    }
  },

  /**
   * Create a listing with a specific payment token
   * @param {number} assetId
   * @param {string} price - Price in token units (human readable)
   * @param {string} paymentToken - Token address for payment
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<any>} Transaction receipt
   */
  createListingWithToken: async (assetId, price, paymentToken, tokenDecimals = 18) => {
    console.log(`[Blockchain] Creating listing for asset #${assetId} at ${price} tokens (${paymentToken})...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Ensure marketplace is approved as operator
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)
      
      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator...')
        const approveTx = await assetsWithSigner.setApprovalForAll(
          BlockchainManager.contracts.marketplace.target,
          true
        )
        await approveTx.wait()
      }

      // Create listing with specific token
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), tokenDecimals)
      const listTx = await marketplaceWithSigner.listAssetWithToken(
        BigInt(assetId), 
        1, 
        priceWei, 
        false, 
        0, 
        paymentToken
      )
      const receipt = await listTx.wait()

      console.log('[Blockchain] Listing with custom token created')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] createListingWithToken failed:', e.message)
      throw e
    }
  },

  /**
   * Create a rental listing with a specific payment token
   * @param {number} assetId
   * @param {string} pricePerPeriod - Price per rental period
   * @param {number} durationSeconds - Rental duration in seconds
   * @param {string} paymentToken - Token address for payment
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<any>} Transaction receipt
   */
  createRentalListingWithToken: async (assetId, pricePerPeriod, durationSeconds, paymentToken, tokenDecimals = 18) => {
    console.log(`[Blockchain] Creating rental for asset #${assetId} at ${pricePerPeriod} tokens (${paymentToken})...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Ensure marketplace is approved as operator
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)
      
      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator...')
        const approveTx = await assetsWithSigner.setApprovalForAll(
          BlockchainManager.contracts.marketplace.target,
          true
        )
        await approveTx.wait()
      }

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const priceWei = BlockchainManager.ethers.parseUnits(pricePerPeriod.toString(), tokenDecimals)
      const listTx = await marketplaceWithSigner.listAssetWithToken(
        BigInt(assetId),
        1,
        priceWei,
        true, // isRental
        BigInt(durationSeconds),
        paymentToken
      )
      const receipt = await listTx.wait()

      console.log('[Blockchain] Rental listing with custom token created')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] createRentalListingWithToken failed:', e.message)
      throw e
    }
  },

  /**
   * List a bundle with a specific payment token
   * @param {number[]} assetIds
   * @param {number[]} amounts
   * @param {string} price - Total price
   * @param {string} paymentToken - Token address
   * @param {string} [name=''] - Optional bundle name
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<any>} Transaction receipt
   */
  listBundleWithToken: async (assetIds, amounts, price, paymentToken, name = '', tokenDecimals = 18) => {
    console.log(`[Blockchain] Listing bundle of ${assetIds.length} assets for ${price} tokens (${paymentToken})...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), tokenDecimals)
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      
      // Ensure marketplace is approved
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, marketplaceWithSigner.target)
      
      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator for bundle...')
        const approveTx = await assetsWithSigner.setApprovalForAll(marketplaceWithSigner.target, true)
        await approveTx.wait()
      }
      
      let tx
      if (name && name.trim()) {
        tx = await marketplaceWithSigner.listBundleWithNameAndToken(
          assetIds.map(id => BigInt(id)), 
          amounts.map(a => BigInt(a)), 
          priceWei,
          name.trim(),
          paymentToken
        )
      } else {
        tx = await marketplaceWithSigner.listBundleWithToken(
          assetIds.map(id => BigInt(id)), 
          amounts.map(a => BigInt(a)), 
          priceWei,
          paymentToken
        )
      }
      const receipt = await tx.wait()

      console.log('[Blockchain] Bundle with custom token listed successfully')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] listBundleWithToken failed:', e.message)
      throw e
    }
  },

  /**
   * Place a global bid with a specific token
   * @param {number} assetId
   * @param {string} price - Offer price
   * @param {string} paymentToken - Token address
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<any>} Transaction receipt
   */
  placeGlobalBidWithToken: async (assetId, price, paymentToken, tokenDecimals = 18) => {
    console.log(`[Blockchain] Placing global bid on asset #${assetId} for ${price} tokens (${paymentToken})...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const priceWei = BlockchainManager.ethers.parseUnits(price.toString(), tokenDecimals)
      
      // Approve token spending
      const address = await signer.getAddress()
      const tokenContract = new BlockchainManager.ethers.Contract(
        paymentToken,
        ['function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'],
        signer
      )
      
      const currentAllowance = await tokenContract.allowance(address, BlockchainManager.contracts.marketplace.target)
      if (currentAllowance < priceWei) {
        console.log('[Blockchain] Approving token spending for global bid...')
        const approveTx = await tokenContract.approve(BlockchainManager.contracts.marketplace.target, priceWei)
        await approveTx.wait()
      }

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.placeGlobalBidWithToken(BigInt(assetId), priceWei, paymentToken)
      const receipt = await tx.wait()

      console.log('[Blockchain] Global bid with custom token placed successfully')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] placeGlobalBidWithToken failed:', e.message)
      throw e
    }
  },

  /**
   * Get accumulated fees for a specific token
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<string>} Accumulated fees in token units
   */
  getAccumulatedFeesByToken: async (tokenAddress) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return '0'

      const fees = await BlockchainManager.contracts.marketplace.getAccumulatedFees(tokenAddress)
      return BlockchainManager.ethers.formatUnits(fees, 18)
    } catch (e) {
      console.warn('[Blockchain] getAccumulatedFeesByToken failed:', e.message)
      return '0'
    }
  },

  /**
   * Withdraw accumulated fees for a specific token (owner only)
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<object>} Transaction receipt
   */
  withdrawFeesByToken: async (tokenAddress) => {
    console.log(`[Blockchain] Withdrawing accumulated fees for token ${tokenAddress}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.withdrawFeesByToken(tokenAddress)
      const receipt = await tx.wait()

      console.log('[Blockchain] Fees withdrawn successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] withdrawFeesByToken failed:', e.message)
      throw e
    }
  },

  /**
   * Initialize V1.3.0 upgrade with additional allowed tokens
   * @param {string[]} additionalTokens - Array of token addresses to whitelist
   * @returns {Promise<object>} Transaction receipt
   */
  initializeMarketplaceV1_3: async (additionalTokens = []) => {
    console.log(`[Blockchain] Initializing marketplace V1.3 with ${additionalTokens.length} additional tokens...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.initializeV1_3(additionalTokens)
      const receipt = await tx.wait()

      console.log('[Blockchain] Marketplace V1.3 initialized successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] initializeMarketplaceV1_3 failed:', e.message)
      throw e
    }
  },

  /**
   * Get marketplace version
   * @returns {Promise<string>} Version string
   */
  getMarketplaceVersion: async () => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return 'unknown'

      return await BlockchainManager.contracts.marketplace.version()
    } catch (e) {
      console.warn('[Blockchain] getMarketplaceVersion failed:', e.message)
      return 'unknown'
    }
  },

  // ==================== END MULTI-TOKEN SUPPORT ====================

  // ==================== BATCH OPERATIONS (V1.4.0) ====================

  /**
   * List multiple assets in a single transaction
   * @param {number[]} assetIds - Array of asset IDs to list
   * @param {number[]} amounts - Array of amounts for each asset
   * @param {string[]} prices - Array of prices (human readable) for each asset
   * @param {boolean[]} isRentals - Array indicating if each is a rental (must all be false)
   * @param {number[]} durations - Array of durations (ignored for sales)
   * @param {string} paymentToken - Payment token address for all listings
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<{receipt: object, listingIds: number[]}>}
   */
  batchListAssets: async (assetIds, amounts, prices, isRentals, durations, paymentToken, tokenDecimals = 18) => {
    console.log(`[Blockchain] Batch listing ${assetIds.length} assets...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Ensure marketplace is approved
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)

      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator for batch...')
        const approveTx = await assetsWithSigner.setApprovalForAll(BlockchainManager.contracts.marketplace.target, true)
        await approveTx.wait()
      }

      // Convert prices to wei
      const pricesWei = prices.map(p => BlockchainManager.ethers.parseUnits(p.toString(), tokenDecimals))

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.batchListAssets(
        assetIds.map(id => BigInt(id)),
        amounts.map(a => BigInt(a)),
        pricesWei,
        isRentals,
        durations.map(d => BigInt(d)),
        paymentToken
      )
      const receipt = await tx.wait()

      // Extract listing IDs from BatchListed event
      const batchEvent = receipt.logs.find(log => {
        try {
          return marketplaceWithSigner.interface.parseLog(log)?.name === 'BatchListed'
        } catch { return false }
      })

      let listingIds = []
      if (batchEvent) {
        const parsed = marketplaceWithSigner.interface.parseLog(batchEvent)
        listingIds = parsed.args.listingIds.map(id => Number(id))
      }

      console.log(`[Blockchain] Batch listing successful: ${listingIds.length} listings created`)
      MarketplaceCache.clear()
      return { receipt, listingIds }
    } catch (e) {
      console.error('[Blockchain] batchListAssets failed:', e.message)
      throw e
    }
  },

  /**
   * Validate batch purchase before execution
   * Checks if all listings are still available and returns total price
   * @param {number[]} listingIds - Listing IDs to validate
   * @returns {Promise<{valid: boolean, invalid: object[], totalPrice: bigint, results: object[]}>}
   */
  validateBatchPurchase: async (listingIds) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return { valid: false, invalid: [], totalPrice: 0n, results: [] }

      const results = await Promise.all(listingIds.map(async id => {
        try {
          const listing = await BlockchainManager.contracts.marketplace.listings(BigInt(id))
          const isValid = listing.amount > 0n
          return {
            id,
            valid: isValid,
            price: listing.price,
            reason: !isValid ? 'SOLD_OUT' : 'OK'
          }
        } catch (e) {
          return { id, valid: false, price: 0n, reason: 'READ_ERROR' }
        }
      }))

      const invalid = results.filter(r => !r.valid)
      const totalPrice = results.reduce((sum, r) => sum + (r.valid ? r.price : 0n), 0n)

      return {
        valid: invalid.length === 0,
        invalid,
        totalPrice,
        results
      }
    } catch (e) {
      ErrorLogger.error('validateBatchPurchase failed', { error: e.message, listingIds })
      return { valid: false, invalid: [], totalPrice: 0n, results: [] }
    }
  },

  /**
   * Purchase multiple listings in a single transaction
   * All listings must use the same payment token
   * @param {number[]} listingIds - Array of listing IDs to purchase
   * @returns {Promise<object>} Transaction receipt
   */
  batchPurchase: async (listingIds) => {
    console.log(`[Blockchain] Batch purchasing ${listingIds.length} listings...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Calculate total price for approval
      let totalPrice = 0n
      let paymentToken = null

      for (const listingId of listingIds) {
        const listing = await BlockchainManager.contracts.marketplace.listings(BigInt(listingId))
        if (listing.amount === 0n) throw new Error(`Listing ${listingId} not available`)

        totalPrice += listing.price

        // Get token for this listing
        let listingToken = await BlockchainManager.contracts.marketplace.listingPaymentToken(BigInt(listingId))
        if (listingToken === '0x0000000000000000000000000000000000000000') {
          listingToken = await BlockchainManager.contracts.token.target
        }

        if (paymentToken === null) {
          paymentToken = listingToken
        } else if (paymentToken.toLowerCase() !== listingToken.toLowerCase()) {
          throw new Error('All listings must use the same payment token')
        }
      }

      // Approve token spending
      const tokenContract = new BlockchainManager.ethers.Contract(
        paymentToken,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        signer
      )
      const approveTx = await tokenContract.approve(BlockchainManager.contracts.marketplace.target, totalPrice)
      await withTimeout(approveTx.wait(), MARKETPLACE_CONFIG.TX_WAIT_TIMEOUT_MS, 'Approval timed out')

      // Execute batch purchase
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.batchPurchase(listingIds.map(id => BigInt(id)))
      const receipt = await withTimeout(tx.wait(), MARKETPLACE_CONFIG.TX_WAIT_TIMEOUT_MS, 'Batch purchase timed out')

      console.log('[Blockchain] Batch purchase successful')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] batchPurchase failed:', e.message)
      throw e
    }
  },

  // ==================== END BATCH OPERATIONS ====================

  // ==================== TIMED AUCTIONS (V1.5.0) ====================

  /**
   * Create a timed auction for an asset
   * @param {number} assetId - Asset to auction
   * @param {number} amount - Amount of the asset (usually 1)
   * @param {string} minBid - Minimum starting bid (human readable)
   * @param {number} durationSeconds - Auction duration in seconds (300 to 2592000)
   * @param {string} paymentToken - Payment token address
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<{receipt: object, auctionId: number}>}
   */
  createAuction: async (assetId, amount, minBid, durationSeconds, paymentToken, tokenDecimals = 18) => {
    console.log(`[Blockchain] Creating auction for asset #${assetId} with min bid ${minBid}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      // Ensure marketplace is approved
      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)

      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator for auction...')
        const approveTx = await assetsWithSigner.setApprovalForAll(BlockchainManager.contracts.marketplace.target, true)
        await approveTx.wait()
      }

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const minBidWei = BlockchainManager.ethers.parseUnits(minBid.toString(), tokenDecimals)

      const tx = await marketplaceWithSigner.createAuction(
        BigInt(assetId),
        BigInt(amount),
        minBidWei,
        BigInt(durationSeconds),
        paymentToken
      )
      const receipt = await tx.wait()

      // Extract auction ID from event
      const auctionEvent = receipt.logs.find(log => {
        try {
          return marketplaceWithSigner.interface.parseLog(log)?.name === 'AuctionCreated'
        } catch { return false }
      })

      let auctionId = null
      if (auctionEvent) {
        const parsed = marketplaceWithSigner.interface.parseLog(auctionEvent)
        auctionId = Number(parsed.args.auctionId)
      }

      console.log(`[Blockchain] Auction #${auctionId} created successfully`)
      MarketplaceCache.clear()
      return { receipt, auctionId }
    } catch (e) {
      console.error('[Blockchain] createAuction failed:', e.message)
      throw e
    }
  },

  /**
   * Create an auction with on-chain metadata (V2.0.0 - external contract)
   * @param {number} assetId - Asset ID to auction
   * @param {number} amount - Amount of tokens
   * @param {string} minBid - Minimum bid (human readable)
   * @param {number} durationSeconds - Auction duration
   * @param {string} paymentToken - Payment token address
   * @param {object} metadata - Metadata object
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<{receipt: any, auctionId: number}>}
   */
  createAuctionWithMetadata: async (assetId, amount, minBid, durationSeconds, paymentToken, metadata, tokenDecimals = 18) => {
    console.log(`[Blockchain] Creating auction with metadata for asset #${assetId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}

      const assetsWithSigner = BlockchainManager.contracts.assets.connect(signer)
      const address = await signer.getAddress()
      const isApproved = await assetsWithSigner.isApprovedForAll(address, BlockchainManager.contracts.marketplace.target)

      if (!isApproved) {
        console.log('[Blockchain] Approving marketplace as operator for auction...')
        const approveTx = await assetsWithSigner.setApprovalForAll(BlockchainManager.contracts.marketplace.target, true)
        await approveTx.wait()
      }

      // Step 1: Create auction without metadata
      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const minBidWei = BlockchainManager.ethers.parseUnits(minBid.toString(), tokenDecimals)

      const tx = await marketplaceWithSigner.createAuction(
        BigInt(assetId),
        BigInt(amount),
        minBidWei,
        BigInt(durationSeconds),
        paymentToken
      )
      const receipt = await tx.wait()

      // Step 2: Extract auctionId from AuctionCreated event
      const auctionEvent = receipt.logs.find(log => {
        try {
          return marketplaceWithSigner.interface.parseLog(log)?.name === 'AuctionCreated'
        } catch { return false }
      })

      let auctionId = null
      if (auctionEvent) {
        const parsed = marketplaceWithSigner.interface.parseLog(auctionEvent)
        auctionId = Number(parsed.args.auctionId)
      }

      // Step 3: Set metadata on external contract
      if (auctionId !== null && BlockchainManager.contracts.metadata && (title || description || imageUrl || assetUrl)) {
        const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
        const metaTx = await metadataWithSigner.setAuctionMetadata(
          BigInt(auctionId),
          title,
          description,
          imageUrl,
          assetUrl
        )
        await metaTx.wait()
        console.log('[Blockchain] Auction metadata set on external contract')
      }

      console.log(`[Blockchain] Auction #${auctionId} with metadata created successfully`)
      MarketplaceCache.clear()
      return { receipt, auctionId }
    } catch (e) {
      console.error('[Blockchain] createAuctionWithMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Update metadata for an existing auction (V2.0.0 - external contract)
   * @param {number} auctionId - Auction ID
   * @param {object} metadata - New metadata
   * @returns {Promise<any>}
   */
  setAuctionMetadata: async (auctionId, metadata) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        throw new Error('Metadata contract not deployed on this network')
      }

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const { title = '', description = '', imageUrl = '', assetUrl = '' } = metadata || {}

      const metadataWithSigner = BlockchainManager.contracts.metadata.connect(signer)
      const tx = await metadataWithSigner.setAuctionMetadata(
        BigInt(auctionId),
        title,
        description,
        imageUrl,
        assetUrl
      )
      const receipt = await tx.wait()

      console.log('[Blockchain] Auction metadata updated on external contract')
      return receipt
    } catch (e) {
      console.error('[Blockchain] setAuctionMetadata failed:', e.message)
      throw e
    }
  },

  /**
   * Get metadata for an auction (V2.0.0 - external contract)
   * @param {number} auctionId - Auction ID
   * @returns {Promise<{title: string, description: string, imageUrl: string, assetUrl: string}>}
   */
  getAuctionMetadata: async (auctionId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      if (!BlockchainManager.contracts.metadata) {
        return { title: '', description: '', imageUrl: '', assetUrl: '' }
      }

      const [title, description, imageUrl, assetUrl] = await BlockchainManager.contracts.metadata.getAuctionMetadata(BigInt(auctionId))
      return { title, description, imageUrl, assetUrl }
    } catch (e) {
      console.error('[Blockchain] getAuctionMetadata failed:', e.message)
      return { title: '', description: '', imageUrl: '', assetUrl: '' }
    }
  },

  /**
   * Place a bid on an active auction
   * @param {number} auctionId - Auction to bid on
   * @param {string} bidAmount - Bid amount (human readable)
   * @param {string} paymentToken - Payment token address
   * @param {number} [tokenDecimals=18] - Token decimals
   * @returns {Promise<object>} Transaction receipt
   */
  placeBidOnAuction: async (auctionId, bidAmount, paymentToken, tokenDecimals = 18) => {
    console.log(`[Blockchain] Placing bid of ${bidAmount} on auction #${auctionId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const bidAmountWei = BlockchainManager.ethers.parseUnits(bidAmount.toString(), tokenDecimals)

      // Approve token spending
      const address = await signer.getAddress()
      const tokenContract = new BlockchainManager.ethers.Contract(
        paymentToken,
        ['function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'],
        signer
      )

      const currentAllowance = await tokenContract.allowance(address, BlockchainManager.contracts.marketplace.target)
      if (currentAllowance < bidAmountWei) {
        console.log('[Blockchain] Approving token spending for auction bid...')
        const approveTx = await tokenContract.approve(BlockchainManager.contracts.marketplace.target, bidAmountWei)
        await approveTx.wait()
      }

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.placeBidOnAuction(BigInt(auctionId), bidAmountWei)
      const receipt = await tx.wait()

      console.log('[Blockchain] Auction bid placed successfully')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] placeBidOnAuction failed:', e.message)
      throw e
    }
  },

  /**
   * Settle an ended auction (anyone can call)
   * @param {number} auctionId - Auction to settle
   * @returns {Promise<object>} Transaction receipt
   */
  settleAuction: async (auctionId) => {
    console.log(`[Blockchain] Settling auction #${auctionId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.settleAuction(BigInt(auctionId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Auction settled successfully')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] settleAuction failed:', e.message)
      throw e
    }
  },

  /**
   * Cancel an auction (seller only, no bids placed)
   * @param {number} auctionId - Auction to cancel
   * @returns {Promise<object>} Transaction receipt
   */
  cancelAuction: async (auctionId) => {
    console.log(`[Blockchain] Cancelling auction #${auctionId}...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.cancelAuction(BigInt(auctionId))
      const receipt = await tx.wait()

      console.log('[Blockchain] Auction cancelled successfully')
      MarketplaceCache.clear()
      return receipt
    } catch (e) {
      console.error('[Blockchain] cancelAuction failed:', e.message)
      throw e
    }
  },

  /**
   * Update an auction's duration (seller only, no bids placed)
   * @param {number} auctionId - Auction to update
   * @param {number} newDuration - New duration in seconds from now
   * @returns {Promise<object>} Transaction receipt with newEndTime
   */
  updateAuction: async (auctionId, newDuration) => {
    console.log(`[Blockchain] Updating auction #${auctionId} with duration ${newDuration}s...`)
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.updateAuction(BigInt(auctionId), BigInt(newDuration))
      const receipt = await tx.wait()

      // Extract newEndTime from event
      let newEndTime = null
      for (const log of receipt.logs) {
        try {
          const parsed = BlockchainManager.contracts.marketplace.interface.parseLog(log)
          if (parsed?.name === 'AuctionUpdated') {
            newEndTime = Number(parsed.args.newEndTime)
            break
          }
        } catch { /* skip non-marketplace logs */ }
      }

      console.log('[Blockchain] Auction updated successfully, newEndTime:', newEndTime)
      MarketplaceCache.clear()
      return { ...receipt, newEndTime }
    } catch (e) {
      console.error('[Blockchain] updateAuction failed:', e.message)
      throw e
    }
  },

  /**
   * Get auction details
   * @param {number} auctionId - Auction ID
   * @returns {Promise<object|null>} Auction data
   */
  getAuction: async (auctionId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return null

      const auction = await BlockchainManager.contracts.marketplace.getAuction(BigInt(auctionId))
      const paymentToken = await BlockchainManager.contracts.marketplace.auctionPaymentToken(BigInt(auctionId))

      return {
        auctionId,
        seller: auction.seller,
        assetId: Number(auction.assetId),
        amount: Number(auction.amount),
        minBid: BlockchainManager.ethers.formatUnits(auction.minBid, 18),
        startTime: Number(auction.startTime),
        endTime: Number(auction.endTime),
        highestBidder: auction.highestBidder,
        highestBid: BlockchainManager.ethers.formatUnits(auction.highestBid, 18),
        settled: auction.settled,
        paymentToken
      }
    } catch (e) {
      console.error('[Blockchain] getAuction failed:', e.message)
      return null
    }
  },

  /**
   * Get active auctions (not settled and not ended)
   * Uses direct iteration over auction IDs instead of events to avoid RPC block range limits
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of active auctions
   */
  getActiveAuctions: async (options = {}) => {
    const cacheKey = 'active_auctions'
    if (!options.forceRefresh) {
      const cached = MarketplaceCache.get(cacheKey)
      if (cached) return cached
    }

    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const nextAuctionId = await marketplace.nextAuctionId()
      const totalAuctions = Number(nextAuctionId)

      const auctions = []
      const now = Math.floor(Date.now() / 1000)

      // 1. Fetch all auctions via Multicall3 (1 RPC call)
      const auctionIds = Array.from({ length: totalAuctions }, (_, i) => i)
      const auctionCalls = auctionIds.map(id => encodeCall(marketplace, 'getAuction', [BigInt(id)]))
      const auctionResults = await multicall(auctionCalls)

      // Parse auctions and identify active ones
      const activeAuctionIds = []
      const parsedAuctions = new Map()

      for (let i = 0; i < auctionIds.length; i++) {
        const result = auctionResults[i]
        if (!result?.success || result.returnData === '0x') continue

        try {
          const [auction] = decodeResult(marketplace, 'getAuction', result.returnData)
          // Only include active auctions (not settled and not ended)
          if (!auction.settled && Number(auction.endTime) > now) {
            activeAuctionIds.push(auctionIds[i])
            parsedAuctions.set(auctionIds[i], auction)
          }
        } catch { /* skip invalid auction */ }
      }

      // 2. Fetch payment tokens for active auctions via Multicall3 (1 RPC call)
      if (activeAuctionIds.length > 0) {
        const tokenCalls = activeAuctionIds.map(id => encodeCall(marketplace, 'auctionPaymentToken', [BigInt(id)]))
        const tokenResults = await multicall(tokenCalls)

        for (let i = 0; i < activeAuctionIds.length; i++) {
          const auctionId = activeAuctionIds[i]
          const auction = parsedAuctions.get(auctionId)
          let paymentToken = null

          const tokenResult = tokenResults[i]
          if (tokenResult?.success && tokenResult.returnData !== '0x') {
            try {
              [paymentToken] = decodeResult(marketplace, 'auctionPaymentToken', tokenResult.returnData)
            } catch { /* use null */ }
          }

          auctions.push({
            auctionId,
            seller: auction.seller,
            assetId: Number(auction.assetId),
            amount: Number(auction.amount),
            minBid: BlockchainManager.ethers.formatUnits(auction.minBid, 18),
            startTime: Number(auction.startTime),
            endTime: Number(auction.endTime),
            highestBidder: auction.highestBidder,
            highestBid: BlockchainManager.ethers.formatUnits(auction.highestBid, 18),
            settled: auction.settled,
            paymentToken,
            isAuction: true
          })
        }
      }
      console.log(`[Blockchain] Fetched ${totalAuctions} auctions + ${activeAuctionIds.length} tokens in 2 multicalls`)

      // Fetch all metadata in ONE batch call
      if (auctions.length > 0 && BlockchainManager.contracts.metadata) {
        try {
          const assetIds = auctions.map(a => BigInt(a.assetId))
          const metadataBatch = await BlockchainManager.contracts.metadata.getFullMetadataBatch(assetIds)
          auctions.forEach((auction, i) => {
            const meta = metadataBatch[i] || {}
            auction.title = meta.title || `Auction #${auction.auctionId}`
            auction.image = meta.imageUrl || ''
            auction.description = meta.description || ''
            auction.assetUrl = meta.assetUrl || ''
            auction.rarity = meta.rarity || ''
            auction.category = meta.category || ''
            auction.collection = meta.collection || ''
          })
          console.log(`[Blockchain] Fetched metadata for ${auctions.length} auctions in 1 batch call`)
        } catch (e) {
          console.warn('[Blockchain] Batch metadata fetch failed for auctions:', e.message)
        }
      }

      console.log(`[Blockchain] getActiveAuctions: ${auctions.length} active auctions (of ${totalAuctions} total)`)
      MarketplaceCache.set(cacheKey, auctions)
      return auctions
    } catch (e) {
      console.error('[Blockchain] getActiveAuctions failed:', e.message)
      return []
    }
  },

  /**
   * Get bid history for an auction
   * @param {number} auctionId - Auction ID
   * @returns {Promise<Array>} Array of bids
   */
  getAuctionBids: async (auctionId) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)

      // Query AuctionBidPlaced events for this auction
      const events = await marketplace.queryFilter(
        marketplace.filters.AuctionBidPlaced(auctionId),
        fromBlock
      ).catch(() => [])

      const bids = events.map(e => ({
        auctionId: Number(e.args.auctionId),
        bidder: e.args.bidder,
        bidAmount: BlockchainManager.ethers.formatUnits(e.args.bidAmount, 18),
        paymentToken: e.args.paymentToken,
        block: e.blockNumber,
        txHash: e.transactionHash
      }))

      // Sort by block (most recent first)
      bids.sort((a, b) => b.block - a.block)

      console.log(`[Blockchain] getAuctionBids #${auctionId}: ${bids.length} bids`)
      return bids
    } catch (e) {
      console.error('[Blockchain] getAuctionBids failed:', e.message)
      return []
    }
  },

  /**
   * Get auctions created by a user
   * @param {string} userAddress - User address
   * @returns {Promise<Array>} Array of auctions
   */
  getUserAuctions: async (userAddress) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)

      // Query AuctionCreated events by seller
      const events = await marketplace.queryFilter(
        marketplace.filters.AuctionCreated(null, userAddress),
        fromBlock
      ).catch(() => [])

      const auctions = []
      for (const e of events) {
        const auctionId = Number(e.args.auctionId)
        try {
          const auction = await marketplace.getAuction(BigInt(auctionId))
          const paymentToken = await marketplace.auctionPaymentToken(BigInt(auctionId))

          auctions.push({
            auctionId,
            seller: auction.seller,
            assetId: Number(auction.assetId),
            amount: Number(auction.amount),
            minBid: BlockchainManager.ethers.formatUnits(auction.minBid, 18),
            startTime: Number(auction.startTime),
            endTime: Number(auction.endTime),
            highestBidder: auction.highestBidder,
            highestBid: BlockchainManager.ethers.formatUnits(auction.highestBid, 18),
            settled: auction.settled,
            paymentToken,
            isAuction: true
          })
        } catch { /* Auction may not exist */ }
      }

      console.log(`[Blockchain] getUserAuctions for ${userAddress.slice(0,8)}...: ${auctions.length} auctions`)
      return auctions
    } catch (e) {
      console.error('[Blockchain] getUserAuctions failed:', e.message)
      return []
    }
  },

  /**
   * Get auctions user has bid on
   * @param {string} userAddress - User address
   * @returns {Promise<Array>} Array of auction bids with status
   */
  getUserAuctionBids: async (userAddress) => {
    try {
      const ready = await BlockchainManager.init()
      if (!ready) return []

      const marketplace = BlockchainManager.contracts.marketplace
      const currentBlock = await BlockchainManager.provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - MARKETPLACE_CONFIG.ACTIVITY_BLOCK_RANGE)

      // Query AuctionBidPlaced events by bidder
      const events = await marketplace.queryFilter(
        marketplace.filters.AuctionBidPlaced(null, userAddress),
        fromBlock
      ).catch(() => [])

      // Track unique auctions
      const seenAuctions = new Set()
      const auctionBids = []
      const now = Math.floor(Date.now() / 1000)

      for (const e of events) {
        const auctionId = Number(e.args.auctionId)
        if (seenAuctions.has(auctionId)) continue
        seenAuctions.add(auctionId)

        try {
          const auction = await marketplace.getAuction(BigInt(auctionId))
          const paymentToken = await marketplace.auctionPaymentToken(BigInt(auctionId))
          const isHighestBidder = auction.highestBidder.toLowerCase() === userAddress.toLowerCase()
          const isEnded = Number(auction.endTime) <= now

          // Determine status
          let status = 'active'
          if (auction.settled) {
            status = isHighestBidder ? 'won' : 'lost'
          } else if (isEnded) {
            status = isHighestBidder ? 'pending_settle' : 'lost'
          } else {
            status = isHighestBidder ? 'winning' : 'outbid'
          }

          auctionBids.push({
            auctionId,
            seller: auction.seller,
            assetId: Number(auction.assetId),
            amount: Number(auction.amount),
            minBid: BlockchainManager.ethers.formatUnits(auction.minBid, 18),
            startTime: Number(auction.startTime),
            endTime: Number(auction.endTime),
            highestBidder: auction.highestBidder,
            highestBid: BlockchainManager.ethers.formatUnits(auction.highestBid, 18),
            settled: auction.settled,
            paymentToken,
            isAuction: true,
            status,
            isHighestBidder
          })
        } catch { /* Auction may not exist */ }
      }

      console.log(`[Blockchain] getUserAuctionBids for ${userAddress.slice(0,8)}...: ${auctionBids.length} auctions`)
      return auctionBids
    } catch (e) {
      console.error('[Blockchain] getUserAuctionBids failed:', e.message)
      return []
    }
  },

  /**
   * Initialize V1.5.0 upgrade
   * @returns {Promise<object>} Transaction receipt
   */
  initializeMarketplaceV1_5: async () => {
    console.log('[Blockchain] Initializing marketplace V1.5...')
    try {
      const ready = await BlockchainManager.init()
      if (!ready) throw new Error('Blockchain not initialized')

      const signer = await BlockchainManager.getSigner()
      if (!signer) throw new Error('Could not get signer')

      const marketplaceWithSigner = BlockchainManager.contracts.marketplace.connect(signer)
      const tx = await marketplaceWithSigner.initializeV1_5()
      const receipt = await tx.wait()

      console.log('[Blockchain] Marketplace V1.5 initialized successfully')
      return receipt
    } catch (e) {
      console.error('[Blockchain] initializeMarketplaceV1_5 failed:', e.message)
      throw e
    }
  },

  // ==================== END TIMED AUCTIONS ====================

  getSigner: async () => {
    await BlockchainManager.init()
    const bridge = createGenosDBSigner(BlockchainManager.provider)
    return bridge.getSigner(BlockchainManager.ethers, BlockchainManager.provider)
  }
}

/**
 * Shared utility to get the initialized BlockchainManager
 * @returns {Promise<Object>}
 */
export const getBlockchainManager = async () => {
  return BlockchainManager
}

/**
 * Reset BlockchainManager for network switch
 * Clears cached provider/contracts and reinitializes
 * @returns {Promise<Object>}
 */
export const resetBlockchainManager = async () => {
  console.log('[Blockchain] Resetting for network switch...')
  
  // Clear current state
  BlockchainManager.provider = null
  BlockchainManager.contracts = {}
  BlockchainManager.initPromise = null
  // Note: Keep ethers loaded
  
  // Reinitialize with new network config
  await BlockchainManager.init()
  
  return BlockchainManager
}

export default BlockchainManager
