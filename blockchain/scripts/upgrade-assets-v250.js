/**
 * Upgrade OVGAssets to v2.5.0 - Add contractURI for OpenSea collection
 *
 * Changes:
 * - Added contractURI() for OpenSea collection metadata
 * - Added setContractURI() to configure collection info
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
import hre from 'hardhat'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Collection metadata - update these values as needed
const COLLECTION_METADATA = {
  name: "OVGrid Assets",
  description: "Digital assets for OVGrid Metaverse - Land, Wearables, Tools, and more.",
  image: "https://gateway.pinata.cloud/ipfs/QmYourCollectionImageHash",
  external_link: "https://ovgrid.com",
  seller_fee_basis_points: 250, // 2.5%
  fee_recipient: "0xE5639DfE345F8ab845bEBE63a1C7322F9c6fF5c7"
}

async function main() {
  const network = hre.network.name
  console.log(`\n🚀 Upgrading OVGAssets to v2.5.0 on ${network}...`)

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

  if (currentVersion === '2.5.0') {
    console.log('✅ Already at v2.5.0, checking contractURI...')
    const existingURI = await currentContract.contractURI()
    if (existingURI) {
      console.log(`📋 contractURI already set: ${existingURI}`)
      return
    }
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

  // Set contractURI with base64 encoded JSON
  console.log('\n📝 Setting contractURI...')
  const contractMetadataJson = JSON.stringify(COLLECTION_METADATA)
  const contractMetadataBase64 = Buffer.from(contractMetadataJson).toString('base64')
  const contractURIValue = `data:application/json;base64,${contractMetadataBase64}`

  const tx = await upgraded.setContractURI(contractURIValue)
  await tx.wait()
  console.log(`✅ contractURI set!`)
  console.log(`   Value: ${contractURIValue.substring(0, 80)}...`)

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

  console.log('\n🔍 Changes in v2.5.0:')
  console.log('   - Added contractURI() for OpenSea collection metadata')
  console.log('   - Added setContractURI() to configure collection')
  console.log(`\n📋 Collection metadata:`)
  console.log(`   Name: ${COLLECTION_METADATA.name}`)
  console.log(`   Description: ${COLLECTION_METADATA.description}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Upgrade failed:', error)
    process.exit(1)
  })
