import { TokenAmount, Pair, Currency } from '@im33357/uniswap-v2-sdk'
import { AddressZero } from '@ethersproject/constants'
import { Contract } from '@ethersproject/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { abi as IUniswapV2PairABI } from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import { useActiveWeb3React } from '../hooks'

import { wrappedCurrency } from '../utils/wrappedCurrency'
import { getRouterAddress, getTokenAddress, getWethAddress } from '../utils/appConfig'

const ROUTER_FACTORY_ABI = ['function factory() view returns (address)']
const FACTORY_GET_PAIR_ABI = ['function getPair(address,address) view returns (address)']

export enum PairState {
  LOADING,
  NOT_EXISTS,
  EXISTS,
  INVALID
}

type PairLookupResult = {
  loading: boolean
  reserves?: { reserve0: string; reserve1: string }
  error?: boolean
}

const PAIR_CACHE_TTL_MS = 10_000
const RESERVES_CACHE_TTL_MS = 5_000
const REQUEST_DEBOUNCE_MS = 150
const MAX_RESERVE_CONCURRENCY = 3

export function usePairs(currencies: [Currency | undefined, Currency | undefined][]): [PairState, Pair | null][] {
  const { chainId, library } = useActiveWeb3React()

  const tokens = useMemo(
    () =>
      currencies.map(([currencyA, currencyB]) => [
        wrappedCurrency(currencyA, chainId),
        wrappedCurrency(currencyB, chainId)
      ]),
    [chainId, currencies]
  )

  const tokenAddressPairs = useMemo(() => {
    return currencies.map(([currencyA, currencyB]) => {
      const tokenA = wrappedCurrency(currencyA, chainId)
      const tokenB = wrappedCurrency(currencyB, chainId)
      return [tokenA?.address || '', tokenB?.address || ''] as const
    })
  }, [chainId, currencies])

  const fallbackTokenAddressPairs = useMemo(() => {
    const tokenAddress = getTokenAddress(chainId ?? undefined)
    const wethAddress = getWethAddress(chainId ?? undefined)
    if (!tokenAddress || !wethAddress) return []
    return [[wethAddress, tokenAddress]] as const
  }, [chainId])

  const effectiveTokenAddressPairs = useMemo(() => {
    const hasValid = tokenAddressPairs.some(
      ([a, b]) => a && b && a.toLowerCase() !== b.toLowerCase()
    )
    return hasValid ? tokenAddressPairs : fallbackTokenAddressPairs
  }, [fallbackTokenAddressPairs, tokenAddressPairs])

  const tokenAddressKey = useMemo(
    () => effectiveTokenAddressPairs.map(([a, b]) => `${a}:${b}`).join('|'),
    [effectiveTokenAddressPairs]
  )

  const [results, setResults] = useState<PairLookupResult[]>([])
  const cacheRef = useRef<{
    pairAddressByKey: Map<string, { address?: string; updatedAt: number }>
    reservesByPair: Map<string, { reserve0: string; reserve1: string; updatedAt: number }>
  }>({
    pairAddressByKey: new Map(),
    reservesByPair: new Map()
  })
  const inflightRef = useRef<{
    pairKey: Set<string>
    reserves: Set<string>
  }>({ pairKey: new Set(), reserves: new Set() })

  useEffect(() => {
    let stale = false
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const asyncPool = async <T, R>(items: T[], limit: number, handler: (item: T) => Promise<R>): Promise<R[]> => {
      const results: R[] = []
      let index = 0
      const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
        while (index < items.length) {
          const currentIndex = index++
          results[currentIndex] = await handler(items[currentIndex])
        }
      })
      await Promise.all(workers)
      return results
    }

    const fetchPairs = async () => {
      const hasValidPair = effectiveTokenAddressPairs.some(
        ([a, b]) => a && b && a.toLowerCase() !== b.toLowerCase()
      )
      console.debug('[pairs] start', {
        chainId,
        hasLibrary: Boolean(library),
        tokenAddressPairs: effectiveTokenAddressPairs,
        hasValidPair
      })
      if (!library || effectiveTokenAddressPairs.length === 0 || !hasValidPair) {
        if (!stale) setResults(effectiveTokenAddressPairs.map(() => ({ loading: false })))
        return
      }

      const now = Date.now()
      const initial = effectiveTokenAddressPairs.map<PairLookupResult>(([tokenA, tokenB]) => {
        if (!tokenA || !tokenB || tokenA.toLowerCase() === tokenB.toLowerCase()) return { loading: false }
        const pairKey = `${tokenA.toLowerCase()}:${tokenB.toLowerCase()}`
        const cachedPair = cacheRef.current.pairAddressByKey.get(pairKey)
        if (cachedPair && cachedPair.address) {
          const cachedReserves = cacheRef.current.reservesByPair.get(cachedPair.address.toLowerCase())
          if (cachedReserves && now - cachedReserves.updatedAt < RESERVES_CACHE_TTL_MS) {
            return { loading: false, reserves: cachedReserves }
          }
        }
        return { loading: true }
      })
      if (!stale) setResults(initial)

      const routerAddress = getRouterAddress(chainId ?? undefined)
      console.debug('[pairs] router', { chainId, routerAddress })

      const pairAddresses = effectiveTokenAddressPairs.map(() => undefined as string | undefined)

      try {
        if (!routerAddress) {
          if (!stale) setResults(effectiveTokenAddressPairs.map(() => ({ loading: false })))
          return
        }

        const routerContract = new Contract(routerAddress, ROUTER_FACTORY_ABI, library)
        const factoryAddress = await routerContract.factory()
        console.debug('[pairs] factory', { factoryAddress })
        if (!factoryAddress || factoryAddress === AddressZero) {
          if (!stale) setResults(effectiveTokenAddressPairs.map(() => ({ loading: false })))
          return
        }

        const factoryContract = new Contract(factoryAddress, FACTORY_GET_PAIR_ABI, library)
        const pairLookups = await Promise.all(
          effectiveTokenAddressPairs.map(async ([tokenA, tokenB]) => {
            if (!tokenA || !tokenB || tokenA.toLowerCase() === tokenB.toLowerCase()) {
              return undefined
            }
            const pairKey = `${tokenA.toLowerCase()}:${tokenB.toLowerCase()}`
            const cached = cacheRef.current.pairAddressByKey.get(pairKey)
            if (cached && now - cached.updatedAt < PAIR_CACHE_TTL_MS) {
              return cached.address
            }
            if (inflightRef.current.pairKey.has(pairKey) && cached?.address) {
              return cached.address
            }
            inflightRef.current.pairKey.add(pairKey)
            try {
              const address = await factoryContract.getPair(tokenA, tokenB)
              const normalized = typeof address === 'string' ? address : undefined
              cacheRef.current.pairAddressByKey.set(pairKey, { address: normalized, updatedAt: Date.now() })
              return normalized
            } finally {
              inflightRef.current.pairKey.delete(pairKey)
            }
          })
        )

        pairLookups.forEach((address, index) => {
          if (typeof address === 'string' && address !== AddressZero) {
            pairAddresses[index] = address
          }
        })
        console.debug('[pairs] pairAddresses', { pairAddresses })

        const reservesResults = await asyncPool(
          pairAddresses,
          MAX_RESERVE_CONCURRENCY,
          async address => {
            if (!address) return undefined
            const normalized = address.toLowerCase()
            const cached = cacheRef.current.reservesByPair.get(normalized)
            if (cached && now - cached.updatedAt < RESERVES_CACHE_TTL_MS) {
              return cached
            }
            if (inflightRef.current.reserves.has(normalized) && cached) return cached
            inflightRef.current.reserves.add(normalized)
            try {
              const pairContract = new Contract(address, IUniswapV2PairABI, library)
              const reserves = await pairContract.getReserves()
              const stored = {
                reserve0: reserves.reserve0.toString(),
                reserve1: reserves.reserve1.toString(),
                updatedAt: Date.now()
              }
              cacheRef.current.reservesByPair.set(normalized, stored)
              return stored
            } catch (error) {
              console.debug('[pairs] getReserves failed', { address, error })
              return undefined
            } finally {
              inflightRef.current.reserves.delete(normalized)
            }
          }
        )
        console.debug('[pairs] reservesResults', { reservesResults })

        const nextResults = effectiveTokenAddressPairs.map<PairLookupResult>(([tokenA, tokenB], index) => {
          if (!tokenA || !tokenB || tokenA.toLowerCase() === tokenB.toLowerCase()) return { loading: false }
          const reserves = reservesResults[index]
          if (!reserves) return { loading: false }
          return {
            loading: false,
            reserves: { reserve0: reserves.reserve0, reserve1: reserves.reserve1 }
          }
        })

        if (!stale) setResults(nextResults)
      } catch (error) {
        console.debug('Failed to fetch pair reserves via router', error)
        if (!stale) setResults(effectiveTokenAddressPairs.map(() => ({ loading: false, error: true })))
      }
    }

    debounceTimer = setTimeout(() => {
      fetchPairs().catch(error => console.debug('Failed to load pairs', error))
    }, REQUEST_DEBOUNCE_MS)

    return () => {
      stale = true
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [chainId, library, tokenAddressKey, effectiveTokenAddressPairs])

  return useMemo(() => {
    return results.map((result, i) => {
      const { reserves, loading } = result
      const tokenA = tokens[i][0]
      const tokenB = tokens[i][1]

      if (loading) return [PairState.LOADING, null]
      if (!tokenA || !tokenB || tokenA.equals(tokenB)) return [PairState.INVALID, null]
      if (!reserves) return [PairState.NOT_EXISTS, null]
      const { reserve0, reserve1 } = reserves
      const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
      return [
        PairState.EXISTS,
        new Pair(new TokenAmount(token0, reserve0), new TokenAmount(token1, reserve1))
      ]
    })
  }, [results, tokens])
}

export function usePair(tokenA?: Currency, tokenB?: Currency): [PairState, Pair | null] {
  return usePairs([[tokenA, tokenB]])[0]
}
