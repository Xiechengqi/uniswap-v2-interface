import { ChainId } from '@im33357/uniswap-v2-sdk'
import MULTICALL_ABI from './abi.json'

// Multicall 地址 (环境变量或空)
const MULTICALL_ADDRESS = process.env.REACT_APP_MULTICALL_ADDRESS || ''
const CUSTOM_CHAIN_ID = parseInt(process.env.REACT_APP_CHAIN_ID ?? '1')

// 支持标准链和自定义链的 Multicall 地址
const MULTICALL_NETWORKS: { [chainId: number]: string | undefined } = {
  [ChainId.MAINNET]: '0xeefBa1e63905eF1D7ACbA5a8513c70307C1cE441',
  [ChainId.ROPSTEN]: '0x53C43764255c17BD724F74c4eF150724AC50a3ed',
  [ChainId.RINKEBY]: '0x42Ad527de7d4e9d9d011aC45B31D8551f8Fe9821',
  [ChainId.GÖRLI]: '0x77dCa2C955b15e9dE4dbBCf1246B4B85b651e50e',
  [ChainId.KOVAN]: '0x2cc8688C5f75E365aaEEb4ea8D6a480405A48D2A',
  // 自定义链使用环境变量配置
  [CUSTOM_CHAIN_ID]: MULTICALL_ADDRESS || undefined
}

export { MULTICALL_ABI, MULTICALL_NETWORKS }
