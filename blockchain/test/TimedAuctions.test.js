const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Timed Auctions Tests
 * Tests for OVGMarketplaceUpgradeable V1.5.0 features:
 * - createAuction: Create a timed auction with escrow
 * - placeBidOnAuction: Place bids with auto-refund
 * - settleAuction: Settle ended auctions
 * - cancelAuction: Cancel auctions without bids
 */
describe("Timed Auctions", function () {
  let deployer, seller, bidder1, bidder2, creator, other;
  let forwarder, token, assets, marketplace;

  const ASSET_ID = 1;
  const ASSET_AMOUNT = 1;
  const MIN_BID = ethers.parseEther("10");
  const AUCTION_DURATION = 3600; // 1 hour
  const DEFAULT_ROYALTY = 500n; // 5%

  beforeEach(async function () {
    [deployer, seller, bidder1, bidder2, creator, other] = await ethers.getSigners();

    // Deploy Forwarder
    const OVGForwarder = await ethers.getContractFactory("OVGForwarder");
    forwarder = await OVGForwarder.deploy();
    await forwarder.waitForDeployment();

    // Deploy Token
    const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
    token = await upgrades.deployProxy(
      OVGToken,
      [deployer.address, deployer.address, await forwarder.getAddress()],
      { kind: 'uups' }
    );
    await token.waitForDeployment();

    // Deploy Assets
    const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
    assets = await upgrades.deployProxy(
      OVGAssets,
      [deployer.address, deployer.address],
      { kind: 'uups' }
    );
    await assets.waitForDeployment();

    // Deploy Marketplace
    const OVGMarketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
    marketplace = await upgrades.deployProxy(
      OVGMarketplace,
      [await token.getAddress(), await assets.getAddress(), deployer.address],
      { kind: 'uups' }
    );
    await marketplace.waitForDeployment();

    // Initialize V1.3 for token support and V1.5 for auctions
    await marketplace.initializeV1_3([]);
    await marketplace.initializeV1_5();

    // Setup: Mint tokens to bidders
    await token.transfer(bidder1.address, ethers.parseEther("10000"));
    await token.transfer(bidder2.address, ethers.parseEther("10000"));

    // Setup: Mint asset to seller
    await assets.mint(seller.address, ASSET_ID, ASSET_AMOUNT, "0x");
    await assets.setRoyalty(ASSET_ID, creator.address, DEFAULT_ROYALTY);

    // Setup: Seller approves marketplace for asset transfers
    await assets.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

    // Setup: Bidders approve marketplace for token spending
    await token.connect(bidder1).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await token.connect(bidder2).approve(await marketplace.getAddress(), ethers.MaxUint256);
  });

  describe("createAuction", function () {
    it("Should create auction with valid parameters", async function () {
      const tx = await marketplace.connect(seller).createAuction(
        ASSET_ID,
        ASSET_AMOUNT,
        MIN_BID,
        AUCTION_DURATION,
        await token.getAddress()
      );

      const receipt = await tx.wait();
      const auction = await marketplace.getAuction(0);

      expect(auction.seller).to.equal(seller.address);
      expect(auction.assetId).to.equal(ASSET_ID);
      expect(auction.amount).to.equal(ASSET_AMOUNT);
      expect(auction.minBid).to.equal(MIN_BID);
      expect(auction.highestBidder).to.equal(ethers.ZeroAddress);
      expect(auction.highestBid).to.equal(0);
      expect(auction.settled).to.equal(false);
    });

    it("Should escrow asset in contract", async function () {
      await marketplace.connect(seller).createAuction(
        ASSET_ID,
        ASSET_AMOUNT,
        MIN_BID,
        AUCTION_DURATION,
        await token.getAddress()
      );

      expect(await assets.balanceOf(seller.address, ASSET_ID)).to.equal(0);
      expect(await assets.balanceOf(await marketplace.getAddress(), ASSET_ID)).to.equal(ASSET_AMOUNT);
    });

    it("Should emit AuctionCreated event", async function () {
      const blockTime = await time.latest();
      const expectedEndTime = blockTime + AUCTION_DURATION + 1;

      await expect(
        marketplace.connect(seller).createAuction(
          ASSET_ID,
          ASSET_AMOUNT,
          MIN_BID,
          AUCTION_DURATION,
          await token.getAddress()
        )
      ).to.emit(marketplace, "AuctionCreated");
    });

    it("Should revert if duration too short (< 5 min)", async function () {
      await expect(
        marketplace.connect(seller).createAuction(
          ASSET_ID,
          ASSET_AMOUNT,
          MIN_BID,
          299, // Less than 300 seconds
          await token.getAddress()
        )
      ).to.be.revertedWith("Duration too short");
    });

    it("Should revert if duration too long (> 30 days)", async function () {
      const thirtyOneDays = 31 * 24 * 3600;
      await expect(
        marketplace.connect(seller).createAuction(
          ASSET_ID,
          ASSET_AMOUNT,
          MIN_BID,
          thirtyOneDays,
          await token.getAddress()
        )
      ).to.be.revertedWith("Duration too long");
    });

    it("Should revert if minBid is 0", async function () {
      await expect(
        marketplace.connect(seller).createAuction(
          ASSET_ID,
          ASSET_AMOUNT,
          0,
          AUCTION_DURATION,
          await token.getAddress()
        )
      ).to.be.revertedWith("Min bid must be > 0");
    });

    it("Should revert if invalid payment token", async function () {
      await expect(
        marketplace.connect(seller).createAuction(
          ASSET_ID,
          ASSET_AMOUNT,
          MIN_BID,
          AUCTION_DURATION,
          other.address // Not an allowed token
        )
      ).to.be.revertedWith("Token not allowed");
    });

    it("Should increment nextAuctionId", async function () {
      expect(await marketplace.nextAuctionId()).to.equal(0);

      await marketplace.connect(seller).createAuction(
        ASSET_ID,
        ASSET_AMOUNT,
        MIN_BID,
        AUCTION_DURATION,
        await token.getAddress()
      );

      expect(await marketplace.nextAuctionId()).to.equal(1);
    });
  });

  describe("placeBidOnAuction", function () {
    beforeEach(async function () {
      await marketplace.connect(seller).createAuction(
        ASSET_ID,
        ASSET_AMOUNT,
        MIN_BID,
        AUCTION_DURATION,
        await token.getAddress()
      );
    });

    it("Should place bid successfully", async function () {
      const bidAmount = ethers.parseEther("15");

      await marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount);

      const auction = await marketplace.getAuction(0);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(bidAmount);
    });

    it("Should refund previous highest bidder", async function () {
      const bid1 = ethers.parseEther("15");
      const bid2 = ethers.parseEther("20");

      await marketplace.connect(bidder1).placeBidOnAuction(0, bid1);
      const bidder1BalanceAfterBid = await token.balanceOf(bidder1.address);

      await marketplace.connect(bidder2).placeBidOnAuction(0, bid2);
      const bidder1BalanceAfterRefund = await token.balanceOf(bidder1.address);

      expect(bidder1BalanceAfterRefund - bidder1BalanceAfterBid).to.equal(bid1);
    });

    it("Should escrow new bid in contract", async function () {
      const bidAmount = ethers.parseEther("15");
      const bidder1BalanceBefore = await token.balanceOf(bidder1.address);

      await marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount);

      const bidder1BalanceAfter = await token.balanceOf(bidder1.address);
      expect(bidder1BalanceBefore - bidder1BalanceAfter).to.equal(bidAmount);
    });

    it("Should emit AuctionBidPlaced event", async function () {
      const bidAmount = ethers.parseEther("15");

      await expect(
        marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount)
      )
        .to.emit(marketplace, "AuctionBidPlaced")
        .withArgs(0, bidder1.address, bidAmount, await token.getAddress());
    });

    it("Should revert if auction ended", async function () {
      await time.increase(AUCTION_DURATION + 1);

      await expect(
        marketplace.connect(bidder1).placeBidOnAuction(0, ethers.parseEther("15"))
      ).to.be.revertedWith("Auction ended");
    });

    it("Should revert if bid below minBid", async function () {
      await expect(
        marketplace.connect(bidder1).placeBidOnAuction(0, ethers.parseEther("5"))
      ).to.be.revertedWith("Bid below minimum");
    });

    it("Should revert if bid not higher than current highest", async function () {
      await marketplace.connect(bidder1).placeBidOnAuction(0, ethers.parseEther("15"));

      await expect(
        marketplace.connect(bidder2).placeBidOnAuction(0, ethers.parseEther("15"))
      ).to.be.revertedWith("Bid increment too low");
    });

    it("Should revert if bid increment < 1%", async function () {
      const firstBid = ethers.parseEther("100");
      await marketplace.connect(bidder1).placeBidOnAuction(0, firstBid);

      // 1% of 100 = 1, so minimum next bid is 101
      const tooLowBid = ethers.parseEther("100.5");

      await expect(
        marketplace.connect(bidder2).placeBidOnAuction(0, tooLowBid)
      ).to.be.revertedWith("Bid increment too low");
    });

    it("Should accept bid with exactly 1% increment", async function () {
      const firstBid = ethers.parseEther("100");
      await marketplace.connect(bidder1).placeBidOnAuction(0, firstBid);

      // Exactly 1% increment
      const minValidBid = ethers.parseEther("101");
      await marketplace.connect(bidder2).placeBidOnAuction(0, minValidBid);

      const auction = await marketplace.getAuction(0);
      expect(auction.highestBidder).to.equal(bidder2.address);
    });

    it("Should revert if seller tries to bid", async function () {
      await expect(
        marketplace.connect(seller).placeBidOnAuction(0, ethers.parseEther("15"))
      ).to.be.revertedWith("Seller cannot bid");
    });
  });

  describe("settleAuction", function () {
    beforeEach(async function () {
      await marketplace.connect(seller).createAuction(
        ASSET_ID,
        ASSET_AMOUNT,
        MIN_BID,
        AUCTION_DURATION,
        await token.getAddress()
      );
    });

    it("Should transfer asset to winner", async function () {
      const bidAmount = ethers.parseEther("50");
      await marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount);

      await time.increase(AUCTION_DURATION + 1);
      await marketplace.settleAuction(0);

      expect(await assets.balanceOf(bidder1.address, ASSET_ID)).to.equal(ASSET_AMOUNT);
    });

    it("Should pay seller (price - royalty - fee)", async function () {
      const bidAmount = ethers.parseEther("100");
      await marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount);

      const sellerBalanceBefore = await token.balanceOf(seller.address);

      await time.increase(AUCTION_DURATION + 1);
      await marketplace.settleAuction(0);

      const sellerBalanceAfter = await token.balanceOf(seller.address);

      // 5% royalty + 2.5% fee = 7.5% deduction
      const royalty = bidAmount * 500n / 10000n;
      const fee = bidAmount * 250n / 10000n;
      const expectedSeller = bidAmount - royalty - fee;

      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSeller);
    });

    it("Should pay royalties to creator", async function () {
      const bidAmount = ethers.parseEther("100");
      await marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount);

      const creatorBalanceBefore = await token.balanceOf(creator.address);

      await time.increase(AUCTION_DURATION + 1);
      await marketplace.settleAuction(0);

      const creatorBalanceAfter = await token.balanceOf(creator.address);

      // 5% royalty
      const expectedRoyalty = bidAmount * 500n / 10000n;
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(expectedRoyalty);
    });

    it("Should pay marketplace fees", async function () {
      const bidAmount = ethers.parseEther("100");
      await marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount);

      const feeRecipient = deployer.address;
      const feeRecipientBalanceBefore = await token.balanceOf(feeRecipient);

      await time.increase(AUCTION_DURATION + 1);
      await marketplace.settleAuction(0);

      const feeRecipientBalanceAfter = await token.balanceOf(feeRecipient);

      // 2.5% fee
      const expectedFee = bidAmount * 250n / 10000n;
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFee);
    });

    it("Should emit AuctionSettled event with winner", async function () {
      const bidAmount = ethers.parseEther("100");
      await marketplace.connect(bidder1).placeBidOnAuction(0, bidAmount);

      await time.increase(AUCTION_DURATION + 1);

      const royalty = bidAmount * 500n / 10000n;
      const fee = bidAmount * 250n / 10000n;

      await expect(marketplace.settleAuction(0))
        .to.emit(marketplace, "AuctionSettled")
        .withArgs(0, seller.address, bidder1.address, bidAmount, royalty, fee);
    });

    it("Should revert if auction not ended", async function () {
      await marketplace.connect(bidder1).placeBidOnAuction(0, ethers.parseEther("15"));

      await expect(
        marketplace.settleAuction(0)
      ).to.be.revertedWith("Auction not ended");
    });

    it("Should revert if already settled", async function () {
      await marketplace.connect(bidder1).placeBidOnAuction(0, ethers.parseEther("15"));

      await time.increase(AUCTION_DURATION + 1);
      await marketplace.settleAuction(0);

      await expect(
        marketplace.settleAuction(0)
      ).to.be.revertedWith("Already settled");
    });

    it("Should return asset to seller if no bids", async function () {
      await time.increase(AUCTION_DURATION + 1);
      await marketplace.settleAuction(0);

      expect(await assets.balanceOf(seller.address, ASSET_ID)).to.equal(ASSET_AMOUNT);
      expect(await assets.balanceOf(await marketplace.getAddress(), ASSET_ID)).to.equal(0);
    });

    it("Should emit AuctionSettled with zero winner if no bids", async function () {
      await time.increase(AUCTION_DURATION + 1);

      await expect(marketplace.settleAuction(0))
        .to.emit(marketplace, "AuctionSettled")
        .withArgs(0, seller.address, ethers.ZeroAddress, 0, 0, 0);
    });

    it("Should allow anyone to settle an ended auction", async function () {
      await marketplace.connect(bidder1).placeBidOnAuction(0, ethers.parseEther("50"));

      await time.increase(AUCTION_DURATION + 1);

      // Other (not seller, not bidder) can settle
      await expect(marketplace.connect(other).settleAuction(0)).to.not.be.reverted;
    });
  });

  describe("cancelAuction", function () {
    beforeEach(async function () {
      await marketplace.connect(seller).createAuction(
        ASSET_ID,
        ASSET_AMOUNT,
        MIN_BID,
        AUCTION_DURATION,
        await token.getAddress()
      );
    });

    it("Should cancel auction with no bids", async function () {
      await marketplace.connect(seller).cancelAuction(0);

      const auction = await marketplace.getAuction(0);
      expect(auction.settled).to.equal(true);
    });

    it("Should return asset to seller", async function () {
      await marketplace.connect(seller).cancelAuction(0);

      expect(await assets.balanceOf(seller.address, ASSET_ID)).to.equal(ASSET_AMOUNT);
      expect(await assets.balanceOf(await marketplace.getAddress(), ASSET_ID)).to.equal(0);
    });

    it("Should emit AuctionCancelled event", async function () {
      await expect(marketplace.connect(seller).cancelAuction(0))
        .to.emit(marketplace, "AuctionCancelled")
        .withArgs(0, seller.address);
    });

    it("Should revert if has bids", async function () {
      await marketplace.connect(bidder1).placeBidOnAuction(0, ethers.parseEther("15"));

      await expect(
        marketplace.connect(seller).cancelAuction(0)
      ).to.be.revertedWith("Cannot cancel with bids");
    });

    it("Should revert if not seller", async function () {
      await expect(
        marketplace.connect(other).cancelAuction(0)
      ).to.be.revertedWith("Only seller can cancel");
    });

    it("Should revert if already settled", async function () {
      await marketplace.connect(seller).cancelAuction(0);

      await expect(
        marketplace.connect(seller).cancelAuction(0)
      ).to.be.revertedWith("Already settled");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await marketplace.connect(seller).createAuction(
        ASSET_ID,
        ASSET_AMOUNT,
        MIN_BID,
        AUCTION_DURATION,
        await token.getAddress()
      );
    });

    it("getAuction should return correct auction data", async function () {
      const auction = await marketplace.getAuction(0);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.assetId).to.equal(ASSET_ID);
    });

    it("isAuctionActive should return true for active auctions", async function () {
      expect(await marketplace.isAuctionActive(0)).to.equal(true);
    });

    it("isAuctionActive should return false for ended auctions", async function () {
      await time.increase(AUCTION_DURATION + 1);
      expect(await marketplace.isAuctionActive(0)).to.equal(false);
    });

    it("isAuctionActive should return false for settled auctions", async function () {
      await time.increase(AUCTION_DURATION + 1);
      await marketplace.settleAuction(0);
      expect(await marketplace.isAuctionActive(0)).to.equal(false);
    });

    it("getAuctionTimeRemaining should return correct time", async function () {
      const remaining = await marketplace.getAuctionTimeRemaining(0);
      expect(remaining).to.be.closeTo(BigInt(AUCTION_DURATION), 5n);
    });

    it("getAuctionTimeRemaining should return 0 for ended auction", async function () {
      await time.increase(AUCTION_DURATION + 1);
      expect(await marketplace.getAuctionTimeRemaining(0)).to.equal(0);
    });
  });

  describe("Constants", function () {
    it("MIN_AUCTION_DURATION should be 300 (5 minutes)", async function () {
      expect(await marketplace.MIN_AUCTION_DURATION()).to.equal(300);
    });

    it("MAX_AUCTION_DURATION should be 30 days", async function () {
      const thirtyDays = 30 * 24 * 3600;
      expect(await marketplace.MAX_AUCTION_DURATION()).to.equal(thirtyDays);
    });

    it("MIN_BID_INCREMENT should be 100 (1%)", async function () {
      expect(await marketplace.MIN_BID_INCREMENT()).to.equal(100);
    });
  });

  describe("Version", function () {
    it("Should return 1.5.0", async function () {
      expect(await marketplace.version()).to.equal("1.5.0");
    });
  });
});
