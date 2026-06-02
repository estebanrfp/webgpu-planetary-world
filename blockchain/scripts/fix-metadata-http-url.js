/**
 * Fix Metadata - Use HTTP Gateway URL instead of ipfs://
 *
 * Polygonscan may have issues resolving ipfs:// URLs.
 * This script creates new metadata with HTTP gateway URLs.
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import 'dotenv/config'
import { ethers } from 'ethers'

// Configuration
const TOKEN_ID = 1
const CONTRACT_ADDRESS = '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71' // Mainnet proxy
const RPC_URL = process.env.POLYGON_MAINNET_RPC || 'https://polygon-rpc.com'
const PRIVATE_KEY = process.env.PRIVATE_KEY

const PINATA_JWT = process.env.PINATA_JWT
const PINATA_API_URL = 'https://api.pinata.cloud'
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

// Image already uploaded
const IMAGE_CID = 'QmXL8h1nt5w5AjkP1FvS5u1qmz6e9CnwaeZTPNF7foiGnp'
const IMAGE_GATEWAY_URL = `${PINATA_GATEWAY}${IMAGE_CID}`

const ABI = [
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function uri(uint256 tokenId) view returns (string)'
]

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
  console.log('🔧 Fixing Metadata - Using HTTP Gateway URLs\n')

  // Create metadata with HTTP gateway URL for image
  const metadata = {
    name: `OVGrid Genesis Asset #${TOKEN_ID}`,
    description: 'First minted asset on OVGrid Metaverse - Genesis Collection',
    image: IMAGE_GATEWAY_URL,  // HTTP URL instead of ipfs://
    external_url: 'https://ovgrid.com',
    attributes: [
      { trait_type: 'Collection', value: 'Genesis' },
      { trait_type: 'Type', value: 'Land' },
      { trait_type: 'Rarity', value: 'Common' }
    ]
  }

  console.log('📝 New metadata with HTTP image URL:')
  console.log(JSON.stringify(metadata, null, 2))

  // Upload new metadata
  console.log('\n📤 Uploading new metadata to IPFS...')
  const metadataResult = await uploadJSONToPinata(metadata, `OVGrid-Genesis-Metadata-HTTP-${TOKEN_ID}`)
  console.log('   ✅ Uploaded!')
  console.log('   IPFS URL:', metadataResult.ipfsUrl)
  console.log('   Gateway URL:', metadataResult.gatewayUrl)

  // Update contract
  console.log('\n🔗 Updating contract...')
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  // Use gateway URL for metadata too (maximum compatibility)
  const metadataUrlToUse = metadataResult.gatewayUrl
  console.log('   Setting metadata URL to:', metadataUrlToUse)

  const tx = await contract.setTokenMetadataUrl(TOKEN_ID, metadataUrlToUse)
  console.log('   TX Hash:', tx.hash)
  console.log('   Waiting for confirmation...')
  const receipt = await tx.wait()
  console.log('   ✅ Confirmed in block:', receipt.blockNumber)

  // Verify
  console.log('\n🔍 Verifying...')
  const newUri = await contract.uri(TOKEN_ID)
  console.log('   uri() returns:', newUri)

  console.log('\n' + '='.repeat(60))
  console.log('✅ SUCCESS!')
  console.log('='.repeat(60))
  console.log('\n📋 Links:')
  console.log('   NFT on Polygonscan:', `https://polygonscan.com/nft/${CONTRACT_ADDRESS}/${TOKEN_ID}`)
  console.log('   Metadata JSON:', metadataResult.gatewayUrl)
  console.log('   Image:', IMAGE_GATEWAY_URL)
}

main().catch(console.error)
