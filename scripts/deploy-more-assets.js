const hre = require("hardhat");

// 已部署的合约地址 (Sepolia)
const ADDRESSES = {
  addressResolver: "0x29500269deb97fF92cc50Aa3Db885C5c9B5F091F",
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD",
  megTokenIssuer: "0x9a6279D85ece04195C31D609B4Fc973dfD007b7B",
};

// Chainlink 喂价地址 (Sepolia)
const CHAINLINK_FEEDS = {
  BTC_USD: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  XAU_USD: "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea", // 黄金价格
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 获取已部署的合约
  const addressResolver = await hre.ethers.getContractAt("AddressResolver", ADDRESSES.addressResolver);
  const megTokenIssuer = await hre.ethers.getContractAt("MegTokenIssuer", ADDRESSES.megTokenIssuer);
  const priceOracle = await hre.ethers.getContractAt("PriceOracle", ADDRESSES.priceOracle);

  // ========== 1. 部署 mBTC ==========
  console.log("\n========== Deploying mBTC ==========");

  const mBTCKey = hre.ethers.encodeBytes32String("mBTC");
  const MegToken = await hre.ethers.getContractFactory("MegToken");

  const mBTC = await MegToken.deploy(
    "MegFi Bitcoin",
    "mBTC",
    mBTCKey,
    deployer.address,
    ADDRESSES.addressResolver
  );
  await mBTC.waitForDeployment();
  const mBTCAddress = await mBTC.getAddress();
  console.log("mBTC deployed to:", mBTCAddress);

  // ========== 2. 部署 mGOLD ==========
  console.log("\n========== Deploying mGOLD ==========");

  const mGOLDKey = hre.ethers.encodeBytes32String("mGOLD");

  const mGOLD = await MegToken.deploy(
    "MegFi Gold",
    "mGOLD",
    mGOLDKey,
    deployer.address,
    ADDRESSES.addressResolver
  );
  await mGOLD.waitForDeployment();
  const mGOLDAddress = await mGOLD.getAddress();
  console.log("mGOLD deployed to:", mGOLDAddress);

  // ========== 3. 重建缓存 ==========
  console.log("\n========== Rebuilding caches ==========");

  let tx = await mBTC.rebuildCache();
  await tx.wait();
  console.log("mBTC cache rebuilt");

  tx = await mGOLD.rebuildCache();
  await tx.wait();
  console.log("mGOLD cache rebuilt");

  // ========== 4. 注册到 Issuer ==========
  console.log("\n========== Registering to Issuer ==========");

  tx = await megTokenIssuer.addMegToken(mBTCAddress);
  await tx.wait();
  console.log("mBTC registered");

  tx = await megTokenIssuer.addMegToken(mGOLDAddress);
  await tx.wait();
  console.log("mGOLD registered");

  // ========== 5. 配置 Chainlink 价格源 ==========
  console.log("\n========== Setting up Chainlink price feeds ==========");

  tx = await priceOracle.addAggregator(mBTCKey, CHAINLINK_FEEDS.BTC_USD);
  await tx.wait();
  console.log("BTC/USD price feed configured");

  tx = await priceOracle.addAggregator(mGOLDKey, CHAINLINK_FEEDS.XAU_USD);
  await tx.wait();
  console.log("XAU/USD price feed configured");

  // ========== 6. 验证价格 ==========
  console.log("\n========== Verifying prices ==========");

  const [btcPrice, btcValid] = await priceOracle.getPrice(mBTCKey);
  console.log(`BTC Price: $${hre.ethers.formatEther(btcPrice)} (valid: ${btcValid})`);

  const [goldPrice, goldValid] = await priceOracle.getPrice(mGOLDKey);
  console.log(`Gold Price: $${hre.ethers.formatEther(goldPrice)} (valid: ${goldValid})`);

  // ========== 打印摘要 ==========
  console.log("\n============ Deployment Summary ============");
  console.log("mBTC:", mBTCAddress);
  console.log("mGOLD:", mGOLDAddress);
  console.log("=============================================");
  console.log("\n请将这些地址添加到前端的 contracts.ts 配置文件中");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
