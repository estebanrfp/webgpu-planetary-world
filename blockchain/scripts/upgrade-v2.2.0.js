const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Upgrade OVGAssets to V2.2.0 with direct metadata URL support
 *
 * V2.2.0 Features:
 * - setTokenMetadataUrl(tokenId, url) - Set IPFS/HTTP URL for token
 * - getTokenMetadataUrl(tokenId) - Get direct URL
 * - uri() now returns direct URL if set (Polygonscan compatible)
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("====================================================");
  console.log("Upgrading OVGAssets to V2.2.0 on:", hre.network.name);
  console.log("Deployer address:", deployer.address);
  console.log("Network ID:", await ethers.provider.getNetwork().then(n => n.chainId));
  console.log("====================================================");

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);

  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  // Upgrade OVGAssets
  console.log("\nUpgrading OVGAssets to V2.2.0...");
  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  const oldAssetsImpl = deployment.contracts.OVGAssets.implementation;
  console.log("  Proxy:", assetsProxy);
  console.log("  Current implementation:", oldAssetsImpl);

  const OVGAssetsV2 = await ethers.getContractFactory("OVGAssetsUpgradeable");

  console.log("  Validating upgrade...");
  await upgrades.validateUpgrade(assetsProxy, OVGAssetsV2, {
    kind: 'uups'
  });

  console.log("  Performing upgrade...");
  const upgradedAssets = await upgrades.upgradeProxy(assetsProxy, OVGAssetsV2, {
    kind: 'uups'
  });
  await upgradedAssets.waitForDeployment();

  const newAssetsImpl = await upgrades.erc1967.getImplementationAddress(assetsProxy);
  console.log("  New implementation:", newAssetsImpl);

  const assetsVersion = await upgradedAssets.version();
  console.log("  Contract version:", assetsVersion);

  // Update deployment file
  if (!deployment.contracts.OVGAssets.previousImplementations) {
    deployment.contracts.OVGAssets.previousImplementations = [];
  }
  deployment.contracts.OVGAssets.previousImplementations.push({
    address: oldAssetsImpl,
    upgradedAt: new Date().toISOString()
  });
  deployment.contracts.OVGAssets.implementation = newAssetsImpl;
  deployment.lastUpdated = new Date().toISOString();

  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment file updated:", deploymentFile);

  console.log("\n====================================================");
  console.log("V2.2.0 UPGRADE SUMMARY");
  console.log("====================================================");
  console.log("OVGAssets:");
  console.log("  Proxy:             ", assetsProxy);
  console.log("  Old Implementation:", oldAssetsImpl);
  console.log("  New Implementation:", newAssetsImpl);
  console.log("====================================================");
  console.log("\nV2.2.0 Features enabled:");
  console.log("  - setTokenMetadataUrl(tokenId, url) - Set IPFS/HTTP URL for Polygonscan");
  console.log("  - getTokenMetadataUrl(tokenId) - Get direct URL");
  console.log("  - uri(tokenId) returns direct URL if set");
  console.log("====================================================");
  console.log("\nNext step: Upload JSON to IPFS and call setTokenMetadataUrl");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
