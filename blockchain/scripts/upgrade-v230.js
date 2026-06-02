const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Upgrade OVGAssets and OVGMetadata to V2.3.0
 * - Adds asset attributes (rarity, category, collection) for OpenSea traits
 * - Generates full JSON metadata with attributes on-chain
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;

  console.log("=== Upgrade to V2.3.0 (On-chain Attributes) ===");
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  console.log("");

  // Load deployment file
  const deploymentPath = path.join(__dirname, `../deployments/${network}-upgradeable.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  // Upgrade OVGMetadata
  console.log("=== Upgrading OVGMetadata ===");
  const metadataProxy = deployment.contracts.OVGMetadata.proxy;
  const oldMetadataImpl = deployment.contracts.OVGMetadata.implementation;
  console.log("Proxy:", metadataProxy);
  console.log("Current implementation:", oldMetadataImpl);

  const OVGMetadata = await ethers.getContractFactory("OVGMetadataUpgradeable");
  const upgradedMetadata = await upgrades.upgradeProxy(metadataProxy, OVGMetadata, {
    kind: "uups",
    redeployImplementation: "always"
  });
  await upgradedMetadata.waitForDeployment();

  const newMetadataImpl = await upgrades.erc1967.getImplementationAddress(metadataProxy);
  console.log("New implementation:", newMetadataImpl);

  // Set assetsContract if not set
  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  try {
    const currentAssetsContract = await upgradedMetadata.assetsContract();
    if (currentAssetsContract === ethers.ZeroAddress) {
      console.log("Setting assetsContract...");
      const tx = await upgradedMetadata.setAssetsContract(assetsProxy);
      await tx.wait();
      console.log("assetsContract set to:", assetsProxy);
    } else {
      console.log("assetsContract already set:", currentAssetsContract);
    }
  } catch (e) {
    // Function might not exist yet, set it after upgrade
    console.log("Setting assetsContract (first time)...");
    const tx = await upgradedMetadata.setAssetsContract(assetsProxy);
    await tx.wait();
    console.log("assetsContract set to:", assetsProxy);
  }

  // Update deployment for metadata
  if (!deployment.contracts.OVGMetadata.previousImplementations) {
    deployment.contracts.OVGMetadata.previousImplementations = [];
  }
  deployment.contracts.OVGMetadata.previousImplementations.push({
    address: oldMetadataImpl,
    upgradedAt: new Date().toISOString()
  });
  deployment.contracts.OVGMetadata.implementation = newMetadataImpl;

  // Upgrade OVGAssets
  console.log("");
  console.log("=== Upgrading OVGAssets ===");
  const oldAssetsImpl = deployment.contracts.OVGAssets.implementation;
  console.log("Proxy:", assetsProxy);
  console.log("Current implementation:", oldAssetsImpl);

  const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
  const upgradedAssets = await upgrades.upgradeProxy(assetsProxy, OVGAssets, {
    kind: "uups",
    redeployImplementation: "always"
  });
  await upgradedAssets.waitForDeployment();

  const newAssetsImpl = await upgrades.erc1967.getImplementationAddress(assetsProxy);
  console.log("New implementation:", newAssetsImpl);

  // Verify version
  const version = await upgradedAssets.version();
  console.log("Contract version:", version);

  // Update deployment for assets
  if (!deployment.contracts.OVGAssets.previousImplementations) {
    deployment.contracts.OVGAssets.previousImplementations = [];
  }
  deployment.contracts.OVGAssets.previousImplementations.push({
    address: oldAssetsImpl,
    upgradedAt: new Date().toISOString()
  });
  deployment.contracts.OVGAssets.implementation = newAssetsImpl;

  // Save deployment
  deployment.lastUpdated = new Date().toISOString();
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("");
  console.log("Deployment file updated");

  console.log("");
  console.log("=== Upgrade Complete ===");
  console.log("V2.3.0 features:");
  console.log("- setAssetAttributes(): Store rarity, category, collection on-chain");
  console.log("- uri() now returns JSON with attributes array for OpenSea");
  console.log("- OpenSea will show traits: Rarity, Category, Collection");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
