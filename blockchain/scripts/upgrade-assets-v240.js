/**
 * Upgrade OVGAssets to v2.4.0 - OpenSea compatibility fixes
 *
 * Changes:
 * - uri() no longer includes empty animation_url
 * - uri() no longer includes non-standard token_id field
 * - _buildAttributes() always returns valid JSON array
 * - Requires image to be set (returns default if empty)
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
import hre from 'hardhat'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
  const network = hre.network.name
  console.log(`\n🚀 Upgrading OVGAssets to v2.4.0 on ${network}...`)

  // Load deployment info
  const deploymentFile = network === 'polygonMainnet'
    ? 'polygonMainnet-upgradeable.json'
    : 'polygonAmoy-upgradeable.json'

  const deploymentPath = path.join(__dirname, '..', 'deployments', deploymentFile)

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`)
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
  const assetsProxy = deployment.contracts.OVGAssets.proxy

  console.log(`📋 Proxy address: ${assetsProxy}`)

  // Get current version
  const currentContract = await hre.ethers.getContractAt('OVGAssetsUpgradeable', assetsProxy)
  const currentVersion = await currentContract.version()
  console.log(`📌 Current version: ${currentVersion}`)

  if (currentVersion === '2.4.0') {
    console.log('✅ Already at v2.4.0, nothing to upgrade')
    return
  }

  // Compile and deploy new implementation
  console.log('\n📦 Compiling new implementation...')
  await hre.run('compile')

  const OVGAssets = await hre.ethers.getContractFactory('OVGAssetsUpgradeable')

  console.log('🔄 Upgrading proxy to new implementation...')
  const upgraded = await hre.upgrades.upgradeProxy(assetsProxy, OVGAssets)
  await upgraded.waitForDeployment()

  const newImplementation = await hre.upgrades.erc1967.getImplementationAddress(assetsProxy)
  console.log(`✅ New implementation deployed: ${newImplementation}`)

  // Verify new version
  const newVersion = await upgraded.version()
  console.log(`📌 New version: ${newVersion}`)

  // Update deployment file
  const oldImplementation = deployment.contracts.OVGAssets.implementation

  if (!deployment.contracts.OVGAssets.previousImplementations) {
    deployment.contracts.OVGAssets.previousImplementations = []
  }

  deployment.contracts.OVGAssets.previousImplementations.push({
    address: oldImplementation,
    upgradedAt: new Date().toISOString()
  })

  deployment.contracts.OVGAssets.implementation = newImplementation
  deployment.lastUpdated = new Date().toISOString()

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))
  console.log(`💾 Updated ${deploymentFile}`)

  console.log('\n✅ Upgrade complete!')
  console.log('\n📊 Summary:')
  console.log(`   Network: ${network}`)
  console.log(`   Proxy: ${assetsProxy}`)
  console.log(`   Old Implementation: ${oldImplementation}`)
  console.log(`   New Implementation: ${newImplementation}`)
  console.log(`   Version: ${currentVersion} → ${newVersion}`)

  console.log('\n🔍 Changes in v2.4.0:')
  console.log('   - uri() excludes empty animation_url (OpenSea fix)')
  console.log('   - uri() removes non-standard token_id field')
  console.log('   - _buildAttributes() always returns valid [] array')
  console.log('   - Returns default URI if image is empty')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Upgrade failed:', error)
    process.exit(1)
  })
