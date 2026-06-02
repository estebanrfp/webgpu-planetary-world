/**
 * NFT.storage Integration for IPFS metadata uploads
 *
 * Uploads JSON metadata to IPFS via NFT.storage API
 * Returns ipfs:// URLs compatible with Polygonscan/OpenSea
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

const NFT_STORAGE_API = 'https://api.nft.storage/upload'

let apiKey = null

/**
 * Initialize NFT.storage with API key
 * @param {string} key - NFT.storage API key
 */
export function init(key) {
  apiKey = key
}

/**
 * Upload JSON metadata to IPFS via NFT.storage
 * @param {Object} metadata - Metadata object with name, description, image
 * @returns {Promise<string>} IPFS URL (ipfs://bafyrei...)
 */
export async function uploadMetadata(metadata) {
  if (!apiKey) {
    throw new Error('NFT.storage API key not configured. Call init() first.')
  }

  const json = JSON.stringify(metadata)
  const blob = new Blob([json], { type: 'application/json' })

  const response = await fetch(NFT_STORAGE_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: blob
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`NFT.storage upload failed: ${error}`)
  }

  const result = await response.json()

  if (!result.ok || !result.value?.cid) {
    throw new Error(`NFT.storage upload failed: ${JSON.stringify(result)}`)
  }

  // Return IPFS URL
  return `ipfs://${result.value.cid}`
}

/**
 * Create and upload NFT metadata to IPFS
 * @param {Object} options - Metadata options
 * @param {string} options.name - NFT name/title
 * @param {string} options.description - NFT description
 * @param {string} options.image - Image URL (HTTP/IPFS)
 * @param {string} [options.animation_url] - Optional animation/asset URL
 * @returns {Promise<string>} IPFS URL for the metadata JSON
 */
export async function createMetadata({ name, description, image, animation_url }) {
  const metadata = {
    name: name || '',
    description: description || '',
    image: image || ''
  }

  // Only add animation_url if provided
  if (animation_url) {
    metadata.animation_url = animation_url
  }

  return uploadMetadata(metadata)
}

/**
 * Convert IPFS URL to HTTP gateway URL for preview
 * @param {string} ipfsUrl - IPFS URL (ipfs://...)
 * @returns {string} HTTP gateway URL
 */
export function toGatewayUrl(ipfsUrl) {
  if (!ipfsUrl?.startsWith('ipfs://')) return ipfsUrl
  const cid = ipfsUrl.replace('ipfs://', '')
  return `https://nftstorage.link/ipfs/${cid}`
}

export default {
  init,
  uploadMetadata,
  createMetadata,
  toGatewayUrl
}
