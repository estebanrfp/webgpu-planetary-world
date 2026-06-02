/**
 * Mint Land Plots on Polygon Mainnet
 *
 * Usage:
 *   npx hardhat run scripts/mint-lands-mainnet.js --network polygonMainnet
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  if (network.chainId !== 137n) {
    console.error("This script is only for Polygon Mainnet (137)");
    process.exit(1);
  }

  // Load mainnet deployment
  const deploymentPath = path.join(__dirname, "../deployments/polygonMainnet-upgradeable.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const assetsAddress = deployment.contracts.OVGAssets.proxy;

  const targetAddress = deployer.address;
  const startId = 1000;
  const count = 10; // Mint 10 lands for testing

  console.log("\n====================================================");
  console.log("Minting Land Plots on MAINNET");
  console.log("====================================================");
  console.log(`Network: Polygon Mainnet (${network.chainId})`);
  console.log(`Contract: ${assetsAddress}`);
  console.log(`To: ${targetAddress}`);
  console.log(`Range: ${startId} - ${startId + count - 1} (${count} plots)`);
  console.log("====================================================\n");

  const ovgAssets = await hre.ethers.getContractAt("OVGAssetsUpgradeable", assetsAddress);

  // Check if deployer has MINTER_ROLE
  const MINTER_ROLE = await ovgAssets.MINTER_ROLE();
  const hasMinterRole = await ovgAssets.hasRole(MINTER_ROLE, deployer.address);

  if (!hasMinterRole) {
    console.error("Deployer does not have MINTER_ROLE!");
    process.exit(1);
  }
  console.log("✅ MINTER_ROLE confirmed\n");

  const landIds = Array.from({ length: count }, (_, i) => startId + i);
  const amounts = Array(count).fill(1);

  console.log("Minting batch...");
  const tx = await ovgAssets.mintBatch(targetAddress, landIds, amounts, "0x");
  console.log(`Transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed in block: ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed}`);

  console.log("\n====================================================");
  console.log(`✅ ${count} Land Plots minted successfully!`);
  console.log(`   IDs: ${startId} - ${startId + count - 1}`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
