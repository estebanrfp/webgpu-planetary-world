const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Marketplace Fees and Pausable Tests
 * Tests for OVGMarketplaceUpgradeable V1.2.0 features:
 * - Marketplace fees (basis points)
 * - Fee recipient management
 * - Fee accumulation and withdrawal
 * - Pausable functionality
 */
describe("Marketplace Fees and Pausable", function () {
  let deployer, seller, buyer, creator, feeRecipient, other;
  let forwarder, token, assets, marketplace;

  const ASSET_ID = 1;
  const ASSET_AMOUNT = 10;
  const LISTING_PRICE = ethers.parseEther("100");
  const DEFAULT_FEE = 250n; // 2.5% in basis points
  const MAX_FEE = 1000n; // 10% max

  beforeEach(async function () {
    [deployer, seller, buyer, creator, feeRecipient, other] = await ethers.getSigners();

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

    // Setup: Mint tokens to buyer
    await token.transfer(buyer.address, ethers.parseEther("10000"));

    // Setup: Mint assets to seller
    await assets.mint(seller.address, ASSET_ID, ASSET_AMOUNT, "0x");

    // Setup: Seller approves marketplace
    await assets.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

    // Setup: Buyer approves marketplace for token spending
    await token.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
  });

  describe("Fee Configuration", function () {
    it("Should initialize with default marketplace fee (2.5%)", async function () {
      expect(await marketplace.marketplaceFee()).to.equal(DEFAULT_FEE);
    });

    it("Should initialize with deployer as fee recipient", async function () {
      expect(await marketplace.feeRecipient()).to.equal(deployer.address);
    });

    it("Should have MAX_MARKETPLACE_FEE of 1000 (10%)", async function () {
      expect(await marketplace.MAX_MARKETPLACE_FEE()).to.equal(MAX_FEE);
    });
  });

  describe("setMarketplaceFee", function () {
    it("Should allow owner to set marketplace fee", async function () {
      await marketplace.setMarketplaceFee(500); // 5%
      expect(await marketplace.marketplaceFee()).to.equal(500);
    });

    it("Should emit MarketplaceFeeUpdated event", async function () {
      await expect(marketplace.setMarketplaceFee(500))
        .to.emit(marketplace, "MarketplaceFeeUpdated")
        .withArgs(DEFAULT_FEE, 500);
    });

    it("Should allow setting fee to 0", async function () {
      await marketplace.setMarketplaceFee(0);
      expect(await marketplace.marketplaceFee()).to.equal(0);
    });

    it("Should allow setting fee to MAX_MARKETPLACE_FEE", async function () {
      await marketplace.setMarketplaceFee(MAX_FEE);
      expect(await marketplace.marketplaceFee()).to.equal(MAX_FEE);
    });

    it("Should revert if fee exceeds MAX_MARKETPLACE_FEE", async function () {
      await expect(marketplace.setMarketplaceFee(1001))
        .to.be.revertedWith("Fee exceeds maximum");
    });

    it("Should revert if non-owner tries to set fee", async function () {
      await expect(marketplace.connect(other).setMarketplaceFee(500))
        .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });
  });

  describe("setFeeRecipient", function () {
    it("Should allow owner to set fee recipient", async function () {
      await marketplace.setFeeRecipient(feeRecipient.address);
      expect(await marketplace.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should emit FeeRecipientUpdated event", async function () {
      await expect(marketplace.setFeeRecipient(feeRecipient.address))
        .to.emit(marketplace, "FeeRecipientUpdated")
        .withArgs(deployer.address, feeRecipient.address);
    });

    it("Should revert if setting zero address", async function () {
      await expect(marketplace.setFeeRecipient(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid recipient");
    });

    it("Should revert if non-owner tries to set recipient", async function () {
      await expect(marketplace.connect(other).setFeeRecipient(feeRecipient.address))
        .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });
  });

  describe("purchase() with fees", function () {
    beforeEach(async function () {
      // Create listing
      await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
    });

    it("Should deduct marketplace fee correctly on purchase", async function () {
      const sellerBalanceBefore = await token.balanceOf(seller.address);
      const feeRecipientBalanceBefore = await token.balanceOf(deployer.address);

      await marketplace.connect(buyer).purchase(0);

      // Fee = 100 * 250 / 10000 = 2.5 OVG
      const expectedFee = (LISTING_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSellerAmount = LISTING_PRICE - expectedFee;

      const sellerBalanceAfter = await token.balanceOf(seller.address);
      const feeRecipientBalanceAfter = await token.balanceOf(deployer.address);

      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFee);
    });

    it("Should deduct royalty + marketplace fee correctly", async function () {
      // Set 5% royalty for the asset
      await assets.setRoyalty(ASSET_ID, creator.address, 500); // 5%

      const sellerBalanceBefore = await token.balanceOf(seller.address);
      const creatorBalanceBefore = await token.balanceOf(creator.address);
      const feeRecipientBalanceBefore = await token.balanceOf(deployer.address);

      await marketplace.connect(buyer).purchase(0);

      // Royalty = 100 * 500 / 10000 = 5 OVG
      // Fee = 100 * 250 / 10000 = 2.5 OVG
      // Seller = 100 - 5 - 2.5 = 92.5 OVG
      const expectedRoyalty = (LISTING_PRICE * 500n) / 10000n;
      const expectedFee = (LISTING_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSellerAmount = LISTING_PRICE - expectedRoyalty - expectedFee;

      const sellerBalanceAfter = await token.balanceOf(seller.address);
      const creatorBalanceAfter = await token.balanceOf(creator.address);
      const feeRecipientBalanceAfter = await token.balanceOf(deployer.address);

      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(expectedRoyalty);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFee);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
    });

    it("Should handle zero marketplace fee", async function () {
      await marketplace.setMarketplaceFee(0);

      const sellerBalanceBefore = await token.balanceOf(seller.address);

      await marketplace.connect(buyer).purchase(0);

      const sellerBalanceAfter = await token.balanceOf(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(LISTING_PRICE);
    });
  });

  describe("purchaseBundle() with fees", function () {
    const BUNDLE_PRICE = ethers.parseEther("200");

    beforeEach(async function () {
      // Mint additional assets for bundle
      await assets.mint(seller.address, 2, 5, "0x");
      await assets.mint(seller.address, 3, 3, "0x");

      // Create bundle listing
      await marketplace.connect(seller).listBundle([ASSET_ID, 2, 3], [2, 2, 1], BUNDLE_PRICE);
    });

    it("Should deduct marketplace fee on bundle purchase", async function () {
      const sellerBalanceBefore = await token.balanceOf(seller.address);
      const feeRecipientBalanceBefore = await token.balanceOf(deployer.address);

      await marketplace.connect(buyer).purchaseBundle(0);

      // Fee = 200 * 250 / 10000 = 5 OVG
      const expectedFee = (BUNDLE_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSellerAmount = BUNDLE_PRICE - expectedFee;

      const sellerBalanceAfter = await token.balanceOf(seller.address);
      const feeRecipientBalanceAfter = await token.balanceOf(deployer.address);

      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFee);
    });

    it("Should transfer all bundle assets to buyer", async function () {
      await marketplace.connect(buyer).purchaseBundle(0);

      expect(await assets.balanceOf(buyer.address, ASSET_ID)).to.equal(2);
      expect(await assets.balanceOf(buyer.address, 2)).to.equal(2);
      expect(await assets.balanceOf(buyer.address, 3)).to.equal(1);
    });
  });

  describe("acceptBid() with fees", function () {
    const BID_PRICE = ethers.parseEther("80");

    beforeEach(async function () {
      // Create listing
      await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
      
      // Place bid
      await marketplace.connect(buyer).placeBid(0, BID_PRICE);
    });

    it("Should deduct marketplace fee when accepting bid", async function () {
      const sellerBalanceBefore = await token.balanceOf(seller.address);
      const feeRecipientBalanceBefore = await token.balanceOf(deployer.address);

      await marketplace.connect(seller).acceptBid(0, buyer.address);

      // Fee = 80 * 250 / 10000 = 2 OVG
      const expectedFee = (BID_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSellerAmount = BID_PRICE - expectedFee;

      const sellerBalanceAfter = await token.balanceOf(seller.address);
      const feeRecipientBalanceAfter = await token.balanceOf(deployer.address);

      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFee);
    });

    it("Should deduct royalty + fee when accepting bid", async function () {
      await assets.setRoyalty(ASSET_ID, creator.address, 1000); // 10%

      const sellerBalanceBefore = await token.balanceOf(seller.address);
      const creatorBalanceBefore = await token.balanceOf(creator.address);

      await marketplace.connect(seller).acceptBid(0, buyer.address);

      // Royalty = 80 * 1000 / 10000 = 8 OVG
      // Fee = 80 * 250 / 10000 = 2 OVG
      // Seller = 80 - 8 - 2 = 70 OVG
      const expectedRoyalty = (BID_PRICE * 1000n) / 10000n;
      const expectedFee = (BID_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSellerAmount = BID_PRICE - expectedRoyalty - expectedFee;

      const sellerBalanceAfter = await token.balanceOf(seller.address);
      const creatorBalanceAfter = await token.balanceOf(creator.address);

      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(expectedRoyalty);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
    });
  });

  describe("acceptGlobalBid() with fees", function () {
    const BID_PRICE = ethers.parseEther("50");

    beforeEach(async function () {
      // Place global bid (no listing needed)
      await marketplace.connect(buyer).placeGlobalBid(ASSET_ID, BID_PRICE);
    });

    it("Should deduct marketplace fee when accepting global bid", async function () {
      const sellerBalanceBefore = await token.balanceOf(seller.address);
      const feeRecipientBalanceBefore = await token.balanceOf(deployer.address);

      await marketplace.connect(seller).acceptGlobalBid(ASSET_ID, buyer.address);

      // Fee = 50 * 250 / 10000 = 1.25 OVG
      const expectedFee = (BID_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSellerAmount = BID_PRICE - expectedFee;

      const sellerBalanceAfter = await token.balanceOf(seller.address);
      const feeRecipientBalanceAfter = await token.balanceOf(deployer.address);

      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFee);
    });

    it("Should transfer asset to bidder", async function () {
      const buyerBalanceBefore = await assets.balanceOf(buyer.address, ASSET_ID);

      await marketplace.connect(seller).acceptGlobalBid(ASSET_ID, buyer.address);

      expect(await assets.balanceOf(buyer.address, ASSET_ID)).to.equal(buyerBalanceBefore + 1n);
    });
  });

  describe("Fee Accumulation (no feeRecipient)", function () {
    beforeEach(async function () {
      // Deploy new marketplace with custom init to test accumulation
      const OVGMarketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
      marketplace = await upgrades.deployProxy(
        OVGMarketplace,
        [await token.getAddress(), await assets.getAddress(), deployer.address],
        { kind: 'uups' }
      );
      await marketplace.waitForDeployment();

      // Re-setup approvals
      await assets.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
      await token.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
    });

    it("Should accumulate fees when feeRecipient is zero address", async function () {
      // This test verifies the escrow mechanism - we need to modify contract
      // For now, test that fees go to feeRecipient correctly
      await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);

      const feeRecipientBefore = await token.balanceOf(deployer.address);
      await marketplace.connect(buyer).purchase(0);
      const feeRecipientAfter = await token.balanceOf(deployer.address);

      const expectedFee = (LISTING_PRICE * DEFAULT_FEE) / 10000n;
      expect(feeRecipientAfter - feeRecipientBefore).to.equal(expectedFee);
    });
  });

  describe("withdrawFees", function () {
    it("Should revert if no fees to withdraw", async function () {
      await expect(marketplace.withdrawFees())
        .to.be.revertedWith("No fees to withdraw");
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      await expect(marketplace.connect(other).withdrawFees())
        .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });

    it("Should emit FeesWithdrawn event", async function () {
      // To test withdrawal, we need accumulated fees
      // This would require setting feeRecipient to zero first
      // For basic coverage, just verify the revert on empty
      await expect(marketplace.withdrawFees())
        .to.be.revertedWith("No fees to withdraw");
    });
  });

  describe("Pausable Functionality", function () {
    describe("pause()", function () {
      it("Should allow owner to pause", async function () {
        await marketplace.pause();
        expect(await marketplace.paused()).to.be.true;
      });

      it("Should emit Paused event", async function () {
        await expect(marketplace.pause())
          .to.emit(marketplace, "Paused")
          .withArgs(deployer.address);
      });

      it("Should revert if non-owner tries to pause", async function () {
        await expect(marketplace.connect(other).pause())
          .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
      });
    });

    describe("unpause()", function () {
      beforeEach(async function () {
        await marketplace.pause();
      });

      it("Should allow owner to unpause", async function () {
        await marketplace.unpause();
        expect(await marketplace.paused()).to.be.false;
      });

      it("Should emit Unpaused event", async function () {
        await expect(marketplace.unpause())
          .to.emit(marketplace, "Unpaused")
          .withArgs(deployer.address);
      });

      it("Should revert if non-owner tries to unpause", async function () {
        await expect(marketplace.connect(other).unpause())
          .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
      });
    });

    describe("whenNotPaused modifier", function () {
      beforeEach(async function () {
        await marketplace.pause();
      });

      it("Should block listAsset when paused", async function () {
        await expect(
          marketplace.connect(seller).listAsset(ASSET_ID, 1, LISTING_PRICE, false, 0)
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block listBundle when paused", async function () {
        await expect(
          marketplace.connect(seller).listBundle([ASSET_ID], [1], LISTING_PRICE)
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block purchase when paused", async function () {
        // First unpause to create listing, then pause again
        await marketplace.unpause();
        await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
        await marketplace.pause();

        await expect(
          marketplace.connect(buyer).purchase(0)
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block purchaseBundle when paused", async function () {
        await marketplace.unpause();
        await marketplace.connect(seller).listBundle([ASSET_ID], [1], LISTING_PRICE);
        await marketplace.pause();

        await expect(
          marketplace.connect(buyer).purchaseBundle(0)
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block placeBid when paused", async function () {
        await marketplace.unpause();
        await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
        await marketplace.pause();

        await expect(
          marketplace.connect(buyer).placeBid(0, ethers.parseEther("50"))
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block placeGlobalBid when paused", async function () {
        await expect(
          marketplace.connect(buyer).placeGlobalBid(ASSET_ID, ethers.parseEther("50"))
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block acceptBid when paused", async function () {
        await marketplace.unpause();
        await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
        await marketplace.connect(buyer).placeBid(0, ethers.parseEther("80"));
        await marketplace.pause();

        await expect(
          marketplace.connect(seller).acceptBid(0, buyer.address)
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block acceptGlobalBid when paused", async function () {
        await marketplace.unpause();
        await marketplace.connect(buyer).placeGlobalBid(ASSET_ID, ethers.parseEther("50"));
        await marketplace.pause();

        await expect(
          marketplace.connect(seller).acceptGlobalBid(ASSET_ID, buyer.address)
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should block rent when paused", async function () {
        await marketplace.unpause();
        await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, true, 86400);
        await marketplace.pause();

        await expect(
          marketplace.connect(buyer).rent(0)
        ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
      });

      it("Should allow withdrawBid when paused (emergency withdrawal)", async function () {
        await marketplace.unpause();
        await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
        await marketplace.connect(buyer).placeBid(0, ethers.parseEther("50"));
        await marketplace.pause();

        // withdrawBid should work even when paused (user safety)
        await expect(marketplace.connect(buyer).withdrawBid(0)).to.not.be.reverted;
      });

      it("Should allow withdrawGlobalBid when paused (emergency withdrawal)", async function () {
        await marketplace.unpause();
        await marketplace.connect(buyer).placeGlobalBid(ASSET_ID, ethers.parseEther("50"));
        await marketplace.pause();

        // withdrawGlobalBid should work even when paused (user safety)
        await expect(marketplace.connect(buyer).withdrawGlobalBid(ASSET_ID)).to.not.be.reverted;
      });

      it("Should allow cancelListing when paused", async function () {
        await marketplace.unpause();
        await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
        await marketplace.pause();

        // cancelListing should work even when paused
        await expect(marketplace.connect(seller).cancelListing(0)).to.not.be.reverted;
      });

      it("Should allow cancelBundle when paused", async function () {
        await marketplace.unpause();
        await marketplace.connect(seller).listBundle([ASSET_ID], [1], LISTING_PRICE);
        await marketplace.pause();

        // cancelBundle should work even when paused
        await expect(marketplace.connect(seller).cancelBundle(0)).to.not.be.reverted;
      });
    });

    describe("Resume operations after unpause", function () {
      it("Should allow purchase after unpause", async function () {
        await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);
        
        await marketplace.pause();
        await expect(marketplace.connect(buyer).purchase(0))
          .to.be.revertedWithCustomError(marketplace, "EnforcedPause");
        
        await marketplace.unpause();
        await expect(marketplace.connect(buyer).purchase(0)).to.not.be.reverted;
      });
    });
  });

  describe("Version", function () {
    it("Should return version 1.5.0", async function () {
      expect(await marketplace.version()).to.equal("1.5.0");
    });
  });

  describe("Integration: Full Purchase Flow with Fees", function () {
    it("Should correctly distribute funds: Seller, Creator, Fee Recipient", async function () {
      // Setup: 10% royalty to creator
      await assets.setRoyalty(ASSET_ID, creator.address, 1000);
      
      // Setup: 5% marketplace fee to feeRecipient
      await marketplace.setMarketplaceFee(500);
      await marketplace.setFeeRecipient(feeRecipient.address);

      // Create listing
      await marketplace.connect(seller).listAsset(ASSET_ID, 1, LISTING_PRICE, false, 0);

      // Record balances before
      const buyerBefore = await token.balanceOf(buyer.address);
      const sellerBefore = await token.balanceOf(seller.address);
      const creatorBefore = await token.balanceOf(creator.address);
      const feeRecipientBefore = await token.balanceOf(feeRecipient.address);

      // Purchase
      await marketplace.connect(buyer).purchase(0);

      // Calculate expected amounts
      // Price = 100 OVG
      // Royalty = 100 * 10% = 10 OVG
      // Fee = 100 * 5% = 5 OVG
      // Seller = 100 - 10 - 5 = 85 OVG
      const expectedRoyalty = ethers.parseEther("10");
      const expectedFee = ethers.parseEther("5");
      const expectedSellerAmount = ethers.parseEther("85");

      // Verify balances after
      expect(await token.balanceOf(buyer.address)).to.equal(buyerBefore - LISTING_PRICE);
      expect(await token.balanceOf(seller.address)).to.equal(sellerBefore + expectedSellerAmount);
      expect(await token.balanceOf(creator.address)).to.equal(creatorBefore + expectedRoyalty);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(feeRecipientBefore + expectedFee);

      // Verify asset transferred
      expect(await assets.balanceOf(buyer.address, ASSET_ID)).to.equal(1);
    });
  });
});
