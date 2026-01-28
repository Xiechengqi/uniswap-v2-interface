import { TokenAmount, Pair, Currency } from '@im33357/uniswap-v2-sdk'
import { AddressZero } from '@ethersproject/constants'
import { Contract } from '@ethersproject/contracts'
import { useEffect, useMemo, useState } from 'react'
import { abi as IUniswapV2PairABI } from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import { useActiveWeb3React } from '../hooks'

import { wrappedCurrency } from '../utils/wrappedCurrency'
import { getRouterAddress } from '../utils/appConfig'

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

  const [results, setResults] = useState<PairLookupResult[]>([])

  useEffect(() => {
    let stale = false

    const fetchPairs = async () => {
      if (!library || tokens.length === 0) {
        if (!stale) setResults(tokens.map(() => ({ loading: false })))
        return
      }

      const initial = tokens.map<PairLookupResult>(() => ({ loading: true }))
      if (!stale) setResults(initial)

      const routerAddress = getRouterAddress(chainId ?? undefined)

      const pairAddresses = tokens.map(() => undefined as string | undefined)

      try {
        if (!routerAddress) {
          if (!stale) setResults(tokens.map(() => ({ loading: false })))
          return
        }

        const routerContract = new Contract(routerAddress, ROUTER_FACTORY_ABI, library)
        const factoryAddress = await routerContract.factory()
        if (!factoryAddress || factoryAddress === AddressZero) {
          if (!stale) setResults(tokens.map(() => ({ loading: false })))
          return
        }

        const factoryContract = new Contract(factoryAddress, FACTORY_GET_PAIR_ABI, library)
        const pairLookups = await Promise.all(
          tokens.map(([tokenA, tokenB]) => {
            if (!tokenA || !tokenB || tokenA.equals(tokenB)) return Promise.resolve(undefined)
            return factoryContract.getPair(tokenA.address, tokenB.address)
          })
        )

        pairLookups.forEach((address, index) => {
          if (typeof address === 'string' && address !== AddressZero) {
            pairAddresses[index] = address
          }
        })

        const reservesResults = await Promise.all(
          pairAddresses.map(address => {
            if (!address) return Promise.resolve(undefined)
            const pairContract = new Contract(address, IUniswapV2PairABI, library)
            return pairContract.getReserves()
          })
        )

        const nextResults = tokens.map<PairLookupResult>(([tokenA, tokenB], index) => {
          if (!tokenA || !tokenB || tokenA.equals(tokenB)) return { loading: false }
          const reserves = reservesResults[index]
          if (!reserves) return { loading: false }
          return {
            loading: false,
            reserves: { reserve0: reserves.reserve0.toString(), reserve1: reserves.reserve1.toString() }
          }
        })

        if (!stale) setResults(nextResults)
      } catch (error) {
        console.debug('Failed to fetch pair reserves via router', error)
        if (!stale) setResults(tokens.map(() => ({ loading: false, error: true })))
      }
    }

    fetchPairs().catch(error => console.debug('Failed to load pairs', error))

    return () => {
      stale = true
    }
  }, [chainId, library, tokens])

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
