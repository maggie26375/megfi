import { useState, useEffect, useCallback } from 'react';
import { Contract, formatEther, parseEther, JsonRpcSigner } from 'ethers';
import { ADDRESSES, VAULT_ABI, TOKEN_ABI, ORACLE_ABI, NETWORK, SYNTH_ASSETS } from '../config/contracts';

interface Position {
  collateral: string;
  debt: string;
  maxMintable: string;
  collateralRatio: string;
}

// 交易记录类型
export interface TxRecord {
  hash: string;
  type: 'deposit' | 'withdraw' | 'mint' | 'burn' | 'approve' | 'swap';
  amount: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

interface ContractsState {
  wethBalance: string;
  musdBalance: string;
  mbtcBalance: string;
  mgoldBalance: string;
  position: Position;
  ethPrice: string;
  allowance: string;
  isLoading: boolean;
}

// localStorage key for transaction history
const TX_HISTORY_KEY = 'megfi_tx_history';

// Load transaction history from localStorage
export const loadTxHistory = (walletAddress: string): TxRecord[] => {
  try {
    const stored = localStorage.getItem(`${TX_HISTORY_KEY}_${walletAddress.toLowerCase()}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load tx history:', e);
  }
  return [];
};

// Save transaction history to localStorage
export const saveTxHistory = (walletAddress: string, history: TxRecord[]) => {
  try {
    localStorage.setItem(
      `${TX_HISTORY_KEY}_${walletAddress.toLowerCase()}`,
      JSON.stringify(history.slice(0, 20)) // Keep last 20 transactions
    );
  } catch (e) {
    console.error('Failed to save tx history:', e);
  }
};

export function useContracts(signer: JsonRpcSigner | null, address: string | null) {
  const [state, setState] = useState<ContractsState>({
    wethBalance: '0',
    musdBalance: '0',
    mbtcBalance: '0',
    mgoldBalance: '0',
    position: {
      collateral: '0',
      debt: '0',
      maxMintable: '0',
      collateralRatio: '0'
    },
    ethPrice: '0',
    allowance: '0',
    isLoading: false
  });

  const [txPending, setTxPending] = useState(false);
  const [currentTxHash, setCurrentTxHash] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);

  // Load transaction history when wallet connects
  useEffect(() => {
    if (address) {
      const history = loadTxHistory(address);
      setTxHistory(history);
    } else {
      setTxHistory([]);
    }
  }, [address]);

  // 添加交易记录
  const addTxRecord = useCallback((hash: string, type: TxRecord['type'], amount: string) => {
    const record: TxRecord = {
      hash,
      type,
      amount,
      timestamp: Date.now(),
      status: 'pending'
    };
    setTxHistory(prev => {
      const newHistory = [record, ...prev].slice(0, 20);
      if (address) {
        saveTxHistory(address, newHistory);
      }
      return newHistory;
    });
  }, [address]);

  // 更新交易状态
  const updateTxStatus = useCallback((hash: string, status: TxRecord['status']) => {
    setTxHistory(prev => {
      const newHistory = prev.map(tx => tx.hash === hash ? { ...tx, status } : tx);
      if (address) {
        saveTxHistory(address, newHistory);
      }
      return newHistory;
    });
  }, [address]);

  // 获取 Etherscan 链接
  const getEtherscanUrl = useCallback((hash: string) => {
    return `${NETWORK.explorer}/tx/${hash}`;
  }, []);

  // 刷新数据
  const refresh = useCallback(async () => {
    if (!signer || !address) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const weth = new Contract(ADDRESSES.mockWETH, TOKEN_ABI, signer);
      const musd = new Contract(ADDRESSES.mUSD, TOKEN_ABI, signer);
      const mbtc = new Contract(ADDRESSES.mBTC, TOKEN_ABI, signer);
      const mgold = new Contract(ADDRESSES.mGOLD, TOKEN_ABI, signer);
      const oracle = new Contract(ADDRESSES.priceOracle, ORACLE_ABI, signer);

      // 并行获取所有数据
      const [
        wethBalance,
        musdBalance,
        mbtcBalance,
        mgoldBalance,
        position,
        maxMintable,
        ethPrice,
        allowance,
        collateralRatio
      ] = await Promise.all([
        weth.balanceOf(address),
        musd.balanceOf(address),
        mbtc.balanceOf(address),
        mgold.balanceOf(address),
        vault.getPosition(address),
        vault.maxMintable(address),
        oracle.getCollateralPrice(),
        weth.allowance(address, ADDRESSES.collateralVault),
        vault.getCollateralRatio(address).catch(() => BigInt(0))
      ]);

      setState({
        wethBalance: formatEther(wethBalance),
        musdBalance: formatEther(musdBalance),
        mbtcBalance: formatEther(mbtcBalance),
        mgoldBalance: formatEther(mgoldBalance),
        position: {
          collateral: formatEther(position.collateral),
          debt: formatEther(position.debt),
          maxMintable: formatEther(maxMintable),
          collateralRatio: position.debt > 0 ? formatEther(collateralRatio) : '0'
        },
        ethPrice: formatEther(ethPrice),
        allowance: formatEther(allowance),
        isLoading: false
      });

      // 重新加载交易历史（包括 Swap 添加的记录）
      const history = loadTxHistory(address);
      setTxHistory(history);
    } catch (error) {
      console.error('Error fetching data:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [signer, address]);

  // 授权 WETH
  const approveWETH = useCallback(async () => {
    if (!signer) return;

    setTxPending(true);
    setCurrentTxHash(null);
    try {
      const weth = new Contract(ADDRESSES.mockWETH, TOKEN_ABI, signer);
      const tx = await weth.approve(ADDRESSES.collateralVault, parseEther('1000000'));
      setCurrentTxHash(tx.hash);
      addTxRecord(tx.hash, 'approve', 'unlimited');
      await tx.wait();
      updateTxStatus(tx.hash, 'confirmed');
      await refresh();
    } catch (error: any) {
      if (currentTxHash) updateTxStatus(currentTxHash, 'failed');
      console.error('Approve error:', error);
      throw error;
    } finally {
      setTxPending(false);
      setCurrentTxHash(null);
    }
  }, [signer, refresh, addTxRecord, updateTxStatus, currentTxHash]);

  // 存入抵押品
  const deposit = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    setCurrentTxHash(null);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.deposit(parseEther(amount));
      setCurrentTxHash(tx.hash);
      addTxRecord(tx.hash, 'deposit', amount);
      await tx.wait();
      updateTxStatus(tx.hash, 'confirmed');
      await refresh();
    } catch (error: any) {
      if (currentTxHash) updateTxStatus(currentTxHash, 'failed');
      console.error('Deposit error:', error);
      throw error;
    } finally {
      setTxPending(false);
      setCurrentTxHash(null);
    }
  }, [signer, refresh, addTxRecord, updateTxStatus, currentTxHash]);

  // 提取抵押品
  const withdraw = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    setCurrentTxHash(null);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.withdraw(parseEther(amount));
      setCurrentTxHash(tx.hash);
      addTxRecord(tx.hash, 'withdraw', amount);
      await tx.wait();
      updateTxStatus(tx.hash, 'confirmed');
      await refresh();
    } catch (error: any) {
      if (currentTxHash) updateTxStatus(currentTxHash, 'failed');
      console.error('Withdraw error:', error);
      throw error;
    } finally {
      setTxPending(false);
      setCurrentTxHash(null);
    }
  }, [signer, refresh, addTxRecord, updateTxStatus, currentTxHash]);

  // 铸造 mUSD
  const mint = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    setCurrentTxHash(null);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.mint(parseEther(amount));
      setCurrentTxHash(tx.hash);
      addTxRecord(tx.hash, 'mint', amount);
      await tx.wait();
      updateTxStatus(tx.hash, 'confirmed');
      await refresh();
    } catch (error: any) {
      if (currentTxHash) updateTxStatus(currentTxHash, 'failed');
      console.error('Mint error:', error);
      throw error;
    } finally {
      setTxPending(false);
      setCurrentTxHash(null);
    }
  }, [signer, refresh, addTxRecord, updateTxStatus, currentTxHash]);

  // 还款 (burn mUSD to repay debt)
  const repay = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    setCurrentTxHash(null);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.burn(parseEther(amount));
      setCurrentTxHash(tx.hash);
      addTxRecord(tx.hash, 'burn', amount);
      await tx.wait();
      updateTxStatus(tx.hash, 'confirmed');
      await refresh();
    } catch (error: any) {
      if (currentTxHash) updateTxStatus(currentTxHash, 'failed');
      console.error('Repay error:', error);
      throw error;
    } finally {
      setTxPending(false);
      setCurrentTxHash(null);
    }
  }, [signer, refresh, addTxRecord, updateTxStatus, currentTxHash]);

  // 连接后自动刷新
  useEffect(() => {
    if (signer && address) {
      refresh();
    }
  }, [signer, address, refresh]);

  return {
    ...state,
    txPending,
    currentTxHash,
    txHistory,
    getEtherscanUrl,
    refresh,
    approveWETH,
    deposit,
    withdraw,
    mint,
    repay
  };
}
