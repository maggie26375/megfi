// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";

/// @title AddressResolver - 地址解析器
/// @notice 中央注册表，用于管理系统中所有合约的地址
/// @dev 参考 Synthetix 的设计模式，使合约之间可以松耦合地相互引用
contract AddressResolver is Owned, IAddressResolver {
    mapping(bytes32 => address) public repository;

    constructor(address _owner) Owned(_owner) {}

    /// @notice 批量导入合约地址
    /// @param names 合约名称数组
    /// @param destinations 合约地址数组
    function importAddresses(bytes32[] calldata names, address[] calldata destinations) external onlyOwner {
        require(names.length == destinations.length, "Input lengths must match");

        for (uint i = 0; i < names.length; i++) {
            bytes32 name = names[i];
            address destination = destinations[i];
            repository[name] = destination;
            emit AddressImported(name, destination);
        }
    }

    /// @notice 获取单个合约地址
    /// @param name 合约名称
    /// @return 合约地址
    function getAddress(bytes32 name) external view override returns (address) {
        return repository[name];
    }

    /// @notice 获取合约地址，如果不存在则回滚
    /// @param name 合约名称
    /// @param reason 回滚原因
    /// @return 合约地址
    function requireAndGetAddress(bytes32 name, string calldata reason) external view override returns (address) {
        address _foundAddress = repository[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }

    /// @notice 检查地址是否已导入
    /// @param names 合约名称数组
    /// @param destinations 合约地址数组
    /// @return 是否全部匹配
    function areAddressesImported(bytes32[] calldata names, address[] calldata destinations) external view returns (bool) {
        for (uint i = 0; i < names.length; i++) {
            if (repository[names[i]] != destinations[i]) {
                return false;
            }
        }
        return true;
    }

    event AddressImported(bytes32 name, address destination);
}
