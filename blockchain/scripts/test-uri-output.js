const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Test what uri() returns for a token
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  // Test with a sample tokenId (use one you minted)
  const TOKEN_ID = process.env.TOKEN_ID || 1010;

  const assetsAddress = "0x79f547F3E8a344D87064C15aA572a98E8d4A5c71";
  const metadataAddress = "0x8eDB11F435918371E28AC538c95Cf1b7b6505a10";

  console.log("=== Test URI Output ===\n");
  console.log("Token ID:", TOKEN_ID);

  // Check metadata contract
  const metadataAbi = [
    "function getAssetMetadata(uint256) view returns (string,string,string,string)",
    "function getAssetAttributes(uint256) view returns (string,string,string)"
  ];
  const metadata = new ethers.Contract(metadataAddress, metadataAbi, deployer);

  console.log("\n--- OVGMetadata Data ---");
  try {
    const [title, desc, imageUrl, assetUrl] = await metadata.getAssetMetadata(TOKEN_ID);
    console.log("Title:", title || "(empty)");
    console.log("Description:", desc || "(empty)");
    console.log("Image URL:", imageUrl || "(empty)");
    console.log("Asset URL:", assetUrl || "(empty)");
  } catch (e) {
    console.log("getAssetMetadata error:", e.message);
  }

  try {
    const [rarity, category, collection] = await metadata.getAssetAttributes(TOKEN_ID);
    console.log("Rarity:", rarity || "(empty)");
    console.log("Category:", category || "(empty)");
    console.log("Collection:", collection || "(empty)");
  } catch (e) {
    console.log("getAssetAttributes error:", e.message);
  }

  // Check uri() output
  const assetsAbi = ["function uri(uint256) view returns (string)"];
  const assets = new ethers.Contract(assetsAddress, assetsAbi, deployer);

  console.log("\n--- OVGAssets.uri() Output ---");
  const uriResult = await assets.uri(TOKEN_ID);
  console.log("Raw URI (first 200 chars):", uriResult.substring(0, 200));

  // Decode if it's a data URI
  if (uriResult.startsWith("data:application/json;base64,")) {
    const base64 = uriResult.replace("data:application/json;base64,", "");
    const json = Buffer.from(base64, "base64").toString("utf8");
    console.log("\n--- Decoded JSON ---");
    console.log(json);

    // Validate JSON
    try {
      const parsed = JSON.parse(json);
      console.log("\n--- Parsed JSON (formatted) ---");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log("JSON parse error:", e.message);
    }
  } else {
    console.log("\nNot a base64 data URI");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
