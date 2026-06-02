/**
 * Mainnet - Mint Token to User with Custom Image
 *
 * 1. Creates metadata JSON with the provided image
 * 2. Uploads metadata to Pinata IPFS
 * 3. Mints token on Polygon Mainnet
 * 4. Sets the metadata URL
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import 'dotenv/config'
import { ethers } from 'ethers'

// Configuration
const TOKEN_ID = Date.now() // Unique token ID based on timestamp
const RECIPIENT = '0xE5639DfE345F8ab845bEBE63a1C7322F9c6fF5c7'
const CONTRACT_ADDRESS = '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71' // Mainnet proxy
const RPC_URL = process.env.POLYGON_MAINNET_RPC || 'https://polygon-rpc.com'

// Asset metadata
const ASSET_NAME = 'OVGrid Test Asset'
const ASSET_DESCRIPTION = 'Test asset minted for verification'
const IMAGE_URL = 'https://peach-foolish-hoverfly-843.mypinata.cloud/ipfs/QmXHHGYSPSwuyTsKfupRpeZiPrF8RtDyYycjqVygGXtrMC'

// Pinata config
const PINATA_JWT = process.env.PINATA_JWT
const PRIVATE_KEY = process.env.PRIVATE_KEY

const ABI = [
  'function mint(address account, uint256 id, uint256 amount, bytes data)',
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function uri(uint256 tokenId) view returns (string)',
  'function exists(uint256 tokenId) view returns (bool)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function MINTER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)'
]

/**
 * Upload JSON metadata to Pinata
 */
async function uploadMetadataToPinata(metadata, name) {
  console.log('📤 Uploading metadata to Pinata...')

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PINATA_JWT}`
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Pinata upload failed: ${error}`)
  }

  const result = await response.json()
  const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`

  console.log('   CID:', result.IpfsHash)
  console.log('   Gateway URL:', gatewayUrl)

  return { cid: result.IpfsHash, gatewayUrl }
}

async function main() {
  console.log('🔗 Polygon Mainnet - Mint Asset to User\n')
  console.log('Contract:', CONTRACT_ADDRESS)
  console.log('Token ID:', TOKEN_ID)
  console.log('Recipient:', RECIPIENT)
  console.log('Image:', IMAGE_URL)

  if (!PINATA_JWT) {
    console.log('\n❌ PINATA_JWT not set in .env')
    return
  }

  if (!PRIVATE_KEY) {
    console.log('\n❌ PRIVATE_KEY not set in .env')
    return
  }

  // Step 1: Create and upload metadata
  const metadata = {
    name: ASSET_NAME,
    description: ASSET_DESCRIPTION,
    image: IMAGE_URL,
    external_url: 'https://ovgrid.com',
    attributes: [
      { trait_type: 'Collection', value: 'OVGrid' },
      { trait_type: 'Minted By', value: 'OVGrid CLI' },
      { trait_type: 'Token ID', value: TOKEN_ID.toString() }
    ]
  }

  const { gatewayUrl: metadataUrl } = await uploadMetadataToPinata(metadata, `OVGrid-Metadata-${TOKEN_ID}`)

  // Step 2: Connect to blockchain
  console.log('\n🔗 Connecting to Polygon Mainnet...')
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  console.log('Wallet:', wallet.address)

  const balance = await provider.getBalance(wallet.address)
  console.log('Balance:', ethers.formatEther(balance), 'POL')

  // Check minter role
  console.log('\n🔍 Checking MINTER_ROLE...')
  const minterRole = await contract.MINTER_ROLE()
  const hasMinterRole = await contract.hasRole(minterRole, wallet.address)
  console.log('   Has MINTER_ROLE:', hasMinterRole)

  if (!hasMinterRole) {
    console.log('\n❌ Wallet does not have MINTER_ROLE')
    return
  }

  // Step 3: Mint token
  console.log('\n📤 Minting token...')
  const mintTx = await contract.mint(
    RECIPIENT,    // to
    TOKEN_ID,     // id
    1,            // amount
    '0x'          // data
  )
  console.log('   TX Hash:', mintTx.hash)
  console.log('   Waiting for confirmation...')
  const mintReceipt = await mintTx.wait()
  console.log('   ✅ Minted in block:', mintReceipt.blockNumber)

  // Step 4: Set metadata URL
  console.log('\n📤 Setting metadata URL...')
  console.log('   URL:', metadataUrl)
  const metaTx = await contract.setTokenMetadataUrl(TOKEN_ID, metadataUrl)
  console.log('   TX Hash:', metaTx.hash)
  console.log('   Waiting for confirmation...')
  const metaReceipt = await metaTx.wait()
  console.log('   ✅ Confirmed in block:', metaReceipt.blockNumber)

  // Verify
  console.log('\n🔍 Verifying...')
  const newUri = await contract.uri(TOKEN_ID)
  console.log('   uri() returns:', newUri)

  const recipientBalance = await contract.balanceOf(RECIPIENT, TOKEN_ID)
  console.log('   Recipient balance:', recipientBalance.toString())

  console.log('\n' + '='.repeat(60))
  console.log('✅ SUCCESS!')
  console.log('='.repeat(60))
  console.log('\n📋 Details:')
  console.log('   Token ID:', TOKEN_ID)
  console.log('   Recipient:', RECIPIENT)
  console.log('   Name:', ASSET_NAME)
  console.log('\n📋 Links:')
  console.log('   Polygonscan NFT:', `https://polygonscan.com/nft/${CONTRACT_ADDRESS}/${TOKEN_ID}`)
  console.log('   Polygonscan Token:', `https://polygonscan.com/token/${CONTRACT_ADDRESS}?a=${TOKEN_ID}`)
  console.log('   Mint TX:', `https://polygonscan.com/tx/${mintTx.hash}`)
  console.log('   Metadata TX:', `https://polygonscan.com/tx/${metaTx.hash}`)
  console.log('   Metadata JSON:', metadataUrl)
  console.log('   Image:', IMAGE_URL)
}

main().catch(console.error)
