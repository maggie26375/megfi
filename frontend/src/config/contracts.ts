import { encodeBytes32String } from 'ethers';

// 合约地址 (Sepolia)
export const ADDRESSES = {
  priceOracle: "0xDD8d0D91B1C99D93123712461DA5F8013ee7C0BD",
  megTokenIssuer: "0x9a6279D85ece04195C31D609B4Fc973dfD007b7B",
  mUSD: "0x88316D830419D6f270Cc664d15DB1bb82ac2C20A",
  mBTC: "0x83A2C107174CD84E2c43c0c85A4A145714B0Cf52",
  mGOLD: "0x66Fc2E58d075476CC33211910dE173F5AcD8Db71",
  mockWETH: "0xc7cB844Ef871994455A67e3987536203692Df55d",
  collateralVault: "0xDa0848d547301BfC847aBf7f1e8Dc83A9E2c2Bb3",
  megSwap: "0x6Cb51AbDafaba27AC4130B1A22BD9b09Fd0BD887"
};

// 支持的合成资产
export const SYNTH_ASSETS = [
  { key: "mUSD", symbol: "mUSD", name: "MegFi USD", address: ADDRESSES.mUSD, decimals: 18 },
  { key: "mBTC", symbol: "mBTC", name: "MegFi Bitcoin", address: ADDRESSES.mBTC, decimals: 18 },
  { key: "mGOLD", symbol: "mGOLD", name: "MegFi Gold", address: ADDRESSES.mGOLD, decimals: 18 },
];

// 获取 bytes32 编码的 key
export const getCurrencyKey = (symbol: string): string => {
  return encodeBytes32String(symbol);
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
  "function liquidate(address account) external",
  "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
  "function maxMintable(address user) external view returns (uint256)",
  "function getCollateralRatio(address user) external view returns (uint256)",
  "function getCollateralRatioForLiquidation(address user) external view returns (uint256)",
  "function isLiquidatable(address user) external view returns (bool)",
  "function collateralToken() external view returns (address)",
  "function minCollateralRatio() external view returns (uint256)",
  "function liquidationRatio() external view returns (uint256)",
  "function liquidationPenalty() external view returns (uint256)",
  "function totalCollateral() external view returns (uint256)",
  "function totalDebt() external view returns (uint256)",
  "event CollateralDeposited(address indexed account, uint256 amount)",
  "event PositionLiquidated(address indexed account, address indexed liquidator, uint256 debtLiquidated, uint256 collateralSeized)"
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
  "function getCollateralSettlementPrice() external view returns (uint256)",
  "function getPrice(bytes32 currencyKey) external view returns (uint256 price, bool isValid)",
  "function getSettlementPrice(bytes32 currencyKey) external view returns (uint256 price, bool isValid)",
  "function getOSMStatus(bytes32 currencyKey) external view returns (uint256 currentPrice, uint256 nextPrice, uint256 nextPriceEffectiveTime, uint256 spotPrice)",
  "function osmEnabled() external view returns (bool)",
  "function poke(bytes32 currencyKey) external",
  "function initializeOSMPrice(bytes32 currencyKey, uint256 price) external"
];

// MegSwap ABI
export const SWAP_ABI = [
  "function swap(bytes32 fromCurrency, bytes32 toCurrency, uint256 fromAmount, uint256 minToAmount) external returns (uint256 toAmount)",
  "function previewSwap(bytes32 fromCurrency, bytes32 toCurrency, uint256 fromAmount) external view returns (uint256 toAmount, uint256 feeAmount)",
  "function swapFee() external view returns (uint256)"
];
