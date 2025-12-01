import { useState } from 'react';
import { useWallet } from './hooks/useWallet';
import { useContracts, TxRecord } from './hooks/useContracts';
import { Swap } from './components/Swap';
import './App.css';

function App() {
  const wallet = useWallet();
  const contracts = useContracts(wallet.signer, wallet.address);

  const [activeTab, setActiveTab] = useState<'vault' | 'swap'>('vault');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 格式化数字显示
  const formatNumber = (num: string, decimals = 2) => {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
  };

  // 格式化地址
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // 格式化交易哈希
  const formatTxHash = (hash: string) => {
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // 获取交易类型显示名称
  const getTxTypeName = (type: TxRecord['type']) => {
    const names: Record<TxRecord['type'], string> = {
      deposit: '存入',
      withdraw: '提取',
      mint: '铸造',
      burn: '还款',
      approve: '授权',
      swap: '交换'
    };
    return names[type];
  };

  // 处理交易
  const handleTx = async (action: () => Promise<void>, successMsg: string) => {
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(successMsg);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.reason || e.message || '交易失败');
    }
  };

  // 需要授权？
  const needsApproval = parseFloat(contracts.allowance) < parseFloat(depositAmount || '0');

  // 抵押率警告
  const collateralRatio = parseFloat(contracts.position.collateralRatio);
  const hasDebt = parseFloat(contracts.position.debt) > 0;
  const isLowRatio = hasDebt && collateralRatio > 0 && collateralRatio < 1.5;
  const isDangerRatio = hasDebt && collateralRatio > 0 && collateralRatio < 1.3;

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <h1>MegFi Protocol</h1>
          <span className="network-badge">Sepolia Testnet</span>
        </div>
        <div className="header-right">
          {wallet.isConnected ? (
            <div className="wallet-info">
              <span className="address">{formatAddress(wallet.address!)}</span>
              <button onClick={wallet.disconnect} className="btn btn-outline">
                断开连接
              </button>
            </div>
          ) : (
            <button
              onClick={wallet.connect}
              className="btn btn-primary"
              disabled={wallet.isConnecting}
            >
              {wallet.isConnecting ? '连接中...' : '连接钱包'}
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {!wallet.isConnected ? (
          <div className="connect-prompt">
            <h2>欢迎使用 MegFi Protocol</h2>
            <p>存入 ETH 作为抵押品，铸造 mUSD 合成美元</p>
            <button onClick={wallet.connect} className="btn btn-primary btn-large">
              连接 MetaMask
            </button>
          </div>
        ) : (
          <>
            {/* 交易进行中的遮罩 */}
            {contracts.txPending && (
              <div className="tx-overlay">
                <div className="tx-modal">
                  <div className="spinner"></div>
                  <p>交易处理中...</p>
                  {contracts.currentTxHash && (
                    <a
                      href={contracts.getEtherscanUrl(contracts.currentTxHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="tx-link"
                    >
                      在 Etherscan 查看
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 抵押率警告 */}
            {isDangerRatio && (
              <div className="alert alert-danger">
                ⚠️ 警告：抵押率过低 ({formatNumber((collateralRatio * 100).toString())}%)，接近清算线 (120%)！请立即增加抵押品或还款。
              </div>
            )}
            {isLowRatio && !isDangerRatio && (
              <div className="alert alert-warning">
                ⚠️ 注意：抵押率较低 ({formatNumber((collateralRatio * 100).toString())}%)，建议增加抵押品或还款以降低清算风险。
              </div>
            )}

            {/* 标签切换 */}
            <div className="tab-container">
              <button
                className={`tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
                onClick={() => setActiveTab('vault')}
              >
                Vault
              </button>
              <button
                className={`tab-btn ${activeTab === 'swap' ? 'active' : ''}`}
                onClick={() => setActiveTab('swap')}
              >
                Swap
              </button>
            </div>

            {activeTab === 'vault' && (
            <>
            {/* 市场信息 */}
            <div className="market-info">
              <div className="info-card">
                <span className="label">ETH 价格</span>
                <span className="value">${formatNumber(contracts.ethPrice)}</span>
              </div>
              <div className="info-card">
                <span className="label">最低抵押率</span>
                <span className="value">150%</span>
              </div>
              <div className="info-card">
                <span className="label">清算线</span>
                <span className="value">120%</span>
              </div>
            </div>

            {/* 提示信息 */}
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="content-grid">
              {/* 左侧：钱包余额 */}
              <div className="card">
                <h3>钱包余额</h3>
                <div className="balance-item">
                  <span>WETH (测试币)</span>
                  <span className="balance-value">{formatNumber(contracts.wethBalance, 4)} WETH</span>
                </div>
                <div className="balance-item">
                  <span>mUSD</span>
                  <span className="balance-value">{formatNumber(contracts.musdBalance, 2)} mUSD</span>
                </div>
                <div className="balance-item">
                  <span>mBTC</span>
                  <span className="balance-value">{formatNumber(contracts.mbtcBalance, 6)} mBTC</span>
                </div>
                <div className="balance-item">
                  <span>mGOLD</span>
                  <span className="balance-value">{formatNumber(contracts.mgoldBalance, 4)} mGOLD</span>
                </div>
                <button onClick={contracts.refresh} className="btn btn-outline btn-small" disabled={contracts.isLoading}>
                  {contracts.isLoading ? '刷新中...' : '刷新'}
                </button>

                {/* 交易历史 */}
                <div className="tx-history">
                  <h4>交易历史</h4>
                  {contracts.txHistory.length > 0 ? (
                    contracts.txHistory.slice(0, 10).map((tx) => (
                      <div key={tx.hash} className={`tx-item tx-${tx.status}`}>
                        <div className="tx-info">
                          <span className="tx-type">{getTxTypeName(tx.type)}</span>
                          <span className="tx-amount">
                            {tx.amount === 'unlimited' ? '无限' : `${formatNumber(tx.amount, 4)}`}
                          </span>
                        </div>
                        <div className="tx-meta">
                          <span className="tx-time">{formatTime(tx.timestamp)}</span>
                          <a
                            href={contracts.getEtherscanUrl(tx.hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="tx-hash"
                          >
                            {formatTxHash(tx.hash)}
                          </a>
                          <span className={`tx-status status-${tx.status}`}>
                            {tx.status === 'pending' ? '⏳' : tx.status === 'confirmed' ? '✓' : '✗'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="tx-empty">暂无交易记录</div>
                  )}
                </div>
              </div>

              {/* 中间：仓位信息 */}
              <div className="card">
                <h3>我的仓位</h3>
                <div className="position-info">
                  <div className="position-item">
                    <span>抵押品</span>
                    <span className="position-value">{formatNumber(contracts.position.collateral, 4)} WETH</span>
                  </div>
                  <div className="position-item">
                    <span>抵押品价值</span>
                    <span className="position-value">
                      ${formatNumber((parseFloat(contracts.position.collateral) * parseFloat(contracts.ethPrice)).toString())}
                    </span>
                  </div>
                  <div className="position-item">
                    <span>债务</span>
                    <span className="position-value">{formatNumber(contracts.position.debt, 2)} mUSD</span>
                  </div>
                  <div className={`position-item ${isDangerRatio ? 'danger-bg' : isLowRatio ? 'warning-bg' : ''}`}>
                    <span>抵押率</span>
                    <span className={`position-value ${isDangerRatio ? 'danger' : isLowRatio ? 'warning' : ''}`}>
                      {hasDebt
                        ? `${formatNumber((collateralRatio * 100).toString())}%`
                        : '-'}
                    </span>
                  </div>
                  <div className="position-item highlight">
                    <span>可铸造</span>
                    <span className="position-value">{formatNumber(contracts.position.maxMintable, 2)} mUSD</span>
                  </div>
                </div>
              </div>

              {/* 右侧：操作 */}
              <div className="card">
                <h3>操作</h3>

                {/* 存入抵押品 */}
                <div className="action-group">
                  <label>存入 WETH</label>
                  <div className="input-group">
                    <input
                      type="number"
                      placeholder="数量"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                    <button
                      className="btn btn-max"
                      onClick={() => setDepositAmount(contracts.wethBalance)}
                    >
                      MAX
                    </button>
                  </div>
                  {needsApproval ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleTx(() => contracts.approveWETH(), '授权成功！')}
                      disabled={contracts.txPending}
                    >
                      {contracts.txPending ? '处理中...' : '授权 WETH'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleTx(() => contracts.deposit(depositAmount), '存入成功！')}
                      disabled={contracts.txPending || !depositAmount}
                    >
                      {contracts.txPending ? '处理中...' : '存入'}
                    </button>
                  )}
                </div>

                {/* 提取抵押品 */}
                <div className="action-group">
                  <label>提取 WETH</label>
                  <div className="input-group">
                    <input
                      type="number"
                      placeholder="数量"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                    <button
                      className="btn btn-max"
                      onClick={() => setWithdrawAmount(contracts.position.collateral)}
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleTx(() => contracts.withdraw(withdrawAmount), '提取成功！')}
                    disabled={contracts.txPending || !withdrawAmount}
                  >
                    {contracts.txPending ? '处理中...' : '提取'}
                  </button>
                </div>

                {/* 铸造 mUSD */}
                <div className="action-group">
                  <label>铸造 mUSD</label>
                  <div className="input-group">
                    <input
                      type="number"
                      placeholder="数量"
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value)}
                    />
                    <button
                      className="btn btn-max"
                      onClick={() => setMintAmount(contracts.position.maxMintable)}
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleTx(() => contracts.mint(mintAmount), '铸造成功！')}
                    disabled={contracts.txPending || !mintAmount}
                  >
                    {contracts.txPending ? '处理中...' : '铸造'}
                  </button>
                </div>

                {/* 还款 */}
                <div className="action-group">
                  <label>还款 mUSD</label>
                  <div className="input-group">
                    <input
                      type="number"
                      placeholder="数量"
                      value={repayAmount}
                      onChange={(e) => setRepayAmount(e.target.value)}
                    />
                    <button
                      className="btn btn-max"
                      onClick={() => setRepayAmount(contracts.position.debt)}
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleTx(() => contracts.repay(repayAmount), '还款成功！')}
                    disabled={contracts.txPending || !repayAmount}
                  >
                    {contracts.txPending ? '处理中...' : '还款'}
                  </button>
                </div>
              </div>
            </div>
            </>
            )}

            {activeTab === 'swap' && (
              <Swap
                signer={wallet.signer}
                address={wallet.address}
                onRefresh={contracts.refresh}
              />
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p>MegFi Protocol - Sepolia Testnet | <a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer">Etherscan</a></p>
      </footer>
    </div>
  );
}

export default App;
