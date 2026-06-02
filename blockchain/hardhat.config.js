require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const POLYGON_MAINNET_RPC = process.env.POLYGON_MAINNET_RPC || "https://polygon-rpc.com";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    polygonAmoy: {
      url: process.env.POLYGON_AMOY_RPC || "https://polygon-amoy.drpc.org",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      timeout: 120000,
    },
    polygonMainnet: {
      url: POLYGON_MAINNET_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      timeout: 300000,
    },
  },
  etherscan: {
    apiKey: POLYGONSCAN_API_KEY,
    customChains: [
      {
        network: "polygonMainnet",
        chainId: 137,
        urls: {
          apiURL: "https://api.polygonscan.com/api",
          browserURL: "https://polygonscan.com"
        }
      }
    ]
  },
};
