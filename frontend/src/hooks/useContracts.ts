import { useState, useEffect, useCallback } from 'react';
import { Contract, formatEther, parseEther, JsonRpcSigner } from 'ethers';
import { ADDRESSES, VAULT_ABI, TOKEN_ABI, ORACLE_ABI } from '../config/contracts';

interface Position {
  collateral: string;
  debt: string;
  maxMintable: string;
  collateralRatio: string;
}

interface ContractsState {
  wethBalance: string;
  musdBalance: string;
  position: Position;
  ethPrice: string;
  allowance: string;
  isLoading: boolean;
}

export function useContracts(signer: JsonRpcSigner | null, address: string | null) {
  const [state, setState] = useState<ContractsState>({
    wethBalance: '0',
    musdBalance: '0',
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

  // 刷新数据
  const refresh = useCallback(async () => {
    if (!signer || !address) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const weth = new Contract(ADDRESSES.mockWETH, TOKEN_ABI, signer);
      const musd = new Contract(ADDRESSES.mUSD, TOKEN_ABI, signer);
      const oracle = new Contract(ADDRESSES.priceOracle, ORACLE_ABI, signer);

      // 并行获取所有数据
      const [
        wethBalance,
        musdBalance,
        position,
        maxMintable,
        ethPrice,
        allowance,
        collateralRatio
      ] = await Promise.all([
        weth.balanceOf(address),
        musd.balanceOf(address),
        vault.getPosition(address),
        vault.maxMintable(address),
        oracle.getCollateralPrice(),
        weth.allowance(address, ADDRESSES.collateralVault),
        vault.getCollateralRatio(address).catch(() => BigInt(0))
      ]);

      setState({
        wethBalance: formatEther(wethBalance),
        musdBalance: formatEther(musdBalance),
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
    } catch (error) {
      console.error('Error fetching data:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [signer, address]);

  // 授权 WETH
  const approveWETH = useCallback(async () => {
    if (!signer) return;

    setTxPending(true);
    try {
      const weth = new Contract(ADDRESSES.mockWETH, TOKEN_ABI, signer);
      const tx = await weth.approve(ADDRESSES.collateralVault, parseEther('1000000'));
      await tx.wait();
      await refresh();
    } catch (error: any) {
      console.error('Approve error:', error);
      throw error;
    } finally {
      setTxPending(false);
    }
  }, [signer, refresh]);

  // 存入抵押品
  const deposit = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.deposit(parseEther(amount));
      await tx.wait();
      await refresh();
    } catch (error: any) {
      console.error('Deposit error:', error);
      throw error;
    } finally {
      setTxPending(false);
    }
  }, [signer, refresh]);

  // 提取抵押品
  const withdraw = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.withdraw(parseEther(amount));
      await tx.wait();
      await refresh();
    } catch (error: any) {
      console.error('Withdraw error:', error);
      throw error;
    } finally {
      setTxPending(false);
    }
  }, [signer, refresh]);

  // 铸造 mUSD
  const mint = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.mint(parseEther(amount));
      await tx.wait();
      await refresh();
    } catch (error: any) {
      console.error('Mint error:', error);
      throw error;
    } finally {
      setTxPending(false);
    }
  }, [signer, refresh]);

  // 还款 (burn mUSD to repay debt)
  const repay = useCallback(async (amount: string) => {
    if (!signer) return;

    setTxPending(true);
    try {
      const vault = new Contract(ADDRESSES.collateralVault, VAULT_ABI, signer);
      const tx = await vault.burn(parseEther(amount));
      await tx.wait();
      await refresh();
    } catch (error: any) {
      console.error('Repay error:', error);
      throw error;
    } finally {
      setTxPending(false);
    }
  }, [signer, refresh]);

  // 连接后自动刷新
  useEffect(() => {
    if (signer && address) {
      refresh();
    }
  }, [signer, address, refresh]);

  return {
    ...state,
    txPending,
    refresh,
    approveWETH,
    deposit,
    withdraw,
    mint,
    repay
  };
}
