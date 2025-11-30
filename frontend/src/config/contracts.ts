// 合约地址 (Sepolia)
export const ADDRESSES = {
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD",
  megTokenIssuer: "0x9a6279D85ece04195C31D609B4Fc973dfD007b7B",
  mUSD: "0x88316D830419D6f270Cc664d15DB1bb82ac2C20A",
  mockWETH: "0xc7cB844Ef871994455A67e3987536203692Df55d",
  collateralVault: "0xDa0848d547301BfC847aBf7f1e8Dc83A9E2c2Bb3"
};

// Sepolia 网络配置
export const NETWORK = {
  chainId: 11155111,
  chainIdHex: "0xaa36a7",
  name: "Sepolia",
  rpcUrl: "https://sepolia.infura.io/v3/",
  explorer: "https://sepolia.etherscan.io"
};

// CollateralVault ABI (只包含我们需要的函数)
export const VAULT_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function mint(uint256 amount) external",
  "function burn(uint256 amount) external",
  "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
  "function maxMintable(address user) external view returns (uint256)",
  "function getCollateralRatio(address user) external view returns (uint256)",
  "function collateralToken() external view returns (address)",
  "function minCollateralRatio() external view returns (uint256)",
  "function liquidationRatio() external view returns (uint256)"
];

// MegToken (ERC20) ABI
export const TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)"
];

// PriceOracle ABI
export const ORACLE_ABI = [
  "function getCollateralPrice() external view returns (uint256)",
  "function getPrice(bytes32 currencyKey) external view returns (uint256 price, bool isValid)"
];
