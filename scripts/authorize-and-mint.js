const hre = require("hardhat");

// 部署的合约地址 (Sepolia)
const ADDRESSES = {
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD",
  megTokenIssuer: "0x9a6279D85ece04195C31D609B4Fc973dfD007b7B",
  mUSD: "0x88316D830419D6f270Cc664d15DB1bb82ac2C20A",
  mockWETH: "0xc7cB844Ef871994455A67e3987536203692Df55d",
  collateralVault: "0xDa0848d547301BfC847aBf7f1e8Dc83A9E2c2Bb3"
};

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Using account:", signer.address);

  const megTokenIssuer = await hre.ethers.getContractAt("MegTokenIssuer", ADDRESSES.megTokenIssuer);
  const mockWETH = await hre.ethers.getContractAt("MegToken", ADDRESSES.mockWETH);

  // ========== 步骤 1: 授权我们的账户作为 Vault 来铸造 WETH ==========
  console.log("\n========== Step 1: Authorize account as vault to mint WETH ==========");

  // 检查当前是否已授权 (我们的账户需要被授权为 vault)
  const isAuthorized = await megTokenIssuer.isAuthorizedVault(signer.address);
  console.log(`Current authorization status: ${isAuthorized}`);

  if (!isAuthorized) {
    console.log("Authorizing account as vault...");
    const authTx = await megTokenIssuer.authorizeVault(signer.address);
    await authTx.wait();
    console.log("Authorized!");
  }

  // ========== 步骤 2: 注册 WETH 到 issuer (如果还没有注册) ==========
  console.log("\n========== Step 2: Register WETH in issuer ==========");

  const wethKey = hre.ethers.encodeBytes32String("WETH");
  const registeredWeth = await megTokenIssuer.megTokens(wethKey);
  console.log(`Registered WETH address: ${registeredWeth}`);

  if (registeredWeth === "0x0000000000000000000000000000000000000000") {
    console.log("Registering WETH in issuer...");
    const regTx = await megTokenIssuer.addMegToken(ADDRESSES.mockWETH);
    await regTx.wait();
    console.log("WETH registered!");
  } else {
    console.log("WETH already registered");
  }

  // 刷新 mockWETH 的缓存
  console.log("\nRebuilding mockWETH cache...");
  const rebuildTx = await mockWETH.rebuildCache();
  await rebuildTx.wait();
  console.log("Cache rebuilt!");

  // ========== 步骤 3: 铸造 WETH ==========
  console.log("\n========== Step 3: Mint WETH ==========");

  const currentBalance = await mockWETH.balanceOf(signer.address);
  console.log(`Current WETH balance: ${hre.ethers.formatEther(currentBalance)} WETH`);

  const mintAmount = hre.ethers.parseEther("10");
  console.log(`Minting ${hre.ethers.formatEther(mintAmount)} WETH...`);

  const mintTx = await megTokenIssuer.issueMegToken(
    wethKey,
    signer.address,
    mintAmount
  );
  await mintTx.wait();
  console.log("Minted!");

  const newBalance = await mockWETH.balanceOf(signer.address);
  console.log(`New WETH balance: ${hre.ethers.formatEther(newBalance)} WETH`);

  console.log("\n✅ Authorization and minting completed!");
  console.log("\nNow you can run: npx hardhat run scripts/test-flow.js --network sepolia");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
