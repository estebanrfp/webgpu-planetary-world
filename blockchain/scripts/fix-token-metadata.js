/**
 * Fix Token Metadata - Upload image to IPFS and update contract
 *
 * This script:
 * 1. Uploads the preview image to Pinata IPFS
 * 2. Creates proper NFT metadata JSON with IPFS image URL
 * 3. Uploads metadata JSON to Pinata
 * 4. Updates the contract with setTokenMetadataUrl
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import 'dotenv/config'
import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const TOKEN_ID = 1
const CONTRACT_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195' // Proxy address
const RPC_URL = 'https://rpc-amoy.polygon.technology'

const PINATA_JWT = process.env.PINATA_JWT
const PRIVATE_KEY = process.env.PRIVATE_KEY
const PINATA_API_URL = 'https://api.pinata.cloud'
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

// ABI for setTokenMetadataUrl
const ABI = [
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function uri(uint256 tokenId) view returns (string)'
]

/**
 * Upload file to Pinata IPFS
 */
async function uploadFileToPinata(filePath, name) {
  const fileBuffer = fs.readFileSync(filePath)
  const blob = new Blob([fileBuffer])

  const formData = new FormData()
  formData.append('file', blob, path.basename(filePath))
  formData.append('pinataMetadata', JSON.stringify({ name }))

  const response = await fetch(`${PINATA_API_URL}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PINATA_JWT}` },
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
 * Upload JSON to Pinata IPFS
 */
async function uploadJSONToPinata(metadata, name) {
  const body = {
    pinataContent: metadata,
    pinataMetadata: { name }
  }

  const response = await fetch(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
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

async function main() {
  console.log('🔧 Fixing Token Metadata for Token ID:', TOKEN_ID)
  console.log('=' .repeat(60))

  // 1. Upload image to Pinata
  const imagePath = path.join(__dirname, '../../assets/preview.png')
  console.log('\n📤 Step 1: Uploading image to IPFS...')
  console.log('   Image path:', imagePath)

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`)
  }

  const imageResult = await uploadFileToPinata(imagePath, `OVGrid-Genesis-Image-${TOKEN_ID}`)
  console.log('   ✅ Image uploaded!')
  console.log('   IPFS URL:', imageResult.ipfsUrl)
  console.log('   Gateway URL:', imageResult.gatewayUrl)

  // 2. Create and upload metadata JSON
  console.log('\n📝 Step 2: Creating metadata JSON...')
  const metadata = {
    name: `OVGrid Genesis Asset #${TOKEN_ID}`,
    description: 'First minted asset on OVGrid Metaverse - Genesis Collection',
    image: imageResult.ipfsUrl,
    external_url: 'https://ovgrid.com',
    attributes: [
      { trait_type: 'Collection', value: 'Genesis' },
      { trait_type: 'Type', value: 'Land' },
      { trait_type: 'Rarity', value: 'Common' }
    ]
  }
  console.log('   Metadata:', JSON.stringify(metadata, null, 2))

  console.log('\n📤 Step 3: Uploading metadata to IPFS...')
  const metadataResult = await uploadJSONToPinata(metadata, `OVGrid-Genesis-Metadata-${TOKEN_ID}`)
  console.log('   ✅ Metadata uploaded!')
  console.log('   IPFS URL:', metadataResult.ipfsUrl)
  console.log('   Gateway URL:', metadataResult.gatewayUrl)

  // 3. Update contract
  console.log('\n🔗 Step 4: Updating contract...')
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  console.log('   Calling setTokenMetadataUrl...')
  const tx = await contract.setTokenMetadataUrl(TOKEN_ID, metadataResult.ipfsUrl)
  console.log('   TX Hash:', tx.hash)

  console.log('   Waiting for confirmation...')
  const receipt = await tx.wait()
  console.log('   ✅ Confirmed in block:', receipt.blockNumber)

  // 4. Verify
  console.log('\n🔍 Step 5: Verifying...')
  const newUri = await contract.uri(TOKEN_ID)
  console.log('   uri(1) returns:', newUri)

  // Summary
  console.log('\n' + '=' .repeat(60))
  console.log('✅ SUCCESS!')
  console.log('=' .repeat(60))
  console.log('\n📋 Summary:')
  console.log('   Token ID:', TOKEN_ID)
  console.log('   Image IPFS:', imageResult.ipfsUrl)
  console.log('   Metadata IPFS:', metadataResult.ipfsUrl)
  console.log('\n🔗 Links:')
  console.log('   Pinata Image:', imageResult.gatewayUrl)
  console.log('   Pinata Metadata:', metadataResult.gatewayUrl)
  console.log('   Polygonscan:', `https://amoy.polygonscan.com/token/${CONTRACT_ADDRESS}?a=${TOKEN_ID}`)
  console.log('\n⏳ Note: Polygonscan may take a few minutes to refresh the NFT image.')
}

main().catch(console.error)
