const hre = require("hardhat");

async function main() {
  const tokenId = 1770170772551n;
  const deployment = require("../deployments/polygonMainnet-upgradeable.json");
  
  console.log("Checking token #" + tokenId + " on MAINNET\n");
  
  const metadata = await hre.ethers.getContractAt("OVGMetadataUpgradeable", deployment.contracts.OVGMetadata.proxy);
  
  console.log("getAssetMetadata():");
  try {
    const [title, desc, img, asset] = await metadata.getAssetMetadata(tokenId);
    console.log("  title:", title || "(empty)");
    console.log("  description:", desc || "(empty)");
    console.log("  imageUrl:", img || "(empty)");
    console.log("  assetUrl:", asset || "(empty)");
  } catch (e) {
    console.log("  Error:", e.message.slice(0, 80));
  }
  
  console.log("\ngetAssetAttributes():");
  try {
    const [rarity, cat, col] = await metadata.getAssetAttributes(tokenId);
    console.log("  rarity:", rarity || "(empty)");
    console.log("  category:", cat || "(empty)");
    console.log("  collection:", col || "(empty)");
  } catch (e) {
    console.log("  Error:", e.message.slice(0, 80));
  }
}

main().catch(console.error);
