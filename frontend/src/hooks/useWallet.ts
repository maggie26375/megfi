import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import { NETWORK } from '../config/contracts';

interface WalletState {
  address: string | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isConnecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    signer: null,
    provider: null,
    isConnected: false,
    isCorrectNetwork: false,
    isConnecting: false,
    error: null
  });

  // 检查网络
  const checkNetwork = useCallback(async (provider: BrowserProvider) => {
    try {
      const network = await provider.getNetwork();
      return Number(network.chainId) === NETWORK.chainId;
    } catch {
      return false;
    }
  }, []);

  // 切换网络
  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK.chainIdHex }],
      });
    } catch (error: any) {
      // 如果网络不存在，添加它
      if (error.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: NETWORK.chainIdHex,
            chainName: NETWORK.name,
            rpcUrls: [NETWORK.rpcUrl],
            blockExplorerUrls: [NETWORK.explorer]
          }],
        });
      }
    }
  }, []);

  // 连接钱包
  const connect = useCallback(async () => {
    console.log('connect() called, window.ethereum:', !!window.ethereum);

    if (!window.ethereum) {
      console.log('MetaMask not found');
      setState(prev => ({ ...prev, error: '请安装 MetaMask!' }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    console.log('Requesting accounts...');

    try {
      const provider = new BrowserProvider(window.ethereum);

      // 请求连接
      await provider.send("eth_requestAccounts", []);

      // 检查网络
      const isCorrectNetwork = await checkNetwork(provider);
      if (!isCorrectNetwork) {
        await switchNetwork();
      }

      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      setState({
        address,
        signer,
        provider,
        isConnected: true,
        isCorrectNetwork: true,
        isConnecting: false,
        error: null
      });
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || '连接失败'
      }));
    }
  }, [checkNetwork, switchNetwork]);

  // 断开连接
  const disconnect = useCallback(() => {
    setState({
      address: null,
      signer: null,
      provider: null,
      isConnected: false,
      isCorrectNetwork: false,
      isConnecting: false,
      error: null
    });
  }, []);

  // 监听账户变化
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (state.isConnected) {
        connect();
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [state.isConnected, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    switchNetwork
  };
}

// 为 window.ethereum 添加类型
declare global {
  interface Window {
    ethereum?: any;
  }
}
