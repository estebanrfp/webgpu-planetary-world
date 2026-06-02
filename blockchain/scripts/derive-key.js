/**
 * Utility to derive private key from mnemonic
 * Run with: node derive-key.js "your mnemonic phrase here"
 */
const { ethers } = require("ethers");

const mnemonic = process.argv[2];

if (!mnemonic) {
    console.error("Error: Please provide your mnemonic phrase as an argument.");
    console.log('Example: node derive-key.js "word1 word2 ... word12"');
    process.exit(1);
}

try {
    const wallet = ethers.Wallet.fromPhrase(mnemonic);
    console.log("\n====================================================");
    console.log("Account Address: ", wallet.address);
    console.log("Private Key:     ", wallet.privateKey);
    console.log("====================================================\n");
    console.log("IMPORTANT: Copy the Private Key to your blockchain/.env file.");
    console.log("NEVER share this key with anyone!");
} catch (e) {
    console.error("Error deriving key:", e.message);
}
