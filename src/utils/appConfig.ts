export type AppConfig = {
  rpcUrl?: string
  routerAddress?: string
  tokenAddress?: string
  wethAddress?: string
  tokenRequired?: boolean
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

export function getEnvWethAddress(): string {
  return process.env.REACT_APP_WETH_ADDRESS || ''
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
  if (stored?.rpcUrl) return stored.rpcUrl
  if (chainId !== getChainId()) {
    const fallback = getConfigFromStorage(getChainId())
    if (fallback?.rpcUrl) return fallback.rpcUrl
  }
  return getEnvRpcUrl()
}

export function getRouterAddress(chainId: number = getChainId()): string {
  const stored = getConfigFromStorage(chainId)
  if (stored?.routerAddress) return stored.routerAddress
  if (chainId !== getChainId()) {
    const fallback = getConfigFromStorage(getChainId())
    if (fallback?.routerAddress) return fallback.routerAddress
  }
  return getEnvRouterAddress()
}

export function getTokenAddress(chainId: number = getChainId()): string {
  const stored = getConfigFromStorage(chainId)
  if (stored?.tokenAddress) return stored.tokenAddress
  if (chainId !== getChainId()) {
    const fallback = getConfigFromStorage(getChainId())
    if (fallback?.tokenAddress) return fallback.tokenAddress
  }
  return getEnvTokenAddress()
}

export function getWethAddress(chainId: number = getChainId()): string {
  const stored = getConfigFromStorage(chainId)
  if (stored?.wethAddress) return stored.wethAddress
  if (chainId !== getChainId()) {
    const fallback = getConfigFromStorage(getChainId())
    if (fallback?.wethAddress) return fallback.wethAddress
  }
  return getEnvWethAddress()
}
