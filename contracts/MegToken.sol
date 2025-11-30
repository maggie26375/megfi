// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/IMegToken.sol";

/// @title MegToken - MegFi 合成资产代币
/// @notice ERC20 代币，代表某种合成资产（如 mUSD, mETH, mBTC 等）
/// @dev MegFi Protocol 的核心资产代币
contract MegToken is ERC20, Owned, MixinResolver, IMegToken {

    // 代币的货币标识符
    bytes32 public override currencyKey;

    // 授权可以铸造/销毁的合约
    bytes32 private constant CONTRACT_ISSUER = "MegTokenIssuer";

    constructor(
        string memory _tokenName,
        string memory _tokenSymbol,
        bytes32 _currencyKey,
        address _owner,
        address _resolver
    )
        ERC20(_tokenName, _tokenSymbol)
        Owned(_owner)
        MixinResolver(_resolver)
    {
        currencyKey = _currencyKey;
    }

    // ========== VIEWS ==========

    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_ISSUER;
    }

    function issuer() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_ISSUER);
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /// @notice 铸造代币
    /// @param account 接收代币的地址
    /// @param amount 铸造数量
    function issue(address account, uint amount) external override onlyIssuer {
        _mint(account, amount);
        emit Issued(account, amount);
    }

    /// @notice 销毁代币
    /// @param account 销毁代币的地址
    /// @param amount 销毁数量
    function burn(address account, uint amount) external override onlyIssuer {
        _burn(account, amount);
        emit Burned(account, amount);
    }

    // ========== MODIFIERS ==========

    modifier onlyIssuer() {
        require(msg.sender == issuer(), "MegToken: Only Issuer can call");
        _;
    }

    // ========== EVENTS ==========

    event Issued(address indexed account, uint amount);
    event Burned(address indexed account, uint amount);
}
