import { ChainId, Currency, CurrencyAmount, ETHER, Token, TokenAmount, WETH } from '@im33357/uniswap-v2-sdk'

// 环境变量配置的 WETH 地址
const ENV_WETH_ADDRESS = process.env.REACT_APP_WETH_ADDRESS || ''

function getCachedWethAddress(chainId: number | undefined): string {
  if (!chainId) return ''
  try {
    return localStorage.getItem(`wethAddress:${chainId}`) || ''
  } catch {
    return ''
  }
}

/**
 * 安全获取 WETH Token (支持任意 chainId)
 * 优先级: 环境变量 > SDK 默认 > MAINNET 默认
 */
export function getWETH(chainId: number | undefined): Token | undefined {
  if (!chainId) return undefined

  // 优先使用环境变量配置的 WETH
  if (ENV_WETH_ADDRESS) {
    return new Token(chainId, ENV_WETH_ADDRESS, 18, 'WETH', 'Wrapped Ether')
  }

  const cachedWeth = getCachedWethAddress(chainId)
  if (cachedWeth) {
    return new Token(chainId, cachedWeth, 18, 'WETH', 'Wrapped Ether')
  }

  // 尝试从 SDK 获取 (使用类型断言，可能返回 undefined)
  const sdkWeth = WETH[chainId as ChainId]
  if (sdkWeth) return sdkWeth

  // 回退到 MAINNET WETH (兼容未知链)
  return WETH[ChainId.MAINNET]
}

/**
 * 获取指定 chainId 的 WETH Token (支持自定义地址)
 * 优先级: 显式传入 > 环境变量 > SDK 默认
 */
export function getWrappedToken(chainId: number, wethAddress?: string): Token {
  const customAddress = wethAddress || ENV_WETH_ADDRESS || getCachedWethAddress(chainId)
  if (customAddress) {
    return new Token(chainId, customAddress, 18, 'WETH', 'Wrapped Ether')
  }
  // 回退到 SDK 默认 (使用类型断言)
  const chainIdKey = chainId as ChainId
  return WETH[chainIdKey] || WETH[ChainId.MAINNET]
}

/**
 * 包装 Currency 为 Token (支持自定义 WETH)
 * 优先级: 显式传入 > 环境变量 > SDK 默认
 */
export function wrappedCurrency(currency: Currency | undefined, chainId: ChainId | undefined, wethAddress?: string): Token | undefined {
  if (!chainId) return undefined

  // 自定义 WETH 地址优先 (显式传入 > 环境变量)
  const customAddress = wethAddress || ENV_WETH_ADDRESS || getCachedWethAddress(chainId)
  const customWeth = customAddress ? new Token(chainId, customAddress, 18, 'WETH', 'Wrapped Ether') : undefined

  if (currency === ETHER) {
    return customWeth || getWETH(chainId)
  }
  return currency instanceof Token ? currency : undefined
}

/**
 * 包装 CurrencyAmount (支持自定义 WETH)
 */
export function wrappedCurrencyAmount(
  currencyAmount: CurrencyAmount | undefined,
  chainId: ChainId | undefined,
  wethAddress?: string
): TokenAmount | undefined {
  const token = currencyAmount && chainId ? wrappedCurrency(currencyAmount.currency, chainId, wethAddress) : undefined
  return token && currencyAmount ? new TokenAmount(token, currencyAmount.raw) : undefined
}

/**
 * 解包 Token 为 Currency (支持自定义 WETH)
 * 优先级: 显式传入 > 环境变量 > SDK 默认
 */
export function unwrappedToken(token: Token, wethAddress?: string): Currency {
  // 检查是否是自定义 WETH (显式传入 > 环境变量)
  const customAddress = wethAddress || ENV_WETH_ADDRESS || getCachedWethAddress(token.chainId)
  if (customAddress && token.address.toLowerCase() === customAddress.toLowerCase()) {
    return ETHER
  }
  // 检查是否是 SDK 默认 WETH (使用类型断言)
  const chainIdKey = token.chainId as ChainId
  if (WETH[chainIdKey] && token.equals(WETH[chainIdKey])) return ETHER
  return token
}
