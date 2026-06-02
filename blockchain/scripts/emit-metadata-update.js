const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Emit URI event to force Polygonscan/OpenSea to refresh metadata
 *
 * Usage:
 *   TOKEN_ID=1 npx hardhat run scripts/emit-metadata-update.js --network polygonMainnet
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
async function main() {
  const tokenId = process.env.TOKEN_ID || "1";

  const [deployer] = await ethers.getSigners();
  console.log("====================================================");
  console.log("Emitting URI event on:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("Token ID:", tokenId);
  console.log("====================================================");

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  console.log(`\nOVGAssets proxy: ${assetsProxy}`);

  const assets = await ethers.getContractAt("OVGAssetsUpgradeable", assetsProxy);

  // Check version
  const version = await assets.version();
  console.log(`OVGAssets version: ${version}`);

  // Emit URI event
  console.log(`\nEmitting URI event for token ${tokenId}...`);
  const tx = await assets.emitMetadataUpdate(BigInt(tokenId));
  console.log(`Transaction: ${tx.hash}`);
  await tx.wait();

  console.log("\n====================================================");
  console.log("URI EVENT EMITTED SUCCESSFULLY!");
  console.log("====================================================");
  console.log("This forces Polygonscan/OpenSea to refresh the metadata.");
  console.log(`Check: https://polygonscan.com/nft/${assetsProxy}/${tokenId}`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
