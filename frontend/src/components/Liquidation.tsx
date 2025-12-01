import { useState, useEffect, useCallback } from 'react';
import { Contract, formatEther, JsonRpcSigner, BrowserProvider } from 'ethers';
import { ADDRESSES, VAULT_ABI, TOKEN_ABI, ORACLE_ABI, NETWORK } from '../config/contracts';
import { TxRecord, loadTxHistory, saveTxHistory } from '../hooks/useContracts';

interface LiquidationProps {
  signer: JsonRpcSigner | null;
  address: string | null;
  onRefresh: () => void;
}

interface LiquidatablePosition {
  account: string;
  collateral: string;
  debt: string;
  collateralRatio: string;
  collateralValue: string;
  reward: string; // 清算者可获得的抵押品
}

export function Liquidation({ signer, address, onRefresh }: LiquidationProps) {
  const [positions, setPositions] = useState<LiquidatablePosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [myMusdBalance, setMyMusdBalance] = useState('0');
  const [ethPrice, setEthPrice] = useState('0');
  const [liquidationPenalty, setLiquidationPenalty] = useState('0');
  const [searchAddress, setSearchAddress] = useState('');

  // 加载系统参数和余额
  const loadSystemData = useCallback(async () => {
    if (!signer || !address) return;

    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const musd = new Contract(ADDRESSES.mUSD, TOKEN_ABI, signer);
      const oracle = new Contract(ADDRESSES.priceOracle, ORACLE_ABI, signer);

      const [balance, price, penalty] = await Promise.all([
        musd.balanceOf(address),
        oracle.getCollateralPrice(),
        vault.liquidationPenalty()
      ]);

      setMyMusdBalance(formatEther(balance));
      setEthPrice(formatEther(price));
      setLiquidationPenalty(formatEther(penalty));
    } catch (e) {
      console.error('Load system data error:', e);
    }
  }, [signer, address]);

  useEffect(() => {
    loadSystemData();
  }, [loadSystemData]);

  // 搜索可清算仓位
  const searchLiquidatable = useCallback(async () => {
    if (!signer) return;

    setIsLoading(true);
    setError('');
    setPositions([]);

    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const oracle = new Contract(ADDRESSES.priceOracle, ORACLE_ABI, signer);
      const price = await oracle.getCollateralPrice();
      const penalty = await vault.liquidationPenalty();

      // 从链上事件获取有仓位的地址
      const provider = signer.provider as BrowserProvider;
      const filter = vault.filters.CollateralDeposited();

      // 获取最近的存款事件 (最近 10000 个区块)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000);

      const events = await vault.queryFilter(filter, fromBlock, currentBlock);

      // 获取唯一地址
      const addressSet = new Set<string>();
      events.forEach(e => {
        const eventLog = e as any;
        if (eventLog.args?.[0]) {
          addressSet.add(eventLog.args[0] as string);
        }
      });
      const uniqueAddresses = Array.from(addressSet);

      // 如果用户输入了地址，也加入搜索
      if (searchAddress && searchAddress.startsWith('0x') && searchAddress.length === 42) {
        if (!uniqueAddresses.includes(searchAddress)) {
          uniqueAddresses.push(searchAddress);
        }
      }

      const liquidatable: LiquidatablePosition[] = [];

      for (const addr of uniqueAddresses) {
        try {
          const [isLiq, position, ratio] = await Promise.all([
            vault.isLiquidatable(addr),
            vault.getPosition(addr),
            vault.getCollateralRatio(addr).catch(() => BigInt(0))
          ]);

          if (isLiq && position.debt > 0) {
            const PRECISION = BigInt('1000000000000000000'); // 1e18
            const collateralBigInt = BigInt(position.collateral.toString());
            const priceBigInt = BigInt(price.toString());
            const penaltyBigInt = BigInt(penalty.toString());

            const collateralValue = (collateralBigInt * priceBigInt) / PRECISION;
            const penaltyAmount = (collateralBigInt * penaltyBigInt) / PRECISION;
            const reward = collateralBigInt - penaltyAmount;

            liquidatable.push({
              account: addr,
              collateral: formatEther(collateralBigInt),
              debt: formatEther(position.debt),
              collateralRatio: (Number(formatEther(ratio)) * 100).toFixed(2),
              collateralValue: formatEther(collateralValue),
              reward: formatEther(reward)
            });
          }
        } catch (e) {
          // 跳过出错的地址
        }
      }

      setPositions(liquidatable);

      if (liquidatable.length === 0) {
        setError('未找到可清算的仓位');
      }
    } catch (e: any) {
      console.error('Search error:', e);
      setError('搜索失败: ' + (e.message || '未知错误'));
    } finally {
      setIsLoading(false);
    }
  }, [signer, searchAddress]);

  // 保存交易记录
  const addLiqTxRecord = useCallback((hash: string, amount: string, status: TxRecord['status']) => {
    if (!address) return;
    const record: TxRecord = {
      hash,
      type: 'burn', // 清算本质上是帮别人还债
      amount: `清算 ${amount}`,
      timestamp: Date.now(),
      status
    };
    const history = loadTxHistory(address);
    const newHistory = [record, ...history].slice(0, 20);
    saveTxHistory(address, newHistory);
  }, [address]);

  // 执行清算
  const executeLiquidation = async (targetAccount: string, debt: string) => {
    if (!signer || !address) return;

    // 检查 mUSD 余额
    if (parseFloat(myMusdBalance) < parseFloat(debt)) {
      setError(`mUSD 余额不足，需要 ${debt} mUSD 来清算此仓位`);
      return;
    }

    setError('');
    setSuccess('');
    setIsPending(true);
    setTxHash(null);

    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const musd = new Contract(ADDRESSES.mUSD, TOKEN_ABI, signer);

      // 检查授权
      const allowance = await musd.allowance(address, ADDRESSES.collateralVault);
      if (allowance < BigInt(debt.replace('.', '') + '0'.repeat(18 - debt.split('.')[1]?.length || 0))) {
        // 需要授权
        setError('请先授权 mUSD...');
        const approveTx = await musd.approve(ADDRESSES.collateralVault, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'));
        await approveTx.wait();
      }

      // 执行清算
      const tx = await vault.liquidate(targetAccount);
      setTxHash(tx.hash);
      addLiqTxRecord(tx.hash, debt, 'pending');

      await tx.wait();

      addLiqTxRecord(tx.hash, debt, 'confirmed');
      setSuccess(`成功清算仓位！获得抵押品奖励。`);

      // 刷新数据
      await loadSystemData();
      await searchLiquidatable();
      onRefresh();
    } catch (e: any) {
      console.error('Liquidation error:', e);
      setError(e.reason || e.message || '清算失败');
    } finally {
      setIsPending(false);
    }
  };

  const formatNumber = (num: string | number, decimals = 4) => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '0';
    return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="liquidation-container">
      <h3>清算中心</h3>
      <p className="liquidation-desc">
        当仓位抵押率低于 120% 时可被清算。清算者偿还债务后获得抵押品（扣除 10% 罚金）。
      </p>

      {/* 我的信息 */}
      <div className="liquidation-info">
        <div className="info-row">
          <span>我的 mUSD 余额</span>
          <span className="info-value">{formatNumber(myMusdBalance)} mUSD</span>
        </div>
        <div className="info-row">
          <span>当前 ETH 价格</span>
          <span className="info-value">${formatNumber(ethPrice, 2)}</span>
        </div>
        <div className="info-row">
          <span>清算罚金</span>
          <span className="info-value">{(parseFloat(liquidationPenalty) * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* 搜索 */}
      <div className="liquidation-search">
        <input
          type="text"
          placeholder="输入地址搜索特定仓位（可选）"
          value={searchAddress}
          onChange={(e) => setSearchAddress(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={searchLiquidatable}
          disabled={isLoading}
        >
          {isLoading ? '搜索中...' : '搜索可清算仓位'}
        </button>
      </div>

      {/* 状态消息 */}
      {error && <div className="liquidation-error">{error}</div>}
      {success && <div className="liquidation-success">{success}</div>}

      {/* 交易进行中 */}
      {isPending && (
        <div className="liquidation-pending">
          <div className="spinner-small"></div>
          <span>清算处理中...</span>
          {txHash && (
            <a href={`${NETWORK.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">
              查看交易
            </a>
          )}
        </div>
      )}

      {/* 可清算仓位列表 */}
      {positions.length > 0 && (
        <div className="liquidation-list">
          <h4>可清算仓位 ({positions.length})</h4>
          {positions.map((pos) => (
            <div key={pos.account} className="liquidation-item">
              <div className="item-header">
                <a
                  href={`${NETWORK.explorer}/address/${pos.account}`}
                  target="_blank"
                  rel="noreferrer"
                  className="item-address"
                >
                  {formatAddress(pos.account)}
                </a>
                <span className="item-ratio danger">{pos.collateralRatio}%</span>
              </div>
              <div className="item-details">
                <div className="detail-row">
                  <span>抵押品</span>
                  <span>{formatNumber(pos.collateral)} WETH (${formatNumber(pos.collateralValue, 2)})</span>
                </div>
                <div className="detail-row">
                  <span>债务</span>
                  <span>{formatNumber(pos.debt)} mUSD</span>
                </div>
                <div className="detail-row highlight">
                  <span>清算奖励</span>
                  <span>{formatNumber(pos.reward)} WETH</span>
                </div>
              </div>
              <button
                className="btn btn-danger btn-liquidate"
                onClick={() => executeLiquidation(pos.account, pos.debt)}
                disabled={isPending || parseFloat(myMusdBalance) < parseFloat(pos.debt)}
              >
                {parseFloat(myMusdBalance) < parseFloat(pos.debt)
                  ? `需要 ${formatNumber(pos.debt)} mUSD`
                  : '清算此仓位'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && positions.length === 0 && !error && (
        <div className="liquidation-empty">
          点击"搜索可清算仓位"查找可清算的仓位
        </div>
      )}
    </div>
  );
}
