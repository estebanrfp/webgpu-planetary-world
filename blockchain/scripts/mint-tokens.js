/**
 * Mint OVG Tokens to specified addresses
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
  
  const targetAddress = process.env.TARGET_ADDRESS || deployer.address;
  const amount = process.env.AMOUNT || "1000";
  
  console.log("====================================================");
  console.log("Minting OVG Tokens");
  console.log(`Contract: ${tokenAddress}`);
  console.log(`To: ${targetAddress}`);
  console.log(`Amount: ${amount} OVG`);
  console.log("====================================================");
  
  const ovgToken = await hre.ethers.getContractAt("OVGTokenUpgradeable", tokenAddress);
  
  const tokenAmount = hre.ethers.parseUnits(amount, 18);
  const tx = await ovgToken.mint(targetAddress, tokenAmount);
  await tx.wait();
  
  console.log(`\n${amount} OVG minted successfully!`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
