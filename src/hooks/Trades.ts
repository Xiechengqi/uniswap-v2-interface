import { Currency, CurrencyAmount, Pair, Token, Trade, ETHER } from '@im33357/uniswap-v2-sdk'
import flatMap from 'lodash.flatmap'
import { useMemo, useRef } from 'react'

import { BASES_TO_CHECK_TRADES_AGAINST, CUSTOM_BASES } from '../constants'
import { PairState, usePairs } from '../data/Reserves'
import { wrappedCurrency } from '../utils/wrappedCurrency'

import { useActiveWeb3React } from './index'

function useAllCommonPairs(currencyA?: Currency, currencyB?: Currency): Pair[] {
  const { chainId } = useActiveWeb3React()

  const bases: Token[] = chainId ? BASES_TO_CHECK_TRADES_AGAINST[chainId] ?? [] : []

  const [tokenA, tokenB] = chainId
    ? [wrappedCurrency(currencyA, chainId), wrappedCurrency(currencyB, chainId)]
    : [undefined, undefined]

  if (!bases.length && chainId) {
    const weth = wrappedCurrency(ETHER, chainId)
    if (weth) {
      bases.push(weth)
    }
  }

  const basePairs: [Token, Token][] = useMemo(
    () =>
      flatMap(bases, (base): [Token, Token][] => bases.map(otherBase => [base, otherBase])).filter(
        ([t0, t1]) => t0.address !== t1.address
      ),
    [bases]
  )

  const allPairCombinations: [Token, Token][] = useMemo(
    () =>
      tokenA && tokenB
        ? [
            // the direct pair
            [tokenA, tokenB],
            // token A against all bases
            ...bases.map((base): [Token, Token] => [tokenA, base]),
            // token B against all bases
            ...bases.map((base): [Token, Token] => [tokenB, base]),
            // each base against all bases
            ...basePairs
          ]
            .filter((tokens): tokens is [Token, Token] => Boolean(tokens[0] && tokens[1]))
            .filter(([t0, t1]) => t0.address !== t1.address)
            .filter(([tokenA, tokenB]) => {
              if (!chainId) return true
              const customBases = CUSTOM_BASES[chainId]
              if (!customBases) return true

              const customBasesA: Token[] | undefined = customBases[tokenA.address]
              const customBasesB: Token[] | undefined = customBases[tokenB.address]

              if (!customBasesA && !customBasesB) return true

              if (customBasesA && !customBasesA.find(base => tokenB.equals(base))) return false
              if (customBasesB && !customBasesB.find(base => tokenA.equals(base))) return false

              return true
            })
        : [],
    [tokenA, tokenB, bases, basePairs, chainId]
  )

  const allPairs = usePairs(allPairCombinations)

  // only pass along valid pairs, non-duplicated pairs
  const lastLogRef = useRef(0)

  return useMemo(() => {
    const states = allPairs.map(([state, pair]) => ({
      state,
      pairAddress: pair?.liquidityToken?.address ?? null,
      token0: pair?.token0?.address ?? null,
      token1: pair?.token1?.address ?? null
    }))
    const now = Date.now()
    if (now - lastLogRef.current > 2000) {
      lastLogRef.current = now
      console.debug('[trade] pairs summary', {
        chainId,
        tokenA: tokenA?.address ?? null,
        tokenB: tokenB?.address ?? null,
        bases: bases.map(base => base.address),
        combinations: allPairCombinations.map(([a, b]) => [a.address, b.address]),
        states
      })
    }

    return Object.values(
      allPairs
        // filter out invalid pairs
        .filter((result): result is [PairState.EXISTS, Pair] => Boolean(result[0] === PairState.EXISTS && result[1]))
        // filter out duplicated pairs
        .reduce<{ [pairAddress: string]: Pair }>((memo, [, curr]) => {
          memo[curr.liquidityToken.address] = memo[curr.liquidityToken.address] ?? curr
          return memo
        }, {})
    )
  }, [allPairs, allPairCombinations, bases, chainId, tokenA, tokenB])
}

/**
 * Returns the best trade for the exact amount of tokens in to the given token out
 */
export function useTradeExactIn(currencyAmountIn?: CurrencyAmount, currencyOut?: Currency): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyAmountIn?.currency, currencyOut)
  return useMemo(() => {
    if (currencyAmountIn && currencyOut && allowedPairs.length > 0) {
      try {
        return (
          Trade.bestTradeExactIn(allowedPairs, currencyAmountIn, currencyOut, { maxHops: 3, maxNumResults: 1 })[0] ??
          null
        )
      } catch (error) {
        console.debug('[trade] exact in failed', {
          error,
          input: currencyAmountIn?.currency?.symbol,
          output: currencyOut?.symbol,
          pairs: allowedPairs.map(pair => ({
            token0: pair.token0?.address,
            token1: pair.token1?.address,
            token0Decimals: pair.token0?.decimals,
            token1Decimals: pair.token1?.decimals
          }))
        })
        return null
      }
    }
    return null
  }, [allowedPairs, currencyAmountIn, currencyOut])
}

/**
 * Returns the best trade for the token in to the exact amount of token out
 */
export function useTradeExactOut(currencyIn?: Currency, currencyAmountOut?: CurrencyAmount): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyIn, currencyAmountOut?.currency)

  return useMemo(() => {
    if (currencyIn && currencyAmountOut && allowedPairs.length > 0) {
      try {
        return (
          Trade.bestTradeExactOut(allowedPairs, currencyIn, currencyAmountOut, { maxHops: 3, maxNumResults: 1 })[0] ??
          null
        )
      } catch (error) {
        console.debug('[trade] exact out failed', {
          error,
          input: currencyIn?.symbol,
          output: currencyAmountOut?.currency?.symbol,
          pairs: allowedPairs.map(pair => ({
            token0: pair.token0?.address,
            token1: pair.token1?.address,
            token0Decimals: pair.token0?.decimals,
            token1Decimals: pair.token1?.decimals
          }))
        })
        return null
      }
    }
    return null
  }, [allowedPairs, currencyIn, currencyAmountOut])
}
