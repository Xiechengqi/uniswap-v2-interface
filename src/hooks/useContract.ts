import { Contract } from '@ethersproject/contracts'
import { ChainId } from '@im33357/uniswap-v2-sdk'
import { abi as IUniswapV2PairABI } from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import { useEffect, useMemo, useState } from 'react'
import ENS_ABI from '../constants/abis/ens-registrar.json'
import ENS_PUBLIC_RESOLVER_ABI from '../constants/abis/ens-public-resolver.json'
import { ERC20_BYTES32_ABI } from '../constants/abis/erc20'
import ERC20_ABI from '../constants/abis/erc20.json'
import { MIGRATOR_ABI, MIGRATOR_ADDRESS } from '../constants/abis/migrator'
import UNISOCKS_ABI from '../constants/abis/unisocks.json'
import WETH_ABI from '../constants/abis/weth.json'
import { MULTICALL_ABI, MULTICALL_NETWORKS } from '../constants/multicall'
import { ROUTER_ADDRESS } from '../constants'
import { getWethAddress } from '../utils/appConfig'
import { V1_EXCHANGE_ABI, V1_FACTORY_ABI, V1_FACTORY_ADDRESSES } from '../constants/v1'
import { getContract } from '../utils'
import { getWETH } from '../utils/wrappedCurrency'
import { useActiveWeb3React } from './index'

// Router ABI (只需要 WETH 方法)
const ROUTER_WETH_ABI = ['function WETH() external view returns (address)']

// returns null on errors
function useContract(address: string | undefined, ABI: any, withSignerIfPossible = true): Contract | null {
  const { library, account } = useActiveWeb3React()

  return useMemo(() => {
    if (!address || !ABI || !library) return null
    try {
      return getContract(address, ABI, library, withSignerIfPossible && account ? account : undefined)
    } catch (error) {
      console.error('Failed to get contract', error)
      return null
    }
  }, [address, ABI, library, withSignerIfPossible, account])
}

export function useV1FactoryContract(): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(chainId ? V1_FACTORY_ADDRESSES[chainId as ChainId] : undefined, V1_FACTORY_ABI, false)
}

export function useV2MigratorContract(): Contract | null {
  return useContract(MIGRATOR_ADDRESS, MIGRATOR_ABI, true)
}

export function useV1ExchangeContract(address?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(address, V1_EXCHANGE_ABI, withSignerIfPossible)
}

export function useTokenContract(tokenAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(tokenAddress, ERC20_ABI, withSignerIfPossible)
}

/**
 * 从 Router 合约动态获取 WETH 地址
 * 优先级: 环境变量 > Router.WETH() > SDK 默认
 */
export function useWETHAddress(): string | undefined {
  const { chainId, library } = useActiveWeb3React()
  const [routerWethAddress, setRouterWethAddress] = useState<string | undefined>()

  // 优先级1: 环境变量
  const envWethAddress = process.env.REACT_APP_WETH_ADDRESS
  const configuredWethAddress = useMemo(() => (chainId ? getWethAddress(chainId) : undefined), [chainId])
  const cachedWethAddress = useMemo(() => {
    if (!chainId) return undefined
    try {
      return localStorage.getItem(`wethAddress:${chainId}`) || undefined
    } catch (error) {
      console.debug('Failed to read cached WETH address', error)
      return undefined
    }
  }, [chainId])

  // 优先级2: 从 Router 动态获取
  useEffect(() => {
    if (envWethAddress || configuredWethAddress || !library || !ROUTER_ADDRESS) return

    const fetchWETH = async () => {
      try {
        const routerContract = new Contract(ROUTER_ADDRESS, ROUTER_WETH_ABI, library)
        const wethAddr = await routerContract.WETH()
        setRouterWethAddress(wethAddr)
        if (chainId) {
          try {
            localStorage.setItem(`wethAddress:${chainId}`, wethAddr)
          } catch (error) {
            console.debug('Failed to cache WETH address', error)
          }
        }
        console.debug('Fetched WETH address from Router:', wethAddr)
      } catch (error) {
        console.debug('Failed to fetch WETH from Router, using SDK default', error)
      }
    }

    fetchWETH()
  }, [chainId, configuredWethAddress, envWethAddress, library])

  // 返回优先级: 环境变量 > Router > SDK 默认
  if (envWethAddress) return envWethAddress
  if (configuredWethAddress) return configuredWethAddress
  if (routerWethAddress) return routerWethAddress
  if (cachedWethAddress) return cachedWethAddress

  const sdkWeth = chainId ? getWETH(chainId) : undefined
  return sdkWeth?.address
}

/**
 * 获取当前链的 WETH Token 对象 (用于货币比较)
 */
export function useWETHToken(): import('@im33357/uniswap-v2-sdk').Token | undefined {
  const { chainId } = useActiveWeb3React()
  const wethAddress = useWETHAddress()

  return useMemo(() => {
    if (!chainId || !wethAddress) return undefined
    const { Token } = require('@im33357/uniswap-v2-sdk')
    return new Token(chainId, wethAddress, 18, 'WETH', 'Wrapped Ether')
  }, [chainId, wethAddress])
}

export function useWETHContract(withSignerIfPossible?: boolean): Contract | null {
  const wethAddress = useWETHAddress()
  return useContract(wethAddress, WETH_ABI, withSignerIfPossible)
}

export function useENSRegistrarContract(withSignerIfPossible?: boolean): Contract | null {
  const { chainId } = useActiveWeb3React()
  let address: string | undefined
  if (chainId) {
    switch (chainId) {
      case ChainId.MAINNET:
      case ChainId.GÖRLI:
      case ChainId.ROPSTEN:
      case ChainId.RINKEBY:
        address = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
        break
    }
  }
  return useContract(address, ENS_ABI, withSignerIfPossible)
}

export function useENSResolverContract(address: string | undefined, withSignerIfPossible?: boolean): Contract | null {
  return useContract(address, ENS_PUBLIC_RESOLVER_ABI, withSignerIfPossible)
}

export function useBytes32TokenContract(tokenAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(tokenAddress, ERC20_BYTES32_ABI, withSignerIfPossible)
}

export function usePairContract(pairAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(pairAddress, IUniswapV2PairABI, withSignerIfPossible)
}

export function useMulticallContract(): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(chainId ? MULTICALL_NETWORKS[chainId as ChainId] : undefined, MULTICALL_ABI, false)
}

export function useSocksController(): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(
    chainId === ChainId.MAINNET ? '0x65770b5283117639760beA3F867b69b3697a91dd' : undefined,
    UNISOCKS_ABI,
    false
  )
}
