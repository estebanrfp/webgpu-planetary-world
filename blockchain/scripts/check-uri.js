const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Check what uri(tokenId) returns
 */
async function main() {
  const tokenId = process.env.TOKEN_ID || "1";

  console.log("====================================================");
  console.log("Checking uri() on:", hre.network.name);
  console.log("Token ID:", tokenId);
  console.log("====================================================");

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  const metadataProxy = deployment.contracts.OVGMetadata.proxy;

  console.log(`\nOVGAssets proxy: ${assetsProxy}`);
  console.log(`OVGMetadata proxy: ${metadataProxy}`);

  // Check OVGAssets
  const assets = await ethers.getContractAt("OVGAssetsUpgradeable", assetsProxy);

  // Check metadataContract
  const metadataContract = await assets.metadataContract();
  console.log(`\nmetadataContract in OVGAssets: ${metadataContract}`);

  // Check version
  const version = await assets.version();
  console.log(`OVGAssets version: ${version}`);

  // Call uri(tokenId)
  console.log(`\nCalling uri(${tokenId})...`);
  const uriResult = await assets.uri(BigInt(tokenId));

  console.log("\n====================================================");
  console.log("RAW URI RESULT:");
  console.log("====================================================");
  console.log(uriResult);

  // If it's a data URI, decode it
  if (uriResult.startsWith("data:application/json;base64,")) {
    const base64 = uriResult.replace("data:application/json;base64,", "");
    const json = Buffer.from(base64, "base64").toString("utf8");
    console.log("\n====================================================");
    console.log("DECODED JSON:");
    console.log("====================================================");
    console.log(json);
    console.log("\nParsed:");
    console.log(JSON.parse(json));
  }

  // Also check the metadata contract directly
  console.log("\n====================================================");
  console.log("DIRECT CHECK ON OVGMetadata:");
  console.log("====================================================");
  const metadata = await ethers.getContractAt("OVGMetadataUpgradeable", metadataProxy);
  const [title, description, imageUrl, assetUrl] = await metadata.getAssetMetadata(BigInt(tokenId));
  console.log(`Title: "${title}"`);
  console.log(`Description: "${description}"`);
  console.log(`Image URL: "${imageUrl}"`);
  console.log(`Asset URL: "${assetUrl}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
