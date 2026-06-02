const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("====================================================");
  console.log(`Deploying OVGrid Upgradeable Infrastructure to: ${hre.network.name}`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Network ID: ${network.chainId}`);
  console.log("====================================================");

  // 1. Deploy OVGForwarder (non-upgradeable - simple wrapper)
  console.log("\n1. Deploying OVGForwarder (non-upgradeable)...");
  const OVGForwarder = await ethers.getContractFactory("OVGForwarder");
  const ovgForwarder = await OVGForwarder.deploy();
  await ovgForwarder.waitForDeployment();
  const ovgForwarderAddress = await ovgForwarder.getAddress();
  console.log(`OVGForwarder deployed to: ${ovgForwarderAddress}`);

  // 2. Deploy OVGPaymasterUpgradeable
  console.log("\n2. Deploying OVGPaymasterUpgradeable (UUPS Proxy)...");
  const OVGPaymaster = await ethers.getContractFactory("OVGPaymasterUpgradeable");
  const ovgPaymaster = await upgrades.deployProxy(
    OVGPaymaster,
    [deployer.address],
    { kind: 'uups' }
  );
  await ovgPaymaster.waitForDeployment();
  const ovgPaymasterAddress = await ovgPaymaster.getAddress();
  const paymasterImplAddress = await upgrades.erc1967.getImplementationAddress(ovgPaymasterAddress);
  console.log(`OVGPaymaster Proxy deployed to: ${ovgPaymasterAddress}`);
  console.log(`OVGPaymaster Implementation: ${paymasterImplAddress}`);

  // 3. Deploy OVGTokenUpgradeable
  console.log("\n3. Deploying OVGTokenUpgradeable (UUPS Proxy)...");
  const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
  const ovgToken = await upgrades.deployProxy(
    OVGToken,
    [deployer.address, deployer.address, ovgForwarderAddress],
    { kind: 'uups' }
  );
  await ovgToken.waitForDeployment();
  const ovgTokenAddress = await ovgToken.getAddress();
  const tokenImplAddress = await upgrades.erc1967.getImplementationAddress(ovgTokenAddress);
  console.log(`OVGToken Proxy deployed to: ${ovgTokenAddress}`);
  console.log(`OVGToken Implementation: ${tokenImplAddress}`);

  // 4. Deploy OVGAssetsUpgradeable
  console.log("\n4. Deploying OVGAssetsUpgradeable (UUPS Proxy)...");
  const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
  const ovgAssets = await upgrades.deployProxy(
    OVGAssets,
    [deployer.address, deployer.address],
    { kind: 'uups' }
  );
  await ovgAssets.waitForDeployment();
  const ovgAssetsAddress = await ovgAssets.getAddress();
  const assetsImplAddress = await upgrades.erc1967.getImplementationAddress(ovgAssetsAddress);
  console.log(`OVGAssets Proxy deployed to: ${ovgAssetsAddress}`);
  console.log(`OVGAssets Implementation: ${assetsImplAddress}`);

  // 5. Deploy OVGMarketplaceUpgradeable
  console.log("\n5. Deploying OVGMarketplaceUpgradeable (UUPS Proxy)...");
  const OVGMarketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
  const ovgMarketplace = await upgrades.deployProxy(
    OVGMarketplace,
    [ovgTokenAddress, ovgAssetsAddress, deployer.address],
    { kind: 'uups' }
  );
  await ovgMarketplace.waitForDeployment();
  const ovgMarketplaceAddress = await ovgMarketplace.getAddress();
  const marketplaceImplAddress = await upgrades.erc1967.getImplementationAddress(ovgMarketplaceAddress);
  console.log(`OVGMarketplace Proxy deployed to: ${ovgMarketplaceAddress}`);
  console.log(`OVGMarketplace Implementation: ${marketplaceImplAddress}`);

  // 6. Deploy OVGLandClaimUpgradeable
  console.log("\n6. Deploying OVGLandClaimUpgradeable (UUPS Proxy)...");
  const OVGLandClaim = await ethers.getContractFactory("OVGLandClaimUpgradeable");
  const ovgLandClaim = await upgrades.deployProxy(
    OVGLandClaim,
    [ovgAssetsAddress, deployer.address],
    { kind: 'uups' }
  );
  await ovgLandClaim.waitForDeployment();
  const ovgLandClaimAddress = await ovgLandClaim.getAddress();
  const landClaimImplAddress = await upgrades.erc1967.getImplementationAddress(ovgLandClaimAddress);
  console.log(`OVGLandClaim Proxy deployed to: ${ovgLandClaimAddress}`);
  console.log(`OVGLandClaim Implementation: ${landClaimImplAddress}`);

  // 7. Initial Setup
  console.log("\n7. Performing Initial Setup...");
  
  // Fund the Paymaster with some MATIC
  console.log("   - Funding Paymaster with 0.5 MATIC...");
  const fundTx = await deployer.sendTransaction({
    to: ovgPaymasterAddress,
    value: ethers.parseEther("0.5")
  });
  await fundTx.wait();

  // Grant Marketplace approval for assets
  console.log("   - Approving Marketplace for deployer's assets...");
  const approveTx = await ovgAssets.setApprovalForAll(ovgMarketplaceAddress, true);
  await approveTx.wait();

  // Grant MINTER_ROLE to LandClaim contract so it can mint land NFTs
  console.log("   - Granting MINTER_ROLE to LandClaim contract...");
  const MINTER_ROLE = await ovgAssets.MINTER_ROLE();
  const grantRoleTx = await ovgAssets.grantRole(MINTER_ROLE, ovgLandClaimAddress);
  await grantRoleTx.wait();

  console.log("   Initial setup completed.");

  // Save Addresses
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const deploymentData = {
    network: hre.network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    type: "upgradeable",
    contracts: {
      OVGForwarder: {
        address: ovgForwarderAddress,
        upgradeable: false
      },
      OVGPaymaster: {
        proxy: ovgPaymasterAddress,
        implementation: paymasterImplAddress,
        upgradeable: true
      },
      OVGToken: {
        proxy: ovgTokenAddress,
        implementation: tokenImplAddress,
        upgradeable: true
      },
      OVGAssets: {
        proxy: ovgAssetsAddress,
        implementation: assetsImplAddress,
        upgradeable: true
      },
      OVGMarketplace: {
        proxy: ovgMarketplaceAddress,
        implementation: marketplaceImplAddress,
        upgradeable: true
      },
      OVGLandClaim: {
        proxy: ovgLandClaimAddress,
        implementation: landClaimImplAddress,
        upgradeable: true
      }
    },
    timestamp: new Date().toISOString(),
  };

  const filePath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));
  console.log(`\nDeployment summary saved to: ${filePath}`);

  // Summary
  console.log("\n====================================================");
  console.log("DEPLOYMENT SUMMARY");
  console.log("====================================================");
  console.log("\nProxy Addresses (use these in your app):");
  console.log(`  OVGForwarder:   ${ovgForwarderAddress}`);
  console.log(`  OVGPaymaster:   ${ovgPaymasterAddress}`);
  console.log(`  OVGToken:       ${ovgTokenAddress}`);
  console.log(`  OVGAssets:      ${ovgAssetsAddress}`);
  console.log(`  OVGMarketplace: ${ovgMarketplaceAddress}`);
  console.log(`  OVGLandClaim:   ${ovgLandClaimAddress}`);
  console.log("\n====================================================");
  console.log("Deployment completed successfully!");
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
