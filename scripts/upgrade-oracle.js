const hre = require("hardhat");

// 现有合约地址
const ADDRESSES = {
  addressResolver: "0x...", // 需要从 Etherscan 获取
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD", // 旧的
  megTokenIssuer: "0x9a6279D85ece04195C31D609B4Fc973dfD007b7B",
  mUSD: "0x88316D830419D6f270Cc664d15DB1bb82ac2C20A",
  mBTC: "0x83A2C107174CD84E2c43c0c85A4A145714B0Cf52",
  mGOLD: "0x66Fc2E58d075476CC33211910dE173F5AcD8Db71",
  mockWETH: "0xc7cB844Ef871994455A67e3987536203692Df55d",
  collateralVault: "0xDa0848d547301BfC847aBf7f1e8Dc83A9E2c2Bb3",
  megSwap: "0x6Cb51AbDafaba27AC4130B1A22BD9b09Fd0BD887"
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Upgrading PriceOracle with account:", deployer.address);

  // 1. 部署新的 PriceOracle（带 OSM）
  console.log("\n1. Deploying new PriceOracle with OSM...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const newPriceOracle = await PriceOracle.deploy(deployer.address);
  await newPriceOracle.waitForDeployment();
  const newPriceOracleAddress = await newPriceOracle.getAddress();
  console.log("New PriceOracle deployed to:", newPriceOracleAddress);

  // 2. 设置抵押品价格
  console.log("\n2. Setting collateral price...");
  const collateralKey = hre.ethers.encodeBytes32String("COLLATERAL");
  const tx1 = await newPriceOracle.setManualPrice(collateralKey, hre.ethers.parseEther("2000"));
  await tx1.wait();
  console.log("Collateral price set to $2000");

  // 3. 初始化 OSM 价格
  console.log("\n3. Initializing OSM price...");
  const tx2 = await newPriceOracle.initializeOSMPrice(collateralKey, hre.ethers.parseEther("2000"));
  await tx2.wait();
  console.log("OSM price initialized to $2000");

  // 4. 设置 mBTC 价格
  console.log("\n4. Setting mBTC price...");
  const mBTCKey = hre.ethers.encodeBytes32String("mBTC");
  const tx3 = await newPriceOracle.setManualPrice(mBTCKey, hre.ethers.parseEther("100000"));
  await tx3.wait();
  console.log("mBTC price set to $100,000");

  // 5. 设置 mGOLD 价格
  console.log("\n5. Setting mGOLD price...");
  const mGOLDKey = hre.ethers.encodeBytes32String("mGOLD");
  const tx4 = await newPriceOracle.setManualPrice(mGOLDKey, hre.ethers.parseEther("2000"));
  await tx4.wait();
  console.log("mGOLD price set to $2,000");

  // 打印结果
  console.log("\n============ Upgrade Summary ============");
  console.log("Old PriceOracle:", ADDRESSES.priceOracle);
  console.log("New PriceOracle:", newPriceOracleAddress);
  console.log("=========================================");
  console.log("\nIMPORTANT: You need to update AddressResolver to point to the new PriceOracle!");
  console.log("Then update frontend/src/config/contracts.ts with the new address.");
  console.log("\nTo update AddressResolver, run:");
  console.log(`  npx hardhat run scripts/update-resolver.js --network sepolia`);

  return newPriceOracleAddress;
}

main()
  .then((address) => {
    console.log("\nUpgrade successful! New PriceOracle:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
