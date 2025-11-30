const hre = require("hardhat");

// 部署的合约地址 (Sepolia)
const ADDRESSES = {
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD",
};

// Chainlink 喂价地址 (Sepolia 测试网)
// 完整列表: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet
const CHAINLINK_FEEDS = {
  // ETH/USD
  ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  // BTC/USD
  BTC_USD: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  // LINK/USD
  LINK_USD: "0xc59E3633BAAC79493d908e63626716e204A45EdF",
};

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Using account:", signer.address);

  const priceOracle = await hre.ethers.getContractAt("PriceOracle", ADDRESSES.priceOracle);

  // ========== 配置 Chainlink ETH/USD 喂价 ==========
  console.log("\n========== Setting up Chainlink Price Feeds ==========");

  // 使用 COLLATERAL 作为 key (你的合约用这个 key 获取抵押品价格)
  const collateralKey = hre.ethers.encodeBytes32String("COLLATERAL");

  console.log("\nAdding ETH/USD Chainlink aggregator for COLLATERAL...");
  const tx = await priceOracle.addAggregator(collateralKey, CHAINLINK_FEEDS.ETH_USD);
  await tx.wait();
  console.log("Done! ETH/USD Chainlink feed configured.");

  // ========== 验证价格 ==========
  console.log("\n========== Verifying Price ==========");

  const [price, isValid] = await priceOracle.getPrice(collateralKey);
  console.log(`Current ETH Price: $${hre.ethers.formatEther(price)}`);
  console.log(`Price is valid: ${isValid}`);

  // 也获取一下抵押品价格
  const collateralPrice = await priceOracle.getCollateralPrice();
  console.log(`Collateral Price (via getCollateralPrice): $${hre.ethers.formatEther(collateralPrice)}`);

  console.log("\n========== Price Feed Info ==========");
  const feedInfo = await priceOracle.priceFeeds(collateralKey);
  console.log(`Aggregator address: ${feedInfo.aggregator}`);
  console.log(`Decimals: ${feedInfo.decimals}`);
  console.log(`Using manual price: ${feedInfo.useManual}`);

  console.log("\n✅ Chainlink price feed setup completed!");
  console.log("\n现在你的合约使用真实的市场价格，不再是你手动设置的价格了。");
  console.log("价格由 Chainlink 去中心化预言机网络提供，你无法操控。");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
