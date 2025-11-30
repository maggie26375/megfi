const hre = require("hardhat");

async function main() {
  const mUSD = await hre.ethers.getContractAt("MegToken", "0x88316D830419D6f270Cc664d15DB1bb82ac2C20A");
  const resolverAddress = await mUSD.resolver();
  console.log("AddressResolver:", resolverAddress);
}

main();
