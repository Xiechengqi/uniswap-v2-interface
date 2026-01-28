import { TokenList } from '@uniswap/token-lists'
import { getChainId, getTokenAddress } from '../../utils/appConfig'

const CHAIN_ID = getChainId()
const WETH_ADDRESS = process.env.REACT_APP_WETH_ADDRESS || ''
const TOKEN_ADDRESS = getTokenAddress()

// 构建私有链 token 列表
const tokens: TokenList['tokens'] = []

// 添加 WETH (metadata will be refreshed from chain)
if (WETH_ADDRESS) {
  tokens.push({
    chainId: CHAIN_ID,
    address: WETH_ADDRESS,
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether'
  })
}

// 添加自定义 Token (metadata will be refreshed from chain)
if (TOKEN_ADDRESS) {
  tokens.push({
    chainId: CHAIN_ID,
    address: TOKEN_ADDRESS,
    decimals: 18,
    symbol: 'TOKEN',
    name: 'Token'
  })
}

export const PRIVATE_CHAIN_TOKEN_LIST: TokenList = {
  name: 'Private Chain Tokens',
  timestamp: new Date().toISOString(),
  version: { major: 1, minor: 0, patch: 0 },
  tokens
}

export default PRIVATE_CHAIN_TOKEN_LIST
