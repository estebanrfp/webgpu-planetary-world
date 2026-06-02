const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const deploymentFile = network === "polygonMainnet"
    ? "../deployments/polygonMainnet-upgradeable.json"
    : "../deployments/polygonAmoy-upgradeable.json";

  const deployment = require(deploymentFile);

  console.log("=== " + network.toUpperCase() + " ===");
  console.log("OVGMetadata proxy:", deployment.contracts.OVGMetadata.proxy);
  console.log("OVGMetadata impl:", deployment.contracts.OVGMetadata.implementation);
  console.log("OVGAssets proxy:", deployment.contracts.OVGAssets.proxy);

  const metadata = await hre.ethers.getContractAt("OVGMetadataUpgradeable", deployment.contracts.OVGMetadata.proxy);

  // Check assetsContract
  console.log("\nChecking assetsContract...");
  try {
    const assetsAddr = await metadata.assetsContract();
    console.log("assetsContract:", assetsAddr);
    if (assetsAddr === "0x0000000000000000000000000000000000000000") {
      console.log("Status: NOT configured");
    } else if (assetsAddr.toLowerCase() === deployment.contracts.OVGAssets.proxy.toLowerCase()) {
      console.log("Status: Correctly configured");
    } else {
      console.log("Status: Different from expected");
    }
  } catch (e) {
    console.log("Error:", e.message.slice(0, 80));
  }

  // Check sample token metadata
  console.log("\nChecking getAssetMetadata(1)...");
  try {
    const [title, desc, img, asset] = await metadata.getAssetMetadata(1n);
    console.log("title:", title || "(empty)");
    console.log("imageUrl:", img ? img.slice(0, 60) + "..." : "(empty)");
  } catch (e) {
    console.log("Error:", e.message.slice(0, 80));
  }

  console.log("\nChecking getAssetAttributes(1)...");
  try {
    const [rarity, cat, col] = await metadata.getAssetAttributes(1n);
    console.log("rarity:", rarity || "(empty)");
    console.log("category:", cat || "(empty)");
    console.log("collection:", col || "(empty)");
  } catch (e) {
    console.log("Error:", e.message.slice(0, 80));
  }
}

main().catch(console.error);
