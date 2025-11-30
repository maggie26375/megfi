const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying MegFi Protocol with the account:", deployer.address);

  // 1. 部署 AddressResolver
  console.log("\n1. Deploying AddressResolver...");
  const AddressResolver = await hre.ethers.getContractFactory("AddressResolver");
  const addressResolver = await AddressResolver.deploy(deployer.address);
  await addressResolver.waitForDeployment();
  const resolverAddress = await addressResolver.getAddress();
  console.log("AddressResolver deployed to:", resolverAddress);

  // 2. 部署 PriceOracle
  console.log("\n2. Deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(deployer.address);
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log("PriceOracle deployed to:", priceOracleAddress);

  // 3. 部署 MegTokenIssuer
  console.log("\n3. Deploying MegTokenIssuer...");
  const MegTokenIssuer = await hre.ethers.getContractFactory("MegTokenIssuer");
  const megTokenIssuer = await MegTokenIssuer.deploy(deployer.address, resolverAddress);
  await megTokenIssuer.waitForDeployment();
  const megTokenIssuerAddress = await megTokenIssuer.getAddress();
  console.log("MegTokenIssuer deployed to:", megTokenIssuerAddress);

  // 4. 部署 MegToken (mUSD)
  console.log("\n4. Deploying MegToken (mUSD)...");
  const mUSDKey = hre.ethers.encodeBytes32String("mUSD");
  const MegToken = await hre.ethers.getContractFactory("MegToken");
  const mUSD = await MegToken.deploy(
    "MegFi USD",
    "mUSD",
    mUSDKey,
    deployer.address,
    resolverAddress
  );
  await mUSD.waitForDeployment();
  const mUSDAddress = await mUSD.getAddress();
  console.log("mUSD deployed to:", mUSDAddress);

  // 5. 部署模拟抵押品代币 (用于测试)
  console.log("\n5. Deploying Mock Collateral Token (WETH)...");
  const mockWETH = await MegToken.deploy(
    "Wrapped Ether",
    "WETH",
    hre.ethers.encodeBytes32String("WETH"),
    deployer.address,
    resolverAddress
  );
  await mockWETH.waitForDeployment();
  const mockWETHAddress = await mockWETH.getAddress();
  console.log("Mock WETH deployed to:", mockWETHAddress);

  // 6. 部署 CollateralVault
  console.log("\n6. Deploying CollateralVault...");
  const CollateralVault = await hre.ethers.getContractFactory("CollateralVault");
  const collateralVault = await CollateralVault.deploy(
    deployer.address,
    resolverAddress,
    mockWETHAddress,  // 抵押品代币
    mUSDKey,          // 铸造的合成资产
    hre.ethers.parseEther("1.5"),   // 最低抵押率 150%
    hre.ethers.parseEther("1.2"),   // 清算线 120%
    hre.ethers.parseEther("0.1")    // 清算惩罚 10%
  );
  await collateralVault.waitForDeployment();
  const collateralVaultAddress = await collateralVault.getAddress();
  console.log("CollateralVault deployed to:", collateralVaultAddress);

  // 7. 配置 AddressResolver
  console.log("\n7. Configuring AddressResolver...");
  const names = [
    hre.ethers.encodeBytes32String("PriceOracle"),
    hre.ethers.encodeBytes32String("MegTokenIssuer"),
    hre.ethers.encodeBytes32String("mUSD"),
    hre.ethers.encodeBytes32String("CollateralVault")
  ];
  const addresses = [
    priceOracleAddress,
    megTokenIssuerAddress,
    mUSDAddress,
    collateralVaultAddress
  ];
  const importTx = await addressResolver.importAddresses(names, addresses);
  await importTx.wait();
  console.log("Addresses imported to resolver");

  // 8. 重建缓存
  console.log("\n8. Rebuilding caches...");
  const tx1 = await mUSD.rebuildCache();
  await tx1.wait();
  console.log("  - mUSD cache rebuilt");

  const tx2 = await megTokenIssuer.rebuildCache();
  await tx2.wait();
  console.log("  - MegTokenIssuer cache rebuilt");

  const tx3 = await collateralVault.rebuildCache();
  await tx3.wait();
  console.log("  - CollateralVault cache rebuilt");

  // 9. 配置 MegTokenIssuer
  console.log("\n9. Configuring MegTokenIssuer...");
  const tx4 = await megTokenIssuer.addMegToken(mUSDAddress);
  await tx4.wait();
  console.log("  - mUSD added");

  const tx5 = await megTokenIssuer.authorizeVault(collateralVaultAddress);
  await tx5.wait();
  console.log("  - CollateralVault authorized");

  // 10. 设置抵押品价格 (假设 ETH = $2000)
  console.log("\n10. Setting collateral price...");
  const collateralKey = hre.ethers.encodeBytes32String("COLLATERAL");
  const tx6 = await priceOracle.setManualPrice(collateralKey, hre.ethers.parseEther("2000"));
  await tx6.wait();
  console.log("Collateral price set to $2000");

  // 打印部署摘要
  console.log("\n============ MegFi Protocol Deployment Summary ============");
  console.log("AddressResolver:", resolverAddress);
  console.log("PriceOracle:", priceOracleAddress);
  console.log("MegTokenIssuer:", megTokenIssuerAddress);
  console.log("mUSD:", mUSDAddress);
  console.log("Mock WETH:", mockWETHAddress);
  console.log("CollateralVault:", collateralVaultAddress);
  console.log("============================================================");

  // 返回部署的合约地址
  return {
    addressResolver: resolverAddress,
    priceOracle: priceOracleAddress,
    megTokenIssuer: megTokenIssuerAddress,
    mUSD: mUSDAddress,
    mockWETH: mockWETHAddress,
    collateralVault: collateralVaultAddress
  };
}

main()
  .then((addresses) => {
    console.log("\nMegFi Protocol deployment successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
