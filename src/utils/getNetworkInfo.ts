import { providers } from 'ethers'

export interface NetworkInfo {
  chainId: number | null
  name: string | null
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  } | null
}

/**
 * 从 RPC URL 获取网络信息
 */
export async function getNetworkInfoFromRpcUrl(rpcUrl: string): Promise<NetworkInfo> {
  try {
    const provider = new providers.JsonRpcProvider(rpcUrl)
    const network = await provider.getNetwork()

    return {
      chainId: network.chainId,
      name: network.name || null,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18
      }
    }
  } catch (error) {
    console.error('Failed to get network info from RPC:', error)
    return {
      chainId: null,
      name: null,
      nativeCurrency: null
    }
  }
}

/**
 * 仅获取 chainId
 */
export async function getChainIdFromRpcUrl(rpcUrl: string): Promise<number | null> {
  const info = await getNetworkInfoFromRpcUrl(rpcUrl)
  return info.chainId
}
