import useENS from '../../hooks/useENS'
import { Version } from '../../hooks/useToggledVersion'
import { parseUnits } from '@ethersproject/units'
import { Currency, CurrencyAmount, ETHER, JSBI, Token, TokenAmount, Trade, Route, TradeType } from '@im33357/uniswap-v2-sdk'
import { ParsedQs } from 'qs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useV1Trade } from '../../data/V1'
import { useActiveWeb3React } from '../../hooks'
import { getTokenAddress } from '../../utils/appConfig'
import { useCurrency } from '../../hooks/Tokens'
import { useTradeExactIn, useTradeExactOut } from '../../hooks/Trades'
import { usePair } from '../../data/Reserves'
import useParsedQueryString from '../../hooks/useParsedQueryString'
import { isAddress } from '../../utils'
import { AppDispatch, AppState } from '../index'
import { useCurrencyBalances } from '../wallet/hooks'
import { Field, replaceSwapState, selectCurrency, setRecipient, switchCurrencies, typeInput } from './actions'
import { SwapState } from './reducer'
import useToggledVersion from '../../hooks/useToggledVersion'
import { useUserSlippageTolerance } from '../user/hooks'
import { computeSlippageAdjustedAmounts } from '../../utils/prices'
import { DeploymentInfo } from '@im33357/uniswap-v2-sdk'
import { Contract } from '@ethersproject/contracts'
import ERC20_ABI from '../../constants/abis/erc20.json'

export function useSwapState(): AppState['swap'] {
  return useSelector<AppState, AppState['swap']>(state => state.swap)
}

export function useSwapActionHandlers(): {
  onCurrencySelection: (field: Field, currency: Currency) => void
  onSwitchTokens: () => void
  onUserInput: (field: Field, typedValue: string) => void
  onChangeRecipient: (recipient: string | null) => void
} {
  const dispatch = useDispatch<AppDispatch>()
  const onCurrencySelection = useCallback(
    (field: Field, currency: Currency) => {
      dispatch(
        selectCurrency({
          field,
          currencyId: currency instanceof Token ? currency.address : currency === ETHER ? 'ETH' : ''
        })
      )
    },
    [dispatch]
  )

  const onSwitchTokens = useCallback(() => {
    dispatch(switchCurrencies())
  }, [dispatch])

  const onUserInput = useCallback(
    (field: Field, typedValue: string) => {
      dispatch(typeInput({ field, typedValue }))
    },
    [dispatch]
  )

  const onChangeRecipient = useCallback(
    (recipient: string | null) => {
      dispatch(setRecipient({ recipient }))
    },
    [dispatch]
  )

  return {
    onSwitchTokens,
    onCurrencySelection,
    onUserInput,
    onChangeRecipient
  }
}

// try to parse a user entered amount for a given token
export function tryParseAmount(value?: string, currency?: Currency): CurrencyAmount | undefined {
  if (!value || !currency) {
    return undefined
  }
  try {
    const typedValueParsed = parseUnits(value, currency.decimals).toString()
    if (typedValueParsed !== '0') {
      return currency instanceof Token
        ? new TokenAmount(currency, JSBI.BigInt(typedValueParsed))
        : CurrencyAmount.ether(JSBI.BigInt(typedValueParsed))
    }
  } catch (error) {
    // should fail if the user specifies too many decimal places of precision (or maybe exceed max uint?)
    console.debug(`Failed to parse input amount: "${value}"`, error)
  }
  // necessary for all paths to return a value
  return undefined
}

const BAD_RECIPIENT_ADDRESSES: string[] = [
  DeploymentInfo[4].factory.proxyAddress, // v2 factory
  '0xf164fC0Ec4E93095b804a4795bBe1e041497b92a', // v2 router 01
  DeploymentInfo[4].router.proxyAddress // v2 router 02
]

/**
 * Returns true if any of the pairs or tokens in a trade have the given checksummed address
 * @param trade to check for the given address
 * @param checksummedAddress address to check in the pairs and tokens
 */
function involvesAddress(trade: Trade, checksummedAddress: string): boolean {
  return (
    trade.route.path.some(token => token.address === checksummedAddress) ||
    trade.route.pairs.some(pair => pair.liquidityToken.address === checksummedAddress)
  )
}

// from the current swap inputs, compute the best trade and return it.
export function useDerivedSwapInfo(): {
  currencies: { [field in Field]?: Currency }
  currencyBalances: { [field in Field]?: CurrencyAmount }
  parsedAmount: CurrencyAmount | undefined
  v2Trade: Trade | undefined
  inputError?: string
  v1Trade: Trade | undefined
} {
  const { account, library, chainId } = useActiveWeb3React()

  const toggledVersion = useToggledVersion()

  const {
    independentField,
    typedValue,
    [Field.INPUT]: { currencyId: inputCurrencyId },
    [Field.OUTPUT]: { currencyId: outputCurrencyId },
    recipient
  } = useSwapState()

  const lockedTokenAddress = getTokenAddress()
  const normalizedLocked = lockedTokenAddress ? lockedTokenAddress.toLowerCase() : ''
  const normalizedInput = (inputCurrencyId ?? '').toLowerCase()
  const normalizedOutput = (outputCurrencyId ?? '').toLowerCase()
  const hasLockedPair =
    normalizedLocked &&
    ((normalizedInput === 'eth' && normalizedOutput === normalizedLocked) ||
      (normalizedInput === normalizedLocked && normalizedOutput === 'eth'))

  const effectiveInputCurrencyId =
    normalizedLocked && !hasLockedPair ? 'ETH' : inputCurrencyId
  const effectiveOutputCurrencyId =
    normalizedLocked && !hasLockedPair ? lockedTokenAddress : outputCurrencyId

  const [lockedTokenMeta, setLockedTokenMeta] = useState<{ symbol: string; name: string; decimals: number } | null>(null)

  useEffect(() => {
    let stale = false
    const loadMeta = async () => {
      if (!lockedTokenAddress || !chainId || !library) return
      try {
        const contract = new Contract(lockedTokenAddress, ERC20_ABI, library)
        const [symbol, name, decimals] = await Promise.all([
          contract.symbol().catch(() => 'TOKEN'),
          contract.name().catch(() => 'Token'),
          contract.decimals().catch(() => 18)
        ])
        if (!stale) {
          setLockedTokenMeta({
            symbol: String(symbol) || 'TOKEN',
            name: String(name) || 'Token',
            decimals: Number(decimals) || 18
          })
        }
      } catch {
        if (!stale) {
          setLockedTokenMeta({
            symbol: 'TOKEN',
            name: 'Token',
            decimals: 18
          })
        }
      }
    }
    loadMeta()
    return () => {
      stale = true
    }
  }, [chainId, library, lockedTokenAddress])

  const lockedToken = useMemo(() => {
    if (!lockedTokenAddress || !chainId) return undefined
    const meta = lockedTokenMeta ?? { symbol: 'TOKEN', name: 'Token', decimals: 18 }
    return new Token(chainId, lockedTokenAddress, meta.decimals, meta.symbol, meta.name)
  }, [chainId, lockedTokenAddress, lockedTokenMeta])

  const defaultInputCurrency = useCurrency(effectiveInputCurrencyId)
  const defaultOutputCurrency = useCurrency(effectiveOutputCurrencyId)

  const inputCurrency = lockedToken
    ? normalizedInput === lockedToken.address.toLowerCase()
      ? lockedToken
      : ETHER
    : defaultInputCurrency
  const outputCurrency = lockedToken
    ? normalizedOutput === lockedToken.address.toLowerCase()
      ? lockedToken
      : ETHER
    : defaultOutputCurrency

  useEffect(() => {
    console.debug('[swap] currency state', {
      chainId,
      lockedTokenAddress,
      lockedTokenMeta,
      hasLockedPair,
      inputCurrencyId,
      outputCurrencyId,
      effectiveInputCurrencyId,
      effectiveOutputCurrencyId,
      defaultInputCurrency: defaultInputCurrency?.symbol,
      defaultOutputCurrency: defaultOutputCurrency?.symbol,
      lockedToken: lockedToken?.symbol,
      inputCurrency: inputCurrency?.symbol,
      outputCurrency: outputCurrency?.symbol,
      inputType: inputCurrency instanceof Token ? 'Token' : inputCurrency === ETHER ? 'ETH' : 'Unknown',
      outputType: outputCurrency instanceof Token ? 'Token' : outputCurrency === ETHER ? 'ETH' : 'Unknown'
    })
  }, [
    chainId,
    defaultInputCurrency,
    defaultOutputCurrency,
    effectiveInputCurrencyId,
    effectiveOutputCurrencyId,
    hasLockedPair,
    inputCurrency,
    inputCurrencyId,
    lockedTokenAddress,
    lockedTokenMeta,
    lockedToken,
    outputCurrency,
    outputCurrencyId
  ])
  const recipientLookup = useENS(recipient ?? undefined)
  const to: string | null = (recipient === null ? account : recipientLookup.address) ?? null

  const relevantTokenBalances = useCurrencyBalances(account ?? undefined, [
    inputCurrency ?? undefined,
    outputCurrency ?? undefined
  ])

  const isExactIn: boolean = independentField === Field.INPUT
  const parsedAmount = tryParseAmount(typedValue, (isExactIn ? inputCurrency : outputCurrency) ?? undefined)

  const [directPairState, directPair] = usePair(inputCurrency ?? undefined, outputCurrency ?? undefined)

  const directTrade = useMemo(() => {
    if (!directPair || !parsedAmount || !inputCurrency || !outputCurrency) return undefined
    try {
      const route = new Route([directPair], inputCurrency, outputCurrency)
      return new Trade(route, parsedAmount, isExactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT)
    } catch (error) {
      console.debug('[swap] direct trade failed', {
        error,
        directPairState,
        inputSymbol: inputCurrency?.symbol,
        outputSymbol: outputCurrency?.symbol
      })
      return undefined
    }
  }, [directPair, directPairState, inputCurrency, outputCurrency, isExactIn, parsedAmount])

  const bestTradeExactIn = useTradeExactIn(isExactIn ? parsedAmount : undefined, outputCurrency ?? undefined)
  const bestTradeExactOut = useTradeExactOut(inputCurrency ?? undefined, !isExactIn ? parsedAmount : undefined)

  const v2Trade = directTrade ?? (isExactIn ? bestTradeExactIn : bestTradeExactOut)

  const currencyBalances = {
    [Field.INPUT]: relevantTokenBalances[0],
    [Field.OUTPUT]: relevantTokenBalances[1]
  }

  const currencies: { [field in Field]?: Currency } = {
    [Field.INPUT]: inputCurrency ?? undefined,
    [Field.OUTPUT]: outputCurrency ?? undefined
  }

  // get link to trade on v1, if a better rate exists
  const v1Trade = useV1Trade(isExactIn, currencies[Field.INPUT], currencies[Field.OUTPUT], parsedAmount)

  let inputError: string | undefined
  if (!account) {
    inputError = 'Connect Wallet'
  }

  if (!parsedAmount) {
    inputError = inputError ?? 'Enter an amount'
  }

  if (!currencies[Field.INPUT] || !currencies[Field.OUTPUT]) {
    inputError = inputError ?? 'Select a token'
  }

  const formattedTo = isAddress(to)
  if (!to || !formattedTo) {
    inputError = inputError ?? 'Enter a recipient'
  } else {
    if (
      BAD_RECIPIENT_ADDRESSES.indexOf(formattedTo) !== -1 ||
      (bestTradeExactIn && involvesAddress(bestTradeExactIn, formattedTo)) ||
      (bestTradeExactOut && involvesAddress(bestTradeExactOut, formattedTo))
    ) {
      inputError = inputError ?? 'Invalid recipient'
    }
  }

  const [allowedSlippage] = useUserSlippageTolerance()

  const slippageAdjustedAmounts = v2Trade && allowedSlippage && computeSlippageAdjustedAmounts(v2Trade, allowedSlippage)

  const slippageAdjustedAmountsV1 =
    v1Trade && allowedSlippage && computeSlippageAdjustedAmounts(v1Trade, allowedSlippage)

  // compare input balance to max input based on version
  const [balanceIn, amountIn] = [
    currencyBalances[Field.INPUT],
    toggledVersion === Version.v1
      ? slippageAdjustedAmountsV1
        ? slippageAdjustedAmountsV1[Field.INPUT]
        : null
      : slippageAdjustedAmounts
      ? slippageAdjustedAmounts[Field.INPUT]
      : null
  ]

  if (balanceIn && amountIn && balanceIn.lessThan(amountIn)) {
    inputError = 'Insufficient ' + amountIn.currency.symbol + ' balance'
  }

  useEffect(() => {
    console.debug('[swap] trade state', {
      isExactIn,
      typedValue,
      parsedAmount: parsedAmount?.toExact?.() ?? null,
      inputSymbol: inputCurrency?.symbol,
      outputSymbol: outputCurrency?.symbol,
      directPairState,
      hasDirectTrade: Boolean(directTrade),
      v2Trade: Boolean(v2Trade),
      v2Route: v2Trade?.route?.path?.map(t => t.symbol),
      inputError
    })
  }, [isExactIn, typedValue, parsedAmount, inputCurrency, outputCurrency, v2Trade, inputError, directPairState, directTrade])

  return {
    currencies,
    currencyBalances,
    parsedAmount,
    v2Trade: v2Trade ?? undefined,
    inputError,
    v1Trade
  }
}

function parseCurrencyFromURLParameter(urlParam: any): string {
  if (typeof urlParam === 'string') {
    const valid = isAddress(urlParam)
    if (valid) return valid
    if (urlParam.toUpperCase() === 'ETH') return 'ETH'
    if (valid === false) return 'ETH'
  }
  return 'ETH' ?? ''
}

function parseTokenAmountURLParameter(urlParam: any): string {
  return typeof urlParam === 'string' && !isNaN(parseFloat(urlParam)) ? urlParam : ''
}

function parseIndependentFieldURLParameter(urlParam: any): Field {
  return typeof urlParam === 'string' && urlParam.toLowerCase() === 'output' ? Field.OUTPUT : Field.INPUT
}

const ENS_NAME_REGEX = /^[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)?$/
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
function validatedRecipient(recipient: any): string | null {
  if (typeof recipient !== 'string') return null
  const address = isAddress(recipient)
  if (address) return address
  if (ENS_NAME_REGEX.test(recipient)) return recipient
  if (ADDRESS_REGEX.test(recipient)) return recipient
  return null
}

export function queryParametersToSwapState(parsedQs: ParsedQs): SwapState {
  let inputCurrency = parseCurrencyFromURLParameter(parsedQs.inputCurrency)
  let outputCurrency = parseCurrencyFromURLParameter(parsedQs.outputCurrency)
  if (inputCurrency === outputCurrency) {
    if (typeof parsedQs.outputCurrency === 'string') {
      inputCurrency = ''
    } else {
      outputCurrency = ''
    }
  }

  const recipient = validatedRecipient(parsedQs.recipient)

  return {
    [Field.INPUT]: {
      currencyId: inputCurrency
    },
    [Field.OUTPUT]: {
      currencyId: outputCurrency
    },
    typedValue: parseTokenAmountURLParameter(parsedQs.exactAmount),
    independentField: parseIndependentFieldURLParameter(parsedQs.exactField),
    recipient
  }
}

// updates the swap state to use the defaults for a given network
export function useDefaultsFromURLSearch():
  | { inputCurrencyId: string | undefined; outputCurrencyId: string | undefined }
  | undefined {
  const { chainId } = useActiveWeb3React()
  const dispatch = useDispatch<AppDispatch>()
  const parsedQs = useParsedQueryString()
  const [result, setResult] = useState<
    { inputCurrencyId: string | undefined; outputCurrencyId: string | undefined } | undefined
  >()

  useEffect(() => {
    if (!chainId) return
    const lockedTokenAddress = getTokenAddress()
    if (lockedTokenAddress) {
      console.debug('[swap] defaults lock', {
        chainId,
        inputCurrencyId: 'ETH',
        outputCurrencyId: lockedTokenAddress
      })
      dispatch(
        replaceSwapState({
          typedValue: '',
          field: Field.INPUT,
          inputCurrencyId: 'ETH',
          outputCurrencyId: lockedTokenAddress,
          recipient: null
        })
      )
      setResult({ inputCurrencyId: 'ETH', outputCurrencyId: lockedTokenAddress })
      return
    }
    const parsed = queryParametersToSwapState(parsedQs)
    console.debug('[swap] defaults from url', {
      chainId,
      inputCurrencyId: parsed[Field.INPUT].currencyId,
      outputCurrencyId: parsed[Field.OUTPUT].currencyId
    })

    dispatch(
      replaceSwapState({
        typedValue: parsed.typedValue,
        field: parsed.independentField,
        inputCurrencyId: parsed[Field.INPUT].currencyId,
        outputCurrencyId: parsed[Field.OUTPUT].currencyId,
        recipient: parsed.recipient
      })
    )

    setResult({ inputCurrencyId: parsed[Field.INPUT].currencyId, outputCurrencyId: parsed[Field.OUTPUT].currencyId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, chainId])

  return result
}
