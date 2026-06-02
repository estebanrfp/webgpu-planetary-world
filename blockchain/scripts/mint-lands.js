/**
 * Mint Land Plots to target wallet
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
  const startId = parseInt(process.env.START_ID || "1000");
  const count = parseInt(process.env.COUNT || "50");
  
  console.log("====================================================");
  console.log("Minting Land Plots");
  console.log(`Contract: ${assetsAddress}`);
  console.log(`To: ${targetAddress}`);
  console.log(`Range: ${startId} - ${startId + count - 1} (${count} plots)`);
  console.log("====================================================");
  
  const ovgAssets = await hre.ethers.getContractAt("OVGAssetsUpgradeable", assetsAddress);
  
  const landIds = Array.from({ length: count }, (_, i) => startId + i);
  const amounts = Array(count).fill(1);
  
  // Mint in batches of 10 to avoid gas issues
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < landIds.length; i += BATCH_SIZE) {
    const batchIds = landIds.slice(i, i + BATCH_SIZE);
    const batchAmounts = amounts.slice(i, i + BATCH_SIZE);
    
    console.log(`\nBatch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(count/BATCH_SIZE)}: IDs ${batchIds[0]}-${batchIds[batchIds.length-1]}...`);
    
    const tx = await ovgAssets.mintBatch(targetAddress, batchIds, batchAmounts, "0x");
    const receipt = await tx.wait();
    console.log(`   Gas used: ${receipt.gasUsed}`);
  }
  
  console.log("\n====================================================");
  console.log(`${count} Land Plots minted successfully!`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
