const hre = require("hardhat");

// 合约地址
const ADDRESS_RESOLVER = "0x29500269deb97fF92cc50Aa3Db885C5c9B5F091F";
// 新的 PriceOracle 地址 - 部署后填入
const NEW_PRICE_ORACLE = process.env.NEW_PRICE_ORACLE || "";

async function main() {
  if (!NEW_PRICE_ORACLE) {
    console.log("Please set NEW_PRICE_ORACLE environment variable");
    console.log("Usage: NEW_PRICE_ORACLE=0x... npx hardhat run scripts/update-resolver.js --network sepolia");
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Updating AddressResolver with account:", deployer.address);

  // 获取 AddressResolver 合约
  const addressResolver = await hre.ethers.getContractAt("AddressResolver", ADDRESS_RESOLVER);

  // 更新 PriceOracle 地址
  console.log("\nUpdating PriceOracle address in resolver...");
  const priceOracleKey = hre.ethers.encodeBytes32String("PriceOracle");

  const tx = await addressResolver.importAddresses(
    [priceOracleKey],
    [NEW_PRICE_ORACLE]
  );
  await tx.wait();

  console.log("PriceOracle address updated to:", NEW_PRICE_ORACLE);

  // 需要重建各合约的缓存
  console.log("\nRebuilding caches...");

  // CollateralVault
  const collateralVault = await hre.ethers.getContractAt("CollateralVault", "0xDa0848d547301BfC847aBf7f1e8Dc83A9E2c2Bb3");
  const tx1 = await collateralVault.rebuildCache();
  await tx1.wait();
  console.log("  - CollateralVault cache rebuilt");

  // MegSwap
  const megSwap = await hre.ethers.getContractAt("MegSwap", "0x6Cb51AbDafaba27AC4130B1A22BD9b09Fd0BD887");
  const tx2 = await megSwap.rebuildCache();
  await tx2.wait();
  console.log("  - MegSwap cache rebuilt");

  console.log("\nDone! AddressResolver updated successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
