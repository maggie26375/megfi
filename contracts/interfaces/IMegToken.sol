// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMegToken is IERC20 {
    // Views
    function currencyKey() external view returns (bytes32);

    // Mutative functions
    function issue(address account, uint amount) external;
    function burn(address account, uint amount) external;
}
