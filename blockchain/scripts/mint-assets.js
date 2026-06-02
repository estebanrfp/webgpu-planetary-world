/**
 * Mint NFT Assets (Lands, Licenses, etc.)
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
  const assetsAddress = deployment.contracts.OVGAssets.proxy;
  
  const targetAddress = process.env.TARGET_ADDRESS || deployer.address;
  
  console.log("====================================================");
  console.log("Minting NFT Assets");
  console.log(`Contract: ${assetsAddress}`);
  console.log(`To: ${targetAddress}`);
  console.log("====================================================");
  
  const ovgAssets = await hre.ethers.getContractAt("OVGAssetsUpgradeable", assetsAddress);
  
  // Mint Licenses (IDs 1-5)
  console.log("\n1. Minting Licenses...");
  const licenseIds = [1, 2, 3, 4, 5];
  const licenseAmounts = [1, 1, 1, 1, 1];
  const txLicenses = await ovgAssets.mintBatch(targetAddress, licenseIds, licenseAmounts, "0x");
  await txLicenses.wait();
  console.log("   Licenses minted (IDs: 1-5)");
  
  // Mint Land Plots (IDs 1001-1010)
  console.log("\n2. Minting Land Plots...");
  const landIds = Array.from({ length: 10 }, (_, i) => 1001 + i);
  const landAmounts = Array(10).fill(1);
  const txLands = await ovgAssets.mintBatch(targetAddress, landIds, landAmounts, "0x");
  await txLands.wait();
  console.log("   Land Plots minted (IDs: 1001-1010)");
  
  console.log("\n====================================================");
  console.log("Assets minted successfully!");
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
