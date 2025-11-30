// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IMegToken.sol";
import "./interfaces/IMegTokenIssuer.sol";

/// @title MegSwap - MegFi 合成资产交换合约
/// @notice 允许用户在不同合成资产之间进行交换
/// @dev 基于价格预言机实现无滑点交换
contract MegSwap is Owned, MixinResolver, ReentrancyGuard {

    // ========== STATE VARIABLES ==========

    uint256 public constant PRECISION = 1e18;

    // 交换费率 (0.3% = 0.003e18)
    uint256 public swapFee = 3e15; // 0.3%

    // 累积的费用
    mapping(bytes32 => uint256) public accumulatedFees;

    // ========== ADDRESS RESOLVER CONFIGURATION ==========

    bytes32 private constant CONTRACT_PRICE_ORACLE = "PriceOracle";
    bytes32 private constant CONTRACT_ISSUER = "MegTokenIssuer";

    // ========== EVENTS ==========

    event Swapped(
        address indexed user,
        bytes32 indexed fromCurrency,
        bytes32 indexed toCurrency,
        uint256 fromAmount,
        uint256 toAmount,
        uint256 fee
    );
    event SwapFeeUpdated(uint256 newFee);
    event FeesWithdrawn(bytes32 currencyKey, uint256 amount);

    // ========== CONSTRUCTOR ==========

    constructor(
        address _owner,
        address _resolver
    )
        Owned(_owner)
        MixinResolver(_resolver)
    {}

    // ========== VIEWS ==========

    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_PRICE_ORACLE;
        addresses[1] = CONTRACT_ISSUER;
    }

    function priceOracle() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_PRICE_ORACLE);
    }

    function issuer() internal view returns (IMegTokenIssuer) {
        return IMegTokenIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    /// @notice 获取资产价格
    function getPrice(bytes32 currencyKey) public view returns (uint256) {
        (bool success, bytes memory data) = priceOracle().staticcall(
            abi.encodeWithSignature("getPrice(bytes32)", currencyKey)
        );
        require(success, "Price oracle call failed");
        (uint256 price, bool isValid) = abi.decode(data, (uint256, bool));
        require(isValid, "Invalid price");
        return price;
    }

    /// @notice 预览交换结果
    /// @param fromCurrency 源货币
    /// @param toCurrency 目标货币
    /// @param fromAmount 源数量
    /// @return toAmount 可获得的目标数量
    /// @return feeAmount 费用
    function previewSwap(
        bytes32 fromCurrency,
        bytes32 toCurrency,
        uint256 fromAmount
    ) public view returns (uint256 toAmount, uint256 feeAmount) {
        require(fromCurrency != toCurrency, "Same currency");
        require(fromAmount > 0, "Amount must be > 0");

        uint256 fromPrice = getPrice(fromCurrency);
        uint256 toPrice = getPrice(toCurrency);

        // 计算等值数量
        uint256 fromValue = (fromAmount * fromPrice) / PRECISION;
        uint256 rawToAmount = (fromValue * PRECISION) / toPrice;

        // 计算费用
        feeAmount = (rawToAmount * swapFee) / PRECISION;
        toAmount = rawToAmount - feeAmount;
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /// @notice 交换合成资产
    /// @param fromCurrency 源货币标识符
    /// @param toCurrency 目标货币标识符
    /// @param fromAmount 源数量
    /// @param minToAmount 最小接收数量（滑点保护）
    function swap(
        bytes32 fromCurrency,
        bytes32 toCurrency,
        uint256 fromAmount,
        uint256 minToAmount
    ) external nonReentrant returns (uint256 toAmount) {
        require(fromCurrency != toCurrency, "Same currency");
        require(fromAmount > 0, "Amount must be > 0");

        IMegTokenIssuer _issuer = issuer();

        // 获取代币合约
        IMegToken fromToken = _issuer.megTokens(fromCurrency);
        IMegToken toToken = _issuer.megTokens(toCurrency);
        require(address(fromToken) != address(0), "From token not found");
        require(address(toToken) != address(0), "To token not found");

        // 计算交换数量
        uint256 feeAmount;
        (toAmount, feeAmount) = previewSwap(fromCurrency, toCurrency, fromAmount);
        require(toAmount >= minToAmount, "Slippage exceeded");

        // 销毁源代币
        _issuer.burnMegToken(fromCurrency, msg.sender, fromAmount);

        // 铸造目标代币（扣除费用后的数量）
        _issuer.issueMegToken(toCurrency, msg.sender, toAmount);

        // 记录费用（以目标代币计）
        accumulatedFees[toCurrency] += feeAmount;

        emit Swapped(msg.sender, fromCurrency, toCurrency, fromAmount, toAmount, feeAmount);
    }

    // ========== ADMIN FUNCTIONS ==========

    /// @notice 设置交换费率
    function setSwapFee(uint256 _fee) external onlyOwner {
        require(_fee <= 1e17, "Fee too high"); // 最高 10%
        swapFee = _fee;
        emit SwapFeeUpdated(_fee);
    }

    /// @notice 提取累积的费用
    function withdrawFees(bytes32 currencyKey, address to) external onlyOwner {
        uint256 amount = accumulatedFees[currencyKey];
        require(amount > 0, "No fees to withdraw");

        accumulatedFees[currencyKey] = 0;

        // 铸造费用给接收者
        issuer().issueMegToken(currencyKey, to, amount);

        emit FeesWithdrawn(currencyKey, amount);
    }
}
