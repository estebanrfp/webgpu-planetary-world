/**
 * Upgrade OVGMetadata on testnet to latest version (with assetsContract support)
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const deploymentPath = "./deployments/polygonAmoy-upgradeable.json";
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const metadataProxy = deployment.contracts.OVGMetadata.proxy;
  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  const oldImplementation = deployment.contracts.OVGMetadata.implementation;

  console.log("=== Upgrading OVGMetadata on Testnet ===");
  console.log("Proxy:", metadataProxy);
  console.log("Current implementation:", oldImplementation);
  console.log("Assets contract:", assetsProxy);

  // Deploy new implementation with forceImport to recognize existing proxy
  console.log("\n1. Deploying new implementation...");
  const OVGMetadataUpgradeable = await hre.ethers.getContractFactory("OVGMetadataUpgradeable");

  // Force import the proxy to recognize it in the upgrade system
  try {
    await hre.upgrades.forceImport(metadataProxy, OVGMetadataUpgradeable);
    console.log("Proxy imported to upgrades system");
  } catch (e) {
    console.log("Proxy already in upgrades system or import error:", e.message);
  }

  // Upgrade with redeployImplementation option
  const newImplementation = await hre.upgrades.upgradeProxy(metadataProxy, OVGMetadataUpgradeable, {
    redeployImplementation: 'always'
  });
  await newImplementation.waitForDeployment();

  const newImplAddress = await hre.upgrades.erc1967.getImplementationAddress(metadataProxy);
  console.log("New implementation:", newImplAddress);

  // Set assetsContract
  console.log("\n2. Setting assetsContract...");
  const metadata = await hre.ethers.getContractAt("OVGMetadataUpgradeable", metadataProxy);

  try {
    const currentAssets = await metadata.assetsContract();
    console.log("Current assetsContract:", currentAssets);

    if (currentAssets === "0x0000000000000000000000000000000000000000") {
      console.log("Setting assetsContract to:", assetsProxy);
      const tx = await metadata.setAssetsContract(assetsProxy);
      console.log("Transaction:", tx.hash);
      await tx.wait();
      console.log("✅ assetsContract configured!");
    } else if (currentAssets.toLowerCase() === assetsProxy.toLowerCase()) {
      console.log("✅ assetsContract already correctly configured");
    } else {
      console.log("⚠️ assetsContract is different, updating...");
      const tx = await metadata.setAssetsContract(assetsProxy);
      await tx.wait();
      console.log("✅ assetsContract updated!");
    }
  } catch (e) {
    console.log("Error setting assetsContract:", e.message);
  }

  // Update deployment file
  console.log("\n3. Updating deployment file...");
  if (!deployment.contracts.OVGMetadata.previousImplementations) {
    deployment.contracts.OVGMetadata.previousImplementations = [];
  }
  deployment.contracts.OVGMetadata.previousImplementations.push({
    address: oldImplementation,
    upgradedAt: new Date().toISOString()
  });
  deployment.contracts.OVGMetadata.implementation = newImplAddress;
  deployment.lastUpdated = new Date().toISOString();

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("✅ Deployment file updated");

  // Verify
  console.log("\n4. Verifying...");
  const finalAssets = await metadata.assetsContract();
  console.log("Final assetsContract:", finalAssets);

  console.log("\n=== Upgrade Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
