// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ICollateralVault.sol";
import "./interfaces/IMegToken.sol";

/// @title CollateralVault - MegFi 抵押品仓库
/// @notice 用户存入抵押品来铸造 MegFi 合成资产
/// @dev MegFi Protocol 的核心 CDP 合约
contract CollateralVault is Owned, MixinResolver, ReentrancyGuard, ICollateralVault {
    using SafeERC20 for IERC20;

    // ========== STATE VARIABLES ==========

    // 抵押品代币 (例如 WETH, USDC 等)
    IERC20 public collateralToken;

    // 合成资产的 currency key (例如 "mUSD")
    bytes32 public megTokenKey;

    // 用户仓位
    mapping(address => Position) public positions;

    // 全局统计
    uint256 public override totalCollateral;
    uint256 public override totalDebt;

    // 系统参数
    uint256 public constant PRECISION = 1e18;
    uint256 public minCollateralRatio;        // 最低抵押率 (例如 150% = 1.5e18)
    uint256 public liquidationRatio;          // 清算线 (例如 120% = 1.2e18)
    uint256 public liquidationPenalty;        // 清算惩罚 (例如 10% = 0.1e18)

    // 系统状态
    bool public isActive = true;

    // ========== ADDRESS RESOLVER CONFIGURATION ==========

    bytes32 private constant CONTRACT_PRICE_ORACLE = "PriceOracle";
    bytes32 private constant CONTRACT_ISSUER = "MegTokenIssuer";

    // ========== CONSTRUCTOR ==========

    constructor(
        address _owner,
        address _resolver,
        address _collateralToken,
        bytes32 _megTokenKey,
        uint256 _minCollateralRatio,
        uint256 _liquidationRatio,
        uint256 _liquidationPenalty
    )
        Owned(_owner)
        MixinResolver(_resolver)
    {
        collateralToken = IERC20(_collateralToken);
        megTokenKey = _megTokenKey;
        minCollateralRatio = _minCollateralRatio;
        liquidationRatio = _liquidationRatio;
        liquidationPenalty = _liquidationPenalty;
    }

    // ========== VIEWS ==========

    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_PRICE_ORACLE;
        addresses[1] = CONTRACT_ISSUER;
    }

    function priceOracle() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_PRICE_ORACLE);
    }

    function issuer() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_ISSUER);
    }

    /// @notice 获取用户仓位
    function getPosition(address account) external view override returns (Position memory) {
        return positions[account];
    }

    /// @notice 获取抵押率
    /// @param account 用户地址
    /// @return 抵押率 (18 位精度)
    function getCollateralRatio(address account) public view override returns (uint256) {
        Position memory pos = positions[account];
        if (pos.debt == 0) return type(uint256).max;

        uint256 collateralValue = _getCollateralValue(pos.collateral);
        uint256 debtValue = _getDebtValue(pos.debt);

        return (collateralValue * PRECISION) / debtValue;
    }

    /// @notice 检查仓位是否可被清算
    function isLiquidatable(address account) public view override returns (bool) {
        Position memory pos = positions[account];
        if (pos.debt == 0) return false;

        uint256 ratio = getCollateralRatio(account);
        return ratio < liquidationRatio;
    }

    /// @notice 获取抵押品价值 (以 mUSD 计价)
    function _getCollateralValue(uint256 collateralAmount) internal view returns (uint256) {
        // 调用 PriceOracle 获取价格
        (bool success, bytes memory data) = priceOracle().staticcall(
            abi.encodeWithSignature("getCollateralPrice()")
        );
        require(success, "Price oracle call failed");
        uint256 price = abi.decode(data, (uint256));
        return (collateralAmount * price) / PRECISION;
    }

    /// @notice 获取债务价值
    function _getDebtValue(uint256 debtAmount) internal pure returns (uint256) {
        // mUSD 债务，1:1 计价
        return debtAmount;
    }

    /// @notice 计算最大可铸造数量
    function maxMintable(address account) external view returns (uint256) {
        Position memory pos = positions[account];
        uint256 collateralValue = _getCollateralValue(pos.collateral);
        uint256 maxDebt = (collateralValue * PRECISION) / minCollateralRatio;

        if (maxDebt <= pos.debt) return 0;
        return maxDebt - pos.debt;
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /// @notice 存入抵押品
    function deposit(uint256 amount) external override nonReentrant whenActive {
        require(amount > 0, "Amount must be > 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        positions[msg.sender].collateral += amount;
        positions[msg.sender].lastUpdateTime = block.timestamp;
        totalCollateral += amount;

        emit CollateralDeposited(msg.sender, amount);
    }

    /// @notice 提取抵押品
    function withdraw(uint256 amount) external override nonReentrant whenActive {
        Position storage pos = positions[msg.sender];
        require(amount > 0, "Amount must be > 0");
        require(pos.collateral >= amount, "Insufficient collateral");

        // 检查提取后的抵押率
        uint256 newCollateral = pos.collateral - amount;
        if (pos.debt > 0) {
            uint256 newCollateralValue = _getCollateralValue(newCollateral);
            uint256 debtValue = _getDebtValue(pos.debt);
            uint256 newRatio = (newCollateralValue * PRECISION) / debtValue;
            require(newRatio >= minCollateralRatio, "Would breach min collateral ratio");
        }

        pos.collateral = newCollateral;
        pos.lastUpdateTime = block.timestamp;
        totalCollateral -= amount;

        collateralToken.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice 铸造合成资产
    function mint(uint256 amount) external override nonReentrant whenActive {
        require(amount > 0, "Amount must be > 0");

        Position storage pos = positions[msg.sender];

        // 计算新的抵押率
        uint256 newDebt = pos.debt + amount;
        uint256 collateralValue = _getCollateralValue(pos.collateral);
        uint256 debtValue = _getDebtValue(newDebt);
        uint256 newRatio = (collateralValue * PRECISION) / debtValue;
        require(newRatio >= minCollateralRatio, "Would breach min collateral ratio");

        pos.debt = newDebt;
        pos.lastUpdateTime = block.timestamp;
        totalDebt += amount;

        // 调用 Issuer 铸造代币
        (bool success, ) = issuer().call(
            abi.encodeWithSignature("issueMegToken(bytes32,address,uint256)", megTokenKey, msg.sender, amount)
        );
        require(success, "Issuer call failed");

        emit MegTokenMinted(msg.sender, amount);
    }

    /// @notice 销毁合成资产还债
    function burn(uint256 amount) external override nonReentrant whenActive {
        Position storage pos = positions[msg.sender];
        require(amount > 0, "Amount must be > 0");
        require(pos.debt >= amount, "Amount exceeds debt");

        pos.debt -= amount;
        pos.lastUpdateTime = block.timestamp;
        totalDebt -= amount;

        // 调用 Issuer 销毁代币
        (bool success, ) = issuer().call(
            abi.encodeWithSignature("burnMegToken(bytes32,address,uint256)", megTokenKey, msg.sender, amount)
        );
        require(success, "Issuer call failed");

        emit MegTokenBurned(msg.sender, amount);
    }

    /// @notice 清算不健康的仓位
    function liquidate(address account) external override nonReentrant whenActive {
        require(isLiquidatable(account), "Position is healthy");
        require(msg.sender != account, "Cannot liquidate yourself");

        Position storage pos = positions[account];
        uint256 debtToLiquidate = pos.debt;
        uint256 collateralToSeize = pos.collateral;

        // 计算清算惩罚
        uint256 penalty = (collateralToSeize * liquidationPenalty) / PRECISION;
        uint256 collateralToLiquidator = collateralToSeize - penalty;

        // 更新状态
        totalCollateral -= collateralToSeize;
        totalDebt -= debtToLiquidate;

        pos.collateral = 0;
        pos.debt = 0;
        pos.lastUpdateTime = block.timestamp;

        // 清算者需要先销毁债务对应的 mUSD
        (bool success, ) = issuer().call(
            abi.encodeWithSignature("burnMegToken(bytes32,address,uint256)", megTokenKey, msg.sender, debtToLiquidate)
        );
        require(success, "Burn failed");

        // 转移抵押品给清算者
        collateralToken.safeTransfer(msg.sender, collateralToLiquidator);

        // 罚金转给协议 (owner)
        collateralToken.safeTransfer(owner, penalty);

        emit PositionLiquidated(account, msg.sender, debtToLiquidate, collateralToSeize);
    }

    // ========== ADMIN FUNCTIONS ==========

    function setMinCollateralRatio(uint256 _ratio) external onlyOwner {
        minCollateralRatio = _ratio;
        emit MinCollateralRatioUpdated(_ratio);
    }

    function setLiquidationRatio(uint256 _ratio) external onlyOwner {
        liquidationRatio = _ratio;
        emit LiquidationRatioUpdated(_ratio);
    }

    function setLiquidationPenalty(uint256 _penalty) external onlyOwner {
        liquidationPenalty = _penalty;
        emit LiquidationPenaltyUpdated(_penalty);
    }

    function setActive(bool _active) external onlyOwner {
        isActive = _active;
        emit SystemStatusUpdated(_active);
    }

    // ========== MODIFIERS ==========

    modifier whenActive() {
        require(isActive, "System is paused");
        _;
    }

    // ========== EVENTS ==========

    event CollateralDeposited(address indexed account, uint256 amount);
    event CollateralWithdrawn(address indexed account, uint256 amount);
    event MegTokenMinted(address indexed account, uint256 amount);
    event MegTokenBurned(address indexed account, uint256 amount);
    event PositionLiquidated(
        address indexed account,
        address indexed liquidator,
        uint256 debtLiquidated,
        uint256 collateralSeized
    );
    event MinCollateralRatioUpdated(uint256 newRatio);
    event LiquidationRatioUpdated(uint256 newRatio);
    event LiquidationPenaltyUpdated(uint256 newPenalty);
    event SystemStatusUpdated(bool active);
}
