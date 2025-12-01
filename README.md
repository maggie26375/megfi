# MegFi Protocol

一个参考 Synthetix 和 MakerDAO (DSS) 设计的合成资产协议。

**Live Demo**: https://megfi.vercel.app

**Network**: Sepolia Testnet

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       AddressResolver                            │
│                    (中央地址注册表)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  PriceOracle  │    │MegTokenIssuer │    │CollateralVault│
│  (价格预言机)  │    │ (发行管理器)  │    │ (抵押品仓库)   │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        │                     ▼                     │
        │            ┌───────────────┐              │
        └───────────►│   MegToken    │◄─────────────┘
                     │ (合成资产代币) │
                     └───────────────┘
```

## 合成资产列表

| 代币 | 符号 | 描述 |
|-----|------|------|
| MegFi USD | **mUSD** | 锚定美元的稳定币 |
| MegFi BTC | **mBTC** | 合成比特币 |
| MegFi GOLD | **mGOLD** | 合成黄金 |

## 核心合约

### 1. Owned.sol
- 提供两步式所有权转移机制
- 防止意外将所有权转移到错误地址

### 2. AddressResolver.sol
- 中央地址注册表
- 所有合约通过名称查找其他合约地址
- 支持缓存机制以节省 gas

### 3. MixinResolver.sol
- 为合约提供从 AddressResolver 获取地址的能力
- 实现地址缓存

### 4. MegToken.sol
- ERC20 合成资产代币
- 每种合成资产有唯一的 currencyKey
- 只有 Issuer 可以铸造和销毁

### 5. MegTokenIssuer.sol
- 管理所有合成资产的注册
- 控制铸造和销毁权限
- 只有授权的 Vault 可以触发铸造/销毁

### 6. CollateralVault.sol
- 用户存入抵押品
- 根据抵押率铸造合成资产
- 实现清算机制

### 7. PriceOracle.sol
- 提供资产价格数据
- 支持 Chainlink 聚合器
- 支持手动设置价格（测试用）

## 参数说明

| 参数 | 说明 | 默认值 |
|-----|------|-------|
| minCollateralRatio | 最低抵押率 | 150% |
| liquidationRatio | 清算线 | 120% |
| liquidationPenalty | 清算惩罚 | 10% |

## 用户操作流程

### 铸造 mUSD
1. 用户调用 `deposit()` 存入抵押品 (如 WETH)
2. 用户调用 `mint()` 铸造 mUSD
3. 系统检查抵押率是否满足 150% 要求

### 销毁 mUSD 还债
1. 用户调用 `burn()` 销毁 mUSD
2. 债务减少
3. 用户调用 `withdraw()` 提取抵押品

### 清算
1. 当仓位抵押率低于 120% 时，任何人都可以清算
2. 清算者需要持有足够的 mUSD 来偿还债务
3. 清算者获得抵押品（扣除 10% 惩罚）
4. 惩罚部分归协议所有

## 安装和运行

```bash
# 进入项目目录
cd my-synthetic-token

# 安装依赖
npm install

# 编译合约
npm run compile

# 运行测试
npm run test

# 本地部署
npx hardhat node
npm run deploy:local
```

## 项目结构

```
my-synthetic-token/
├── contracts/
│   ├── interfaces/
│   │   ├── IAddressResolver.sol
│   │   ├── ICollateralVault.sol
│   │   ├── IMegToken.sol
│   │   ├── IMegTokenIssuer.sol
│   │   └── IPriceOracle.sol
│   ├── AddressResolver.sol
│   ├── CollateralVault.sol
│   ├── MegToken.sol
│   ├── MegTokenIssuer.sol
│   ├── MixinResolver.sol
│   ├── Owned.sol
│   └── PriceOracle.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── MegFi.test.js
├── hardhat.config.js
├── package.json
└── README.md
```

## 设计参考

- **Synthetix**:
  - AddressResolver 架构
  - Synth (MegToken) 代币设计
  - Issuer 发行管理

- **MakerDAO DSS**:
  - Vat (CollateralVault) CDP 仓位管理
  - 清算机制
  - 债务追踪

## 安全注意事项

1. 生产环境需要集成去中心化预言机（如 Chainlink）
2. 需要进行完整的安全审计
3. 考虑添加更多的访问控制和紧急暂停机制
4. 考虑添加利率累积机制

## License

MIT
