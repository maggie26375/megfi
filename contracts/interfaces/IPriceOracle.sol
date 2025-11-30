// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPriceOracle {
    function getPrice(bytes32 currencyKey) external view returns (uint256 price, bool isValid);
    function getCollateralPrice() external view returns (uint256);
    function getMegTokenPrice(bytes32 currencyKey) external view returns (uint256);
}
