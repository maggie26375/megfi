const hre = require("hardhat");

// 已部署的合约地址 (Sepolia)
const ADDRESSES = {
  addressResolver: "0x29500269deb97fF92cc50Aa3Db885C5c9B5F091F",
  megTokenIssuer: "0x9a6279D85ece04195C31D609B4Fc973dfD007b7B",
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying MegSwap with account:", deployer.address);

  // ========== 1. 部署 MegSwap ==========
  console.log("\n========== Deploying MegSwap ==========");

  const MegSwap = await hre.ethers.getContractFactory("MegSwap");
  const megSwap = await MegSwap.deploy(
    deployer.address,
    ADDRESSES.addressResolver
  );
  await megSwap.waitForDeployment();
  const megSwapAddress = await megSwap.getAddress();
  console.log("MegSwap deployed to:", megSwapAddress);

  // ========== 2. 重建缓存 ==========
  console.log("\n========== Rebuilding cache ==========");
  let tx = await megSwap.rebuildCache();
  await tx.wait();
  console.log("MegSwap cache rebuilt");

  // ========== 3. 授权 MegSwap 为 Vault ==========
  console.log("\n========== Authorizing MegSwap ==========");
  const megTokenIssuer = await hre.ethers.getContractAt("MegTokenIssuer", ADDRESSES.megTokenIssuer);

  tx = await megTokenIssuer.authorizeVault(megSwapAddress);
  await tx.wait();
  console.log("MegSwap authorized as vault");

  // ========== 4. 测试 previewSwap ==========
  console.log("\n========== Testing previewSwap ==========");

  const mUSDKey = hre.ethers.encodeBytes32String("mUSD");
  const mBTCKey = hre.ethers.encodeBytes32String("mBTC");

  const testAmount = hre.ethers.parseEther("1000"); // 1000 mUSD
  const [toAmount, feeAmount] = await megSwap.previewSwap(mUSDKey, mBTCKey, testAmount);

  console.log(`1000 mUSD -> ${hre.ethers.formatEther(toAmount)} mBTC`);
  console.log(`Fee: ${hre.ethers.formatEther(feeAmount)} mBTC`);

  // ========== 打印摘要 ==========
  console.log("\n============ Deployment Summary ============");
  console.log("MegSwap:", megSwapAddress);
  console.log("Swap Fee: 0.3%");
  console.log("=============================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
