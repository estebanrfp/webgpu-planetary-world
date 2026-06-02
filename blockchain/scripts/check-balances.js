/**
 * Check Token and Asset Balances
 * Reads contract addresses from current deployment
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  // Load current deployment
  const deploymentPath = path.join(__dirname, "../deployments/polygonAmoy.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  const tokenAddress = deployment.contracts.OVGToken.proxy;
  const assetsAddress = deployment.contracts.OVGAssets.proxy;
  const targetAddress = process.env.TARGET_ADDRESS || deployer.address;
  
  console.log("====================================================");
  console.log("Checking Balances");
  console.log(`Target: ${targetAddress}`);
  console.log("====================================================");
  
  // Check OVG Token balance
  const ovgToken = await hre.ethers.getContractAt("OVGTokenUpgradeable", tokenAddress);
  const tokenBalance = await ovgToken.balanceOf(targetAddress);
  console.log(`\nOVG Token: ${hre.ethers.formatUnits(tokenBalance, 18)} OVG`);
  
  // Check Asset balances
  const ovgAssets = await hre.ethers.getContractAt("OVGAssetsUpgradeable", assetsAddress);
  
  // Check licenses (IDs 1-10)
  const licenseIds = Array.from({ length: 10 }, (_, i) => i + 1);
  // Check lands (IDs 1000-1050)
  const landIds = Array.from({ length: 50 }, (_, i) => i + 1000);
  
  const allIds = [...licenseIds, ...landIds];
  
  console.log("\nAssets owned:");
  console.log("-".repeat(40));
  
  const owned = [];
  for (const id of allIds) {
    const balance = await ovgAssets.balanceOf(targetAddress, id);
    if (balance > 0n) {
      const label = id >= 1000 ? `Land #${id}` : `License #${id}`;
      owned.push({ id, label, balance: Number(balance) });
    }
  }
  
  if (owned.length === 0) {
    console.log("  (none)");
  } else {
    for (const item of owned) {
      console.log(`  ${item.label}: x${item.balance}`);
    }
  }
  
  console.log("\n====================================================");
  console.log(`Total: ${owned.length} different assets owned`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
