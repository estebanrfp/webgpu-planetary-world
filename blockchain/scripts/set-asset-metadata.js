const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Set metadata for an existing ERC-1155 asset
 *
 * Usage:
 *   ASSET_ID=1 TITLE="My NFT" IMAGE_URL="https://example.com/image.png" npx hardhat run scripts/set-asset-metadata.js --network polygonMainnet
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
async function main() {
  const assetId = process.env.ASSET_ID;
  const title = process.env.TITLE || `Asset #${assetId}`;
  const description = process.env.DESCRIPTION || '';
  const imageUrl = process.env.IMAGE_URL || `https://picsum.photos/seed/asset${assetId}/400/400`;
  const assetUrl = process.env.ASSET_URL || '';

  if (!assetId) {
    console.log("Usage: ASSET_ID=1 TITLE='My NFT' IMAGE_URL='https://...' npx hardhat run scripts/set-asset-metadata.js --network polygonMainnet");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("====================================================");
  console.log("Setting Asset Metadata on:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("====================================================");
  console.log(`Asset ID: ${assetId}`);
  console.log(`Title: ${title}`);
  console.log(`Description: ${description}`);
  console.log(`Image URL: ${imageUrl}`);
  console.log(`Asset URL: ${assetUrl}`);
  console.log("====================================================");

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  const metadataProxy = deployment.contracts.OVGMetadata.proxy;
  console.log(`\nOVGMetadata proxy: ${metadataProxy}`);

  const metadata = await ethers.getContractAt("OVGMetadataUpgradeable", metadataProxy);

  console.log("Setting asset metadata...");
  const tx = await metadata.setAssetMetadata(
    BigInt(assetId),
    title,
    description,
    imageUrl,
    assetUrl
  );
  console.log(`Transaction: ${tx.hash}`);
  await tx.wait();

  console.log("\nMetadata set successfully!");

  // Verify
  console.log("\nVerifying...");
  const [readTitle, readDesc, readImg, readAsset] = await metadata.getAssetMetadata(BigInt(assetId));
  console.log(`  Title: ${readTitle}`);
  console.log(`  Description: ${readDesc}`);
  console.log(`  Image URL: ${readImg}`);
  console.log(`  Asset URL: ${readAsset}`);

  console.log("\n====================================================");
  console.log("DONE! Polygonscan will now display the image from uri()");
  console.log(`Check: https://polygonscan.com/nft/0x79f547F3E8a344D87064C15aA572a98E8d4A5c71/${assetId}`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
