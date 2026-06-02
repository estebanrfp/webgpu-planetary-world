/**
 * Check Implementation - Verify the proxy points to V2.2.0
 */

import 'dotenv/config'
import { ethers } from 'ethers'

const PROXY_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195'
const RPC_URL = 'https://rpc.ankr.com/polygon_amoy'

// ERC1967 implementation slot
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)

  console.log('🔍 Checking proxy implementation...\n')
  console.log('Proxy Address:', PROXY_ADDRESS)

  // Get implementation address from storage slot
  const implementationRaw = await provider.getStorage(PROXY_ADDRESS, IMPLEMENTATION_SLOT)
  const implementationAddress = '0x' + implementationRaw.slice(-40)

  console.log('Implementation Address:', implementationAddress)
  console.log('\nExpected V2.2.0:', '0xeE523656A5D22D5fe2bbB2a4A4391032dfd6DE14')
  console.log('Match:', implementationAddress.toLowerCase() === '0xee523656a5d22d5fe2bbb2a4a4391032dfd6de14')
}

main().catch(console.error)
