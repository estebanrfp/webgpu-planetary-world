const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Upload metadata JSON to Pinata IPFS and set the IPFS URL on contract
 *
 * Usage:
 *   TOKEN_ID=1 NAME="My NFT" IMAGE_URL="https://..." npx hardhat run scripts/upload-and-set-metadata.js --network polygonMainnet
 *
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
async function main() {
  const tokenId = process.env.TOKEN_ID || "1";
  const name = process.env.NAME || `OVGrid Asset #${tokenId}`;
  const description = process.env.DESCRIPTION || '';
  const imageUrl = process.env.IMAGE_URL;

  if (!imageUrl) {
    console.log("Usage: TOKEN_ID=1 NAME='My NFT' IMAGE_URL='https://...' npx hardhat run scripts/upload-and-set-metadata.js --network polygonMainnet");
    process.exit(1);
  }

  // Load Pinata JWT from .env
  const PINATA_JWT = process.env.PINATA_JWT;
  if (!PINATA_JWT) {
    console.error("Error: PINATA_JWT not found in .env");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("====================================================");
  console.log("Upload & Set Metadata on:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("====================================================");
  console.log(`Token ID: ${tokenId}`);
  console.log(`Name: ${name}`);
  console.log(`Description: ${description}`);
  console.log(`Image URL: ${imageUrl}`);
  console.log("====================================================");

  // Step 1: Upload JSON to Pinata IPFS
  console.log("\n[1/3] Uploading metadata to Pinata IPFS...");

  const metadata = {
    pinataContent: {
      name,
      description,
      image: imageUrl
    },
    pinataMetadata: {
      name: `OVGrid-Asset-${tokenId}`
    }
  };

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinata upload failed: ${error}`);
  }

  const result = await response.json();
  if (!result.IpfsHash) {
    throw new Error(`Pinata upload failed: ${JSON.stringify(result)}`);
  }

  const ipfsUrl = `ipfs://${result.IpfsHash}`;
  console.log(`  CID: ${result.IpfsHash}`);
  console.log(`  IPFS URL: ${ipfsUrl}`);
  console.log(`  Gateway: https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`);

  // Step 2: Set token metadata URL on contract
  console.log("\n[2/3] Setting token metadata URL on contract...");

  const deploymentsDir = path.join(__dirname, "../deployments");
  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-upgradeable.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  const assetsProxy = deployment.contracts.OVGAssets.proxy;
  console.log(`  OVGAssets proxy: ${assetsProxy}`);

  const assets = await ethers.getContractAt("OVGAssetsUpgradeable", assetsProxy);

  const version = await assets.version();
  console.log(`  Contract version: ${version}`);

  const tx = await assets.setTokenMetadataUrl(BigInt(tokenId), ipfsUrl);
  console.log(`  Transaction: ${tx.hash}`);
  await tx.wait();
  console.log("  URL set successfully!");

  // Step 3: Verify
  console.log("\n[3/3] Verifying...");

  const storedUrl = await assets.getTokenMetadataUrl(BigInt(tokenId));
  console.log(`  Stored URL: ${storedUrl}`);

  const uriResult = await assets.uri(BigInt(tokenId));
  console.log(`  uri(${tokenId}): ${uriResult}`);

  console.log("\n====================================================");
  console.log("DONE! Polygonscan should now display the NFT image.");
  console.log(`Check: https://polygonscan.com/nft/${assetsProxy}/${tokenId}`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
