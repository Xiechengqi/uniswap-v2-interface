import { getChainId } from '../utils/appConfig'

// the Uniswap Default token list lives here
export const DEFAULT_TOKEN_LIST_URL = 'tokens.uniswap.eth'

// 私有链 token list (本地)
export const PRIVATE_CHAIN_LIST_URL = 'private-chain-tokens'

const ENS_LISTS = [
  't2crtokens.eth', // kleros
  'tokens.1inch.eth', // 1inch
  'synths.snx.eth',
  'tokenlist.dharma.eth',
  'defi.cmc.eth',
  'erc20.cmc.eth',
  'stablecoin.cmc.eth',
  'tokenlist.zerion.eth',
  'tokenlist.aave.eth'
]

const HTTP_LISTS = [
  'https://raw.githubusercontent.com/compound-finance/token-list/master/compound.tokenlist.json',
  'https://defiprime.com/defiprime.tokenlist.json'
]

const IS_MAINNET = getChainId() === 1

export const DEFAULT_LIST_OF_LISTS: string[] = [
  ...(IS_MAINNET ? [DEFAULT_TOKEN_LIST_URL] : []),
  PRIVATE_CHAIN_LIST_URL,
  ...(IS_MAINNET ? ENS_LISTS : []),
  ...HTTP_LISTS
]
