/**
 * Mainnet - Burn All User's Assets
 *
 * Burns specified token IDs from user's wallet
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import 'dotenv/config'
import { ethers } from 'ethers'

// Configuration
const USER_ADDRESS = '0xE5639DfE345F8ab845bEBE63a1C7322F9c6fF5c7'
const CONTRACT_ADDRESS = '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71' // Mainnet proxy
const RPC_URL = process.env.POLYGON_MAINNET_RPC || 'https://polygon-rpc.com'

// Known token IDs to check and burn
const KNOWN_TOKEN_IDS = [
  '1',                    // Old test token
  '1770145415878',        // Recently minted token
  // Add more if needed
]

const PRIVATE_KEY = process.env.PRIVATE_KEY

const ABI = [
  'function burn(address account, uint256 id, uint256 value)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function uri(uint256 tokenId) view returns (string)'
]

async function main() {
  console.log('🔥 Polygon Mainnet - Burn All Assets\n')
  console.log('Contract:', CONTRACT_ADDRESS)
  console.log('User:', USER_ADDRESS)

  if (!PRIVATE_KEY) {
    console.log('\n❌ PRIVATE_KEY not set in .env')
    return
  }

  // Connect to blockchain
  console.log('\n🔗 Connecting to Polygon Mainnet...')
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)

  console.log('Wallet:', wallet.address)

  const balance = await provider.getBalance(wallet.address)
  console.log('Balance:', ethers.formatEther(balance), 'POL')

  // Check balances of known token IDs
  console.log('\n🔍 Checking token balances...')
  const tokensToBurn = []

  for (const tokenId of KNOWN_TOKEN_IDS) {
    try {
      const balance = await contract.balanceOf(USER_ADDRESS, BigInt(tokenId))
      if (balance > 0n) {
        // Try to get URI for info
        let uri = ''
        try {
          uri = await contract.uri(BigInt(tokenId))
        } catch { /* ignore */ }

        tokensToBurn.push({ id: tokenId, balance: balance.toString(), uri })
        console.log(`   ✓ Token #${tokenId}: balance = ${balance}`)
        if (uri) console.log(`     URI: ${uri.slice(0, 60)}...`)
      } else {
        console.log(`   - Token #${tokenId}: balance = 0 (skip)`)
      }
    } catch (error) {
      console.log(`   ❌ Token #${tokenId}: error - ${error.message}`)
    }
  }

  if (tokensToBurn.length === 0) {
    console.log('\n✅ No tokens to burn!')
    return
  }

  console.log(`\n🔥 Burning ${tokensToBurn.length} tokens...`)

  for (const token of tokensToBurn) {
    try {
      console.log(`\n   Burning token #${token.id} (amount: ${token.balance})...`)
      const tx = await contract.burn(USER_ADDRESS, BigInt(token.id), BigInt(token.balance))
      console.log('   TX Hash:', tx.hash)
      console.log('   Waiting for confirmation...')
      const receipt = await tx.wait()
      console.log('   ✅ Burned in block:', receipt.blockNumber)
      console.log('   Polygonscan:', `https://polygonscan.com/tx/${tx.hash}`)
    } catch (error) {
      console.log(`   ❌ Failed to burn token #${token.id}:`, error.message)
    }
  }

  // Verify all burned
  console.log('\n🔍 Verifying...')
  for (const token of tokensToBurn) {
    const newBalance = await contract.balanceOf(USER_ADDRESS, BigInt(token.id))
    console.log(`   Token #${token.id}: balance = ${newBalance}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ BURN COMPLETE!')
  console.log('='.repeat(60))
}

main().catch(console.error)
