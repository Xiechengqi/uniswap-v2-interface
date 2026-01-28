// 私有链配置
import { getChainId, getRpcUrl } from './appConfig'

const PRIVATE_CHAIN_ID = getChainId()
const PRIVATE_CHAIN_ID_HEX = `0x${PRIVATE_CHAIN_ID.toString(16)}`

const CHAIN_CONFIG = {
  chainId: PRIVATE_CHAIN_ID_HEX,
  chainName: process.env.REACT_APP_CHAIN_NAME || 'Base Private',
  nativeCurrency: {
    name: process.env.REACT_APP_NATIVE_NAME || 'Ether',
    symbol: process.env.REACT_APP_NATIVE_SYMBOL || 'ETH',
    decimals: 18
  },
  rpcUrls: [getRpcUrl()],
  blockExplorerUrls: process.env.REACT_APP_BLOCK_EXPLORER_URL
    ? [process.env.REACT_APP_BLOCK_EXPLORER_URL]
    : undefined
}

export async function switchToPrivateChain(): Promise<boolean> {
  const { ethereum } = window as any
  if (!ethereum) {
    console.error('No ethereum provider found')
    return false
  }

  try {
    // 尝试切换到私有链
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: PRIVATE_CHAIN_ID_HEX }]
    })
    return true
  } catch (switchError) {
    // 错误码 4902 表示链不存在，需要添加
    const err = switchError as any
    if (err.code === 4902) {
      try {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [CHAIN_CONFIG]
        })
        return true
      } catch (addError) {
        console.error('Failed to add chain:', addError)
        return false
      }
    }
    console.error('Failed to switch chain:', switchError)
    return false
  }
}

export function getPrivateChainId(): number {
  return PRIVATE_CHAIN_ID
}

export function isPrivateChain(chainId: number | undefined): boolean {
  return chainId === PRIVATE_CHAIN_ID
}
