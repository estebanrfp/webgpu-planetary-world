const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/polygonAmoy-upgradeable.json");
  
  const metadataAddress = deployment.contracts.OVGMetadata.proxy;
  const assetsAddress = deployment.contracts.OVGAssets.proxy;
  
  console.log("OVGMetadata proxy:", metadataAddress);
  console.log("OVGAssets proxy:", assetsAddress);
  
  const metadata = await hre.ethers.getContractAt("OVGMetadataUpgradeable", metadataAddress);
  
  const configuredAssets = await metadata.assetsContract();
  console.log("\nConfigured assetsContract in metadata:", configuredAssets);
  
  if (configuredAssets === "0x0000000000000000000000000000000000000000") {
    console.log("\n⚠️  assetsContract NOT configured! Need to call setAssetsContract()");
  } else if (configuredAssets.toLowerCase() === assetsAddress.toLowerCase()) {
    console.log("\n✅ assetsContract is correctly configured");
  } else {
    console.log("\n⚠️  assetsContract is different from expected!");
  }
}

main().catch(console.error);
