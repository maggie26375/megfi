import { useState, useEffect, useCallback } from 'react';
import { Contract, formatEther, parseEther, JsonRpcSigner } from 'ethers';
import { ADDRESSES, SYNTH_ASSETS, TOKEN_ABI, SWAP_ABI, ORACLE_ABI, getCurrencyKey, NETWORK } from '../config/contracts';
import { TxRecord, loadTxHistory, saveTxHistory } from '../hooks/useContracts';

interface SwapProps {
  signer: JsonRpcSigner | null;
  address: string | null;
  onRefresh: () => void;
}

interface AssetBalance {
  symbol: string;
  balance: string;
  price: string;
}

export function Swap({ signer, address, onRefresh }: SwapProps) {
  const [fromAsset, setFromAsset] = useState('mUSD');
  const [toAsset, setToAsset] = useState('mBTC');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fee, setFee] = useState('');
  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 加载余额和价格
  const loadBalances = useCallback(async () => {
    if (!signer || !address) return;

    try {
      const oracle = new Contract(ADDRESSES.priceOracle, ORACLE_ABI, signer);
      const results: AssetBalance[] = [];

      for (const asset of SYNTH_ASSETS) {
        try {
          const token = new Contract(asset.address, TOKEN_ABI, signer);
          const balance = await token.balanceOf(address);
          const [price, isValid] = await oracle.getPrice(getCurrencyKey(asset.symbol));

          results.push({
            symbol: asset.symbol,
            balance: formatEther(balance),
            price: isValid ? formatEther(price) : '0'
          });
        } catch (assetError) {
          console.error(`Error loading ${asset.symbol}:`, assetError);
          results.push({
            symbol: asset.symbol,
            balance: '0',
            price: '0'
          });
        }
      }

      setBalances(results);
    } catch (e) {
      console.error('Load balances error:', e);
    }
  }, [signer, address]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // 预览交换
  const previewSwap = useCallback(async () => {
    if (!signer || !fromAmount || fromAsset === toAsset) {
      setToAmount('');
      setFee('');
      return;
    }

    try {
      const swap = new Contract(ADDRESSES.megSwap, SWAP_ABI, signer);
      const fromKey = getCurrencyKey(fromAsset);
      const toKey = getCurrencyKey(toAsset);
      const amount = parseEther(fromAmount);

      const [resultAmount, feeAmount] = await swap.previewSwap(fromKey, toKey, amount);
      setToAmount(formatEther(resultAmount));
      setFee(formatEther(feeAmount));
    } catch (e: any) {
      console.error('Preview error:', e);
      setToAmount('');
      setFee('');
    }
  }, [signer, fromAmount, fromAsset, toAsset]);

  useEffect(() => {
    const timer = setTimeout(() => {
      previewSwap();
    }, 300);
    return () => clearTimeout(timer);
  }, [previewSwap]);

  // 保存交易记录
  const addSwapTxRecord = useCallback((hash: string, amount: string, status: TxRecord['status']) => {
    if (!address) {
      console.log('addSwapTxRecord: no address');
      return;
    }
    const record: TxRecord = {
      hash,
      type: 'swap',
      amount,
      timestamp: Date.now(),
      status
    };
    const history = loadTxHistory(address);
    const newHistory = [record, ...history].slice(0, 20);
    saveTxHistory(address, newHistory);
    console.log('Swap tx saved:', hash, 'total history:', newHistory.length);
  }, [address]);

  // 更新交易状态
  const updateSwapTxStatus = useCallback((hash: string, status: TxRecord['status']) => {
    if (!address) return;
    const history = loadTxHistory(address);
    const newHistory = history.map(tx => tx.hash === hash ? { ...tx, status } : tx);
    saveTxHistory(address, newHistory);
  }, [address]);

  // 执行交换
  const executeSwap = async () => {
    if (!signer || !fromAmount || !toAmount) return;

    setError('');
    setSuccess('');
    setIsPending(true);
    setTxHash(null);

    try {
      const swap = new Contract(ADDRESSES.megSwap, SWAP_ABI, signer);
      const fromKey = getCurrencyKey(fromAsset);
      const toKey = getCurrencyKey(toAsset);
      const amount = parseEther(fromAmount);

      // 设置 1% 滑点保护
      const minAmount = parseEther(toAmount) * BigInt(99) / BigInt(100);

      const tx = await swap.swap(fromKey, toKey, amount, minAmount);
      setTxHash(tx.hash);

      // 记录交易 (pending)
      addSwapTxRecord(tx.hash, `${fromAmount} ${fromAsset} → ${toAsset}`, 'pending');

      await tx.wait();

      // 更新交易状态为确认
      updateSwapTxStatus(tx.hash, 'confirmed');

      setSuccess(`成功将 ${fromAmount} ${fromAsset} 换成 ${toAmount} ${toAsset}`);
      setFromAmount('');
      setToAmount('');
      setFee('');
      await loadBalances();
      onRefresh();
    } catch (e: any) {
      console.error('Swap error:', e);
      if (txHash) {
        updateSwapTxStatus(txHash, 'failed');
      }
      setError(e.reason || e.message || '交换失败');
    } finally {
      setIsPending(false);
    }
  };

  // 切换资产
  const switchAssets = () => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  // 获取余额
  const getBalance = (symbol: string) => {
    const asset = balances.find(b => b.symbol === symbol);
    return asset ? parseFloat(asset.balance) : 0;
  };

  // 获取价格
  const getPrice = (symbol: string) => {
    const asset = balances.find(b => b.symbol === symbol);
    return asset ? parseFloat(asset.price) : 0;
  };

  const formatNumber = (num: string | number, decimals = 6) => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '0';
    return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
  };

  return (
    <div className="swap-container">
      <h3>Swap</h3>

      {/* 交易进行中 */}
      {isPending && (
        <div className="swap-pending">
          <div className="spinner-small"></div>
          <span>交易处理中...</span>
          {txHash && (
            <a
              href={`${NETWORK.explorer}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              查看交易
            </a>
          )}
        </div>
      )}

      {error && <div className="swap-error">{error}</div>}
      {success && <div className="swap-success">{success}</div>}

      {/* From */}
      <div className="swap-input-group">
        <div className="swap-input-header">
          <span>From</span>
          <span className="swap-balance" onClick={() => setFromAmount(getBalance(fromAsset).toString())}>
            余额: {formatNumber(getBalance(fromAsset))}
          </span>
        </div>
        <div className="swap-input-row">
          <input
            type="number"
            placeholder="0.0"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
          />
          <select value={fromAsset} onChange={(e) => setFromAsset(e.target.value)}>
            {SYNTH_ASSETS.map(asset => (
              <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>
            ))}
          </select>
        </div>
        <div className="swap-input-footer">
          ≈ ${formatNumber(parseFloat(fromAmount || '0') * getPrice(fromAsset), 2)}
        </div>
      </div>

      {/* Switch button */}
      <div className="swap-switch" onClick={switchAssets}>
        <span>↓↑</span>
      </div>

      {/* To */}
      <div className="swap-input-group">
        <div className="swap-input-header">
          <span>To</span>
          <span className="swap-balance">
            余额: {formatNumber(getBalance(toAsset))}
          </span>
        </div>
        <div className="swap-input-row">
          <input
            type="number"
            placeholder="0.0"
            value={toAmount}
            readOnly
          />
          <select value={toAsset} onChange={(e) => setToAsset(e.target.value)}>
            {SYNTH_ASSETS.map(asset => (
              <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>
            ))}
          </select>
        </div>
        <div className="swap-input-footer">
          ≈ ${formatNumber(parseFloat(toAmount || '0') * getPrice(toAsset), 2)}
        </div>
      </div>

      {/* Info */}
      {toAmount && (
        <div className="swap-info">
          <div className="swap-info-row">
            <span>汇率</span>
            <span>1 {fromAsset} = {formatNumber(parseFloat(toAmount) / parseFloat(fromAmount))} {toAsset}</span>
          </div>
          <div className="swap-info-row">
            <span>手续费 (0.3%)</span>
            <span>{formatNumber(fee)} {toAsset}</span>
          </div>
        </div>
      )}

      {/* Swap button */}
      <button
        className="btn btn-primary btn-swap"
        onClick={executeSwap}
        disabled={isPending || !fromAmount || !toAmount || fromAsset === toAsset || parseFloat(fromAmount) > getBalance(fromAsset)}
      >
        {isPending ? '处理中...' : fromAsset === toAsset ? '请选择不同资产' : parseFloat(fromAmount) > getBalance(fromAsset) ? '余额不足' : '交换'}
      </button>

      {/* Price info */}
      <div className="swap-prices">
        <h4>实时价格</h4>
        {balances.map(asset => (
          <div key={asset.symbol} className="price-row">
            <span>{asset.symbol}</span>
            <span>${formatNumber(asset.price, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
