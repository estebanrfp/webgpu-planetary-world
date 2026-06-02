const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OVGMarketplace Evolution Features", function () {
  let ovgToken, ovgAssets, ovgMarketplace, forwarder;
  let owner, seller, bidder, other;
  
  const INITIAL_MINT = ethers.parseEther("1000");
  const ASSET_ID_1 = 1;
  const ASSET_ID_2 = 2;
  const BID_PRICE = ethers.parseEther("50");
  const BUNDLE_PRICE = ethers.parseEther("150");

  beforeEach(async function () {
    [owner, seller, bidder, other] = await ethers.getSigners();

    const Forwarder = await ethers.getContractFactory("OVGForwarder");
    forwarder = await Forwarder.deploy();

    const Token = await ethers.getContractFactory("OVGToken");
    ovgToken = await Token.deploy(owner.address, owner.address, forwarder.target);

    const Assets = await ethers.getContractFactory("OVGAssets");
    ovgAssets = await Assets.deploy(owner.address, owner.address);

    const Marketplace = await ethers.getContractFactory("OVGMarketplace");
    ovgMarketplace = await Marketplace.deploy(ovgToken.target, ovgAssets.target, owner.address);

    // Initial setup
    await ovgToken.mint(bidder.address, INITIAL_MINT);
    await ovgAssets.mint(seller.address, ASSET_ID_1, 10, "0x");
    await ovgAssets.mint(seller.address, ASSET_ID_2, 10, "0x");
    
    await ovgAssets.connect(seller).setApprovalForAll(ovgMarketplace.target, true);
  });

  describe("Global Bidding (Unlisted Assets)", function () {
    it("Should allow placing a global bid on an asset ID", async function () {
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE);
      
      const tx = await ovgMarketplace.connect(bidder).placeGlobalBid(ASSET_ID_1, BID_PRICE);
      await expect(tx).to.emit(ovgMarketplace, "GlobalBidPlaced").withArgs(ASSET_ID_1, bidder.address, BID_PRICE);
      
      const bid = await ovgMarketplace.globalBids(ASSET_ID_1, bidder.address);
      expect(bid.price).to.equal(BID_PRICE);
      expect(await ovgToken.balanceOf(ovgMarketplace.target)).to.equal(BID_PRICE);
    });

    it("Should allow a seller to accept a global bid", async function () {
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE);
      await ovgMarketplace.connect(bidder).placeGlobalBid(ASSET_ID_1, BID_PRICE);
      
      const sellerBalanceBefore = await ovgToken.balanceOf(seller.address);
      
      const tx = await ovgMarketplace.connect(seller).acceptGlobalBid(ASSET_ID_1, bidder.address);
      await expect(tx).to.emit(ovgMarketplace, "GlobalBidAccepted").withArgs(ASSET_ID_1, seller.address, bidder.address, BID_PRICE, 0);
      
      expect(await ovgToken.balanceOf(seller.address)).to.equal(sellerBalanceBefore + BID_PRICE);
      expect(await ovgAssets.balanceOf(bidder.address, ASSET_ID_1)).to.equal(1);
    });

    it("Should allow withdrawing a global bid", async function () {
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE);
      await ovgMarketplace.connect(bidder).placeGlobalBid(ASSET_ID_1, BID_PRICE);
      
      await ovgMarketplace.connect(bidder).withdrawGlobalBid(ASSET_ID_1);
      expect(await ovgToken.balanceOf(bidder.address)).to.equal(INITIAL_MINT);
    });
  });

  describe("Bundles (Multi-Asset Listings)", function () {
    const assetIds = [ASSET_ID_1, ASSET_ID_2];
    const amounts = [1, 2];

    it("Should allow listing a bundle", async function () {
      const tx = await ovgMarketplace.connect(seller).listBundle(assetIds, amounts, BUNDLE_PRICE);
      await expect(tx).to.emit(ovgMarketplace, "BundleListed").withArgs(0, seller.address, assetIds, BUNDLE_PRICE);
      
      const bundle = await ovgMarketplace.bundleListings(0);
      expect(bundle.seller).to.equal(seller.address);
      expect(bundle.price).to.equal(BUNDLE_PRICE);
      expect(bundle.active).to.be.true;
    });

    it("Should allow purchasing a bundle", async function () {
      await ovgMarketplace.connect(seller).listBundle(assetIds, amounts, BUNDLE_PRICE);
      
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BUNDLE_PRICE);
      const tx = await ovgMarketplace.connect(bidder).purchaseBundle(0);
      
      await expect(tx).to.emit(ovgMarketplace, "BundlePurchased").withArgs(0, bidder.address, BUNDLE_PRICE);
      
      expect(await ovgAssets.balanceOf(bidder.address, ASSET_ID_1)).to.equal(1);
      expect(await ovgAssets.balanceOf(bidder.address, ASSET_ID_2)).to.equal(2);
      expect(await ovgToken.balanceOf(seller.address)).to.equal(BUNDLE_PRICE);
    });

    it("Should allow cancelling a bundle", async function () {
      await ovgMarketplace.connect(seller).listBundle(assetIds, amounts, BUNDLE_PRICE);
      await ovgMarketplace.connect(seller).cancelBundle(0);
      
      const bundle = await ovgMarketplace.bundleListings(0);
      expect(bundle.active).to.be.false;
      
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BUNDLE_PRICE);
      await expect(
        ovgMarketplace.connect(bidder).purchaseBundle(0)
      ).to.be.revertedWith("Bundle not active");
    });
  });
});
