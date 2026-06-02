const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

const formatTime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds/60)}m ${seconds%60}s`;
};

async function main() {
  const startTotal = Date.now();
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║         OVGrid Mainnet Deployment                    ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Network:  Polygon Mainnet (${network.chainId})                   ║`);
  console.log(`║  Deployer: ${deployer.address.slice(0,10)}...${deployer.address.slice(-8)}            ║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);
  
  const filePath = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);
  let deployment = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : {
    network: hre.network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    type: "upgradeable",
    contracts: {},
    timestamp: new Date().toISOString(),
  };

  // 1. OVGForwarder
  if (!deployment.contracts.OVGForwarder?.address) {
    const start = Date.now();
    process.stdout.write(`[1/6] 📨 OVGForwarder ............. deploying...`);
    const OVGForwarder = await ethers.getContractFactory("OVGForwarder");
    const ovgForwarder = await OVGForwarder.deploy();
    await ovgForwarder.waitForDeployment();
    const addr = await ovgForwarder.getAddress();
    deployment.contracts.OVGForwarder = { address: addr, upgradeable: false };
    fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
    console.log(` ✅ ${formatTime(Date.now()-start)}`);
    console.log(`       └─ ${addr}\n`);
  } else {
    console.log(`[1/6] 📨 OVGForwarder ............. ✅ exists`);
    console.log(`       └─ ${deployment.contracts.OVGForwarder.address}\n`);
  }

  // 2. OVGPaymaster
  if (!deployment.contracts.OVGPaymaster?.proxy) {
    const start = Date.now();
    process.stdout.write(`[2/6] ⛽ OVGPaymaster ............. deploying...`);
    const OVGPaymaster = await ethers.getContractFactory("OVGPaymasterUpgradeable");
    const ovgPaymaster = await upgrades.deployProxy(OVGPaymaster, [deployer.address], { kind: 'uups' });
    await ovgPaymaster.waitForDeployment();
    const proxy = await ovgPaymaster.getAddress();
    const impl = await upgrades.erc1967.getImplementationAddress(proxy);
    deployment.contracts.OVGPaymaster = { proxy, implementation: impl, upgradeable: true };
    fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
    console.log(` ✅ ${formatTime(Date.now()-start)}`);
    console.log(`       └─ ${proxy}\n`);
  } else {
    console.log(`[2/6] ⛽ OVGPaymaster ............. ✅ exists`);
    console.log(`       └─ ${deployment.contracts.OVGPaymaster.proxy}\n`);
  }

  // 3. OVGToken
  if (!deployment.contracts.OVGToken?.proxy) {
    const start = Date.now();
    process.stdout.write(`[3/6] 🪙 OVGToken ................. deploying...`);
    const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
    const ovgToken = await upgrades.deployProxy(OVGToken, [deployer.address, deployer.address, deployment.contracts.OVGForwarder.address], { kind: 'uups' });
    await ovgToken.waitForDeployment();
    const proxy = await ovgToken.getAddress();
    const impl = await upgrades.erc1967.getImplementationAddress(proxy);
    deployment.contracts.OVGToken = { proxy, implementation: impl, upgradeable: true };
    fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
    console.log(` ✅ ${formatTime(Date.now()-start)}`);
    console.log(`       └─ ${proxy}\n`);
  } else {
    console.log(`[3/6] 🪙 OVGToken ................. ✅ exists`);
    console.log(`       └─ ${deployment.contracts.OVGToken.proxy}\n`);
  }

  // 4. OVGAssets
  if (!deployment.contracts.OVGAssets?.proxy) {
    const start = Date.now();
    process.stdout.write(`[4/6] 🎨 OVGAssets ................ deploying...`);
    const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
    const ovgAssets = await upgrades.deployProxy(OVGAssets, [deployer.address, deployer.address], { kind: 'uups' });
    await ovgAssets.waitForDeployment();
    const proxy = await ovgAssets.getAddress();
    const impl = await upgrades.erc1967.getImplementationAddress(proxy);
    deployment.contracts.OVGAssets = { proxy, implementation: impl, upgradeable: true };
    fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
    console.log(` ✅ ${formatTime(Date.now()-start)}`);
    console.log(`       └─ ${proxy}\n`);
  } else {
    console.log(`[4/6] 🎨 OVGAssets ................ ✅ exists`);
    console.log(`       └─ ${deployment.contracts.OVGAssets.proxy}\n`);
  }

  // 5. OVGMarketplace
  if (!deployment.contracts.OVGMarketplace?.proxy) {
    const start = Date.now();
    process.stdout.write(`[5/6] 🏪 OVGMarketplace ........... deploying...`);
    const OVGMarketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
    const ovgMarketplace = await upgrades.deployProxy(OVGMarketplace, [deployment.contracts.OVGToken.proxy, deployment.contracts.OVGAssets.proxy, deployer.address], { kind: 'uups' });
    await ovgMarketplace.waitForDeployment();
    const proxy = await ovgMarketplace.getAddress();
    const impl = await upgrades.erc1967.getImplementationAddress(proxy);
    deployment.contracts.OVGMarketplace = { proxy, implementation: impl, upgradeable: true };
    fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
    console.log(` ✅ ${formatTime(Date.now()-start)}`);
    console.log(`       └─ ${proxy}\n`);
  } else {
    console.log(`[5/6] 🏪 OVGMarketplace ........... ✅ exists`);
    console.log(`       └─ ${deployment.contracts.OVGMarketplace.proxy}\n`);
  }

  // 6. OVGLandClaim
  if (!deployment.contracts.OVGLandClaim?.proxy) {
    const start = Date.now();
    process.stdout.write(`[6/6] 🌍 OVGLandClaim ............. deploying...`);
    const OVGLandClaim = await ethers.getContractFactory("OVGLandClaimUpgradeable");
    const ovgLandClaim = await upgrades.deployProxy(OVGLandClaim, [deployment.contracts.OVGAssets.proxy, deployer.address], { kind: 'uups' });
    await ovgLandClaim.waitForDeployment();
    const proxy = await ovgLandClaim.getAddress();
    const impl = await upgrades.erc1967.getImplementationAddress(proxy);
    deployment.contracts.OVGLandClaim = { proxy, implementation: impl, upgradeable: true };
    fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
    console.log(` ✅ ${formatTime(Date.now()-start)}`);
    console.log(`       └─ ${proxy}\n`);
  } else {
    console.log(`[6/6] 🌍 OVGLandClaim ............. ✅ exists`);
    console.log(`       └─ ${deployment.contracts.OVGLandClaim.proxy}\n`);
  }

  deployment.lastUpdated = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));

  const totalTime = formatTime(Date.now()-startTotal);
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║           ✅ DEPLOYMENT COMPLETE                     ║");
  console.log(`║           ⏱️  Total: ${totalTime.padEnd(30)}║`);
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  📨 OVGForwarder                                     ║`);
  console.log(`║     ${deployment.contracts.OVGForwarder.address}  ║`);
  console.log(`║  ⛽ OVGPaymaster                                     ║`);
  console.log(`║     ${deployment.contracts.OVGPaymaster.proxy}  ║`);
  console.log(`║  🪙 OVGToken                                         ║`);
  console.log(`║     ${deployment.contracts.OVGToken.proxy}  ║`);
  console.log(`║  🎨 OVGAssets                                        ║`);
  console.log(`║     ${deployment.contracts.OVGAssets.proxy}  ║`);
  console.log(`║  🏪 OVGMarketplace                                   ║`);
  console.log(`║     ${deployment.contracts.OVGMarketplace.proxy}  ║`);
  console.log(`║  🌍 OVGLandClaim                                     ║`);
  console.log(`║     ${deployment.contracts.OVGLandClaim.proxy}  ║`);
  console.log("╚══════════════════════════════════════════════════════╝");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
