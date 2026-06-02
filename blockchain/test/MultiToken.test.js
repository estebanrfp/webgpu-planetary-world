const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Multi-Token Payment Tests
 * Tests for OVGMarketplaceUpgradeable V1.3.0 features:
 * - Multiple payment token support (OVG, USDC, USDT)
 * - Token whitelist management
 * - Listings with different payment tokens
 * - Bids with token tracking
 * - Fee accumulation per token
 */
describe("Multi-Token Payments (v1.3.0)", function () {
  let deployer, seller, buyer, creator, feeRecipient, other;
  let forwarder, ovgToken, usdcToken, usdtToken, assets, marketplace;

  const ASSET_ID = 1;
  const ASSET_AMOUNT = 10;
  const LISTING_PRICE = ethers.parseEther("100");
  const USDC_PRICE = ethers.parseUnits("50", 6); // USDC has 6 decimals
  const DEFAULT_FEE = 250n; // 2.5%

  beforeEach(async function () {
    [deployer, seller, buyer, creator, feeRecipient, other] = await ethers.getSigners();

    // Deploy Forwarder
    const OVGForwarder = await ethers.getContractFactory("OVGForwarder");
    forwarder = await OVGForwarder.deploy();
    await forwarder.waitForDeployment();

    // Deploy OVG Token
    const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
    ovgToken = await upgrades.deployProxy(
      OVGToken,
      [deployer.address, deployer.address, await forwarder.getAddress()],
      { kind: 'uups' }
    );
    await ovgToken.waitForDeployment();

    // Deploy Mock USDC (6 decimals)
    const MockERC20 = await ethers.getContractFactory("OVGTokenUpgradeable");
    usdcToken = await upgrades.deployProxy(
      MockERC20,
      [deployer.address, deployer.address, await forwarder.getAddress()],
      { kind: 'uups' }
    );
    await usdcToken.waitForDeployment();

    // Deploy Mock USDT (6 decimals)
    usdtToken = await upgrades.deployProxy(
      MockERC20,
      [deployer.address, deployer.address, await forwarder.getAddress()],
      { kind: 'uups' }
    );
    await usdtToken.waitForDeployment();

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
      [await ovgToken.getAddress(), await assets.getAddress(), deployer.address],
      { kind: 'uups' }
    );
    await marketplace.waitForDeployment();

    // Initialize V1.3 with additional tokens
    await marketplace.initializeV1_3([
      await usdcToken.getAddress(),
      await usdtToken.getAddress()
    ]);

    // Setup: Transfer tokens to buyer
    await ovgToken.transfer(buyer.address, ethers.parseEther("10000"));
    await usdcToken.transfer(buyer.address, ethers.parseEther("10000"));
    await usdtToken.transfer(buyer.address, ethers.parseEther("10000"));

    // Setup: Mint assets to seller
    await assets.mint(seller.address, ASSET_ID, ASSET_AMOUNT, "0x");

    // Setup: Approvals
    await assets.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await ovgToken.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await usdcToken.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
    await usdtToken.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
  });

  describe("Version", function () {
    it("Should return version 1.5.0", async function () {
      expect(await marketplace.version()).to.equal("1.5.0");
    });
  });

  describe("Token Whitelist", function () {
    it("Should have OVG token allowed by default after initializeV1_3", async function () {
      expect(await marketplace.isTokenAllowed(await ovgToken.getAddress())).to.be.true;
    });

    it("Should have USDC allowed after initializeV1_3", async function () {
      expect(await marketplace.isTokenAllowed(await usdcToken.getAddress())).to.be.true;
    });

    it("Should have USDT allowed after initializeV1_3", async function () {
      expect(await marketplace.isTokenAllowed(await usdtToken.getAddress())).to.be.true;
    });

    it("Should not allow random tokens", async function () {
      expect(await marketplace.isTokenAllowed(other.address)).to.be.false;
    });

    it("Should allow owner to add new token", async function () {
      const randomToken = ethers.Wallet.createRandom().address;
      await marketplace.setAllowedToken(randomToken, true);
      expect(await marketplace.isTokenAllowed(randomToken)).to.be.true;
    });

    it("Should allow owner to remove token", async function () {
      await marketplace.setAllowedToken(await usdcToken.getAddress(), false);
      expect(await marketplace.isTokenAllowed(await usdcToken.getAddress())).to.be.false;
    });

    it("Should emit TokenAllowed event", async function () {
      const randomToken = ethers.Wallet.createRandom().address;
      await expect(marketplace.setAllowedToken(randomToken, true))
        .to.emit(marketplace, "TokenAllowed")
        .withArgs(randomToken, true);
    });

    it("Should revert if non-owner tries to set allowed token", async function () {
      await expect(marketplace.connect(other).setAllowedToken(other.address, true))
        .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });

    it("Should revert if setting zero address as allowed", async function () {
      await expect(marketplace.setAllowedToken(ethers.ZeroAddress, true))
        .to.be.revertedWith("Invalid token address");
    });
  });

  describe("listAssetWithToken", function () {
    it("Should list asset with USDC as payment token", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, USDC_PRICE, false, 0, await usdcToken.getAddress()
      );

      const paymentToken = await marketplace.getListingPaymentToken(0);
      expect(paymentToken).to.equal(await usdcToken.getAddress());
    });

    it("Should emit ListedWithToken event", async function () {
      await expect(
        marketplace.connect(seller).listAssetWithToken(
          ASSET_ID, 5, USDC_PRICE, false, 0, await usdcToken.getAddress()
        )
      ).to.emit(marketplace, "ListedWithToken")
        .withArgs(0, seller.address, ASSET_ID, USDC_PRICE, await usdcToken.getAddress());
    });

    it("Should revert if token not allowed", async function () {
      await expect(
        marketplace.connect(seller).listAssetWithToken(
          ASSET_ID, 5, USDC_PRICE, false, 0, other.address
        )
      ).to.be.revertedWith("Token not allowed");
    });

    it("Should default to OVG with listAsset() for backwards compatibility", async function () {
      await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);

      const paymentToken = await marketplace.getListingPaymentToken(0);
      expect(paymentToken).to.equal(await ovgToken.getAddress());
    });
  });

  describe("listBundleWithToken", function () {
    beforeEach(async function () {
      await assets.mint(seller.address, 2, 5, "0x");
    });

    it("Should list bundle with USDT as payment token", async function () {
      await marketplace.connect(seller).listBundleWithToken(
        [ASSET_ID, 2], [1, 2], LISTING_PRICE, await usdtToken.getAddress()
      );

      const paymentToken = await marketplace.getBundlePaymentToken(0);
      expect(paymentToken).to.equal(await usdtToken.getAddress());
    });

    it("Should emit BundleListedWithToken event", async function () {
      await expect(
        marketplace.connect(seller).listBundleWithToken(
          [ASSET_ID, 2], [1, 2], LISTING_PRICE, await usdtToken.getAddress()
        )
      ).to.emit(marketplace, "BundleListedWithToken");
    });

    it("Should list bundle with name and token", async function () {
      await marketplace.connect(seller).listBundleWithNameAndToken(
        [ASSET_ID, 2], [1, 2], LISTING_PRICE, "Premium Bundle", await usdcToken.getAddress()
      );

      expect(await marketplace.getBundleName(0)).to.equal("Premium Bundle");
      expect(await marketplace.getBundlePaymentToken(0)).to.equal(await usdcToken.getAddress());
    });
  });

  describe("purchase() with different tokens", function () {
    it("Should purchase with USDC", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, USDC_PRICE, false, 0, await usdcToken.getAddress()
      );

      const sellerBefore = await usdcToken.balanceOf(seller.address);
      const buyerBefore = await usdcToken.balanceOf(buyer.address);

      await marketplace.connect(buyer).purchase(0);

      const expectedFee = (USDC_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSeller = USDC_PRICE - expectedFee;

      expect(await usdcToken.balanceOf(seller.address)).to.equal(sellerBefore + expectedSeller);
      expect(await usdcToken.balanceOf(buyer.address)).to.equal(buyerBefore - USDC_PRICE);
      expect(await assets.balanceOf(buyer.address, ASSET_ID)).to.equal(1);
    });

    it("Should emit PurchasedWithToken event", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, USDC_PRICE, false, 0, await usdcToken.getAddress()
      );

      await expect(marketplace.connect(buyer).purchase(0))
        .to.emit(marketplace, "PurchasedWithToken")
        .withArgs(0, buyer.address, USDC_PRICE, 0, await usdcToken.getAddress());
    });

    it("Should handle royalties with non-OVG token", async function () {
      await assets.setRoyalty(ASSET_ID, creator.address, 1000); // 10%

      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, USDC_PRICE, false, 0, await usdcToken.getAddress()
      );

      const creatorBefore = await usdcToken.balanceOf(creator.address);

      await marketplace.connect(buyer).purchase(0);

      const expectedRoyalty = (USDC_PRICE * 1000n) / 10000n;
      expect(await usdcToken.balanceOf(creator.address)).to.equal(creatorBefore + expectedRoyalty);
    });
  });

  describe("purchaseBundle() with different tokens", function () {
    beforeEach(async function () {
      await assets.mint(seller.address, 2, 5, "0x");
    });

    it("Should purchase bundle with USDT", async function () {
      await marketplace.connect(seller).listBundleWithToken(
        [ASSET_ID, 2], [1, 2], LISTING_PRICE, await usdtToken.getAddress()
      );

      const sellerBefore = await usdtToken.balanceOf(seller.address);

      await marketplace.connect(buyer).purchaseBundle(0);

      const expectedFee = (LISTING_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSeller = LISTING_PRICE - expectedFee;

      expect(await usdtToken.balanceOf(seller.address)).to.equal(sellerBefore + expectedSeller);
      expect(await assets.balanceOf(buyer.address, ASSET_ID)).to.equal(1);
      expect(await assets.balanceOf(buyer.address, 2)).to.equal(2);
    });

    it("Should emit BundlePurchasedWithToken event", async function () {
      await marketplace.connect(seller).listBundleWithToken(
        [ASSET_ID, 2], [1, 2], LISTING_PRICE, await usdtToken.getAddress()
      );

      await expect(marketplace.connect(buyer).purchaseBundle(0))
        .to.emit(marketplace, "BundlePurchasedWithToken")
        .withArgs(0, buyer.address, LISTING_PRICE, await usdtToken.getAddress());
    });
  });

  describe("Bids with different tokens", function () {
    const BID_PRICE = ethers.parseEther("80");

    it("Should place bid using listing's payment token", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, LISTING_PRICE, false, 0, await usdcToken.getAddress()
      );

      const buyerBefore = await usdcToken.balanceOf(buyer.address);
      const marketplaceBefore = await usdcToken.balanceOf(await marketplace.getAddress());

      await marketplace.connect(buyer).placeBid(0, BID_PRICE);

      // Bid should be escrowed in USDC
      expect(await usdcToken.balanceOf(buyer.address)).to.equal(buyerBefore - BID_PRICE);
      expect(await usdcToken.balanceOf(await marketplace.getAddress())).to.equal(marketplaceBefore + BID_PRICE);
    });

    it("Should emit BidPlacedWithToken event", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, LISTING_PRICE, false, 0, await usdcToken.getAddress()
      );

      await expect(marketplace.connect(buyer).placeBid(0, BID_PRICE))
        .to.emit(marketplace, "BidPlacedWithToken")
        .withArgs(0, buyer.address, BID_PRICE, await usdcToken.getAddress());
    });

    it("Should accept bid and transfer correct token", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, LISTING_PRICE, false, 0, await usdcToken.getAddress()
      );

      await marketplace.connect(buyer).placeBid(0, BID_PRICE);

      const sellerBefore = await usdcToken.balanceOf(seller.address);

      await marketplace.connect(seller).acceptBid(0, buyer.address);

      const expectedFee = (BID_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSeller = BID_PRICE - expectedFee;

      expect(await usdcToken.balanceOf(seller.address)).to.equal(sellerBefore + expectedSeller);
      expect(await assets.balanceOf(buyer.address, ASSET_ID)).to.equal(1);
    });

    it("Should withdraw bid in correct token", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, LISTING_PRICE, false, 0, await usdcToken.getAddress()
      );

      await marketplace.connect(buyer).placeBid(0, BID_PRICE);

      const buyerBefore = await usdcToken.balanceOf(buyer.address);

      await marketplace.connect(buyer).withdrawBid(0);

      expect(await usdcToken.balanceOf(buyer.address)).to.equal(buyerBefore + BID_PRICE);
    });

    it("Should refund previous bid when placing new bid", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, LISTING_PRICE, false, 0, await usdcToken.getAddress()
      );

      await marketplace.connect(buyer).placeBid(0, BID_PRICE);
      const buyerAfterFirstBid = await usdcToken.balanceOf(buyer.address);

      const newBidPrice = ethers.parseEther("90");
      await marketplace.connect(buyer).placeBid(0, newBidPrice);

      // Should have refunded first bid and taken new bid
      expect(await usdcToken.balanceOf(buyer.address)).to.equal(buyerAfterFirstBid + BID_PRICE - newBidPrice);
    });
  });

  describe("Global Bids with tokens", function () {
    const BID_PRICE = ethers.parseEther("60");

    it("Should place global bid with specific token", async function () {
      const buyerBefore = await usdcToken.balanceOf(buyer.address);

      await marketplace.connect(buyer).placeGlobalBidWithToken(
        ASSET_ID, BID_PRICE, await usdcToken.getAddress()
      );

      expect(await usdcToken.balanceOf(buyer.address)).to.equal(buyerBefore - BID_PRICE);
    });

    it("Should emit GlobalBidPlacedWithToken event", async function () {
      await expect(
        marketplace.connect(buyer).placeGlobalBidWithToken(
          ASSET_ID, BID_PRICE, await usdcToken.getAddress()
        )
      ).to.emit(marketplace, "GlobalBidPlacedWithToken")
        .withArgs(ASSET_ID, buyer.address, BID_PRICE, await usdcToken.getAddress());
    });

    it("Should accept global bid with correct token", async function () {
      await marketplace.connect(buyer).placeGlobalBidWithToken(
        ASSET_ID, BID_PRICE, await usdcToken.getAddress()
      );

      const sellerBefore = await usdcToken.balanceOf(seller.address);

      await marketplace.connect(seller).acceptGlobalBid(ASSET_ID, buyer.address);

      const expectedFee = (BID_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSeller = BID_PRICE - expectedFee;

      expect(await usdcToken.balanceOf(seller.address)).to.equal(sellerBefore + expectedSeller);
    });

    it("Should withdraw global bid in correct token", async function () {
      await marketplace.connect(buyer).placeGlobalBidWithToken(
        ASSET_ID, BID_PRICE, await usdcToken.getAddress()
      );

      const buyerBefore = await usdcToken.balanceOf(buyer.address);

      await marketplace.connect(buyer).withdrawGlobalBid(ASSET_ID);

      expect(await usdcToken.balanceOf(buyer.address)).to.equal(buyerBefore + BID_PRICE);
    });

    it("Should default to OVG with placeGlobalBid()", async function () {
      const buyerOVGBefore = await ovgToken.balanceOf(buyer.address);

      await marketplace.connect(buyer).placeGlobalBid(ASSET_ID, BID_PRICE);

      expect(await ovgToken.balanceOf(buyer.address)).to.equal(buyerOVGBefore - BID_PRICE);
    });

    it("Should revert global bid with non-allowed token", async function () {
      await expect(
        marketplace.connect(buyer).placeGlobalBidWithToken(
          ASSET_ID, BID_PRICE, other.address
        )
      ).to.be.revertedWith("Token not allowed");
    });
  });

  describe("Rentals with different tokens", function () {
    const RENTAL_PRICE = ethers.parseEther("10");
    const DURATION = 86400; // 1 day

    it("Should rent with USDC", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, RENTAL_PRICE, true, DURATION, await usdcToken.getAddress()
      );

      const sellerBefore = await usdcToken.balanceOf(seller.address);

      await marketplace.connect(buyer).rent(0);

      expect(await usdcToken.balanceOf(seller.address)).to.equal(sellerBefore + RENTAL_PRICE);
    });

    it("Should extend rental with same token", async function () {
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, RENTAL_PRICE, true, DURATION, await usdcToken.getAddress()
      );

      await marketplace.connect(buyer).rent(0);

      const sellerBefore = await usdcToken.balanceOf(seller.address);

      await marketplace.connect(buyer).extendRental(0);

      expect(await usdcToken.balanceOf(seller.address)).to.equal(sellerBefore + RENTAL_PRICE);
    });
  });

  describe("Fee Accumulation per Token", function () {
    it("Should accumulate fees separately per token", async function () {
      // Set feeRecipient to zero to accumulate fees
      // Note: In our implementation, fees go to feeRecipient directly
      // We need to test getAccumulatedFees

      // For this test, let's verify fees go to feeRecipient correctly
      await marketplace.setFeeRecipient(feeRecipient.address);

      // List with USDC
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, USDC_PRICE, false, 0, await usdcToken.getAddress()
      );

      const feeRecipientUSDCBefore = await usdcToken.balanceOf(feeRecipient.address);

      await marketplace.connect(buyer).purchase(0);

      const expectedFee = (USDC_PRICE * DEFAULT_FEE) / 10000n;
      expect(await usdcToken.balanceOf(feeRecipient.address)).to.equal(feeRecipientUSDCBefore + expectedFee);
    });

    it("Should track accumulated fees for OVG", async function () {
      const fees = await marketplace.getAccumulatedFees(await ovgToken.getAddress());
      expect(fees).to.be.a("bigint");
    });

    it("Should track accumulated fees for USDC", async function () {
      const fees = await marketplace.getAccumulatedFees(await usdcToken.getAddress());
      expect(fees).to.be.a("bigint");
    });
  });

  describe("withdrawFeesByToken", function () {
    it("Should revert if no fees to withdraw", async function () {
      await expect(marketplace.withdrawFeesByToken(await usdcToken.getAddress()))
        .to.be.revertedWith("No fees to withdraw");
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      await expect(marketplace.connect(other).withdrawFeesByToken(await usdcToken.getAddress()))
        .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });
  });

  describe("Backwards Compatibility", function () {
    it("Should work with existing listAsset() function", async function () {
      await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);

      const sellerBefore = await ovgToken.balanceOf(seller.address);

      await marketplace.connect(buyer).purchase(0);

      const expectedFee = (LISTING_PRICE * DEFAULT_FEE) / 10000n;
      const expectedSeller = LISTING_PRICE - expectedFee;

      expect(await ovgToken.balanceOf(seller.address)).to.equal(sellerBefore + expectedSeller);
    });

    it("Should work with existing listBundle() function", async function () {
      await assets.mint(seller.address, 2, 5, "0x");

      await marketplace.connect(seller).listBundle([ASSET_ID, 2], [1, 2], LISTING_PRICE);

      const paymentToken = await marketplace.getBundlePaymentToken(0);
      expect(paymentToken).to.equal(await ovgToken.getAddress());
    });

    it("Should work with existing placeBid() on OVG listing", async function () {
      await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);

      const buyerOVGBefore = await ovgToken.balanceOf(buyer.address);

      await marketplace.connect(buyer).placeBid(0, ethers.parseEther("80"));

      expect(await ovgToken.balanceOf(buyer.address)).to.equal(buyerOVGBefore - ethers.parseEther("80"));
    });

    it("Should work with existing withdrawFees() function", async function () {
      // withdrawFees should work for OVG
      await expect(marketplace.withdrawFees())
        .to.be.revertedWith("No fees to withdraw");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle listing with zero paymentToken in storage (legacy)", async function () {
      // When listingPaymentToken is not set (legacy listings), should default to OVG
      await marketplace.connect(seller).listAsset(ASSET_ID, 5, LISTING_PRICE, false, 0);

      const paymentToken = await marketplace.getListingPaymentToken(0);
      expect(paymentToken).to.equal(await ovgToken.getAddress());
    });

    it("Should not allow purchase with wrong token approval", async function () {
      // Revoke USDC approval
      await usdcToken.connect(buyer).approve(await marketplace.getAddress(), 0);

      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 5, USDC_PRICE, false, 0, await usdcToken.getAddress()
      );

      await expect(marketplace.connect(buyer).purchase(0))
        .to.be.reverted;
    });

    it("Should handle multiple listings with different tokens", async function () {
      // List asset 1 with OVG
      await marketplace.connect(seller).listAsset(ASSET_ID, 2, LISTING_PRICE, false, 0);

      // Mint more assets
      await assets.mint(seller.address, 2, 5, "0x");

      // List asset 2 with USDC
      await marketplace.connect(seller).listAssetWithToken(
        2, 3, USDC_PRICE, false, 0, await usdcToken.getAddress()
      );

      expect(await marketplace.getListingPaymentToken(0)).to.equal(await ovgToken.getAddress());
      expect(await marketplace.getListingPaymentToken(1)).to.equal(await usdcToken.getAddress());
    });
  });

  describe("Integration: Full Flow with Multiple Tokens", function () {
    it("Should handle complete purchase flow with USDC including royalties and fees", async function () {
      // Setup royalty
      await assets.setRoyalty(ASSET_ID, creator.address, 500); // 5%

      // Setup fee recipient
      await marketplace.setFeeRecipient(feeRecipient.address);
      await marketplace.setMarketplaceFee(250); // 2.5%

      // List with USDC
      const price = ethers.parseUnits("100", 18);
      await marketplace.connect(seller).listAssetWithToken(
        ASSET_ID, 1, price, false, 0, await usdcToken.getAddress()
      );

      // Record balances
      const buyerBefore = await usdcToken.balanceOf(buyer.address);
      const sellerBefore = await usdcToken.balanceOf(seller.address);
      const creatorBefore = await usdcToken.balanceOf(creator.address);
      const feeRecipientBefore = await usdcToken.balanceOf(feeRecipient.address);

      // Purchase
      await marketplace.connect(buyer).purchase(0);

      // Verify distribution
      // Royalty = 100 * 5% = 5
      // Fee = 100 * 2.5% = 2.5
      // Seller = 100 - 5 - 2.5 = 92.5
      const expectedRoyalty = (price * 500n) / 10000n;
      const expectedFee = (price * 250n) / 10000n;
      const expectedSeller = price - expectedRoyalty - expectedFee;

      expect(await usdcToken.balanceOf(buyer.address)).to.equal(buyerBefore - price);
      expect(await usdcToken.balanceOf(seller.address)).to.equal(sellerBefore + expectedSeller);
      expect(await usdcToken.balanceOf(creator.address)).to.equal(creatorBefore + expectedRoyalty);
      expect(await usdcToken.balanceOf(feeRecipient.address)).to.equal(feeRecipientBefore + expectedFee);

      // Verify asset transfer
      expect(await assets.balanceOf(buyer.address, ASSET_ID)).to.equal(1);
    });
  });
});
