/**
 * Test Mint on Polygon Amoy Testnet
 *
 * This script tests the mint flow directly to diagnose issues.
 * Run: node blockchain/scripts/test-mint-testnet.js
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

import 'dotenv/config'
import { ethers } from 'ethers'

// Configuration - Testnet
const RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com'
const CONTRACT_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195' // OVGAssets proxy on Amoy
const USER_ADDRESS = '0xE5639DfE345F8ab845bEBE63a1C7322F9c6fF5c7'

const PRIVATE_KEY = process.env.PRIVATE_KEY

const ABI = [
  'function mint(address account, uint256 id, uint256 amount, bytes data)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function uri(uint256 tokenId) view returns (string)',
  'function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function MINTER_ROLE() view returns (bytes32)'
]

async function main() {
  console.log('='.repeat(60))
  console.log('🧪 Test Mint on Polygon Amoy Testnet')
  console.log('='.repeat(60))
  console.log()

  // 1. Connect to blockchain
  console.log('📡 Connecting to Polygon Amoy...')
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const network = await provider.getNetwork()
  console.log(`   Network: ${network.name} (chainId: ${network.chainId})`)

  // 2. Check user balance
  const balance = await provider.getBalance(USER_ADDRESS)
  console.log(`   User balance: ${ethers.formatEther(balance)} POL`)

  if (balance === 0n) {
    console.log('\n❌ No POL balance! Get testnet POL from faucet:')
    console.log('   https://faucet.polygon.technology/')
    return
  }

  // 3. Check private key
  if (!PRIVATE_KEY) {
    console.log('\n❌ PRIVATE_KEY not set in .env file')
    console.log('   Add: PRIVATE_KEY=your_private_key_here')
    return
  }

  // 4. Create wallet
  console.log('\n🔑 Creating wallet...')
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  console.log(`   Wallet address: ${wallet.address}`)

  if (wallet.address.toLowerCase() !== USER_ADDRESS.toLowerCase()) {
    console.log(`\n⚠️  Warning: Wallet address doesn't match USER_ADDRESS`)
    console.log(`   Wallet: ${wallet.address}`)
    console.log(`   Expected: ${USER_ADDRESS}`)
  }

  // 5. Connect to contract
  console.log('\n📜 Connecting to OVGAssets contract...')
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet)
  console.log(`   Contract: ${CONTRACT_ADDRESS}`)

  // 6. Check MINTER_ROLE
  console.log('\n🔐 Checking MINTER_ROLE...')
  try {
    const minterRole = await contract.MINTER_ROLE()
    console.log(`   MINTER_ROLE: ${minterRole}`)
    const hasMinterRole = await contract.hasRole(minterRole, wallet.address)
    console.log(`   Has MINTER_ROLE: ${hasMinterRole}`)

    if (!hasMinterRole) {
      console.log('\n❌ Wallet does not have MINTER_ROLE!')
      console.log('   Grant the role first with DEFAULT_ADMIN')
      return
    }
  } catch (e) {
    console.log(`   Error checking role: ${e.message}`)
  }

  // 7. Try to mint
  const tokenId = Date.now()
  console.log(`\n🎨 Minting token #${tokenId}...`)

  try {
    // Get current gas price
    const feeData = await provider.getFeeData()
    console.log(`   Gas price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`)

    // Estimate gas
    console.log('   Estimating gas...')
    const gasEstimate = await contract.mint.estimateGas(
      wallet.address,
      BigInt(tokenId),
      1n,
      '0x'
    )
    console.log(`   Gas estimate: ${gasEstimate.toString()}`)

    // Send transaction
    console.log('   Sending transaction...')
    const tx = await contract.mint(
      wallet.address,
      BigInt(tokenId),
      1n,
      '0x',
      {
        gasLimit: gasEstimate * 12n / 10n // Add 20% buffer
      }
    )
    console.log(`   TX Hash: ${tx.hash}`)
    console.log(`   Polygonscan: https://amoy.polygonscan.com/tx/${tx.hash}`)

    // Wait for confirmation
    console.log('   Waiting for confirmation...')
    const receipt = await tx.wait()
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`)

    // 8. Verify balance
    console.log('\n✅ Verifying balance...')
    const newBalance = await contract.balanceOf(wallet.address, BigInt(tokenId))
    console.log(`   Token #${tokenId} balance: ${newBalance.toString()}`)

    // 9. Try to set metadata URL
    console.log('\n📝 Testing setTokenMetadataUrl...')
    const testUrl = 'https://gateway.pinata.cloud/ipfs/test'
    try {
      const metaTx = await contract.setTokenMetadataUrl(BigInt(tokenId), testUrl)
      console.log(`   TX Hash: ${metaTx.hash}`)
      await metaTx.wait()
      console.log('   ✅ Metadata URL set successfully')

      // Verify
      const uri = await contract.uri(BigInt(tokenId))
      console.log(`   URI: ${uri}`)
    } catch (e) {
      console.log(`   ❌ setTokenMetadataUrl failed: ${e.message}`)
      console.log('   (This might mean the contract needs to be upgraded to V2.2.0)')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ MINT TEST PASSED!')
    console.log('='.repeat(60))

  } catch (e) {
    console.log(`\n❌ Mint failed: ${e.message}`)
    if (e.code) console.log(`   Error code: ${e.code}`)
    if (e.reason) console.log(`   Reason: ${e.reason}`)
    if (e.data) console.log(`   Data: ${e.data}`)

    console.log('\n🔍 Possible causes:')
    console.log('   1. Contract not upgraded to latest version')
    console.log('   2. Wallet doesn\'t have MINTER_ROLE')
    console.log('   3. Insufficient gas')
    console.log('   4. RPC issues')
  }
}

main().catch(console.error)
