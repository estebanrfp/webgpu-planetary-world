const hre = require("hardhat");
const { ethers } = require("hardhat");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Burn all tokens from OVGAssets collection on mainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;

  console.log("=== Burn All Tokens ===");
  console.log("Network:", network);
  console.log("Account:", deployer.address);
  console.log("");

  const assetsAddress = network === "polygonMainnet"
    ? "0x79f547F3E8a344D87064C15aA572a98E8d4A5c71"
    : "0xD55d5049e597BA431d5C2b5c1f286532f0E0C195";

  const assetsAbi = [
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function burn(address account, uint256 id, uint256 value)"
  ];

  const assets = new ethers.Contract(assetsAddress, assetsAbi, deployer);
  console.log("OVGAssets:", assetsAddress);
  console.log("");

  // Token IDs from OpenSea screenshot (1000-1009 range + any others)
  const possibleIds = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012];

  console.log("Checking balances...");
  const toBurn = [];

  for (const id of possibleIds) {
    await sleep(500); // Avoid rate limit
    try {
      const balance = await assets.balanceOf(deployer.address, id);
      if (balance > 0n) {
        console.log(`  Token #${id}: balance = ${balance}`);
        toBurn.push({ id, balance });
      }
    } catch (e) {
      // Skip
    }
  }

  console.log(`\nFound ${toBurn.length} tokens to burn\n`);

  if (toBurn.length === 0) {
    console.log("Nothing to burn!");
    return;
  }

  // Burn each token
  for (const { id, balance } of toBurn) {
    console.log(`Burning token #${id}...`);
    try {
      const tx = await assets.burn(deployer.address, id, balance);
      console.log(`  TX: ${tx.hash}`);
      await tx.wait();
      console.log(`  Done!`);
      await sleep(2000); // Wait between burns
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }

  console.log("\n=== Complete! ===");
  console.log("OpenSea will update in a few minutes.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
