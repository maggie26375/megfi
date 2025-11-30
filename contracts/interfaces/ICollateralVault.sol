// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICollateralVault {
    // 仓位信息
    struct Position {
        uint256 collateral;     // 抵押品数量
        uint256 debt;           // 债务数量
        uint256 lastUpdateTime; // 最后更新时间
    }

    // Views
    function getPosition(address account) external view returns (Position memory);
    function getCollateralRatio(address account) external view returns (uint256);
    function isLiquidatable(address account) external view returns (bool);
    function totalCollateral() external view returns (uint256);
    function totalDebt() external view returns (uint256);

    // Mutative
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function mint(uint256 amount) external;
    function burn(uint256 amount) external;
    function liquidate(address account) external;
}
