const hre = require("hardhat");

const ADDRESSES = {
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD"
};

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Using account:", signer.address);

  const priceOracle = await hre.ethers.getContractAt("PriceOracle", ADDRESSES.priceOracle);

  // 设置抵押品价格 ETH = $2000
  console.log("\nSetting collateral price to $2000...");
  const collateralKey = hre.ethers.encodeBytes32String("COLLATERAL");
  const tx = await priceOracle.setManualPrice(collateralKey, hre.ethers.parseEther("2000"));
  await tx.wait();
  console.log("Price set successfully!");

  // 验证
  const price = await priceOracle.getCollateralPrice();
  console.log(`Collateral Price: $${hre.ethers.formatEther(price)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
