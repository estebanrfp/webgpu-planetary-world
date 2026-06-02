/**
 * Check Roles - Verify who has URI_SETTER_ROLE
 */

import 'dotenv/config'
import { ethers } from 'ethers'

const CONTRACT_ADDRESS = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195'
const RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com'
const WALLET_ADDRESS = '0xE5639DfE345F8ab845bEBE63a1C7322F9c6fF5c7'

const ABI = [
  'function URI_SETTER_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function grantRole(bytes32 role, address account)'
]

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider)

  console.log('🔍 Checking roles on OVGAssets contract...\n')

  const uriSetterRole = await contract.URI_SETTER_ROLE()
  const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE()

  console.log('Role hashes:')
  console.log('  URI_SETTER_ROLE:', uriSetterRole)
  console.log('  DEFAULT_ADMIN_ROLE:', defaultAdminRole)

  const hasUriSetter = await contract.hasRole(uriSetterRole, WALLET_ADDRESS)
  const hasAdmin = await contract.hasRole(defaultAdminRole, WALLET_ADDRESS)

  console.log('\nWallet:', WALLET_ADDRESS)
  console.log('  Has URI_SETTER_ROLE:', hasUriSetter)
  console.log('  Has DEFAULT_ADMIN_ROLE:', hasAdmin)

  if (!hasUriSetter && hasAdmin) {
    console.log('\n⚠️ Wallet has admin but not URI_SETTER_ROLE')
    console.log('   Need to grant URI_SETTER_ROLE to this wallet')
  } else if (!hasUriSetter && !hasAdmin) {
    console.log('\n❌ Wallet has neither admin nor URI_SETTER_ROLE')
    console.log('   Need to find the admin wallet to grant roles')
  }
}

main().catch(console.error)
