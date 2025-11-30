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

  // 获取合约实例
  const mUSD = await hre.ethers.getContractAt("MegToken", ADDRESSES.mUSD);
  const mockWETH = await hre.ethers.getContractAt("MegToken", ADDRESSES.mockWETH);
  const collateralVault = await hre.ethers.getContractAt("CollateralVault", ADDRESSES.collateralVault);
  const megTokenIssuer = await hre.ethers.getContractAt("MegTokenIssuer", ADDRESSES.megTokenIssuer);

  // ========== 步骤 1: 给自己铸造一些测试 WETH ==========
  console.log("\n========== Step 1: Mint test WETH ==========");

  // 先检查 mockWETH 是否已经在 issuer 中注册，并且我们有权限铸造
  // 注意：mockWETH 也是 MegToken，需要通过 issuer 铸造
  // 但我们需要先授权 - 这里用一个简化的方式：直接让 owner 铸造

  const wethBalance = await mockWETH.balanceOf(signer.address);
  console.log(`Current WETH balance: ${hre.ethers.formatEther(wethBalance)} WETH`);

  if (wethBalance < hre.ethers.parseEther("1")) {
    console.log("Minting 10 WETH for testing...");
    // mockWETH 需要通过 issuer 铸造，但我们的 vault 没有授权铸造 WETH
    // 所以我们需要一个变通方案 - 检查是否已授权
    try {
      const tx = await megTokenIssuer.issueMegToken(
        hre.ethers.encodeBytes32String("WETH"),
        signer.address,
        hre.ethers.parseEther("10")
      );
      await tx.wait();
      console.log("Minted 10 WETH!");
    } catch (e) {
      console.log("Cannot mint WETH through issuer, need to authorize first");
      console.log("Let's create a simple mock token instead...");
    }
  }

  const newWethBalance = await mockWETH.balanceOf(signer.address);
  console.log(`WETH balance after: ${hre.ethers.formatEther(newWethBalance)} WETH`);

  // ========== 步骤 2: 授权 Vault 使用 WETH ==========
  console.log("\n========== Step 2: Approve WETH for Vault ==========");

  const allowance = await mockWETH.allowance(signer.address, ADDRESSES.collateralVault);
  console.log(`Current allowance: ${hre.ethers.formatEther(allowance)} WETH`);

  if (allowance < hre.ethers.parseEther("10")) {
    console.log("Approving Vault to spend WETH...");
    const approveTx = await mockWETH.approve(ADDRESSES.collateralVault, hre.ethers.MaxUint256);
    await approveTx.wait();
    console.log("Approved!");
  }

  // ========== 步骤 3: 存入抵押品 ==========
  console.log("\n========== Step 3: Deposit collateral ==========");

  const currentWethBalance = await mockWETH.balanceOf(signer.address);
  if (currentWethBalance >= hre.ethers.parseEther("1")) {
    const depositAmount = hre.ethers.parseEther("1"); // 存入 1 WETH
    console.log(`Depositing ${hre.ethers.formatEther(depositAmount)} WETH...`);

    const depositTx = await collateralVault.deposit(depositAmount);
    await depositTx.wait();
    console.log("Deposited!");
  } else {
    console.log("Not enough WETH to deposit");
  }

  // ========== 步骤 4: 查看仓位 ==========
  console.log("\n========== Step 4: Check position ==========");

  const position = await collateralVault.getPosition(signer.address);
  console.log(`Collateral: ${hre.ethers.formatEther(position.collateral)} WETH`);
  console.log(`Debt: ${hre.ethers.formatEther(position.debt)} mUSD`);

  // 计算最大可铸造量
  const maxMintable = await collateralVault.maxMintable(signer.address);
  console.log(`Max mintable: ${hre.ethers.formatEther(maxMintable)} mUSD`);

  // ========== 步骤 5: 铸造 mUSD ==========
  console.log("\n========== Step 5: Mint mUSD ==========");

  if (position.collateral > 0 && maxMintable > 0) {
    // 铸造最大量的 50%，保持安全
    const mintAmount = maxMintable / 2n;
    console.log(`Minting ${hre.ethers.formatEther(mintAmount)} mUSD...`);

    const mintTx = await collateralVault.mint(mintAmount);
    await mintTx.wait();
    console.log("Minted!");
  } else {
    console.log("Cannot mint - no collateral or max mintable is 0");
  }

  // ========== 步骤 6: 最终状态 ==========
  console.log("\n========== Final Status ==========");

  const finalPosition = await collateralVault.getPosition(signer.address);
  const finalMUSDBalance = await mUSD.balanceOf(signer.address);
  const collateralRatio = await collateralVault.getCollateralRatio(signer.address);

  console.log(`Your WETH in Vault: ${hre.ethers.formatEther(finalPosition.collateral)} WETH`);
  console.log(`Your Debt: ${hre.ethers.formatEther(finalPosition.debt)} mUSD`);
  console.log(`Your mUSD Balance: ${hre.ethers.formatEther(finalMUSDBalance)} mUSD`);

  if (finalPosition.debt > 0) {
    console.log(`Collateral Ratio: ${Number(hre.ethers.formatEther(collateralRatio)) * 100}%`);
  }

  console.log("\n✅ Test flow completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
