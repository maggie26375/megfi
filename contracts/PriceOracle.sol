// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Owned.sol";
import "./interfaces/IPriceOracle.sol";

/// @title PriceOracle - 价格预言机 (带 OSM 延迟机制)
/// @notice 提供资产价格数据，清算使用延迟价格，用户可以看到实时价格提前预警
/// @dev 参考 MakerDAO OSM 和 Synthetix ExchangeRates 的设计
contract PriceOracle is Owned, IPriceOracle {

    // ========== STATE VARIABLES ==========

    uint256 public constant PRECISION = 1e18;
    uint256 public constant STALE_PERIOD = 1 hours;
    uint256 public constant OSM_DELAY = 30 minutes;  // OSM 延迟时间

    // Chainlink 风格的价格聚合器
    struct PriceFeed {
        address aggregator;     // Chainlink 聚合器地址
        uint8 decimals;         // 聚合器的精度
        uint256 manualPrice;    // 手动设置的价格（备用）
        uint256 lastUpdate;     // 最后更新时间
        bool useManual;         // 是否使用手动价格
    }

    // OSM 延迟价格结构
    struct OSMPrice {
        uint256 currentPrice;       // 当前生效的价格（用于清算）
        uint256 currentTimestamp;   // 当前价格的时间戳
        uint256 nextPrice;          // 下一个待生效的价格
        uint256 nextTimestamp;      // 下一个价格的生效时间
        bool hasNext;               // 是否有待生效的价格
    }

    // 货币标识符 => 价格源
    mapping(bytes32 => PriceFeed) public priceFeeds;

    // 货币标识符 => OSM 延迟价格
    mapping(bytes32 => OSMPrice) public osmPrices;

    // 是否启用 OSM
    bool public osmEnabled = true;

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

    /// @notice 获取资产实时价格（用于前端显示和预警）
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

    /// @notice 获取 OSM 延迟价格（用于清算判断）
    /// @param currencyKey 货币标识符
    /// @return price 延迟后的价格
    /// @return isValid 价格是否有效
    function getSettlementPrice(bytes32 currencyKey) public view returns (uint256 price, bool isValid) {
        // mUSD 始终为 1，不需要延迟
        if (currencyKey == mUSD) {
            return (PRECISION, true);
        }

        // 如果 OSM 未启用，返回实时价格
        if (!osmEnabled) {
            return this.getPrice(currencyKey);
        }

        OSMPrice memory osm = osmPrices[currencyKey];

        // 检查是否有待生效的价格已经到期
        if (osm.hasNext && block.timestamp >= osm.nextTimestamp) {
            // 返回已生效的 next 价格
            bool isStale = (block.timestamp - osm.nextTimestamp) > STALE_PERIOD;
            return (osm.nextPrice, osm.nextPrice > 0 && !isStale);
        }

        // 返回当前生效的价格
        if (osm.currentPrice > 0) {
            bool isStale = (block.timestamp - osm.currentTimestamp) > STALE_PERIOD;
            return (osm.currentPrice, !isStale);
        }

        // 如果 OSM 没有价格，回退到实时价格
        return this.getPrice(currencyKey);
    }

    /// @notice 获取抵押品实时价格（用于前端显示）
    function getCollateralPrice() external view override returns (uint256) {
        (uint256 price, bool isValid) = this.getPrice(COLLATERAL_KEY);
        require(isValid, "Invalid collateral price");
        return price;
    }

    /// @notice 获取抵押品延迟价格（用于清算）
    function getCollateralSettlementPrice() external view returns (uint256) {
        (uint256 price, bool isValid) = getSettlementPrice(COLLATERAL_KEY);
        require(isValid, "Invalid collateral settlement price");
        return price;
    }

    /// @notice 获取合成资产价格
    function getMegTokenPrice(bytes32 currencyKey) external view override returns (uint256) {
        (uint256 price, bool isValid) = this.getPrice(currencyKey);
        require(isValid, "Invalid MegToken price");
        return price;
    }

    /// @notice 获取 OSM 状态信息（用于前端显示）
    /// @param currencyKey 货币标识符
    /// @return currentPrice 当前生效价格
    /// @return nextPrice 下一个待生效价格
    /// @return nextPriceEffectiveTime 下一个价格生效时间
    /// @return spotPrice 实时价格
    function getOSMStatus(bytes32 currencyKey) external view returns (
        uint256 currentPrice,
        uint256 nextPrice,
        uint256 nextPriceEffectiveTime,
        uint256 spotPrice
    ) {
        OSMPrice memory osm = osmPrices[currencyKey];
        (uint256 spot, ) = this.getPrice(currencyKey);

        // 检查是否有待生效的价格已经到期
        if (osm.hasNext && block.timestamp >= osm.nextTimestamp) {
            currentPrice = osm.nextPrice;
            nextPrice = 0;
            nextPriceEffectiveTime = 0;
        } else {
            currentPrice = osm.currentPrice;
            nextPrice = osm.hasNext ? osm.nextPrice : 0;
            nextPriceEffectiveTime = osm.hasNext ? osm.nextTimestamp : 0;
        }

        spotPrice = spot;
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

    // ========== OSM FUNCTIONS ==========

    /// @notice 更新 OSM 价格（将实时价格推入延迟队列）
    /// @dev 任何人都可以调用此函数触发价格更新
    /// @param currencyKey 货币标识符
    function poke(bytes32 currencyKey) external {
        require(currencyKey != mUSD, "Cannot poke mUSD");
        require(osmEnabled, "OSM is disabled");

        // 获取当前实时价格
        (uint256 spotPrice, bool isValid) = this.getPrice(currencyKey);
        require(isValid, "Invalid spot price");

        OSMPrice storage osm = osmPrices[currencyKey];

        // 如果有待生效的价格已经到期，先让它生效
        if (osm.hasNext && block.timestamp >= osm.nextTimestamp) {
            osm.currentPrice = osm.nextPrice;
            osm.currentTimestamp = osm.nextTimestamp;
            osm.hasNext = false;

            emit OSMPriceActivated(currencyKey, osm.currentPrice);
        }

        // 如果当前没有待生效的价格，或者距离上次 poke 已过足够时间
        // 将新的实时价格放入 next 队列
        if (!osm.hasNext) {
            osm.nextPrice = spotPrice;
            osm.nextTimestamp = block.timestamp + OSM_DELAY;
            osm.hasNext = true;

            emit OSMPriceQueued(currencyKey, spotPrice, osm.nextTimestamp);
        }
    }

    /// @notice 批量更新多个货币的 OSM 价格
    /// @param currencyKeys 货币标识符数组
    function pokeMany(bytes32[] calldata currencyKeys) external {
        for (uint256 i = 0; i < currencyKeys.length; i++) {
            if (currencyKeys[i] != mUSD && osmEnabled) {
                (uint256 spotPrice, bool isValid) = this.getPrice(currencyKeys[i]);
                if (isValid) {
                    _poke(currencyKeys[i], spotPrice);
                }
            }
        }
    }

    /// @notice 内部 poke 函数
    function _poke(bytes32 currencyKey, uint256 spotPrice) internal {
        OSMPrice storage osm = osmPrices[currencyKey];

        // 如果有待生效的价格已经到期，先让它生效
        if (osm.hasNext && block.timestamp >= osm.nextTimestamp) {
            osm.currentPrice = osm.nextPrice;
            osm.currentTimestamp = osm.nextTimestamp;
            osm.hasNext = false;

            emit OSMPriceActivated(currencyKey, osm.currentPrice);
        }

        // 将新的实时价格放入 next 队列
        if (!osm.hasNext) {
            osm.nextPrice = spotPrice;
            osm.nextTimestamp = block.timestamp + OSM_DELAY;
            osm.hasNext = true;

            emit OSMPriceQueued(currencyKey, spotPrice, osm.nextTimestamp);
        }
    }

    /// @notice 强制激活待生效的价格（如果已到期）
    /// @param currencyKey 货币标识符
    function activate(bytes32 currencyKey) external {
        require(currencyKey != mUSD, "Cannot activate mUSD");

        OSMPrice storage osm = osmPrices[currencyKey];
        require(osm.hasNext, "No pending price");
        require(block.timestamp >= osm.nextTimestamp, "Price not yet effective");

        osm.currentPrice = osm.nextPrice;
        osm.currentTimestamp = osm.nextTimestamp;
        osm.hasNext = false;

        emit OSMPriceActivated(currencyKey, osm.currentPrice);
    }

    /// @notice 初始化 OSM 价格（首次设置，无延迟）
    /// @dev 仅限 owner，用于系统初始化
    function initializeOSMPrice(bytes32 currencyKey, uint256 price) external onlyOwner {
        require(currencyKey != mUSD, "Cannot initialize mUSD");

        OSMPrice storage osm = osmPrices[currencyKey];
        osm.currentPrice = price;
        osm.currentTimestamp = block.timestamp;
        osm.hasNext = false;

        emit OSMPriceInitialized(currencyKey, price);
    }

    /// @notice 启用/禁用 OSM
    function setOSMEnabled(bool enabled) external onlyOwner {
        osmEnabled = enabled;
        emit OSMEnabledUpdated(enabled);
    }

    /// @notice 获取 OSM 延迟时间
    function getOSMDelay() external pure returns (uint256) {
        return OSM_DELAY;
    }

    /// @notice 检查某个价格是否即将在指定时间内生效
    /// @param currencyKey 货币标识符
    /// @param timeWindow 时间窗口（秒）
    /// @return willActivate 是否会在时间窗口内生效
    /// @return priceToActivate 即将生效的价格
    /// @return timeUntilActivation 距离生效的剩余时间
    function checkPendingActivation(bytes32 currencyKey, uint256 timeWindow) external view returns (
        bool willActivate,
        uint256 priceToActivate,
        uint256 timeUntilActivation
    ) {
        OSMPrice memory osm = osmPrices[currencyKey];

        if (!osm.hasNext) {
            return (false, 0, 0);
        }

        if (block.timestamp >= osm.nextTimestamp) {
            // 已经可以激活
            return (true, osm.nextPrice, 0);
        }

        timeUntilActivation = osm.nextTimestamp - block.timestamp;
        if (timeUntilActivation <= timeWindow) {
            return (true, osm.nextPrice, timeUntilActivation);
        }

        return (false, osm.nextPrice, timeUntilActivation);
    }

    // ========== EVENTS ==========

    event AggregatorAdded(bytes32 indexed currencyKey, address aggregator);
    event AggregatorRemoved(bytes32 indexed currencyKey, address aggregator);
    event ManualPriceSet(bytes32 indexed currencyKey, uint256 price);
    event UseManualUpdated(bytes32 indexed currencyKey, bool useManual);

    // OSM Events
    event OSMPriceQueued(bytes32 indexed currencyKey, uint256 price, uint256 effectiveTime);
    event OSMPriceActivated(bytes32 indexed currencyKey, uint256 price);
    event OSMPriceInitialized(bytes32 indexed currencyKey, uint256 price);
    event OSMEnabledUpdated(bool enabled);
}
