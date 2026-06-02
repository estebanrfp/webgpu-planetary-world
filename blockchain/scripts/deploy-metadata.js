const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deploy OVGMetadataUpgradeable contract
 *
 * Usage:
 *   npx hardhat run scripts/deploy-metadata.js --network polygonMainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("====================================================");
  console.log(`Deploying OVGMetadata on: ${hre.network.name}`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Network ID: ${network.chainId}`);
  console.log("====================================================");

  // Load deployment data to get marketplace address
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);

  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const marketplaceProxy = deployment.contracts.OVGMarketplace?.proxy;

  if (!marketplaceProxy) {
    console.error("Marketplace proxy not found in deployment file");
    process.exit(1);
  }

  console.log(`\nMarketplace proxy: ${marketplaceProxy}`);

  // Deploy OVGMetadataUpgradeable
  console.log("\nDeploying OVGMetadataUpgradeable...");
  const OVGMetadata = await ethers.getContractFactory("OVGMetadataUpgradeable");

  const metadata = await upgrades.deployProxy(
    OVGMetadata,
    [deployer.address, marketplaceProxy],
    { kind: 'uups' }
  );
  await metadata.waitForDeployment();

  const metadataProxy = await metadata.getAddress();
  const metadataImpl = await upgrades.erc1967.getImplementationAddress(metadataProxy);

  console.log(`\nOVGMetadata deployed!`);
  console.log(`  Proxy: ${metadataProxy}`);
  console.log(`  Implementation: ${metadataImpl}`);

  // Update deployment file
  deployment.contracts.OVGMetadata = {
    proxy: metadataProxy,
    implementation: metadataImpl,
    upgradeable: true
  };
  deployment.lastUpdated = new Date().toISOString();

  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment file updated: ${deploymentFile}`);

  console.log("\n====================================================");
  console.log("DEPLOYMENT SUMMARY");
  console.log("====================================================");
  console.log(`Contract:       OVGMetadata`);
  console.log(`Proxy:          ${metadataProxy}`);
  console.log(`Implementation: ${metadataImpl}`);
  console.log(`Marketplace:    ${marketplaceProxy}`);
  console.log("====================================================");

  // Verify on Polygonscan
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations before verification...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    try {
      await hre.run("verify:verify", {
        address: metadataImpl,
        constructorArguments: []
      });
      console.log("Contract verified on Polygonscan!");
    } catch (e) {
      console.log("Verification failed:", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
