const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/polygonAmoy-upgradeable.json");
  
  console.log("=== Contract Addresses ===");
  console.log("OVGMetadata proxy:", deployment.contracts.OVGMetadata.proxy);
  console.log("OVGAssets proxy:", deployment.contracts.OVGAssets.proxy);
  
  // Get contracts
  const metadata = await hre.ethers.getContractAt("OVGMetadataUpgradeable", deployment.contracts.OVGMetadata.proxy);
  const assets = await hre.ethers.getContractAt("OVGAssetsUpgradeable", deployment.contracts.OVGAssets.proxy);
  
  console.log("\n=== Checking assetsContract in Metadata ===");
  try {
    const configuredAssets = await metadata.assetsContract();
    console.log("assetsContract value:", configuredAssets);
    
    if (configuredAssets === "0x0000000000000000000000000000000000000000") {
      console.log("❌ assetsContract NOT configured!");
      console.log("\nTo fix, run: metadata.setAssetsContract(assetsAddress)");
    } else if (configuredAssets.toLowerCase() === deployment.contracts.OVGAssets.proxy.toLowerCase()) {
      console.log("✅ assetsContract correctly configured");
    } else {
      console.log("⚠️  assetsContract is different from deployment!");
    }
  } catch (e) {
    console.log("Error reading assetsContract:", e.message);
  }
  
  console.log("\n=== Checking metadataContract in Assets ===");
  try {
    const configuredMetadata = await assets.metadataContract();
    console.log("metadataContract value:", configuredMetadata);
    
    if (configuredMetadata === "0x0000000000000000000000000000000000000000") {
      console.log("❌ metadataContract NOT configured!");
    } else if (configuredMetadata.toLowerCase() === deployment.contracts.OVGMetadata.proxy.toLowerCase()) {
      console.log("✅ metadataContract correctly configured");
    } else {
      console.log("⚠️  metadataContract is different from deployment!");
    }
  } catch (e) {
    console.log("Error reading metadataContract:", e.message);
  }
  
  console.log("\n=== Checking nextTokenId ===");
  try {
    const nextId = await assets.nextTokenId();
    console.log("nextTokenId:", nextId.toString());
  } catch (e) {
    console.log("Error reading nextTokenId:", e.message);
  }
}

main().catch(console.error);
