/**
 * Testnet - Set Token Metadata URL (Pinata)
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import 'dotenv/config'
import { ethers } from 'ethers'

// Configuration
const TOKEN_ID = 1
const CONTRACT_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195'
const METADATA_URL = 'https://gateway.pinata.cloud/ipfs/QmVtNSx3Q7LEwbm6kk5dAV2cRRVomwCvgxNVrcPiGA7ouC'
const PRIVATE_KEY = process.env.PRIVATE_KEY

const RPCS = [
  'https://polygon-amoy-bor-rpc.publicnode.com',
  'https://rpc-amoy.polygon.technology'
]

const ABI = [
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function uri(uint256 tokenId) view returns (string)',
  'function exists(uint256 tokenId) view returns (bool)'
]

async function getProvider() {
  for (const rpc of RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, 80002, { staticNetwork: true })
      await provider.getBlockNumber()
      return provider
    } catch (e) { /* try next */ }
  }
  throw new Error('All RPCs failed')
}

async function main() {
  console.log('🔗 Testnet - Set Token Metadata URL\n')

  const provider = await getProvider()
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  // Check if token exists
  const exists = await contract.exists(TOKEN_ID)
  console.log('Token', TOKEN_ID, 'exists:', exists)

  if (!exists) {
    console.log('❌ Token does not exist. Skipping.')
    return
  }

  // Set metadata
  console.log('\n📤 Setting metadata URL...')
  console.log('   URL:', METADATA_URL)

  const tx = await contract.setTokenMetadataUrl(TOKEN_ID, METADATA_URL)
  console.log('   TX:', tx.hash)

  await tx.wait()
  console.log('   ✅ Confirmed!')

  // Verify
  const uri = await contract.uri(TOKEN_ID)
  console.log('\n🔍 uri() returns:', uri)

  console.log('\n✅ Done!')
  console.log('   Polygonscan:', `https://amoy.polygonscan.com/nft/${CONTRACT_ADDRESS}/${TOKEN_ID}`)
}

main().catch(console.error)
