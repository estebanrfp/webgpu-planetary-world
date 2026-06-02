/**
 * Upgrade OVGAssets Proxy to V2.2.0 Implementation
 *
 * This script upgrades the proxy to point to the new implementation
 * that includes setTokenMetadataUrl function.
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
const PROXY_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195'
const NEW_IMPLEMENTATION = '0xeE523656A5D22D5fe2bbB2a4A4391032dfd6DE14'
const RPC_URL = 'https://rpc-amoy.polygon.technology'
const PRIVATE_KEY = process.env.PRIVATE_KEY

// UUPS upgrade ABI
const ABI = [
  'function upgradeToAndCall(address newImplementation, bytes data)',
  'function upgradeTo(address newImplementation)',
  'function getTokenMetadataUrl(uint256 tokenId) view returns (string)',
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function uri(uint256 tokenId) view returns (string)'
]

// ERC1967 implementation slot
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

async function main() {
  console.log('🔄 Upgrading OVGAssets to V2.2.0...\n')

  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(PROXY_ADDRESS, ABI, wallet)

  // Check current implementation
  console.log('📍 Proxy Address:', PROXY_ADDRESS)
  const currentImpl = await provider.getStorage(PROXY_ADDRESS, IMPLEMENTATION_SLOT)
  const currentImplAddress = '0x' + currentImpl.slice(-40)
  console.log('📍 Current Implementation:', currentImplAddress)
  console.log('📍 New Implementation:', NEW_IMPLEMENTATION)

  if (currentImplAddress.toLowerCase() === NEW_IMPLEMENTATION.toLowerCase()) {
    console.log('\n✅ Already on V2.2.0!')
    return
  }

  // Upgrade
  console.log('\n📤 Sending upgrade transaction...')
  const tx = await contract.upgradeToAndCall(NEW_IMPLEMENTATION, '0x')
  console.log('   TX Hash:', tx.hash)

  console.log('   Waiting for confirmation...')
  const receipt = await tx.wait()
  console.log('   ✅ Confirmed in block:', receipt.blockNumber)

  // Verify
  const newImpl = await provider.getStorage(PROXY_ADDRESS, IMPLEMENTATION_SLOT)
  const newImplAddress = '0x' + newImpl.slice(-40)
  console.log('\n🔍 Verifying...')
  console.log('   New Implementation:', newImplAddress)
  console.log('   Match:', newImplAddress.toLowerCase() === NEW_IMPLEMENTATION.toLowerCase())

  // Update deployment file
  const deploymentPath = path.join(__dirname, '../deployments/polygonAmoy-upgradeable.json')
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))

  // Add previous implementation to history
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

  console.log('\n✅ Upgrade complete!')
}

main().catch(console.error)
