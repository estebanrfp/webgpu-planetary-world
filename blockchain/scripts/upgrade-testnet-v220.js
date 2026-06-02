/**
 * Upgrade Testnet (Amoy) OVGAssets to V2.2.0
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

// Testnet Configuration
const PROXY_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195'
const NEW_IMPLEMENTATION = '0xeE523656A5D22D5fe2bbB2a4A4391032dfd6DE14'
const PRIVATE_KEY = process.env.PRIVATE_KEY

// Try multiple RPCs
const RPCS = [
  'https://rpc-amoy.polygon.technology',
  'https://polygon-amoy-bor-rpc.publicnode.com',
  'https://rpc.ankr.com/polygon_amoy'
]

const ABI = [
  'function upgradeToAndCall(address newImplementation, bytes data)',
  'function getTokenMetadataUrl(uint256 tokenId) view returns (string)',
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function uri(uint256 tokenId) view returns (string)'
]

const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

async function tryRpc(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
    staticNetwork: true,
    batchMaxCount: 1
  })

  // Test connection
  await provider.getBlockNumber()
  return provider
}

async function getWorkingProvider() {
  for (const rpc of RPCS) {
    try {
      console.log(`   Trying ${rpc}...`)
      const provider = await tryRpc(rpc)
      console.log(`   ✅ Connected!`)
      return provider
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message}`)
    }
  }
  throw new Error('All RPCs failed')
}

async function main() {
  console.log('🔄 Upgrading Testnet (Amoy) OVGAssets to V2.2.0\n')
  console.log('Proxy:', PROXY_ADDRESS)
  console.log('New Implementation:', NEW_IMPLEMENTATION)

  console.log('\n🔗 Connecting to RPC...')
  const provider = await getWorkingProvider()
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

  // Check current implementation
  console.log('\n📍 Checking current implementation...')
  const currentImpl = await provider.getStorage(PROXY_ADDRESS, IMPL_SLOT)
  const currentImplAddress = '0x' + currentImpl.slice(-40)
  console.log('   Current:', currentImplAddress)

  if (currentImplAddress.toLowerCase() === NEW_IMPLEMENTATION.toLowerCase()) {
    console.log('\n✅ Already upgraded to V2.2.0!')
    return
  }

  // Upgrade
  console.log('\n📤 Sending upgrade transaction...')
  const contract = new ethers.Contract(PROXY_ADDRESS, ABI, wallet)
  const tx = await contract.upgradeToAndCall(NEW_IMPLEMENTATION, '0x')
  console.log('   TX Hash:', tx.hash)

  console.log('   Waiting for confirmation...')
  const receipt = await tx.wait()
  console.log('   ✅ Confirmed in block:', receipt.blockNumber)

  // Verify
  console.log('\n🔍 Verifying upgrade...')
  const newImpl = await provider.getStorage(PROXY_ADDRESS, IMPL_SLOT)
  const newImplAddress = '0x' + newImpl.slice(-40)
  console.log('   New implementation:', newImplAddress)
  console.log('   Match:', newImplAddress.toLowerCase() === NEW_IMPLEMENTATION.toLowerCase() ? '✅' : '❌')

  // Test new function
  console.log('\n🧪 Testing setTokenMetadataUrl availability...')
  try {
    await contract.getTokenMetadataUrl(1)
    console.log('   ✅ V2.2.0 functions available!')
  } catch (e) {
    console.log('   ❌ Function not available:', e.message)
  }

  // Update deployment file
  const deploymentPath = path.join(__dirname, '../deployments/polygonAmoy-upgradeable.json')
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))

  if (!deployment.contracts.OVGAssets.previousImplementations) {
    deployment.contracts.OVGAssets.previousImplementations = []
  }
  deployment.contracts.OVGAssets.previousImplementations.push({
    address: currentImplAddress,
    upgradedAt: new Date().toISOString()
  })
  deployment.contracts.OVGAssets.implementation = NEW_IMPLEMENTATION
  deployment.lastUpdated = new Date().toISOString()

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))
  console.log('\n📝 Updated deployment file')

  console.log('\n' + '='.repeat(50))
  console.log('✅ UPGRADE COMPLETE!')
  console.log('='.repeat(50))
  console.log('\nPolygonscan:', `https://amoy.polygonscan.com/tx/${tx.hash}`)
}

main().catch(console.error)
