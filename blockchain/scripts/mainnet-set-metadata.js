/**
 * Mainnet - Set Token Metadata URL
 *
 * Uses the Alchemy RPC to set metadata on Polygon Mainnet
 * where V2.2.0 is already deployed.
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
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function getTokenMetadataUrl(uint256 tokenId) view returns (string)',
  'function uri(uint256 tokenId) view returns (string)',
  'function exists(uint256 tokenId) view returns (bool)',
  'function totalSupply(uint256 tokenId) view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)'
]

async function main() {
  console.log('🔗 Polygon Mainnet - Token Metadata Setup\n')
  console.log('Contract:', CONTRACT_ADDRESS)
  console.log('Token ID:', TOKEN_ID)
  console.log('Metadata URL:', METADATA_IPFS_URL)

  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  // Check if token exists
  console.log('\n🔍 Checking token status...')
  try {
    const exists = await contract.exists(TOKEN_ID)
    console.log('   exists():', exists)

    if (!exists) {
      console.log('\n❌ Token ID', TOKEN_ID, 'does not exist on Mainnet.')
      console.log('   You need to mint a token first.')
      return
    }

    const supply = await contract.totalSupply(TOKEN_ID)
    console.log('   totalSupply():', supply.toString())

    const balance = await contract.balanceOf(wallet.address, TOKEN_ID)
    console.log('   balanceOf(you):', balance.toString())

    const currentUri = await contract.uri(TOKEN_ID)
    console.log('   Current uri():', currentUri.substring(0, 100) + '...')
  } catch (e) {
    console.log('   Error checking token:', e.message)
  }

  // Set metadata URL
  console.log('\n📤 Setting metadata URL...')
  try {
    const tx = await contract.setTokenMetadataUrl(TOKEN_ID, METADATA_IPFS_URL)
    console.log('   TX Hash:', tx.hash)

    console.log('   Waiting for confirmation...')
    const receipt = await tx.wait()
    console.log('   ✅ Confirmed in block:', receipt.blockNumber)

    // Verify
    console.log('\n🔍 Verifying...')
    const newUri = await contract.uri(TOKEN_ID)
    console.log('   uri() now returns:', newUri)

    console.log('\n✅ SUCCESS!')
    console.log('   Polygonscan:', `https://polygonscan.com/token/${CONTRACT_ADDRESS}?a=${TOKEN_ID}`)
    console.log('   Pinata Metadata:', 'https://gateway.pinata.cloud/ipfs/QmPSfs4BuXWVevLmTLMKn2tqaC78VdBWydA7uAdiEBZ9sT')
    console.log('   Pinata Image:', 'https://gateway.pinata.cloud/ipfs/QmXL8h1nt5w5AjkP1FvS5u1qmz6e9CnwaeZTPNF7foiGnp')
  } catch (e) {
    console.log('\n❌ Error:', e.message)
  }
}

main().catch(console.error)
