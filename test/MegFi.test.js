const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MegFi Protocol", function () {
  let owner, user1, user2;
  let addressResolver, priceOracle, megTokenIssuer;
  let mUSD, mockWETH, collateralVault;

  const mUSDKey = ethers.encodeBytes32String("mUSD");
  const collateralKey = ethers.encodeBytes32String("COLLATERAL");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // 部署 AddressResolver
    const AddressResolver = await ethers.getContractFactory("AddressResolver");
    addressResolver = await AddressResolver.deploy(owner.address);

    // 部署 PriceOracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy(owner.address);

    // 部署 MegTokenIssuer
    const MegTokenIssuer = await ethers.getContractFactory("MegTokenIssuer");
    megTokenIssuer = await MegTokenIssuer.deploy(owner.address, await addressResolver.getAddress());

    // 部署 mUSD
    const MegToken = await ethers.getContractFactory("MegToken");
    mUSD = await MegToken.deploy(
      "MegFi USD",
      "mUSD",
      mUSDKey,
      owner.address,
      await addressResolver.getAddress()
    );

    // 部署模拟 WETH
    mockWETH = await MegToken.deploy(
      "Wrapped Ether",
      "WETH",
      ethers.encodeBytes32String("WETH"),
      owner.address,
      await addressResolver.getAddress()
    );

    // 部署 CollateralVault
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    collateralVault = await CollateralVault.deploy(
      owner.address,
      await addressResolver.getAddress(),
      await mockWETH.getAddress(),
      mUSDKey,
      ethers.parseEther("1.5"),   // 150% 最低抵押率
      ethers.parseEther("1.2"),   // 120% 清算线
      ethers.parseEther("0.1")    // 10% 清算惩罚
    );

    // 配置 AddressResolver
    const names = [
      ethers.encodeBytes32String("PriceOracle"),
      ethers.encodeBytes32String("MegTokenIssuer")
    ];
    const addresses = [
      await priceOracle.getAddress(),
      await megTokenIssuer.getAddress()
    ];
    await addressResolver.importAddresses(names, addresses);

    // 重建缓存
    await mUSD.rebuildCache();
    await megTokenIssuer.rebuildCache();
    await collateralVault.rebuildCache();

    // 配置 Issuer
    await megTokenIssuer.addMegToken(await mUSD.getAddress());
    await megTokenIssuer.authorizeVault(await collateralVault.getAddress());

    // 设置抵押品价格: ETH = $2000
    await priceOracle.setManualPrice(collateralKey, ethers.parseEther("2000"));

    // 给 user1 一些 WETH 用于测试
    await megTokenIssuer.addMegToken(await mockWETH.getAddress());
  });

  describe("MegToken", function () {
    it("should have correct name and symbol", async function () {
      expect(await mUSD.name()).to.equal("MegFi USD");
      expect(await mUSD.symbol()).to.equal("mUSD");
    });

    it("should have correct currencyKey", async function () {
      expect(await mUSD.currencyKey()).to.equal(mUSDKey);
    });
  });

  describe("PriceOracle", function () {
    it("should return mUSD price as 1", async function () {
      const [price, isValid] = await priceOracle.getPrice(mUSDKey);
      expect(price).to.equal(ethers.parseEther("1"));
      expect(isValid).to.be.true;
    });

    it("should return collateral price", async function () {
      const price = await priceOracle.getCollateralPrice();
      expect(price).to.equal(ethers.parseEther("2000"));
    });

    it("should allow owner to set manual price", async function () {
      const newKey = ethers.encodeBytes32String("TEST");
      await priceOracle.setManualPrice(newKey, ethers.parseEther("100"));
      const [price, isValid] = await priceOracle.getPrice(newKey);
      expect(price).to.equal(ethers.parseEther("100"));
      expect(isValid).to.be.true;
    });
  });

  describe("MegTokenIssuer", function () {
    it("should have mUSD registered", async function () {
      const megToken = await megTokenIssuer.megTokens(mUSDKey);
      expect(megToken).to.equal(await mUSD.getAddress());
    });

    it("should return available currency keys", async function () {
      const keys = await megTokenIssuer.availableCurrencyKeys();
      expect(keys.length).to.be.greaterThan(0);
    });
  });

  describe("CollateralVault", function () {
    it("should have correct configuration", async function () {
      expect(await collateralVault.minCollateralRatio()).to.equal(ethers.parseEther("1.5"));
      expect(await collateralVault.liquidationRatio()).to.equal(ethers.parseEther("1.2"));
      expect(await collateralVault.liquidationPenalty()).to.equal(ethers.parseEther("0.1"));
    });

    it("should allow admin to change parameters", async function () {
      await collateralVault.setMinCollateralRatio(ethers.parseEther("2"));
      expect(await collateralVault.minCollateralRatio()).to.equal(ethers.parseEther("2"));
    });

    it("should be pausable", async function () {
      await collateralVault.setActive(false);
      expect(await collateralVault.isActive()).to.be.false;
    });
  });

  describe("AddressResolver", function () {
    it("should store and retrieve addresses correctly", async function () {
      // 使用已有的 addressResolver，检查 PriceOracle 地址
      const oracleKey = ethers.encodeBytes32String("PriceOracle");

      // 获取存储的地址
      const storedAddr = await addressResolver.repository(oracleKey);
      const expectedAddr = await priceOracle.getAddress();

      expect(storedAddr).to.equal(expectedAddr);
    });

    it("should allow importing new addresses", async function () {
      const testKey = ethers.encodeBytes32String("NewContract");
      const testAddress = "0x1234567890123456789012345678901234567890";

      // 导入新地址
      await addressResolver.importAddresses([testKey], [testAddress]);

      // 验证 - 使用 repository 直接访问
      const stored = await addressResolver.repository(testKey);
      expect(stored).to.equal(testAddress);
    });
  });

  describe("Ownership", function () {
    it("should allow two-step ownership transfer", async function () {
      await addressResolver.nominateNewOwner(user1.address);
      expect(await addressResolver.nominatedOwner()).to.equal(user1.address);

      await addressResolver.connect(user1).acceptOwnership();
      expect(await addressResolver.owner()).to.equal(user1.address);
    });

    it("should reject ownership acceptance from non-nominated address", async function () {
      await addressResolver.nominateNewOwner(user1.address);
      await expect(
        addressResolver.connect(user2).acceptOwnership()
      ).to.be.revertedWith("You must be nominated before you can accept ownership");
    });
  });
});
