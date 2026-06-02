const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Set OVGMetadata contract address on OVGAssets (testnet)
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  const assetsAddress = '0xD55d5049e597BA431d5C2b5c1f286532f0E0C195';
  const metadataAddress = '0x51f36d3A3491551c92D5cE087FF22Cc5010b6B0A';

  console.log("Setting metadataContract on OVGAssets...");
  console.log("  OVGAssets:", assetsAddress);
  console.log("  OVGMetadata:", metadataAddress);
  console.log("  Deployer:", deployer.address);

  const assetsAbi = [
    "function setMetadataContract(address _metadataContract) external",
    "function metadataContract() view returns (address)"
  ];

  const assets = new ethers.Contract(assetsAddress, assetsAbi, deployer);

  const current = await assets.metadataContract();
  console.log("\nCurrent metadataContract:", current);

  if (current === metadataAddress) {
    console.log("Already set correctly!");
    return;
  }

  const tx = await assets.setMetadataContract(metadataAddress);
  console.log("TX Hash:", tx.hash);
  await tx.wait();

  const updated = await assets.metadataContract();
  console.log("Updated metadataContract:", updated);
  console.log("\nDone!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
