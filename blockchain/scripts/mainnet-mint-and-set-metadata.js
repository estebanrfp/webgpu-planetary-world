/**
 * Mainnet - Mint Token and Set Metadata URL
 *
 * 1. Mints a new token on Polygon Mainnet
 * 2. Sets the IPFS metadata URL
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import 'dotenv/config'
import { ethers } from 'ethers'

// Mainnet Configuration
const TOKEN_ID = 1
const CONTRACT_ADDRESS = '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71' // Mainnet proxy
const RPC_URL = process.env.POLYGON_MAINNET_RPC || 'https://polygon-rpc.com'
const METADATA_IPFS_URL = 'ipfs://QmPSfs4BuXWVevLmTLMKn2tqaC78VdBWydA7uAdiEBZ9sT'

const PRIVATE_KEY = process.env.PRIVATE_KEY

const ABI = [
  // Mint functions
  'function mint(address account, uint256 id, uint256 amount, bytes data)',
  'function mintWithRoyalty(address to, uint256 id, uint256 amount, bytes data, address creator, uint96 royaltyPercentage)',
  // Metadata functions
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function getTokenMetadataUrl(uint256 tokenId) view returns (string)',
  'function uri(uint256 tokenId) view returns (string)',
  // View functions
  'function exists(uint256 tokenId) view returns (bool)',
  'function totalSupply(uint256 tokenId) view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  // Role check
  'function MINTER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)'
]

async function main() {
  console.log('🔗 Polygon Mainnet - Mint & Set Metadata\n')
  console.log('Contract:', CONTRACT_ADDRESS)
  console.log('Token ID:', TOKEN_ID)

  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  console.log('Wallet:', wallet.address)

  // Check roles
  console.log('\n🔍 Checking roles...')
  const minterRole = await contract.MINTER_ROLE()
  const hasMinterRole = await contract.hasRole(minterRole, wallet.address)
  console.log('   MINTER_ROLE:', hasMinterRole)

  if (!hasMinterRole) {
    console.log('\n❌ Wallet does not have MINTER_ROLE')
    return
  }

  // Check if token already exists
  const exists = await contract.exists(TOKEN_ID)
  if (exists) {
    console.log('\n⚠️ Token', TOKEN_ID, 'already exists')
  } else {
    // Mint token
    console.log('\n📤 Minting token...')
    const mintTx = await contract.mint(
      wallet.address,  // to
      TOKEN_ID,        // id
      1,               // amount
      '0x'             // data
    )
    console.log('   TX Hash:', mintTx.hash)
    console.log('   Waiting for confirmation...')
    const mintReceipt = await mintTx.wait()
    console.log('   ✅ Minted in block:', mintReceipt.blockNumber)
  }

  // Set metadata URL
  console.log('\n📤 Setting metadata URL...')
  console.log('   URL:', METADATA_IPFS_URL)
  const metaTx = await contract.setTokenMetadataUrl(TOKEN_ID, METADATA_IPFS_URL)
  console.log('   TX Hash:', metaTx.hash)
  console.log('   Waiting for confirmation...')
  const metaReceipt = await metaTx.wait()
  console.log('   ✅ Confirmed in block:', metaReceipt.blockNumber)

  // Verify
  console.log('\n🔍 Verifying...')
  const newUri = await contract.uri(TOKEN_ID)
  console.log('   uri() returns:', newUri)

  console.log('\n' + '='.repeat(60))
  console.log('✅ SUCCESS!')
  console.log('='.repeat(60))
  console.log('\n📋 Links:')
  console.log('   Polygonscan Token:', `https://polygonscan.com/token/${CONTRACT_ADDRESS}?a=${TOKEN_ID}`)
  console.log('   Polygonscan TX:', `https://polygonscan.com/tx/${metaTx.hash}`)
  console.log('   Pinata Metadata:', 'https://gateway.pinata.cloud/ipfs/QmPSfs4BuXWVevLmTLMKn2tqaC78VdBWydA7uAdiEBZ9sT')
  console.log('   Pinata Image:', 'https://gateway.pinata.cloud/ipfs/QmXL8h1nt5w5AjkP1FvS5u1qmz6e9CnwaeZTPNF7foiGnp')
}

main().catch(console.error)
