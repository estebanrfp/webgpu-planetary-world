const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Fix metadata for token 1009 on mainnet (owner-only)
 * This script must be run by the deployer/owner account
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  // Token 1009 data - UPDATE THESE VALUES with actual Pinata URLs
  const TOKEN_ID = 1009;
  const TOKEN_NAME = "OVGrid Asset #1009";  // UPDATE with actual name
  const TOKEN_DESCRIPTION = "";  // UPDATE with actual description
  const TOKEN_IMAGE_URL = "";  // UPDATE with actual Pinata URL
  const TOKEN_ASSET_URL = "";  // UPDATE with actual Pinata URL (or empty)

  // Mainnet addresses
  const metadataAddress = "0x8eDB11F435918371E28AC538c95Cf1b7b6505a10";

  console.log("=== Fix Token Metadata (Mainnet) ===");
  console.log("Deployer:", deployer.address);
  console.log("Token ID:", TOKEN_ID);
  console.log("");

  const metadataAbi = [
    "function setAssetMetadata(uint256 assetId, string title, string description, string imageUrl, string assetUrl) external",
    "function getAssetMetadata(uint256 assetId) view returns (string title, string description, string imageUrl, string assetUrl)",
    "function owner() view returns (address)",
    "function marketplace() view returns (address)"
  ];

  const metadata = new ethers.Contract(metadataAddress, metadataAbi, deployer);

  // Check authorization
  const owner = await metadata.owner();
  const marketplace = await metadata.marketplace();
  console.log("Contract owner:", owner);
  console.log("Marketplace:", marketplace);
  console.log("");

  if (deployer.address !== owner) {
    console.error("ERROR: You are not the owner of this contract!");
    console.error("Required:", owner);
    console.error("Current:", deployer.address);
    process.exit(1);
  }

  // Check current metadata
  console.log("Current metadata for token", TOKEN_ID + ":");
  const [currentTitle, currentDesc, currentImage, currentAsset] = await metadata.getAssetMetadata(TOKEN_ID);
  console.log("  Title:", currentTitle || "(empty)");
  console.log("  Description:", currentDesc || "(empty)");
  console.log("  Image URL:", currentImage || "(empty)");
  console.log("  Asset URL:", currentAsset || "(empty)");
  console.log("");

  // Validate new data
  if (!TOKEN_NAME || !TOKEN_IMAGE_URL) {
    console.error("ERROR: Please update TOKEN_NAME and TOKEN_IMAGE_URL in this script");
    console.error("Get the Pinata URLs from the mint transaction or Pinata dashboard");
    process.exit(1);
  }

  // Set new metadata
  console.log("Setting new metadata:");
  console.log("  Title:", TOKEN_NAME);
  console.log("  Description:", TOKEN_DESCRIPTION || "(empty)");
  console.log("  Image URL:", TOKEN_IMAGE_URL);
  console.log("  Asset URL:", TOKEN_ASSET_URL || "(empty)");
  console.log("");

  const tx = await metadata.setAssetMetadata(
    TOKEN_ID,
    TOKEN_NAME,
    TOKEN_DESCRIPTION,
    TOKEN_IMAGE_URL,
    TOKEN_ASSET_URL
  );
  console.log("TX Hash:", tx.hash);
  console.log("Waiting for confirmation...");
  await tx.wait();

  // Verify
  console.log("");
  console.log("Verifying new metadata:");
  const [newTitle, newDesc, newImage, newAsset] = await metadata.getAssetMetadata(TOKEN_ID);
  console.log("  Title:", newTitle);
  console.log("  Description:", newDesc || "(empty)");
  console.log("  Image URL:", newImage);
  console.log("  Asset URL:", newAsset || "(empty)");

  console.log("");
  console.log("Done! Metadata set successfully.");
  console.log("OpenSea may take a few minutes to refresh the metadata.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
