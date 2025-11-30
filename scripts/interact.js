const hre = require("hardhat");

// 部署的合约地址 (Sepolia)
const ADDRESSES = {
  addressResolver: "0x29500269deb97fF92cc50Aa3Db885C5c9B5F091F",
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD",
  megTokenIssuer: "0x9a6279D85ece04195C31D609B4Fc973dfD007b7B",
  mUSD: "0x88316D830419D6f270Cc664d15DB1bb82ac2C20A",
  mockWETH: "0xc7cB844Ef871994455A67e3987536203692Df55d",
  collateralVault: "0xDa0848d547301BfC847aBf7f1e8Dc83A9E2c2Bb3"
};

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Using account:", signer.address);

  // 获取合约实例
  const mUSD = await hre.ethers.getContractAt("MegToken", ADDRESSES.mUSD);
  const priceOracle = await hre.ethers.getContractAt("PriceOracle", ADDRESSES.priceOracle);
  const collateralVault = await hre.ethers.getContractAt("CollateralVault", ADDRESSES.collateralVault);

  // 查询信息
  console.log("\n========== MegFi Protocol Status ==========");

  // mUSD 信息
  const name = await mUSD.name();
  const symbol = await mUSD.symbol();
  const totalSupply = await mUSD.totalSupply();
  console.log(`\nmUSD Token:`);
  console.log(`  Name: ${name}`);
  console.log(`  Symbol: ${symbol}`);
  console.log(`  Total Supply: ${hre.ethers.formatEther(totalSupply)} mUSD`);

  // 价格信息
  const collateralPrice = await priceOracle.getCollateralPrice();
  console.log(`\nPrice Oracle:`);
  console.log(`  Collateral Price: $${hre.ethers.formatEther(collateralPrice)}`);

  // Vault 信息
  const minRatio = await collateralVault.minCollateralRatio();
  const liquidationRatio = await collateralVault.liquidationRatio();
  const totalCollateral = await collateralVault.totalCollateral();
  const totalDebt = await collateralVault.totalDebt();
  console.log(`\nCollateral Vault:`);
  console.log(`  Min Collateral Ratio: ${hre.ethers.formatEther(minRatio) * 100}%`);
  console.log(`  Liquidation Ratio: ${hre.ethers.formatEther(liquidationRatio) * 100}%`);
  console.log(`  Total Collateral: ${hre.ethers.formatEther(totalCollateral)}`);
  console.log(`  Total Debt: ${hre.ethers.formatEther(totalDebt)} mUSD`);

  // 用户仓位
  const position = await collateralVault.getPosition(signer.address);
  console.log(`\nYour Position:`);
  console.log(`  Collateral: ${hre.ethers.formatEther(position.collateral)}`);
  console.log(`  Debt: ${hre.ethers.formatEther(position.debt)} mUSD`);

  console.log("\n=============================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
