const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Upgrade OVGMetadata and OVGAssets to V2.1.0
 * - OVGMetadata: adds setAssetMetadata/getAssetMetadata for ERC-1155 token metadata
 * - OVGAssets: adds uri() override that reads from OVGMetadata + setMetadataContract
 *
 * Usage:
 *   npx hardhat run scripts/upgrade-v2.1.0.js --network polygonMainnet
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("====================================================");
  console.log("Upgrading to V2.1.0 on:", hre.network.name);
  console.log("Deployer address:", deployer.address);
  console.log("Network ID:", network.chainId);
  console.log("====================================================");

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);

  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  // ========== Step 1: Upgrade OVGMetadata ==========
  console.log("\n[1/3] Upgrading OVGMetadata...");

  const metadataData = deployment.contracts.OVGMetadata;
  if (!metadataData?.proxy) {
    console.error("OVGMetadata not found in deployment file");
    process.exit(1);
  }

  const metadataProxy = metadataData.proxy;
  const oldMetadataImpl = metadataData.implementation;

  console.log(`  Proxy: ${metadataProxy}`);
  console.log(`  Current implementation: ${oldMetadataImpl}`);

  const OVGMetadata = await ethers.getContractFactory("OVGMetadataUpgradeable");

  console.log("  Validating upgrade...");
  await upgrades.validateUpgrade(metadataProxy, OVGMetadata, { kind: 'uups' });

  console.log("  Performing upgrade...");
  const metadataUpgraded = await upgrades.upgradeProxy(metadataProxy, OVGMetadata, { kind: 'uups' });
  await metadataUpgraded.waitForDeployment();

  const newMetadataImpl = await upgrades.erc1967.getImplementationAddress(metadataProxy);
  console.log(`  New implementation: ${newMetadataImpl}`);

  // Update deployment record
  deployment.contracts.OVGMetadata.implementation = newMetadataImpl;
  deployment.contracts.OVGMetadata.previousImplementations = deployment.contracts.OVGMetadata.previousImplementations || [];
  deployment.contracts.OVGMetadata.previousImplementations.push({
    address: oldMetadataImpl,
    upgradedAt: new Date().toISOString()
  });

  // ========== Step 2: Upgrade OVGAssets ==========
  console.log("\n[2/3] Upgrading OVGAssets...");

  const assetsData = deployment.contracts.OVGAssets;
  if (!assetsData?.proxy) {
    console.error("OVGAssets not found in deployment file");
    process.exit(1);
  }

  const assetsProxy = assetsData.proxy;
  const oldAssetsImpl = assetsData.implementation;

  console.log(`  Proxy: ${assetsProxy}`);
  console.log(`  Current implementation: ${oldAssetsImpl}`);

  const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");

  console.log("  Validating upgrade...");
  await upgrades.validateUpgrade(assetsProxy, OVGAssets, { kind: 'uups' });

  console.log("  Performing upgrade...");
  const assetsUpgraded = await upgrades.upgradeProxy(assetsProxy, OVGAssets, { kind: 'uups' });
  await assetsUpgraded.waitForDeployment();

  const newAssetsImpl = await upgrades.erc1967.getImplementationAddress(assetsProxy);
  console.log(`  New implementation: ${newAssetsImpl}`);

  // Verify version
  try {
    const version = await assetsUpgraded.version();
    console.log(`  Contract version: ${version}`);
  } catch (e) {
    // version() might not exist
  }

  // Update deployment record
  deployment.contracts.OVGAssets.implementation = newAssetsImpl;
  deployment.contracts.OVGAssets.previousImplementations = deployment.contracts.OVGAssets.previousImplementations || [];
  deployment.contracts.OVGAssets.previousImplementations.push({
    address: oldAssetsImpl,
    upgradedAt: new Date().toISOString()
  });

  // ========== Step 3: Configure OVGAssets to use OVGMetadata ==========
  console.log("\n[3/3] Configuring OVGAssets.setMetadataContract...");

  const assetsContract = await ethers.getContractAt("OVGAssetsUpgradeable", assetsProxy);

  // Check if already configured
  let currentMetadataContract;
  try {
    currentMetadataContract = await assetsContract.metadataContract();
    console.log(`  Current metadataContract: ${currentMetadataContract}`);
  } catch (e) {
    currentMetadataContract = ethers.ZeroAddress;
    console.log("  metadataContract not set yet");
  }

  if (currentMetadataContract === ethers.ZeroAddress || currentMetadataContract !== metadataProxy) {
    console.log(`  Setting metadataContract to: ${metadataProxy}`);
    const tx = await assetsContract.setMetadataContract(metadataProxy);
    await tx.wait();
    console.log("  metadataContract configured!");
  } else {
    console.log("  metadataContract already correctly configured");
  }

  // ========== Save deployment file ==========
  deployment.lastUpdated = new Date().toISOString();
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment file updated: ${deploymentFile}`);

  // ========== Summary ==========
  console.log("\n====================================================");
  console.log("V2.1.0 UPGRADE SUMMARY");
  console.log("====================================================");
  console.log("OVGMetadata:");
  console.log(`  Proxy:              ${metadataProxy}`);
  console.log(`  Old Implementation: ${oldMetadataImpl}`);
  console.log(`  New Implementation: ${newMetadataImpl}`);
  console.log("");
  console.log("OVGAssets:");
  console.log(`  Proxy:              ${assetsProxy}`);
  console.log(`  Old Implementation: ${oldAssetsImpl}`);
  console.log(`  New Implementation: ${newAssetsImpl}`);
  console.log(`  metadataContract:   ${metadataProxy}`);
  console.log("====================================================");
  console.log("\nV2.1.0 Features enabled:");
  console.log("  - OVGMetadata.setAssetMetadata(assetId, title, description, imageUrl, assetUrl)");
  console.log("  - OVGMetadata.getAssetMetadata(assetId)");
  console.log("  - OVGAssets.uri(tokenId) now returns JSON metadata with image URL");
  console.log("  - Polygonscan/OpenSea will display NFT images from uri()");
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
