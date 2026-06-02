const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Initialize OVGMarketplace v1.3.0 with allowed tokens.
 * 
 * Usage:
 *   npx hardhat run scripts/initialize-v1.3.js --network polygonAmoy
 *   npx hardhat run scripts/initialize-v1.3.js --network polygonMainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("====================================================");
  console.log(`Initializing OVGMarketplace v1.3.0 on: ${hre.network.name}`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Network ID: ${network.chainId}`);
  console.log("====================================================");

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const marketplaceProxy = deployment.contracts.OVGMarketplace.proxy;

  console.log(`\nMarketplace Proxy: ${marketplaceProxy}`);

  // Get contract instance
  const Marketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
  const marketplace = Marketplace.attach(marketplaceProxy);

  // Check current version
  const currentVersion = await marketplace.version();
  console.log(`Current version: ${currentVersion}`);

  if (currentVersion !== "1.3.0") {
    console.error(`Expected version 1.3.0, got ${currentVersion}. Please upgrade first.`);
    process.exit(1);
  }

  // Define tokens to whitelist based on network
  let additionalTokens = [];
  
  if (hre.network.name === "polygonMainnet") {
    // Polygon Mainnet: USDC and USDT
    additionalTokens = [
      "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC (6 decimals)
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"  // USDT (6 decimals)
    ];
    console.log("\nWhitelisting tokens for Polygon Mainnet:");
    console.log("  - USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359");
    console.log("  - USDT: 0xc2132D05D31c914a87C6611C10748AEb04B58e8F");
  } else {
    // Testnet (Amoy): No additional tokens, just OVG
    console.log("\nTestnet detected - OVG token will be whitelisted automatically.");
    console.log("No additional tokens configured for testnet.");
  }

  // Check if already initialized
  const ovgToken = await marketplace.ovgToken();
  const isOvgAllowed = await marketplace.allowedTokens(ovgToken);
  
  if (isOvgAllowed) {
    console.log("\n⚠️  v1.3.0 already initialized (OVG token is already allowed)");
    console.log("Skipping initialization...");
    
    // Verify OVG is allowed
    console.log("\n====================================================");
    console.log("CURRENT TOKEN WHITELIST");
    console.log("====================================================");
    console.log(`OVG (${ovgToken}): ${await marketplace.allowedTokens(ovgToken) ? '✅' : '❌'}`);
    
    for (const token of additionalTokens) {
      console.log(`Token (${token}): ${await marketplace.allowedTokens(token) ? '✅' : '❌'}`);
    }
    return;
  }

  // Initialize v1.3.0
  console.log("\nCalling initializeV1_3()...");
  const tx = await marketplace.initializeV1_3(additionalTokens);
  console.log(`Transaction hash: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

  // Verify initialization
  console.log("\n====================================================");
  console.log("INITIALIZATION COMPLETE");
  console.log("====================================================");
  console.log(`OVG (${ovgToken}): ${await marketplace.allowedTokens(ovgToken) ? '✅' : '❌'}`);
  
  for (const token of additionalTokens) {
    console.log(`Token (${token}): ${await marketplace.allowedTokens(token) ? '✅' : '❌'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
