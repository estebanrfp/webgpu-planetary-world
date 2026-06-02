const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Upgrade a specific contract to a new implementation.
 * 
 * Usage:
 *   npx hardhat run scripts/upgrade-contract.js --network polygonAmoy
 * 
 * Set environment variables:
 *   CONTRACT_NAME: Name of the contract to upgrade (e.g., "OVGToken", "OVGMarketplace")
 *   NEW_VERSION: Optional suffix for the new contract (e.g., "V2" -> "OVGTokenUpgradeableV2")
 */
async function main() {
  const contractName = process.env.CONTRACT_NAME;
  const newVersion = process.env.NEW_VERSION || "";
  
  if (!contractName) {
    console.log("Usage: CONTRACT_NAME=OVGToken npx hardhat run scripts/upgrade-contract.js --network <network>");
    console.log("\nAvailable contracts:");
    console.log("  - OVGToken");
    console.log("  - OVGAssets");
    console.log("  - OVGMarketplace");
    console.log("  - OVGLandClaim");
    console.log("  - OVGPaymaster");
    console.log("\nExample with new version:");
    console.log("  CONTRACT_NAME=OVGToken NEW_VERSION=V2 npx hardhat run scripts/upgrade-contract.js --network polygonAmoy");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("====================================================");
  console.log(`Upgrading ${contractName} on: ${hre.network.name}`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Network ID: ${network.chainId}`);
  console.log("====================================================");

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    console.error("Please deploy the upgradeable contracts first using deploy-upgradeable.js");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const contractData = deployment.contracts[contractName];

  if (!contractData || !contractData.proxy) {
    console.error(`Contract ${contractName} not found in deployment file or is not upgradeable`);
    process.exit(1);
  }

  const proxyAddress = contractData.proxy;
  const oldImplementation = contractData.implementation;

  console.log(`\nProxy address: ${proxyAddress}`);
  console.log(`Current implementation: ${oldImplementation}`);

  // Get the new contract factory
  const newContractName = `${contractName}Upgradeable${newVersion}`;
  console.log(`\nLooking for new contract: ${newContractName}`);

  const NewContract = await ethers.getContractFactory(newContractName);

  // Force import proxy if .openzeppelin state was lost
  try {
    await upgrades.forceImport(proxyAddress, NewContract, { kind: 'uups' });
  } catch (e) {
    // Already registered — safe to ignore
  }

  // Validate upgrade compatibility
  console.log("\nValidating upgrade...");
  await upgrades.validateUpgrade(proxyAddress, NewContract, {
    kind: 'uups'
  });
  console.log("Upgrade validation passed!");

  // Perform the upgrade
  console.log("\nPerforming upgrade...");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, NewContract, {
    kind: 'uups'
  });
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log(`\nUpgrade successful!`);
  console.log(`New implementation: ${newImplementation}`);

  // Verify version if available
  try {
    const version = await upgraded.version();
    console.log(`Contract version: ${version}`);
  } catch (e) {
    // version() might not exist
  }

  // Update deployment file
  deployment.contracts[contractName].implementation = newImplementation;
  deployment.contracts[contractName].previousImplementations = deployment.contracts[contractName].previousImplementations || [];
  deployment.contracts[contractName].previousImplementations.push({
    address: oldImplementation,
    upgradedAt: new Date().toISOString()
  });
  deployment.lastUpdated = new Date().toISOString();

  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment file updated: ${deploymentFile}`);

  console.log("\n====================================================");
  console.log("UPGRADE SUMMARY");
  console.log("====================================================");
  console.log(`Contract:           ${contractName}`);
  console.log(`Proxy:              ${proxyAddress}`);
  console.log(`Old Implementation: ${oldImplementation}`);
  console.log(`New Implementation: ${newImplementation}`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
