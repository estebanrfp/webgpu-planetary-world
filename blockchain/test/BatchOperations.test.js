const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Batch Operations Tests
 * Tests for OVGMarketplaceUpgradeable V1.4.0 features:
 * - batchListAssets: List multiple assets in one transaction
 * - batchPurchase: Purchase multiple listings in one transaction
 */
describe("Batch Operations", function () {
  let deployer, seller, buyer, creator, other;
  let forwarder, token, assets, marketplace;

  const ASSET_IDS = [1, 2, 3];
  const ASSET_AMOUNT = 5;
  const LISTING_PRICES = [
    ethers.parseEther("100"),
    ethers.parseEther("200"),
    ethers.parseEther("150")
  ];
  const DEFAULT_ROYALTY = 500n; // 5%

  beforeEach(async function () {
    [deployer, seller, buyer, creator, other] = await ethers.getSigners();

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

    // Initialize V1.3 for token support
    await marketplace.initializeV1_3([]);

    // Setup: Mint tokens to buyer
    await token.transfer(buyer.address, ethers.parseEther("10000"));

    // Setup: Mint assets to seller
    for (const id of ASSET_IDS) {
      await assets.mint(seller.address, id, ASSET_AMOUNT, "0x");
      // Set royalty for each asset
      await assets.setRoyalty(id, creator.address, DEFAULT_ROYALTY);
    }

    // Setup: Seller approves marketplace
    await assets.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);

    // Setup: Buyer approves marketplace for token spending
    await token.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);
  });

  describe("batchListAssets", function () {
    it("Should create multiple listings in one transaction", async function () {
      const amounts = [1, 1, 1];
      const isRentals = [false, false, false];
      const durations = [0, 0, 0];

      const tx = await marketplace.connect(seller).batchListAssets(
        ASSET_IDS,
        amounts,
        LISTING_PRICES,
        isRentals,
        durations,
        await token.getAddress()
      );

      const receipt = await tx.wait();

      // Check BatchListed event was emitted
      const batchEvent = receipt.logs.find(log => {
        try {
          return marketplace.interface.parseLog(log)?.name === "BatchListed";
        } catch { return false; }
      });
      expect(batchEvent).to.not.be.undefined;

      // Verify each listing exists
      for (let i = 0; i < ASSET_IDS.length; i++) {
        const listing = await marketplace.listings(i);
        expect(listing.seller).to.equal(seller.address);
        expect(listing.assetId).to.equal(ASSET_IDS[i]);
        expect(listing.price).to.equal(LISTING_PRICES[i]);
        expect(listing.amount).to.equal(1);
      }
    });

    it("Should revert on array length mismatch", async function () {
      const amounts = [1, 1]; // Wrong length
      const isRentals = [false, false, false];
      const durations = [0, 0, 0];

      await expect(
        marketplace.connect(seller).batchListAssets(
          ASSET_IDS,
          amounts,
          LISTING_PRICES,
          isRentals,
          durations,
          await token.getAddress()
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should revert when batch size exceeds maximum (15)", async function () {
      const tooManyIds = Array.from({ length: 16 }, (_, i) => i + 100);
      const amounts = Array(16).fill(1);
      const prices = Array(16).fill(ethers.parseEther("10"));
      const isRentals = Array(16).fill(false);
      const durations = Array(16).fill(0);

      await expect(
        marketplace.connect(seller).batchListAssets(
          tooManyIds,
          amounts,
          prices,
          isRentals,
          durations,
          await token.getAddress()
        )
      ).to.be.revertedWith("Batch too large");
    });

    it("Should revert on empty batch", async function () {
      await expect(
        marketplace.connect(seller).batchListAssets(
          [],
          [],
          [],
          [],
          [],
          await token.getAddress()
        )
      ).to.be.revertedWith("Empty batch");
    });

    it("Should revert if rentals included in batch", async function () {
      const amounts = [1, 1, 1];
      const isRentals = [false, true, false]; // One rental
      const durations = [0, 86400, 0];

      await expect(
        marketplace.connect(seller).batchListAssets(
          ASSET_IDS,
          amounts,
          LISTING_PRICES,
          isRentals,
          durations,
          await token.getAddress()
        )
      ).to.be.revertedWith("Batch rentals not supported");
    });

    it("Should emit individual Listed events for each asset", async function () {
      const amounts = [1, 1, 1];
      const isRentals = [false, false, false];
      const durations = [0, 0, 0];

      await expect(
        marketplace.connect(seller).batchListAssets(
          ASSET_IDS,
          amounts,
          LISTING_PRICES,
          isRentals,
          durations,
          await token.getAddress()
        )
      )
        .to.emit(marketplace, "Listed")
        .to.emit(marketplace, "BatchListed");
    });
  });

  describe("batchPurchase", function () {
    beforeEach(async function () {
      // Create batch listings first
      const amounts = [1, 1, 1];
      const isRentals = [false, false, false];
      const durations = [0, 0, 0];

      await marketplace.connect(seller).batchListAssets(
        ASSET_IDS,
        amounts,
        LISTING_PRICES,
        isRentals,
        durations,
        await token.getAddress()
      );
    });

    it("Should purchase multiple listings in one transaction", async function () {
      const listingIds = [0, 1, 2];
      const totalPrice = LISTING_PRICES.reduce((sum, p) => sum + p, 0n);

      const buyerBalanceBefore = await token.balanceOf(buyer.address);

      await marketplace.connect(buyer).batchPurchase(listingIds);

      // Buyer should have all assets
      for (const id of ASSET_IDS) {
        expect(await assets.balanceOf(buyer.address, id)).to.equal(1);
      }

      // Buyer's token balance should decrease by total price
      const buyerBalanceAfter = await token.balanceOf(buyer.address);
      expect(buyerBalanceBefore - buyerBalanceAfter).to.equal(totalPrice);
    });

    it("Should revert when listings use different payment tokens", async function () {
      // Deploy a mock USDC token
      const MockToken = await ethers.getContractFactory("OVGTokenUpgradeable");
      const mockUsdc = await upgrades.deployProxy(
        MockToken,
        [deployer.address, deployer.address, await forwarder.getAddress()],
        { kind: 'uups' }
      );
      await mockUsdc.waitForDeployment();

      // Allow this token
      await marketplace.setAllowedToken(await mockUsdc.getAddress(), true);

      // Mint additional asset and create listing with different token
      await assets.mint(seller.address, 4, 1, "0x");
      await mockUsdc.transfer(buyer.address, ethers.parseEther("1000"));
      await mockUsdc.connect(buyer).approve(await marketplace.getAddress(), ethers.MaxUint256);

      await marketplace.connect(seller).listAssetWithToken(
        4, 1, ethers.parseEther("50"), false, 0, await mockUsdc.getAddress()
      );

      // Try to batch purchase listings with different tokens
      const listingIds = [0, 3]; // 0 uses OVG, 3 uses mockUsdc

      await expect(
        marketplace.connect(buyer).batchPurchase(listingIds)
      ).to.be.revertedWith("Token mismatch");
    });

    it("Should aggregate royalties correctly", async function () {
      const listingIds = [0, 1, 2];

      const creatorBalanceBefore = await token.balanceOf(creator.address);

      await marketplace.connect(buyer).batchPurchase(listingIds);

      const creatorBalanceAfter = await token.balanceOf(creator.address);

      // Calculate expected total royalties (5% of each)
      const expectedRoyalties = LISTING_PRICES.reduce((sum, price) => {
        return sum + (price * 500n / 10000n);
      }, 0n);

      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(expectedRoyalties);
    });

    it("Should calculate marketplace fees correctly", async function () {
      const listingIds = [0, 1, 2];
      const feeRecipient = deployer.address; // Default fee recipient

      const feeRecipientBalanceBefore = await token.balanceOf(feeRecipient);

      await marketplace.connect(buyer).batchPurchase(listingIds);

      const feeRecipientBalanceAfter = await token.balanceOf(feeRecipient);

      // Default fee is 2.5% (250 basis points)
      const expectedFees = LISTING_PRICES.reduce((sum, price) => {
        return sum + (price * 250n / 10000n);
      }, 0n);

      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedFees);
    });

    it("Should revert on batch size exceeds maximum", async function () {
      const tooManyIds = Array.from({ length: 16 }, (_, i) => i);

      await expect(
        marketplace.connect(buyer).batchPurchase(tooManyIds)
      ).to.be.revertedWith("Batch too large");
    });

    it("Should revert on empty batch", async function () {
      await expect(
        marketplace.connect(buyer).batchPurchase([])
      ).to.be.revertedWith("Empty batch");
    });

    it("Should emit BatchPurchased event", async function () {
      const listingIds = [0, 1, 2];

      await expect(
        marketplace.connect(buyer).batchPurchase(listingIds)
      ).to.emit(marketplace, "BatchPurchased");
    });

    it("Should transfer correct amounts to sellers", async function () {
      const listingIds = [0, 1, 2];

      const sellerBalanceBefore = await token.balanceOf(seller.address);

      await marketplace.connect(buyer).batchPurchase(listingIds);

      const sellerBalanceAfter = await token.balanceOf(seller.address);

      // Seller gets price - royalty - fee for each
      const expectedSellerAmount = LISTING_PRICES.reduce((sum, price) => {
        const royalty = price * 500n / 10000n;  // 5%
        const fee = price * 250n / 10000n;      // 2.5%
        return sum + price - royalty - fee;
      }, 0n);

      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSellerAmount);
    });
  });

  describe("MAX_BATCH_SIZE constant", function () {
    it("Should be 15", async function () {
      expect(await marketplace.MAX_BATCH_SIZE()).to.equal(15);
    });
  });
});
