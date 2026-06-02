const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/polygonAmoy-upgradeable.json");
  
  const metadataProxy = deployment.contracts.OVGMetadata.proxy;
  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  
  console.log("Setting assetsContract...");
  console.log("Metadata proxy:", metadataProxy);
  console.log("Assets proxy:", assetsProxy);
  
  const metadata = await hre.ethers.getContractAt("OVGMetadataUpgradeable", metadataProxy);
  
  const current = await metadata.assetsContract();
  console.log("Current assetsContract:", current);
  
  if (current !== "0x0000000000000000000000000000000000000000") {
    console.log("✅ Already configured!");
    return;
  }
  
  console.log("Sending transaction...");
  const tx = await metadata.setAssetsContract(assetsProxy);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  
  const updated = await metadata.assetsContract();
  console.log("✅ assetsContract updated to:", updated);
}

main().catch(console.error);
