/**
 * Check Metadata Setup - Review OVGMetadata contract configuration
 * on both Mainnet and Testnet
 */

import 'dotenv/config'
import { ethers } from 'ethers'

const NETWORKS = {
  mainnet: {
    name: 'Polygon Mainnet',
    rpc: process.env.POLYGON_MAINNET_RPC || 'https://polygon-rpc.com',
    assetsProxy: '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71',
    metadataProxy: '0x8eDB11F435918371E28AC538c95Cf1b7b6505a10'
  },
  testnet: {
    name: 'Polygon Amoy',
    rpc: 'https://polygon-amoy-bor-rpc.publicnode.com',
    assetsProxy: '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195',
    metadataProxy: null // Check if exists
  }
}

const ASSETS_ABI = [
  'function metadataContract() view returns (address)',
  'function uri(uint256 tokenId) view returns (string)',
  'function getTokenMetadataUrl(uint256 tokenId) view returns (string)',
  'function exists(uint256 tokenId) view returns (bool)'
]

const METADATA_ABI = [
  'function getAssetMetadata(uint256 assetId) view returns (string title, string description, string imageUrl, string assetUrl)',
  'function setAssetMetadata(uint256 assetId, string title, string description, string imageUrl, string assetUrl)'
]

// ERC1967 implementation slot
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

async function checkNetwork(networkKey) {
  const network = NETWORKS[networkKey]
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📍 ${network.name}`)
  console.log('='.repeat(60))

  try {
    const provider = new ethers.JsonRpcProvider(network.rpc)
    const assetsContract = new ethers.Contract(network.assetsProxy, ASSETS_ABI, provider)

    // Check implementation
    const implRaw = await provider.getStorage(network.assetsProxy, IMPL_SLOT)
    const implAddress = '0x' + implRaw.slice(-40)
    console.log('\nOVGAssets Proxy:', network.assetsProxy)
    console.log('Implementation:', implAddress)

    // Check if V2.2.0 (has getTokenMetadataUrl)
    let hasV220 = false
    try {
      await assetsContract.getTokenMetadataUrl(1)
      hasV220 = true
    } catch (e) {
      hasV220 = false
    }
    console.log('V2.2.0 (setTokenMetadataUrl):', hasV220 ? '✅ Yes' : '❌ No')

    // Check metadataContract
    let metadataAddr = null
    try {
      metadataAddr = await assetsContract.metadataContract()
      console.log('\nmetadataContract():', metadataAddr)
      console.log('OVGMetadata configured:', metadataAddr !== '0x0000000000000000000000000000000000000000' ? '✅ Yes' : '❌ No')
    } catch (e) {
      console.log('\nmetadataContract(): Not available (older version)')
    }

    // Check token 1 if exists
    try {
      const exists = await assetsContract.exists(1)
      if (exists) {
        console.log('\n--- Token ID 1 ---')
        const uri = await assetsContract.uri(1)
        console.log('uri(1):', uri.substring(0, 100) + (uri.length > 100 ? '...' : ''))

        if (hasV220) {
          const directUrl = await assetsContract.getTokenMetadataUrl(1)
          console.log('getTokenMetadataUrl(1):', directUrl || '(not set)')
        }

        // Check OVGMetadata if configured
        if (metadataAddr && metadataAddr !== '0x0000000000000000000000000000000000000000') {
          const metadataContract = new ethers.Contract(metadataAddr, METADATA_ABI, provider)
          try {
            const [title, desc, img, asset] = await metadataContract.getAssetMetadata(1)
            console.log('\nOVGMetadata for token 1:')
            console.log('  title:', title || '(empty)')
            console.log('  description:', desc || '(empty)')
            console.log('  imageUrl:', img || '(empty)')
            console.log('  assetUrl:', asset || '(empty)')
          } catch (e) {
            console.log('OVGMetadata.getAssetMetadata(1): Error -', e.message)
          }
        }
      } else {
        console.log('\nToken ID 1: Does not exist')
      }
    } catch (e) {
      console.log('\nToken check error:', e.message)
    }

  } catch (e) {
    console.log('Network error:', e.message)
  }
}

async function main() {
  console.log('🔍 Checking Metadata Configuration\n')

  await checkNetwork('mainnet')
  await checkNetwork('testnet')

  console.log('\n' + '='.repeat(60))
  console.log('Done!')
}

main().catch(console.error)
