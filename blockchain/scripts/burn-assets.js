/**
 * Burn Assets Script
 *
 * Burns ERC-1155 assets on Polygon network.
 * Reads token IDs from command line or uses defaults.
 *
 * Usage:
 *   node blockchain/scripts/burn-assets.js [tokenId1] [tokenId2] ...
 *   node blockchain/scripts/burn-assets.js --testnet [tokenId1] [tokenId2] ...
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import { config } from 'dotenv'
import { ethers } from 'ethers'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

// Parse command line args
const args = process.argv.slice(2)
const isTestnet = args.includes('--testnet')
const tokenIds = args.filter(a => !a.startsWith('--')).map(Number).filter(n => !isNaN(n))

// Network configuration
const NETWORKS = {
  mainnet: {
    name: 'Polygon Mainnet',
    rpc: 'https://polygon-bor-rpc.publicnode.com',
    contract: '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71',
    explorer: 'https://polygonscan.com'
  },
  testnet: {
    name: 'Polygon Amoy',
    rpc: 'https://rpc-amoy.polygon.technology',
    contract: '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195',
    explorer: 'https://amoy.polygonscan.com'
  }
}

const network = isTestnet ? NETWORKS.testnet : NETWORKS.mainnet
const PRIVATE_KEY = process.env.PRIVATE_KEY

const ABI = [
  'function burn(address account, uint256 id, uint256 value)',
  'function balanceOf(address account, uint256 id) view returns (uint256)'
]

async function main() {
  console.log('='.repeat(60))
  console.log(`🔥 Burn Assets on ${network.name}`)
  console.log('='.repeat(60))

  if (!PRIVATE_KEY) {
    console.log('\n❌ PRIVATE_KEY not set in .env file')
    return
  }

  if (tokenIds.length === 0) {
    console.log('\n❌ No token IDs provided')
    console.log('Usage: node burn-assets.js [--testnet] <tokenId1> <tokenId2> ...')
    return
  }

  console.log(`\n📡 Connecting to ${network.name}...`)
  const provider = new ethers.JsonRpcProvider(network.rpc)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(network.contract, ABI, wallet)

  console.log(`   Wallet: ${wallet.address}`)
  console.log(`   Contract: ${network.contract}`)
  console.log(`   Tokens to burn: ${tokenIds.join(', ')}\n`)

  for (const tokenId of tokenIds) {
    console.log(`🔥 Processing token #${tokenId}...`)

    try {
      const balance = await contract.balanceOf(wallet.address, BigInt(tokenId))
      const balanceNum = Number(balance)
      console.log(`   Balance: ${balanceNum}`)

      if (balanceNum === 0) {
        console.log(`   ⏭️  Skipping - no balance\n`)
        continue
      }

      console.log(`   Burning ${balanceNum} token(s)...`)
      const tx = await contract.burn(wallet.address, BigInt(tokenId), BigInt(balanceNum))
      console.log(`   TX: ${network.explorer}/tx/${tx.hash}`)

      await tx.wait()
      console.log(`   ✅ Burned successfully\n`)

    } catch (e) {
      console.log(`   ❌ Error: ${e.message}\n`)
    }
  }

  console.log('='.repeat(60))
  console.log('✅ Done!')
  console.log('='.repeat(60))
}

main().catch(console.error)
