/**
 * Deploy V2.2.0 Implementation on Testnet (Amoy)
 * Then upgrade the proxy to it
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
const RPCS = [
  'https://rpc-amoy.polygon.technology',
  'https://polygon-amoy-bor-rpc.publicnode.com',
  'https://rpc.ankr.com/polygon_amoy'
]
const PRIVATE_KEY = process.env.PRIVATE_KEY

async function getWorkingProvider() {
  for (const rpc of RPCS) {
    try {
      console.log(`   Trying ${rpc}...`)
      const provider = new ethers.JsonRpcProvider(rpc, 80002, { staticNetwork: true })
      await provider.getBlockNumber()
      console.log(`   ✅ Connected!`)
      return provider
    } catch (e) {
      console.log(`   ❌ Failed`)
    }
  }
  throw new Error('All RPCs failed')
}

const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

// Read compiled contract
const artifactPath = path.join(__dirname, '../artifacts/contracts/upgradeable/OVGAssetsUpgradeable.sol/OVGAssetsUpgradeable.json')

async function main() {
  console.log('🚀 Deploy V2.2.0 Implementation on Testnet (Amoy)\n')

  // Check if artifact exists
  if (!fs.existsSync(artifactPath)) {
    console.log('❌ Contract artifact not found. Need to compile first.')
    console.log('   Run: npx hardhat compile')
    return
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  console.log('✅ Contract artifact loaded')

  // Connect
  console.log('\n🔗 Connecting to RPC...')
  const provider = await getWorkingProvider()
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  console.log('Wallet:', wallet.address)

  const balance = await provider.getBalance(wallet.address)
  console.log('Balance:', ethers.formatEther(balance), 'POL')

  if (balance === 0n) {
    console.log('❌ No balance! Get testnet POL from faucet.')
    return
  }

  // Deploy new implementation
  console.log('\n📤 Deploying new implementation...')
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
  const implementation = await factory.deploy()

  console.log('   TX Hash:', implementation.deploymentTransaction().hash)
  console.log('   Waiting for confirmation...')

  await implementation.waitForDeployment()
  const implAddress = await implementation.getAddress()
  console.log('   ✅ Implementation deployed at:', implAddress)

  // Upgrade proxy
  console.log('\n📤 Upgrading proxy...')
  const proxyAbi = [
    'function upgradeToAndCall(address newImplementation, bytes data)'
  ]
  const proxy = new ethers.Contract(PROXY_ADDRESS, proxyAbi, wallet)

  const upgradeTx = await proxy.upgradeToAndCall(implAddress, '0x')
  console.log('   TX Hash:', upgradeTx.hash)
  console.log('   Waiting for confirmation...')

  const receipt = await upgradeTx.wait()
  console.log('   ✅ Upgraded in block:', receipt.blockNumber)

  // Verify
  console.log('\n🔍 Verifying...')
  const newImpl = await provider.getStorage(PROXY_ADDRESS, IMPL_SLOT)
  const newImplAddress = '0x' + newImpl.slice(-40)
  console.log('   Implementation:', newImplAddress)
  console.log('   Match:', newImplAddress.toLowerCase() === implAddress.toLowerCase() ? '✅' : '❌')

  // Test V2.2.0 function
  const assetsAbi = ['function getTokenMetadataUrl(uint256 tokenId) view returns (string)']
  const assets = new ethers.Contract(PROXY_ADDRESS, assetsAbi, provider)
  try {
    await assets.getTokenMetadataUrl(1)
    console.log('   V2.2.0 functions: ✅ Available')
  } catch (e) {
    console.log('   V2.2.0 functions: ❌ Not available')
  }

  // Update deployment file
  const deploymentPath = path.join(__dirname, '../deployments/polygonAmoy-upgradeable.json')
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))

  const oldImpl = deployment.contracts.OVGAssets.implementation
  if (!deployment.contracts.OVGAssets.previousImplementations) {
    deployment.contracts.OVGAssets.previousImplementations = []
  }
  deployment.contracts.OVGAssets.previousImplementations.push({
    address: oldImpl,
    upgradedAt: new Date().toISOString()
  })
  deployment.contracts.OVGAssets.implementation = implAddress
  deployment.lastUpdated = new Date().toISOString()

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))
  console.log('\n📝 Updated deployment file')

  console.log('\n' + '='.repeat(60))
  console.log('✅ SUCCESS!')
  console.log('='.repeat(60))
  console.log('\nNew Implementation:', implAddress)
  console.log('Polygonscan:', `https://amoy.polygonscan.com/address/${implAddress}`)
}

main().catch(console.error)
