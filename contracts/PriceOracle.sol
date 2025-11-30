// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Owned.sol";
import "./interfaces/IPriceOracle.sol";

/// @title PriceOracle - 价格预言机
/// @notice 提供资产价格数据
/// @dev 参考 Synthetix ExchangeRates 和 Chainlink 的设计
///      生产环境应该集成 Chainlink 等去中心化预言机
contract PriceOracle is Owned, IPriceOracle {

    // ========== STATE VARIABLES ==========

    uint256 public constant PRECISION = 1e18;
    uint256 public constant STALE_PERIOD = 1 hours;

    // Chainlink 风格的价格聚合器
    struct PriceFeed {
        address aggregator;     // Chainlink 聚合器地址
        uint8 decimals;         // 聚合器的精度
        uint256 manualPrice;    // 手动设置的价格（备用）
        uint256 lastUpdate;     // 最后更新时间
        bool useManual;         // 是否使用手动价格
    }

    // 货币标识符 => 价格源
    mapping(bytes32 => PriceFeed) public priceFeeds;

    // 抵押品价格（简化版，使用固定标识符）
    bytes32 public constant COLLATERAL_KEY = "COLLATERAL";
    bytes32 public constant mUSD = "mUSD";

    // ========== CONSTRUCTOR ==========

    constructor(address _owner) Owned(_owner) {
        // mUSD 始终为 1:1
        priceFeeds[mUSD].manualPrice = PRECISION;
        priceFeeds[mUSD].lastUpdate = block.timestamp;
        priceFeeds[mUSD].useManual = true;
    }

    // ========== VIEWS ==========

    /// @notice 获取资产价格
    /// @param currencyKey 货币标识符
    /// @return price 价格 (18 位精度)
    /// @return isValid 价格是否有效
    function getPrice(bytes32 currencyKey) external view override returns (uint256 price, bool isValid) {
        // mUSD 始终为 1
        if (currencyKey == mUSD) {
            return (PRECISION, true);
        }

        PriceFeed memory feed = priceFeeds[currencyKey];

        if (feed.useManual || feed.aggregator == address(0)) {
            // 使用手动价格
            bool isStale = (block.timestamp - feed.lastUpdate) > STALE_PERIOD;
            return (feed.manualPrice, feed.manualPrice > 0 && !isStale);
        } else {
            // 使用 Chainlink 聚合器
            return _getChainlinkPrice(feed);
        }
    }

    /// @notice 获取抵押品价格
    function getCollateralPrice() external view override returns (uint256) {
        (uint256 price, bool isValid) = this.getPrice(COLLATERAL_KEY);
        require(isValid, "Invalid collateral price");
        return price;
    }

    /// @notice 获取合成资产价格
    function getMegTokenPrice(bytes32 currencyKey) external view override returns (uint256) {
        (uint256 price, bool isValid) = this.getPrice(currencyKey);
        require(isValid, "Invalid MegToken price");
        return price;
    }

    /// @notice 内部函数：从 Chainlink 获取价格
    function _getChainlinkPrice(PriceFeed memory feed) internal view returns (uint256 price, bool isValid) {
        // 调用 Chainlink 聚合器的 latestRoundData
        (bool success, bytes memory data) = feed.aggregator.staticcall(
            abi.encodeWithSignature("latestRoundData()")
        );

        if (!success) {
            return (feed.manualPrice, false);
        }

        (
            ,  // roundId
            int256 answer,
            ,  // startedAt
            uint256 updatedAt,
            // answeredInRound
        ) = abi.decode(data, (uint80, int256, uint256, uint256, uint80));

        // 检查价格有效性
        if (answer <= 0) {
            return (0, false);
        }

        // 检查价格是否过时
        bool isStale = (block.timestamp - updatedAt) > STALE_PERIOD;
        if (isStale) {
            return (uint256(answer), false);
        }

        // 转换为 18 位精度
        price = _formatPrice(uint256(answer), feed.decimals);
        return (price, true);
    }

    /// @notice 格式化价格到 18 位精度
    function _formatPrice(uint256 rawPrice, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) {
            return rawPrice;
        } else if (decimals < 18) {
            return rawPrice * (10 ** (18 - decimals));
        } else {
            return rawPrice / (10 ** (decimals - 18));
        }
    }

    // ========== ADMIN FUNCTIONS ==========

    /// @notice 添加 Chainlink 聚合器
    function addAggregator(bytes32 currencyKey, address aggregatorAddress) external onlyOwner {
        require(aggregatorAddress != address(0), "Invalid aggregator address");

        // 获取聚合器精度
        (bool success, bytes memory data) = aggregatorAddress.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        require(success, "Cannot get decimals");
        uint8 decimals = abi.decode(data, (uint8));

        priceFeeds[currencyKey].aggregator = aggregatorAddress;
        priceFeeds[currencyKey].decimals = decimals;
        priceFeeds[currencyKey].useManual = false;

        emit AggregatorAdded(currencyKey, aggregatorAddress);
    }

    /// @notice 移除聚合器
    function removeAggregator(bytes32 currencyKey) external onlyOwner {
        require(currencyKey != mUSD, "Cannot remove mUSD");

        address aggregator = priceFeeds[currencyKey].aggregator;
        delete priceFeeds[currencyKey];

        emit AggregatorRemoved(currencyKey, aggregator);
    }

    /// @notice 手动设置价格（用于测试或紧急情况）
    function setManualPrice(bytes32 currencyKey, uint256 price) external onlyOwner {
        require(currencyKey != mUSD, "Cannot set mUSD price");

        priceFeeds[currencyKey].manualPrice = price;
        priceFeeds[currencyKey].lastUpdate = block.timestamp;
        priceFeeds[currencyKey].useManual = true;

        emit ManualPriceSet(currencyKey, price);
    }

    /// @notice 切换是否使用手动价格
    function setUseManual(bytes32 currencyKey, bool useManual) external onlyOwner {
        require(currencyKey != mUSD, "Cannot change mUSD settings");
        priceFeeds[currencyKey].useManual = useManual;

        emit UseManualUpdated(currencyKey, useManual);
    }

    // ========== EVENTS ==========

    event AggregatorAdded(bytes32 indexed currencyKey, address aggregator);
    event AggregatorRemoved(bytes32 indexed currencyKey, address aggregator);
    event ManualPriceSet(bytes32 indexed currencyKey, uint256 price);
    event UseManualUpdated(bytes32 indexed currencyKey, bool useManual);
}
