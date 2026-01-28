export type AppConfig = {
  rpcUrl?: string
  routerAddress?: string
  tokenAddress?: string
  tokenRequired?: boolean
  blockscoutUrl?: string
  updatedAt?: number
}

const STORAGE_PREFIX = 'appConfig'

export function getChainId(): number {
  return parseInt(process.env.REACT_APP_CHAIN_ID || '1', 10)
}

export function getEnvRpcUrl(): string {
  return process.env.REACT_APP_NETWORK_URL || ''
}

export function getEnvRouterAddress(): string {
  return process.env.REACT_APP_ROUTER_ADDRESS || ''
}

export function getEnvTokenAddress(): string {
  return process.env.REACT_APP_TOKEN_ADDRESS || ''
}

export function getEnvBlockscoutUrl(): string {
  return process.env.REACT_APP_BLOCK_EXPLORER_URL || ''
}

export function getConfigFromStorage(chainId: number): AppConfig | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${chainId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveConfigToStorage(chainId: number, config: AppConfig): void {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}:${chainId}`,
      JSON.stringify({ ...config, updatedAt: Date.now() })
    )
  } catch {
    // ignore storage errors
  }
}

export function clearConfigFromStorage(chainId: number): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}:${chainId}`)
  } catch {
    // ignore storage errors
  }
}

export function getRpcUrl(chainId: number = getChainId()): string {
  const stored = getConfigFromStorage(chainId)
  return stored?.rpcUrl || getEnvRpcUrl()
}

export function getRouterAddress(chainId: number = getChainId()): string {
  const stored = getConfigFromStorage(chainId)
  return stored?.routerAddress || getEnvRouterAddress()
}

export function getTokenAddress(chainId: number = getChainId()): string {
  const stored = getConfigFromStorage(chainId)
  return stored?.tokenAddress || getEnvTokenAddress()
}

export function getBlockscoutUrl(chainId: number = getChainId()): string {
  const stored = getConfigFromStorage(chainId)
  return stored?.blockscoutUrl || getEnvBlockscoutUrl() || ''
}

export function getBlockscoutTokenListCacheKey(chainId: number = getChainId()): string {
  return `blockscoutTokenList:${chainId}`
}

export function clearBlockscoutTokenListCache(chainId: number = getChainId()): void {
  try {
    localStorage.removeItem(getBlockscoutTokenListCacheKey(chainId))
  } catch {
    // ignore storage errors
  }
}
