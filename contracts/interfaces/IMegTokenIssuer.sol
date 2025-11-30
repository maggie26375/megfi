// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IMegToken.sol";

interface IMegTokenIssuer {
    // Views
    function megTokens(bytes32 currencyKey) external view returns (IMegToken);
    function megTokensByAddress(address megTokenAddress) external view returns (bytes32);
    function availableMegTokens() external view returns (IMegToken[] memory);
    function availableCurrencyKeys() external view returns (bytes32[] memory);
    function totalIssuedMegTokens(bytes32 currencyKey) external view returns (uint256);

    // Mutative
    function addMegToken(IMegToken megToken) external;
    function removeMegToken(bytes32 currencyKey) external;
    function issueMegToken(bytes32 currencyKey, address to, uint256 amount) external;
    function burnMegToken(bytes32 currencyKey, address from, uint256 amount) external;
}
