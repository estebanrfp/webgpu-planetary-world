const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Diagnose OVGMarketplace contract on mainnet.
 *
 * Usage:
 *   npx hardhat run scripts/diagnose-mainnet.js --network polygonMainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n====================================================");
  console.log("OVGMarketplace Mainnet Diagnostics");
  console.log("====================================================");
  console.log(`Network: ${hre.network.name} (${network.chainId})`);
  console.log(`Account: ${deployer.address}`);

  // Load addresses from deployment file
  const deploymentPath = path.join(__dirname, "../deployments/polygonMainnet-upgradeable.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const MARKETPLACE_PROXY = deployment.contracts.OVGMarketplace.proxy;
  const OVG_TOKEN = deployment.contracts.OVGToken.proxy;

  // Check if contract has code
  const code = await ethers.provider.getCode(MARKETPLACE_PROXY);
  console.log(`\nContract code at proxy: ${code.length > 2 ? 'YES (' + code.length + ' bytes)' : 'NO CODE!'}`);

  if (code.length <= 2) {
    console.log("\n❌ No contract code at proxy address!");
    return;
  }

  // Try to get implementation address (ERC1967)
  try {
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const implAddress = await ethers.provider.getStorage(MARKETPLACE_PROXY, implSlot);
    const impl = "0x" + implAddress.slice(-40);
    console.log(`Implementation address: ${impl}`);

    const implCode = await ethers.provider.getCode(impl);
    console.log(`Implementation code: ${implCode.length > 2 ? 'YES (' + implCode.length + ' bytes)' : 'NO CODE!'}`);
  } catch (e) {
    console.log(`Implementation check error: ${e.message}`);
  }

  // Try calling basic functions
  const Marketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
  const marketplace = Marketplace.attach(MARKETPLACE_PROXY);

  console.log("\n--- Function Calls ---");

  try {
    const version = await marketplace.version();
    console.log(`✅ version(): ${version}`);
  } catch (e) {
    console.log(`❌ version(): ${e.message.slice(0, 100)}`);
  }

  try {
    const ovgToken = await marketplace.ovgToken();
    console.log(`✅ ovgToken(): ${ovgToken}`);
  } catch (e) {
    console.log(`❌ ovgToken(): ${e.message.slice(0, 100)}`);
  }

  try {
    const fee = await marketplace.marketplaceFee();
    console.log(`✅ marketplaceFee(): ${fee}`);
  } catch (e) {
    console.log(`❌ marketplaceFee(): ${e.message.slice(0, 100)}`);
  }

  try {
    const paused = await marketplace.paused();
    console.log(`✅ paused(): ${paused}`);
  } catch (e) {
    console.log(`❌ paused(): ${e.message.slice(0, 100)}`);
  }

  try {
    const owner = await marketplace.owner();
    console.log(`✅ owner(): ${owner}`);
  } catch (e) {
    console.log(`❌ owner(): ${e.message.slice(0, 100)}`);
  }

  // Check OVG Token
  console.log("\n--- OVG Token Check ---");
  const Token = await ethers.getContractFactory("OVGTokenUpgradeable");
  const token = Token.attach(OVG_TOKEN);

  try {
    const symbol = await token.symbol();
    const balance = await token.balanceOf(deployer.address);
    console.log(`✅ symbol(): ${symbol}`);
    console.log(`✅ balanceOf(deployer): ${ethers.formatUnits(balance, 18)} OVG`);
  } catch (e) {
    console.log(`❌ Token error: ${e.message.slice(0, 100)}`);
  }

  console.log("\n====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
