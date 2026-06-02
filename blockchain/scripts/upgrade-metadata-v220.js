const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Upgrade OVGMetadata to V2.2.0
 * - Adds setAssetMetadataByTokenOwner for token owners to set their own metadata
 * - Adds assetsContract reference for ownership verification
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;

  console.log("=== Upgrade OVGMetadata to V2.2.0 ===");
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  console.log("");

  // Load deployment file
  const deploymentPath = path.join(__dirname, `../deployments/${network}-upgradeable.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  if (!deployment.contracts.OVGMetadata) {
    throw new Error("OVGMetadata not found in deployment file");
  }

  const proxyAddress = deployment.contracts.OVGMetadata.proxy;
  const assetsAddress = deployment.contracts.OVGAssets.proxy;
  const oldImplementation = deployment.contracts.OVGMetadata.implementation;

  console.log("Proxy address:", proxyAddress);
  console.log("OVGAssets address:", assetsAddress);
  console.log("Current implementation:", oldImplementation);
  console.log("");

  // Upgrade contract
  console.log("Upgrading OVGMetadata...");
  const OVGMetadata = await ethers.getContractFactory("OVGMetadataUpgradeable");

  const upgraded = await upgrades.upgradeProxy(proxyAddress, OVGMetadata, {
    kind: "uups",
    redeployImplementation: "always"
  });
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation:", newImplementation);

  // Set assetsContract reference
  console.log("");
  console.log("Setting assetsContract...");
  const tx = await upgraded.setAssetsContract(assetsAddress);
  console.log("TX Hash:", tx.hash);
  await tx.wait();

  // Verify
  const storedAssets = await upgraded.assetsContract();
  console.log("Verified assetsContract:", storedAssets);

  // Update deployment file
  if (!deployment.contracts.OVGMetadata.previousImplementations) {
    deployment.contracts.OVGMetadata.previousImplementations = [];
  }
  deployment.contracts.OVGMetadata.previousImplementations.push({
    address: oldImplementation,
    upgradedAt: new Date().toISOString()
  });
  deployment.contracts.OVGMetadata.implementation = newImplementation;
  deployment.lastUpdated = new Date().toISOString();

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("");
  console.log("Deployment file updated");

  console.log("");
  console.log("=== Upgrade Complete ===");
  console.log("New features:");
  console.log("- setAssetMetadataByTokenOwner: Token owners can set their own metadata");
  console.log("- assetsContract: Reference to OVGAssets for ownership verification");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
