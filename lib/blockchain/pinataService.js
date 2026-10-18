/**
 * Pinata IPFS Service
 *
 * Uploads files and JSON metadata to IPFS via Pinata API
 * Returns ipfs:// URLs compatible with Polygonscan/OpenSea
 *
 * Folder structure:
 * ovgrid-nft-{tokenId}/
 *   ├── image.{ext}
 *   ├── metadata.json
 *   └── asset.{ext} (optional)
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

const PINATA_API_URL = 'https://api.pinata.cloud'
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

let jwt = null

/**
 * Initialize Pinata with JWT
 * @param {string} token - Pinata JWT token
 */
export function init(token) {
  jwt = token
}

/**
 * Check if Pinata is initialized
 * @returns {boolean}
 */
export function isInitialized() {
  return !!jwt
}

/**
 * Get file extension from File object
 * @param {File} file - File object
 * @returns {string} Extension without dot (e.g., 'png', 'glb')
 */
function getFileExtension(file) {
  const name = file.name || ''
  const ext = name.split('.').pop()?.toLowerCase()
  return ext || 'bin'
}

/**
 * Upload a single file to Pinata IPFS
 * @param {File|Blob} file - File to upload
 * @param {string} [name] - Display name for the file
 * @param {object} [options] - Additional options
 * @param {string} [options.tokenId] - Token ID for keyvalues
 * @param {string} [options.fileType] - File type (image, asset, metadata)
 * @returns {Promise<{cid: string, ipfsUrl: string, gatewayUrl: string}>}
 */
export async function uploadFile(file, name, options = {}) {
  if (!jwt) throw new Error('Pinata not initialized. Call init() first.')

  const formData = new FormData()
  formData.append('file', file)

  const pinataMetadata = { name: name || file.name }
  if (options.tokenId || options.fileType) {
    pinataMetadata.keyvalues = {
      ...(options.tokenId && { tokenId: String(options.tokenId) }),
      ...(options.fileType && { fileType: options.fileType }),
      project: 'WebGPU Planetary World'
    }
  }
  formData.append('pinataMetadata', JSON.stringify(pinataMetadata))

  const response = await fetch(`${PINATA_API_URL}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}` },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Pinata upload failed: ${error}`)
  }

  const result = await response.json()
  return {
    cid: result.IpfsHash,
    ipfsUrl: `ipfs://${result.IpfsHash}`,
    gatewayUrl: `${PINATA_GATEWAY}${result.IpfsHash}`
  }
}

/**
 * Upload JSON metadata to Pinata IPFS
 * @param {Object} metadata - JSON object to upload
 * @param {string} [name] - Display name for the pin
 * @param {object} [options] - Additional options
 * @param {string} [options.tokenId] - Token ID for keyvalues
 * @returns {Promise<{cid: string, ipfsUrl: string, gatewayUrl: string}>}
 */
export async function uploadJSON(metadata, name, options = {}) {
  if (!jwt) throw new Error('Pinata not initialized. Call init() first.')

  const pinataMetadata = { name: name || 'metadata.json' }
  if (options.tokenId) {
    pinataMetadata.keyvalues = {
      tokenId: String(options.tokenId),
      fileType: 'metadata',
      project: 'WebGPU Planetary World'
    }
  }

  const response = await fetch(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ pinataContent: metadata, pinataMetadata })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Pinata JSON upload failed: ${error}`)
  }

  const result = await response.json()
  return {
    cid: result.IpfsHash,
    ipfsUrl: `ipfs://${result.IpfsHash}`,
    gatewayUrl: `${PINATA_GATEWAY}${result.IpfsHash}`
  }
}

/**
 * Upload multiple files as a directory to Pinata IPFS
 * Files directly at CID root: {CID}/image.png, {CID}/metadata.json
 *
 * @param {Array<{file: File|Blob, name: string}>} files - Files with names
 * @param {string} folderName - Display name for the pin in Pinata
 * @param {object} [options] - Additional options
 * @param {string} [options.tokenId] - Token ID for keyvalues
 * @returns {Promise<{cid: string, ipfsUrl: string, gatewayUrl: string}>}
 */
export async function uploadDirectory(files, folderName, options = {}) {
  if (!jwt) throw new Error('Pinata not initialized. Call init() first.')

  const formData = new FormData()

  // Add files with folder prefix - Pinata requires common parent for multi-file upload
  // Files will be at: {CID}/folderName/filename
  for (const { file, name } of files) {
    const filePath = `${folderName}/${name}`
    const blob = file instanceof Blob ? file : new Blob([file])
    const fileObj = new File([blob], name, {
      type: blob.type || 'application/octet-stream'
    })
    formData.append('file', fileObj, filePath)
  }

  const pinataMetadata = { name: folderName }
  if (options.tokenId) {
    pinataMetadata.keyvalues = {
      tokenId: String(options.tokenId),
      fileType: 'folder',
      project: 'WebGPU Planetary World'
    }
  }
  formData.append('pinataMetadata', JSON.stringify(pinataMetadata))
  formData.append('pinataOptions', JSON.stringify({ wrapWithDirectory: false }))

  const response = await fetch(`${PINATA_API_URL}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}` },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[Pinata] Directory upload error:', error)
    throw new Error(`Pinata directory upload failed: ${error}`)
  }

  const result = await response.json()
  // CID points directly to folderName directory
  // Access files at: {CID}/filename (folderName IS the CID content)
  return {
    cid: result.IpfsHash,
    ipfsUrl: `ipfs://${result.IpfsHash}`,
    gatewayUrl: `${PINATA_GATEWAY}${result.IpfsHash}`
  }
}

/**
 * Upload NFT files to IPFS (image + asset only, NO metadata.json)
 * Metadata is stored on-chain via OVGMetadata contract
 *
 * Structure:
 * ovgrid-nft-{tokenId}/
 *   ├── image.{ext}
 *   └── asset.{ext} (optional)
 *
 * @param {Object} options
 * @param {File} [options.imageFile] - Image file to upload
 * @param {string} [options.imageUrl] - Or use existing image URL
 * @param {File} [options.assetFile] - Optional asset file (3D model, etc.)
 * @param {string} [options.assetUrl] - Or use existing asset URL
 * @param {number} [options.tokenId] - Token ID for folder name
 * @returns {Promise<object>} Upload result with URLs
 */
export async function uploadNFTFiles({
  imageFile,
  imageUrl,
  assetFile,
  assetUrl,
  tokenId
}) {
  const id = tokenId || Date.now()
  const folderName = `ovgrid-nft-${id}`

  // Track files for directory upload
  const files = []
  let imageExt = null
  let assetExt = null

  // Add image file
  if (imageFile) {
    imageExt = getFileExtension(imageFile)
    files.push({ file: imageFile, name: `image.${imageExt}` })
  }

  // Add asset file
  if (assetFile) {
    assetExt = getFileExtension(assetFile)
    files.push({ file: assetFile, name: `asset.${assetExt}` })
  }

  // If no files to upload, return existing URLs
  if (files.length === 0) {
    return {
      folderCid: null,
      folderName,
      imageUrl: imageUrl || '',
      assetUrl: assetUrl || ''
    }
  }

  // Upload files as directory (NO metadata.json - stored on-chain)
  console.log(`[Pinata] Uploading ${files.length} file(s) to ${folderName}/...`)
  const dirResult = await uploadDirectory(files, folderName, { tokenId: id })

  // Build absolute URLs
  const basePath = `${PINATA_GATEWAY}${dirResult.cid}`

  return {
    folderCid: dirResult.cid,
    folderName,
    imageUrl: imageExt ? `${basePath}/image.${imageExt}` : imageUrl || '',
    assetUrl: assetExt ? `${basePath}/asset.${assetExt}` : assetUrl || ''
  }
}

/**
 * Convert IPFS URL to gateway URL
 * @param {string} ipfsUrl - ipfs://... URL
 * @returns {string} Gateway URL
 */
export function toGatewayUrl(ipfsUrl) {
  if (!ipfsUrl?.startsWith('ipfs://')) return ipfsUrl
  return `${PINATA_GATEWAY}${ipfsUrl.replace('ipfs://', '')}`
}

export default {
  init,
  isInitialized,
  uploadFile,
  uploadJSON,
  uploadDirectory,
  uploadNFTFiles,
  toGatewayUrl,
  PINATA_GATEWAY
}
