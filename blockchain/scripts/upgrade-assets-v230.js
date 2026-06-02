const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Force upgrade OVGAssets to V2.3.0
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;

  console.log("=== Force Upgrade OVGAssets to V2.3.0 ===");
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  console.log("");

  const deploymentPath = path.join(__dirname, `../deployments/${network}-upgradeable.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  const oldImpl = deployment.contracts.OVGAssets.implementation;

  console.log("Proxy:", assetsProxy);
  console.log("Current implementation:", oldImpl);

  // Force deploy new implementation
  const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");

  console.log("\nDeploying new implementation...");
  const impl = await OVGAssets.deploy();
  await impl.waitForDeployment();
  const newImplAddress = await impl.getAddress();
  console.log("New implementation deployed:", newImplAddress);

  // Upgrade proxy to new implementation
  console.log("\nUpgrading proxy...");
  const proxyAdmin = await upgrades.erc1967.getAdminAddress(assetsProxy);
  console.log("Proxy admin:", proxyAdmin);

  // Use upgradeProxy with force
  const upgraded = await upgrades.upgradeProxy(assetsProxy, OVGAssets, {
    kind: "uups",
    redeployImplementation: "always",
    unsafeSkipStorageCheck: true
  });
  await upgraded.waitForDeployment();

  const finalImpl = await upgrades.erc1967.getImplementationAddress(assetsProxy);
  console.log("Final implementation:", finalImpl);

  // Verify version
  const version = await upgraded.version();
  console.log("Contract version:", version);

  // Update deployment
  if (!deployment.contracts.OVGAssets.previousImplementations) {
    deployment.contracts.OVGAssets.previousImplementations = [];
  }
  deployment.contracts.OVGAssets.previousImplementations.push({
    address: oldImpl,
    upgradedAt: new Date().toISOString()
  });
  deployment.contracts.OVGAssets.implementation = finalImpl;
  deployment.lastUpdated = new Date().toISOString();

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment file updated");
  console.log("\n=== Done ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
