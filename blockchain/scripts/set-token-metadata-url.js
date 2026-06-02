const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Set a direct metadata URL (IPFS/HTTP) for a token
 * This URL is what Polygonscan will fetch to display NFT metadata
 *
 * Usage:
 *   TOKEN_ID=1 METADATA_URL="https://example.com/metadata/1.json" npx hardhat run scripts/set-token-metadata-url.js --network polygonMainnet
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
async function main() {
  const tokenId = process.env.TOKEN_ID || "1";
  const metadataUrl = process.env.METADATA_URL;

  if (!metadataUrl) {
    console.log("Usage: TOKEN_ID=1 METADATA_URL='https://...' npx hardhat run scripts/set-token-metadata-url.js --network polygonMainnet");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("====================================================");
  console.log("Setting Token Metadata URL on:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("====================================================");
  console.log(`Token ID: ${tokenId}`);
  console.log(`Metadata URL: ${metadataUrl}`);
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

  if (version !== "2.2.0") {
    console.error(`\nError: Contract version is ${version}, expected 2.2.0`);
    console.error("Please upgrade the contract first.");
    process.exit(1);
  }

  // Set token metadata URL
  console.log(`\nSetting metadata URL for token ${tokenId}...`);
  const tx = await assets.setTokenMetadataUrl(BigInt(tokenId), metadataUrl);
  console.log(`Transaction: ${tx.hash}`);
  await tx.wait();

  console.log("\nMetadata URL set successfully!");

  // Verify
  console.log("\nVerifying...");
  const storedUrl = await assets.getTokenMetadataUrl(BigInt(tokenId));
  console.log(`  Stored URL: ${storedUrl}`);

  const uriResult = await assets.uri(BigInt(tokenId));
  console.log(`  uri(${tokenId}): ${uriResult}`);

  console.log("\n====================================================");
  console.log("DONE! Polygonscan should now display the NFT metadata.");
  console.log(`Check: https://polygonscan.com/nft/${assetsProxy}/${tokenId}`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
