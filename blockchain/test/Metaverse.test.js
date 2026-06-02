const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OVGrid Metaverse Infrastructure", function () {
  let ovgToken, ovgAssets, ovgMarketplace, forwarder;
  let owner, minter, buyer, user;

  beforeEach(async function () {
    [owner, minter, buyer, user] = await ethers.getSigners();

    // Deploy Forwarder first
    const Forwarder = await ethers.getContractFactory("OVGForwarder");
    forwarder = await Forwarder.deploy();
    await forwarder.waitForDeployment();

    const Token = await ethers.getContractFactory("OVGToken");
    ovgToken = await Token.deploy(owner.address, minter.address, await forwarder.getAddress());

    const Assets = await ethers.getContractFactory("OVGAssets");
    ovgAssets = await Assets.deploy(owner.address, minter.address);

    const Marketplace = await ethers.getContractFactory("OVGMarketplace");
    ovgMarketplace = await Marketplace.deploy(
      await ovgToken.getAddress(), 
      await ovgAssets.getAddress(), 
      owner.address
    );

    await ovgToken.connect(minter).mint(buyer.address, ethers.parseEther("1000"));
  });

  describe("OVGToken", function () {
    it("Should have correct name and symbol", async function () {
      expect(await ovgToken.name()).to.equal("OVGrid Token");
      expect(await ovgToken.symbol()).to.equal("OVG");
    });
  });

  describe("OVGAssets", function () {
    it("Should allow minter to mint assets", async function () {
      const assetId = 1;
      await ovgAssets.connect(minter).mint(owner.address, assetId, 1, "0x");
      expect(await ovgAssets.balanceOf(owner.address, assetId)).to.equal(1);
    });
  });

  describe("OVGMarketplace", function () {
    it("Should allow listing and purchasing an asset", async function () {
      const assetId = 2;
      const price = ethers.parseEther("100");

      await ovgAssets.connect(minter).mint(owner.address, assetId, 1, "0x");
      await ovgAssets.setApprovalForAll(await ovgMarketplace.getAddress(), true);
      await ovgMarketplace.listAsset(assetId, 1, price, false, 0);

      await ovgToken.connect(buyer).approve(await ovgMarketplace.getAddress(), price);
      await ovgMarketplace.connect(buyer).purchase(0);

      expect(await ovgAssets.balanceOf(buyer.address, assetId)).to.equal(1);
    });
  });
});
