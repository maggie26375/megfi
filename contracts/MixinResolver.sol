// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AddressResolver.sol";

/// @title MixinResolver - 地址解析器混入
/// @notice 为合约提供从 AddressResolver 获取其他合约地址的能力
/// @dev 使用地址缓存来节省 gas
abstract contract MixinResolver {
    AddressResolver public resolver;

    mapping(bytes32 => address) private addressCache;

    constructor(address _resolver) {
        resolver = AddressResolver(_resolver);
    }

    /// @notice 返回此合约所需的所有地址名称
    /// @dev 子合约应该重写此函数
    function resolverAddressesRequired() public view virtual returns (bytes32[] memory addresses) {}

    /// @notice 重建地址缓存
    function rebuildCache() public {
        bytes32[] memory requiredAddresses = resolverAddressesRequired();
        for (uint i = 0; i < requiredAddresses.length; i++) {
            bytes32 name = requiredAddresses[i];
            address destination = resolver.requireAndGetAddress(
                name,
                string(abi.encodePacked("Resolver missing target: ", name))
            );
            addressCache[name] = destination;
            emit CacheUpdated(name, destination);
        }
    }

    /// @notice 检查缓存是否是最新的
    function isResolverCached() external view returns (bool) {
        bytes32[] memory requiredAddresses = resolverAddressesRequired();
        for (uint i = 0; i < requiredAddresses.length; i++) {
            bytes32 name = requiredAddresses[i];
            if (resolver.getAddress(name) != addressCache[name] || addressCache[name] == address(0)) {
                return false;
            }
        }
        return true;
    }

    /// @notice 从缓存获取地址
    function requireAndGetAddress(bytes32 name) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(_foundAddress != address(0), string(abi.encodePacked("Missing address: ", name)));
        return _foundAddress;
    }

    /// @notice 合并两个数组
    function combineArrays(bytes32[] memory first, bytes32[] memory second)
        internal
        pure
        returns (bytes32[] memory combination)
    {
        combination = new bytes32[](first.length + second.length);
        for (uint i = 0; i < first.length; i++) {
            combination[i] = first[i];
        }
        for (uint j = 0; j < second.length; j++) {
            combination[first.length + j] = second[j];
        }
    }

    event CacheUpdated(bytes32 name, address destination);
}
