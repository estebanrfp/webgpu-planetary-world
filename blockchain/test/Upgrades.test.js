const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Upgradeable Contracts", function () {
  let deployer, user1, user2;
  let forwarder;
  let token, assets, marketplace, landClaim, paymaster;

  beforeEach(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    // Deploy Forwarder (non-upgradeable)
    const OVGForwarder = await ethers.getContractFactory("OVGForwarder");
    forwarder = await OVGForwarder.deploy();
    await forwarder.waitForDeployment();
  });

  describe("OVGTokenUpgradeable", function () {
    beforeEach(async function () {
      const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
      token = await upgrades.deployProxy(
        OVGToken,
        [deployer.address, deployer.address, await forwarder.getAddress()],
        { kind: 'uups' }
      );
      await token.waitForDeployment();
    });

    it("Should initialize with correct values", async function () {
      expect(await token.name()).to.equal("OVGrid Token");
      expect(await token.symbol()).to.equal("OVG");
      expect(await token.version()).to.equal("1.0.0");
      
      const expectedSupply = ethers.parseEther("21000000");
      expect(await token.totalSupply()).to.equal(expectedSupply);
      expect(await token.balanceOf(deployer.address)).to.equal(expectedSupply);
    });

    it("Should have correct roles assigned", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      const UPGRADER_ROLE = await token.UPGRADER_ROLE();
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();

      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
      expect(await token.hasRole(MINTER_ROLE, deployer.address)).to.be.true;
      expect(await token.hasRole(UPGRADER_ROLE, deployer.address)).to.be.true;
    });

    it("Should allow minting by MINTER_ROLE", async function () {
      const mintAmount = ethers.parseEther("1000");
      await token.mint(user1.address, mintAmount);
      expect(await token.balanceOf(user1.address)).to.equal(mintAmount);
    });

    it("Should prevent unauthorized upgrades", async function () {
      const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
      const tokenAsUser = token.connect(user1);
      
      // User1 doesn't have UPGRADER_ROLE
      await expect(
        upgrades.upgradeProxy(await token.getAddress(), OVGToken.connect(user1))
      ).to.be.reverted;
    });

    it("Should preserve state after upgrade", async function () {
      // Transfer some tokens to user1
      const transferAmount = ethers.parseEther("1000");
      await token.transfer(user1.address, transferAmount);
      
      const balanceBefore = await token.balanceOf(user1.address);
      
      // Upgrade (using same contract as we don't have V2 yet)
      const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
      const upgraded = await upgrades.upgradeProxy(await token.getAddress(), OVGToken);
      
      // State should be preserved
      expect(await upgraded.balanceOf(user1.address)).to.equal(balanceBefore);
      expect(await upgraded.name()).to.equal("OVGrid Token");
    });
  });

  describe("OVGAssetsUpgradeable", function () {
    beforeEach(async function () {
      const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
      assets = await upgrades.deployProxy(
        OVGAssets,
        [deployer.address, deployer.address],
        { kind: 'uups' }
      );
      await assets.waitForDeployment();
    });

    it("Should initialize with correct roles", async function () {
      const MINTER_ROLE = await assets.MINTER_ROLE();
      const UPGRADER_ROLE = await assets.UPGRADER_ROLE();

      expect(await assets.hasRole(MINTER_ROLE, deployer.address)).to.be.true;
      expect(await assets.hasRole(UPGRADER_ROLE, deployer.address)).to.be.true;
    });

    it("Should mint assets correctly", async function () {
      await assets.mint(user1.address, 1, 10, "0x");
      expect(await assets.balanceOf(user1.address, 1)).to.equal(10);
    });

    it("Should handle royalties correctly", async function () {
      await assets.setRoyalty(1, user1.address, 500); // 5%
      
      const [creator, royaltyAmount] = await assets.getRoyaltyInfo(1, ethers.parseEther("100"));
      expect(creator).to.equal(user1.address);
      expect(royaltyAmount).to.equal(ethers.parseEther("5"));
    });

    it("Should preserve state after upgrade", async function () {
      // Mint some assets
      await assets.mint(user1.address, 1, 100, "0x");
      await assets.setRoyalty(1, user2.address, 1000);
      
      // Upgrade
      const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
      const upgraded = await upgrades.upgradeProxy(await assets.getAddress(), OVGAssets);
      
      // State should be preserved
      expect(await upgraded.balanceOf(user1.address, 1)).to.equal(100);
      const [creator, _] = await upgraded.getRoyaltyInfo(1, ethers.parseEther("100"));
      expect(creator).to.equal(user2.address);
    });
  });

  describe("OVGMarketplaceUpgradeable", function () {
    beforeEach(async function () {
      // Deploy Token
      const OVGToken = await ethers.getContractFactory("OVGTokenUpgradeable");
      token = await upgrades.deployProxy(
        OVGToken,
        [deployer.address, deployer.address, await forwarder.getAddress()],
        { kind: 'uups' }
      );

      // Deploy Assets
      const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
      assets = await upgrades.deployProxy(
        OVGAssets,
        [deployer.address, deployer.address],
        { kind: 'uups' }
      );

      // Deploy Marketplace
      const OVGMarketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
      marketplace = await upgrades.deployProxy(
        OVGMarketplace,
        [await token.getAddress(), await assets.getAddress(), deployer.address],
        { kind: 'uups' }
      );
      await marketplace.waitForDeployment();
    });

    it("Should initialize with correct references", async function () {
      expect(await marketplace.ovgToken()).to.equal(await token.getAddress());
      expect(await marketplace.ovgAssets()).to.equal(await assets.getAddress());
      expect(await marketplace.owner()).to.equal(deployer.address);
    });

    it("Should create listings", async function () {
      // Mint asset and approve
      await assets.mint(deployer.address, 1, 10, "0x");
      await assets.setApprovalForAll(await marketplace.getAddress(), true);
      
      // Create listing
      await marketplace.listAsset(1, 5, ethers.parseEther("100"), false, 0);
      
      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(deployer.address);
      expect(listing.assetId).to.equal(1);
      expect(listing.amount).to.equal(5);
    });

    it("Should preserve state after upgrade", async function () {
      // Create a listing
      await assets.mint(deployer.address, 1, 10, "0x");
      await assets.setApprovalForAll(await marketplace.getAddress(), true);
      await marketplace.listAsset(1, 5, ethers.parseEther("100"), false, 0);
      
      const listingIdBefore = await marketplace.nextListingId();
      
      // Upgrade
      const OVGMarketplace = await ethers.getContractFactory("OVGMarketplaceUpgradeable");
      const upgraded = await upgrades.upgradeProxy(await marketplace.getAddress(), OVGMarketplace);
      
      // State should be preserved
      expect(await upgraded.nextListingId()).to.equal(listingIdBefore);
      const listing = await upgraded.listings(0);
      expect(listing.seller).to.equal(deployer.address);
    });
  });

  describe("OVGLandClaimUpgradeable", function () {
    beforeEach(async function () {
      // Deploy Assets
      const OVGAssets = await ethers.getContractFactory("OVGAssetsUpgradeable");
      assets = await upgrades.deployProxy(
        OVGAssets,
        [deployer.address, deployer.address],
        { kind: 'uups' }
      );

      // Deploy LandClaim
      const OVGLandClaim = await ethers.getContractFactory("OVGLandClaimUpgradeable");
      landClaim = await upgrades.deployProxy(
        OVGLandClaim,
        [await assets.getAddress(), deployer.address],
        { kind: 'uups' }
      );

      // Grant MINTER_ROLE to LandClaim
      const MINTER_ROLE = await assets.MINTER_ROLE();
      await assets.grantRole(MINTER_ROLE, await landClaim.getAddress());
    });

    it("Should initialize correctly", async function () {
      expect(await landClaim.ovgAssets()).to.equal(await assets.getAddress());
      expect(await landClaim.owner()).to.equal(deployer.address);
      expect(await landClaim.claimFee()).to.equal(0);
    });

    it("Should convert coordinates to land ID", async function () {
      const landId = await landClaim.coordsToLandId(1000, 2000);
      expect(landId).to.be.gt(10000); // LAND_ID_OFFSET
    });

    it("Should claim land correctly", async function () {
      await landClaim.connect(user1).claimLand(1000, 2000);
      
      const landId = await landClaim.coordsToLandId(1000, 2000);
      expect(await landClaim.isClaimed(landId)).to.be.true;
      expect(await landClaim.landOwner(landId)).to.equal(user1.address);
      expect(await assets.balanceOf(user1.address, landId)).to.equal(1);
    });

    it("Should preserve state after upgrade", async function () {
      // Claim some land
      await landClaim.connect(user1).claimLand(1000, 2000);
      const landId = await landClaim.coordsToLandId(1000, 2000);
      
      // Upgrade
      const OVGLandClaim = await ethers.getContractFactory("OVGLandClaimUpgradeable");
      const upgraded = await upgrades.upgradeProxy(await landClaim.getAddress(), OVGLandClaim);
      
      // State should be preserved
      expect(await upgraded.isClaimed(landId)).to.be.true;
      expect(await upgraded.landOwner(landId)).to.equal(user1.address);
      expect(await upgraded.totalClaimed()).to.equal(1);
    });
  });

  describe("OVGPaymasterUpgradeable", function () {
    beforeEach(async function () {
      const OVGPaymaster = await ethers.getContractFactory("OVGPaymasterUpgradeable");
      paymaster = await upgrades.deployProxy(
        OVGPaymaster,
        [deployer.address],
        { kind: 'uups' }
      );
      await paymaster.waitForDeployment();
    });

    it("Should initialize correctly", async function () {
      expect(await paymaster.owner()).to.equal(deployer.address);
      expect(await paymaster.MAX_DAILY_TX()).to.equal(3);
    });

    it("Should check eligibility correctly", async function () {
      expect(await paymaster.isEligible(user1.address)).to.be.true;
      
      // Record 3 transactions
      await paymaster.recordTransaction(user1.address);
      await paymaster.recordTransaction(user1.address);
      await paymaster.recordTransaction(user1.address);
      
      expect(await paymaster.isEligible(user1.address)).to.be.false;
    });

    it("Should preserve state after upgrade", async function () {
      // Record a transaction
      await paymaster.recordTransaction(user1.address);
      
      // Upgrade
      const OVGPaymaster = await ethers.getContractFactory("OVGPaymasterUpgradeable");
      const upgraded = await upgrades.upgradeProxy(await paymaster.getAddress(), OVGPaymaster);
      
      // State should be preserved
      expect(await upgraded.txCount(user1.address)).to.equal(1);
    });
  });

  describe("Upgrade Security", function () {
    it("Should reject upgrade from non-authorized account", async function () {
      const OVGPaymaster = await ethers.getContractFactory("OVGPaymasterUpgradeable");
      paymaster = await upgrades.deployProxy(
        OVGPaymaster,
        [deployer.address],
        { kind: 'uups' }
      );

      // Try to upgrade from user1 (not owner)
      const PaymasterAsUser1 = await ethers.getContractFactory("OVGPaymasterUpgradeable", user1);
      
      await expect(
        upgrades.upgradeProxy(await paymaster.getAddress(), PaymasterAsUser1)
      ).to.be.reverted;
    });

    it("Should prevent re-initialization", async function () {
      const OVGPaymaster = await ethers.getContractFactory("OVGPaymasterUpgradeable");
      paymaster = await upgrades.deployProxy(
        OVGPaymaster,
        [deployer.address],
        { kind: 'uups' }
      );

      // Try to call initialize again
      await expect(
        paymaster.initialize(user1.address)
      ).to.be.revertedWithCustomError(paymaster, "InvalidInitialization");
    });
  });
});
