const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/polygonMainnet-upgradeable.json");
  
  console.log("=== MAINNET Configuration ===");
  console.log("Metadata proxy:", deployment.contracts.OVGMetadata.proxy);
  console.log("Assets proxy:", deployment.contracts.OVGAssets.proxy);
  
  const metadata = await hre.ethers.getContractAt("OVGMetadataUpgradeable", deployment.contracts.OVGMetadata.proxy);
  
  console.log("\nChecking assetsContract...");
  try {
    const assetsAddr = await metadata.assetsContract();
    console.log("assetsContract:", assetsAddr);
  } catch (e) {
    console.log("Error:", e.message);
  }
  
  // Check implementation version by looking at deployment
  console.log("\nDeployment info:");
  console.log("OVGMetadata implementation:", deployment.contracts.OVGMetadata.implementation);
  console.log("OVGAssets implementation:", deployment.contracts.OVGAssets.implementation);
}

main().catch(console.error);
