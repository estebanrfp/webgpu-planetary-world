/**
 * Set contractURI for OVGAssets collection metadata
 */
import hre from 'hardhat'

const COLLECTION_METADATA = {
  name: "OVGrid Assets",
  description: "Digital assets for OVGrid Metaverse",
  image: "https://gateway.pinata.cloud/ipfs/QmNNxSwj1A8sFUyQCuBWWnzwCwc9ea3z5xJgMtjv4hrCfH/image.jpg",
  external_link: "https://ovgrid.com"
}

async function main() {
  const assetsAddr = '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71'
  const contract = await hre.ethers.getContractAt('OVGAssetsUpgradeable', assetsAddr)

  const [signer] = await hre.ethers.getSigners()
  console.log('Signer:', signer.address)

  // Check role
  const URI_SETTER_ROLE = await contract.URI_SETTER_ROLE()
  const hasRole = await contract.hasRole(URI_SETTER_ROLE, signer.address)
  console.log('Has URI_SETTER_ROLE:', hasRole)

  if (!hasRole) {
    console.log('❌ Signer does not have URI_SETTER_ROLE')
    return
  }

  // Build contractURI as base64 JSON
  const json = JSON.stringify(COLLECTION_METADATA)
  console.log('JSON:', json)
  console.log('JSON length:', json.length)

  const base64 = Buffer.from(json).toString('base64')
  const uri = `data:application/json;base64,${base64}`
  console.log('URI length:', uri.length)

  console.log('\nSetting contractURI...')
  const tx = await contract.setContractURI(uri)
  console.log('TX:', tx.hash)
  await tx.wait()

  console.log('✅ contractURI set!')
  console.log('Verify:', await contract.contractURI())
}

main().catch(console.error)
