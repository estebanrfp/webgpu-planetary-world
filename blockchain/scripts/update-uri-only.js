/**
 * Update URI Only - Set the metadata URL in the contract
 * Image and metadata are already uploaded to IPFS
 */

import 'dotenv/config'
import { ethers } from 'ethers'

const TOKEN_ID = 1
const CONTRACT_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195'
const RPC_URL = 'https://rpc.ankr.com/polygon_amoy'
const METADATA_IPFS_URL = 'ipfs://QmPSfs4BuXWVevLmTLMKn2tqaC78VdBWydA7uAdiEBZ9sT'

const PRIVATE_KEY = process.env.PRIVATE_KEY

const ABI = [
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function uri(uint256 tokenId) view returns (string)'
]

async function main() {
  console.log('🔗 Updating contract metadata URL...')
  console.log('   Token ID:', TOKEN_ID)
  console.log('   Metadata URL:', METADATA_IPFS_URL)

  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  console.log('\n📤 Sending transaction...')
  const tx = await contract.setTokenMetadataUrl(TOKEN_ID, METADATA_IPFS_URL)
  console.log('   TX Hash:', tx.hash)

  console.log('   Waiting for confirmation...')
  const receipt = await tx.wait()
  console.log('   ✅ Confirmed in block:', receipt.blockNumber)

  // Verify
  console.log('\n🔍 Verifying...')
  const newUri = await contract.uri(TOKEN_ID)
  console.log('   uri(1) returns:', newUri)

  console.log('\n✅ SUCCESS!')
  console.log('   Pinata Metadata:', 'https://gateway.pinata.cloud/ipfs/QmPSfs4BuXWVevLmTLMKn2tqaC78VdBWydA7uAdiEBZ9sT')
  console.log('   Pinata Image:', 'https://gateway.pinata.cloud/ipfs/QmXL8h1nt5w5AjkP1FvS5u1qmz6e9CnwaeZTPNF7foiGnp')
  console.log('   Polygonscan:', `https://amoy.polygonscan.com/token/${CONTRACT_ADDRESS}?a=${TOKEN_ID}`)
}

main().catch(console.error)
