// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IMegToken.sol";
import "./interfaces/IMegTokenIssuer.sol";

/// @title MegTokenIssuer - MegFi 合成资产发行管理器
/// @notice 管理所有 MegFi 合成资产的铸造和销毁
/// @dev MegFi Protocol 的核心发行合约
contract MegTokenIssuer is Owned, MixinResolver, IMegTokenIssuer {

    // ========== STATE VARIABLES ==========

    // 可用的合成资产列表
    IMegToken[] public availableMegTokensList;

    // currencyKey => MegToken
    mapping(bytes32 => IMegToken) public override megTokens;

    // MegToken address => currencyKey
    mapping(address => bytes32) public override megTokensByAddress;

    // 授权可以铸造/销毁的 Vault 地址
    mapping(address => bool) public authorizedVaults;

    // ========== ADDRESS RESOLVER CONFIGURATION ==========

    bytes32 private constant CONTRACT_PRICE_ORACLE = "PriceOracle";

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
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_PRICE_ORACLE;
    }

    function priceOracle() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_PRICE_ORACLE);
    }

    /// @notice 获取所有可用的合成资产
    function availableMegTokens() external view override returns (IMegToken[] memory) {
        return availableMegTokensList;
    }

    /// @notice 获取所有可用的货币标识符
    function availableCurrencyKeys() external view override returns (bytes32[] memory keys) {
        keys = new bytes32[](availableMegTokensList.length);
        for (uint i = 0; i < availableMegTokensList.length; i++) {
            keys[i] = megTokensByAddress[address(availableMegTokensList[i])];
        }
    }

    /// @notice 获取合成资产的发行总量
    function totalIssuedMegTokens(bytes32 currencyKey) external view override returns (uint256) {
        IMegToken megToken = megTokens[currencyKey];
        if (address(megToken) == address(0)) return 0;
        return megToken.totalSupply();
    }

    /// @notice 获取所有合成资产的总价值 (以 mUSD 计价)
    function totalIssuedMegTokensValue() external view returns (uint256 totalValue) {
        for (uint i = 0; i < availableMegTokensList.length; i++) {
            IMegToken megToken = availableMegTokensList[i];
            bytes32 currencyKey = megTokensByAddress[address(megToken)];
            uint256 supply = megToken.totalSupply();

            if (supply > 0) {
                // 获取价格
                (bool success, bytes memory data) = priceOracle().staticcall(
                    abi.encodeWithSignature("getPrice(bytes32)", currencyKey)
                );
                if (success) {
                    (uint256 price, bool isValid) = abi.decode(data, (uint256, bool));
                    if (isValid) {
                        totalValue += (supply * price) / 1e18;
                    }
                }
            }
        }
    }

    /// @notice 检查某个地址是否是授权的 Vault
    function isAuthorizedVault(address vault) external view returns (bool) {
        return authorizedVaults[vault];
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /// @notice 铸造合成资产
    /// @param currencyKey 货币标识符
    /// @param to 接收地址
    /// @param amount 数量
    function issueMegToken(bytes32 currencyKey, address to, uint256 amount) external override onlyAuthorizedVault {
        IMegToken megToken = megTokens[currencyKey];
        require(address(megToken) != address(0), "MegToken does not exist");
        require(amount > 0, "Amount must be > 0");

        megToken.issue(to, amount);

        emit MegTokenIssued(currencyKey, to, amount);
    }

    /// @notice 销毁合成资产
    /// @param currencyKey 货币标识符
    /// @param from 销毁来源地址
    /// @param amount 数量
    function burnMegToken(bytes32 currencyKey, address from, uint256 amount) external override onlyAuthorizedVault {
        IMegToken megToken = megTokens[currencyKey];
        require(address(megToken) != address(0), "MegToken does not exist");
        require(amount > 0, "Amount must be > 0");

        megToken.burn(from, amount);

        emit MegTokenBurned(currencyKey, from, amount);
    }

    // ========== ADMIN FUNCTIONS ==========

    /// @notice 添加新的合成资产
    function addMegToken(IMegToken megToken) external override onlyOwner {
        bytes32 currencyKey = megToken.currencyKey();
        require(address(megTokens[currencyKey]) == address(0), "MegToken already exists");
        require(megTokensByAddress[address(megToken)] == bytes32(0), "MegToken address already registered");

        megTokens[currencyKey] = megToken;
        megTokensByAddress[address(megToken)] = currencyKey;
        availableMegTokensList.push(megToken);

        emit MegTokenAdded(currencyKey, address(megToken));
    }

    /// @notice 移除合成资产
    function removeMegToken(bytes32 currencyKey) external override onlyOwner {
        IMegToken megToken = megTokens[currencyKey];
        require(address(megToken) != address(0), "MegToken does not exist");

        // 检查是否还有流通量
        require(megToken.totalSupply() == 0, "MegToken has outstanding supply");

        // 从列表中移除
        for (uint i = 0; i < availableMegTokensList.length; i++) {
            if (address(availableMegTokensList[i]) == address(megToken)) {
                // 将最后一个元素移到当前位置
                availableMegTokensList[i] = availableMegTokensList[availableMegTokensList.length - 1];
                availableMegTokensList.pop();
                break;
            }
        }

        // 清除映射
        delete megTokensByAddress[address(megToken)];
        delete megTokens[currencyKey];

        emit MegTokenRemoved(currencyKey, address(megToken));
    }

    /// @notice 授权 Vault 可以铸造/销毁
    function authorizeVault(address vault) external onlyOwner {
        authorizedVaults[vault] = true;
        emit VaultAuthorized(vault);
    }

    /// @notice 撤销 Vault 授权
    function revokeVault(address vault) external onlyOwner {
        authorizedVaults[vault] = false;
        emit VaultRevoked(vault);
    }

    // ========== MODIFIERS ==========

    modifier onlyAuthorizedVault() {
        require(authorizedVaults[msg.sender], "Not an authorized vault");
        _;
    }

    // ========== EVENTS ==========

    event MegTokenAdded(bytes32 indexed currencyKey, address megToken);
    event MegTokenRemoved(bytes32 indexed currencyKey, address megToken);
    event MegTokenIssued(bytes32 indexed currencyKey, address indexed to, uint256 amount);
    event MegTokenBurned(bytes32 indexed currencyKey, address indexed from, uint256 amount);
    event VaultAuthorized(address indexed vault);
    event VaultRevoked(address indexed vault);
}
