const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OVGMarketplace Bidding System", function () {
  let ovgToken, ovgAssets, ovgMarketplace;
  let owner, seller, bidder, other;
  const INITIAL_MINT = ethers.parseEther("1000");
  const ASSET_ID = 1;
  const ASSET_AMOUNT = 10;
  const LISTING_PRICE = ethers.parseEther("100");
  const BID_PRICE = ethers.parseEther("80");

  beforeEach(async function () {
    [owner, seller, bidder, other] = await ethers.getSigners();

    const Forwarder = await ethers.getContractFactory("OVGForwarder");
    const forwarder = await Forwarder.deploy();

    const Token = await ethers.getContractFactory("OVGToken");
    ovgToken = await Token.deploy(owner.address, owner.address, forwarder.target);

    const Assets = await ethers.getContractFactory("OVGAssets");
    ovgAssets = await Assets.deploy(owner.address, owner.address);

    const Marketplace = await ethers.getContractFactory("OVGMarketplace");
    ovgMarketplace = await Marketplace.deploy(ovgToken.target, ovgAssets.target, owner.address);

    // Setup: Mint tokens and assets
    await ovgToken.mint(bidder.address, INITIAL_MINT);
    await ovgToken.mint(other.address, INITIAL_MINT);
    await ovgAssets.mint(seller.address, ASSET_ID, ASSET_AMOUNT, "0x");

    // Approve Marketplace for assets
    await ovgAssets.connect(seller).setApprovalForAll(ovgMarketplace.target, true);
  });

  describe("placeBid", function () {
    beforeEach(async function () {
      // Create a sale listing
      await ovgMarketplace.connect(seller).listAsset(ASSET_ID, ASSET_AMOUNT, LISTING_PRICE, false, 0);
    });

    it("Should allow placing a bid and escrowing tokens", async function () {
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE);
      
      const tx = await ovgMarketplace.connect(bidder).placeBid(0, BID_PRICE);
      await expect(tx).to.emit(ovgMarketplace, "BidPlaced").withArgs(0, bidder.address, BID_PRICE);

      expect(await ovgToken.balanceOf(ovgMarketplace.target)).to.equal(BID_PRICE);
      expect(await ovgToken.balanceOf(bidder.address)).to.equal(INITIAL_MINT - BID_PRICE);
      
      const bid = await ovgMarketplace.bids(0, bidder.address);
      expect(bid.price).to.equal(BID_PRICE);
    });

    it("Should refund old bid when placing a new one", async function () {
      const NEW_BID_PRICE = ethers.parseEther("90");
      
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE + NEW_BID_PRICE);
      await ovgMarketplace.connect(bidder).placeBid(0, BID_PRICE);
      
      // Place new bid
      await ovgMarketplace.connect(bidder).placeBid(0, NEW_BID_PRICE);
      
      expect(await ovgToken.balanceOf(ovgMarketplace.target)).to.equal(NEW_BID_PRICE);
      expect(await ovgToken.balanceOf(bidder.address)).to.equal(INITIAL_MINT - NEW_BID_PRICE);
    });

    it("Should revert if seller tries to bid on their own listing", async function () {
      await expect(
        ovgMarketplace.connect(seller).placeBid(0, BID_PRICE)
      ).to.be.revertedWith("Seller cannot bid");
    });

    it("Should revert if bidding on a rental", async function () {
      await ovgMarketplace.connect(seller).listAsset(ASSET_ID, 1, LISTING_PRICE, true, 86400);
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE);
      
      await expect(
        ovgMarketplace.connect(bidder).placeBid(1, BID_PRICE)
      ).to.be.revertedWith("Cannot bid on rentals");
    });
  });

  describe("acceptBid", function () {
    beforeEach(async function () {
      await ovgMarketplace.connect(seller).listAsset(ASSET_ID, ASSET_AMOUNT, LISTING_PRICE, false, 0);
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE);
      await ovgMarketplace.connect(bidder).placeBid(0, BID_PRICE);
    });

    it("Should transfer tokens to seller and asset to bidder on acceptance", async function () {
      const sellerBalanceBefore = await ovgToken.balanceOf(seller.address);
      
      const tx = await ovgMarketplace.connect(seller).acceptBid(0, bidder.address);
      await expect(tx).to.emit(ovgMarketplace, "BidAccepted")
        .withArgs(0, seller.address, bidder.address, BID_PRICE, 0);

      expect(await ovgToken.balanceOf(seller.address)).to.equal(sellerBalanceBefore + BID_PRICE);
      expect(await ovgAssets.balanceOf(bidder.address, ASSET_ID)).to.equal(1);
      
      // Bid should be cleared
      const bid = await ovgMarketplace.bids(0, bidder.address);
      expect(bid.price).to.equal(0);
    });

    it("Should revert if caller is not the seller", async function () {
      await expect(
        ovgMarketplace.connect(other).acceptBid(0, bidder.address)
      ).to.be.revertedWith("Only seller can accept");
    });

    it("Should revert if bid does not exist", async function () {
      await expect(
        ovgMarketplace.connect(seller).acceptBid(0, other.address)
      ).to.be.revertedWith("Bid does not exist");
    });
  });

  describe("withdrawBid", function () {
    beforeEach(async function () {
      await ovgMarketplace.connect(seller).listAsset(ASSET_ID, ASSET_AMOUNT, LISTING_PRICE, false, 0);
      await ovgToken.connect(bidder).approve(ovgMarketplace.target, BID_PRICE);
      await ovgMarketplace.connect(bidder).placeBid(0, BID_PRICE);
    });

    it("Should refund tokens to bidder on withdrawal", async function () {
      const tx = await ovgMarketplace.connect(bidder).withdrawBid(0);
      await expect(tx).to.emit(ovgMarketplace, "BidWithdrawn").withArgs(0, bidder.address);

      expect(await ovgToken.balanceOf(bidder.address)).to.equal(INITIAL_MINT);
      expect(await ovgToken.balanceOf(ovgMarketplace.target)).to.equal(0);
      
      const bid = await ovgMarketplace.bids(0, bidder.address);
      expect(bid.price).to.equal(0);
    });

    it("Should revert if no bid exists to withdraw", async function () {
      await expect(
        ovgMarketplace.connect(other).withdrawBid(0)
      ).to.be.revertedWith("Bid does not exist");
    });
  });
});
