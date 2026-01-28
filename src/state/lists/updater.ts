import { getVersionUpgrade, minVersionBump, VersionUpgrade } from '@uniswap/token-lists'
import { useCallback, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useActiveWeb3React } from '../../hooks'
import { useFetchListCallback } from '../../hooks/useFetchListCallback'
import useInterval from '../../hooks/useInterval'
import useIsWindowVisible from '../../hooks/useIsWindowVisible'
import { addPopup } from '../application/actions'
import { AppDispatch, AppState } from '../index'
import { acceptListUpdate, fetchTokenList, selectList } from './actions'
import { PRIVATE_CHAIN_LIST_URL } from '../../constants/lists'
import PRIVATE_CHAIN_TOKEN_LIST from '../../constants/tokenLists/privateChain'
import { Contract } from '@ethersproject/contracts'
import ERC20_ABI from '../../constants/abis/erc20.json'
import { getPrivateChainId, isPrivateChain } from '../../utils/switchNetwork'
import { TokenList, TokenInfo } from '@uniswap/token-lists'
import { getBlockscoutTokenListCacheKey, getBlockscoutUrl, getPairAddress } from '../../utils/appConfig'
import { isAddress } from '../../utils'

export default function Updater(): null {
  const { library, chainId } = useActiveWeb3React()
  const dispatch = useDispatch<AppDispatch>()
  const lists = useSelector<AppState, AppState['lists']['byUrl']>(state => state.lists.byUrl)
  const selectedListUrl = useSelector<AppState, AppState['lists']['selectedListUrl']>(state => state.lists.selectedListUrl)
  const privateChainId = getPrivateChainId()
  const isPrivate = isPrivateChain(chainId ?? privateChainId)

  const isWindowVisible = useIsWindowVisible()

  const fetchList = useFetchListCallback()

  // 自动选择私有链 token list (如果没有选择任何 list)
  useEffect(() => {
    if (!selectedListUrl && lists[PRIVATE_CHAIN_LIST_URL]?.current) {
      dispatch(selectList(PRIVATE_CHAIN_LIST_URL))
    }
  }, [dispatch, selectedListUrl, lists])

  const fetchAllListsCallback = useCallback(() => {
    if (!isWindowVisible) return
    Object.keys(lists).forEach(url => {
      if (url === PRIVATE_CHAIN_LIST_URL) return
      fetchList(url).catch(error => console.debug('interval list fetching error', error))
    })
  }, [fetchList, isWindowVisible, lists])

  // fetch all lists every 10 minutes, but only after we initialize library
  useInterval(fetchAllListsCallback, library ? 1000 * 60 * 10 : null)

  // whenever a list is not loaded and not loading, try again to load it
  useEffect(() => {
    Object.keys(lists).forEach(listUrl => {
      if (listUrl === PRIVATE_CHAIN_LIST_URL) return
      const list = lists[listUrl]

      if (!list.current && !list.loadingRequestId && !list.error) {
        fetchList(listUrl).catch(error => console.debug('list added fetching error', error))
      }
    })
  }, [dispatch, fetchList, library, lists])

  // automatically update lists if versions are minor/patch
  useEffect(() => {
    Object.keys(lists).forEach(listUrl => {
      const list = lists[listUrl]
      if (list.current && list.pendingUpdate) {
        const bump = getVersionUpgrade(list.current.version, list.pendingUpdate.version)
        switch (bump) {
          case VersionUpgrade.NONE:
            throw new Error('unexpected no version bump')
          case VersionUpgrade.PATCH:
          case VersionUpgrade.MINOR:
            const min = minVersionBump(list.current.tokens, list.pendingUpdate.tokens)
            // automatically update minor/patch as long as bump matches the min update
            if (bump >= min) {
              dispatch(acceptListUpdate(listUrl))
              dispatch(
                addPopup({
                  key: listUrl,
                  content: {
                    listUpdate: {
                      listUrl,
                      oldList: list.current,
                      newList: list.pendingUpdate,
                      auto: true
                    }
                  }
                })
              )
            } else {
              console.error(
                `List at url ${listUrl} could not automatically update because the version bump was only PATCH/MINOR while the update had breaking changes and should have been MAJOR`
              )
            }
            break

          case VersionUpgrade.MAJOR:
            dispatch(
              addPopup({
                key: listUrl,
                content: {
                  listUpdate: {
                    listUrl,
                    auto: false,
                    oldList: list.current,
                    newList: list.pendingUpdate
                  }
                },
                removeAfterMs: null
              })
            )
        }
      }
    })
  }, [dispatch, lists])

  // fetch blockscout token list for private chain
  useEffect(() => {
    // Always attempt Blockscout sync for the configured private chain
    let stale = false
    const configuredPairAddress = getPairAddress(privateChainId)
    if (configuredPairAddress) {
      if (!library) {
        return () => {
          stale = true
        }
      }
      const pairContract = new Contract(
        configuredPairAddress,
        ['function token0() view returns (address)', 'function token1() view returns (address)'],
        library
      )

      const buildPairList = async () => {
        try {
          const [token0, token1] = await Promise.all([pairContract.token0(), pairContract.token1()])
          const effectiveChainId = chainId ?? privateChainId
          const nextList: TokenList = {
            name: 'Private Chain Pair Tokens',
            timestamp: new Date().toISOString(),
            version: { major: 1, minor: 0, patch: 0 },
            tokens: [
              { chainId: effectiveChainId, address: token0, decimals: 18, symbol: 'TOKEN0', name: 'Token0' },
              { chainId: effectiveChainId, address: token1, decimals: 18, symbol: 'TOKEN1', name: 'Token1' }
            ]
          }
          if (stale) return
          const requestId = `pair-config-${Date.now()}`
          dispatch(fetchTokenList.fulfilled({ url: PRIVATE_CHAIN_LIST_URL, tokenList: nextList, requestId }))
          dispatch(acceptListUpdate(PRIVATE_CHAIN_LIST_URL))
        } catch (error) {
          console.debug('Failed to load pair tokens, falling back to base list', error)
          const current = lists[PRIVATE_CHAIN_LIST_URL]?.current
          const baseList = PRIVATE_CHAIN_TOKEN_LIST
          const currentMap = new Map((current?.tokens ?? []).map(token => [token.address.toLowerCase(), token]))
          const hasChanges =
            !current ||
            current.tokens.length !== baseList.tokens.length ||
            baseList.tokens.some(token => {
              const existing = currentMap.get(token.address.toLowerCase())
              return (
                !existing ||
                token.symbol !== existing.symbol ||
                token.name !== existing.name ||
                token.decimals !== existing.decimals
              )
            })

          if (hasChanges && !stale) {
            const nextList: TokenList = {
              ...baseList,
              timestamp: new Date().toISOString(),
              version: {
                ...baseList.version,
                patch: baseList.version.patch + 1
              }
            }
            const requestId = `pair-config-fallback-${Date.now()}`
            dispatch(fetchTokenList.fulfilled({ url: PRIVATE_CHAIN_LIST_URL, tokenList: nextList, requestId }))
            dispatch(acceptListUpdate(PRIVATE_CHAIN_LIST_URL))
          }
        }
      }

      buildPairList().catch(error => console.debug('Failed to update pair token list', error))

      return () => {
        stale = true
      }
    }
    const effectiveChainId = privateChainId
    const baseUrl = getBlockscoutUrl(effectiveChainId).replace(/\/$/, '')
    if (!baseUrl) return

    const cacheKey = getBlockscoutTokenListCacheKey(effectiveChainId)
    const CACHE_TTL_MS = 1000 * 60 * 60

    const readCache = () => {
      try {
        const raw = localStorage.getItem(cacheKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        if (Date.now() - parsed.updatedAt > CACHE_TTL_MS) return null
        return parsed as { tokens: TokenInfo[]; updatedAt: number }
      } catch (error) {
        console.debug('Failed to read blockscout cache', error)
        return null
      }
    }

    const writeCache = (tokens: TokenInfo[]) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ tokens, updatedAt: Date.now() }))
      } catch (error) {
        console.debug('Failed to write blockscout cache', error)
      }
    }

    const normalizeTokens = (payload: any): TokenInfo[] => {
      const items: any[] = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.result)
        ? payload.result
        : []

      return items
        .map(item => {
          const address = item.address || item.contractAddress
          const checked = address ? isAddress(address) : false
          if (!checked) return null
          const decimals = Number(item.decimals)
          return {
            chainId: effectiveChainId,
            address: checked,
            symbol: item.symbol || item.tokenSymbol || 'TOKEN',
            name: item.name || item.tokenName || 'Token',
            decimals: Number.isFinite(decimals) ? decimals : 18
          } as TokenInfo
        })
        .filter(Boolean) as TokenInfo[]
    }

    const fetchFromEndpoints = async (): Promise<TokenInfo[] | null> => {
      const endpoints = [
        `${baseUrl}/api/v2/tokens`,
        `${baseUrl}/api?module=token&action=tokenlist`,
        `${baseUrl}/api?module=token&action=tokenlist&limit=1000`
      ]

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint)
          if (!response.ok) continue
          const json = await response.json()
          const tokens = normalizeTokens(json)
          if (tokens.length > 0) return tokens
        } catch (error) {
          console.debug('Blockscout token list fetch failed', endpoint, error)
        }
      }
      return null
    }

    const updateList = async () => {
      const baseList = lists[PRIVATE_CHAIN_LIST_URL]?.current ?? PRIVATE_CHAIN_TOKEN_LIST
      const cached = readCache()
      const blockscoutTokens = cached?.tokens || (await fetchFromEndpoints())
      if (!blockscoutTokens) return

      if (!cached) writeCache(blockscoutTokens)

      if (stale) return

      const currentMap = new Map(
        baseList.tokens.map(token => [token.address.toLowerCase(), token])
      )
      const hasChanges =
        blockscoutTokens.length !== baseList.tokens.length ||
        blockscoutTokens.some(token => {
          const current = currentMap.get(token.address.toLowerCase())
          return (
            !current ||
            token.symbol !== current.symbol ||
            token.name !== current.name ||
            token.decimals !== current.decimals
          )
        })

      if (!hasChanges) return

      const nextList: TokenList = {
        ...baseList,
        tokens: blockscoutTokens,
        timestamp: new Date().toISOString(),
        version: {
          ...baseList.version,
          patch: baseList.version.patch + 1
        }
      }

      const requestId = `blockscout-${Date.now()}`
      dispatch(fetchTokenList.fulfilled({ url: PRIVATE_CHAIN_LIST_URL, tokenList: nextList, requestId }))
      dispatch(acceptListUpdate(PRIVATE_CHAIN_LIST_URL))
    }

    updateList().catch(error => console.debug('Failed to update blockscout token list', error))

    return () => {
      stale = true
    }
  }, [chainId, dispatch, library, lists, privateChainId])

  // refresh private-chain token metadata from ERC20
  useEffect(() => {
    if (!library || !isPrivate) return
    const privateList = lists[PRIVATE_CHAIN_LIST_URL]?.current
    if (!privateList || privateList.tokens.length === 0) return

    let stale = false

    const METADATA_TTL_MS = 1000 * 60 * 60 * 24
    const storageKey = (chain: number, address: string) => `tokenMeta:${chain}:${address.toLowerCase()}`

    const readCache = (chain: number, address: string) => {
      try {
        const raw = localStorage.getItem(storageKey(chain, address))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        if (Date.now() - parsed.updatedAt > METADATA_TTL_MS) return null
        return parsed
      } catch (error) {
        console.debug('Failed to read token metadata cache', error)
        return null
      }
    }

    const writeCache = (chain: number, address: string, value: { symbol: string; name: string; decimals: number }) => {
      try {
        localStorage.setItem(
          storageKey(chain, address),
          JSON.stringify({ ...value, updatedAt: Date.now() })
        )
      } catch (error) {
        console.debug('Failed to write token metadata cache', error)
      }
    }

    const sanitizeText = (value: string, fallback: string) => {
      const trimmed = value?.trim()
      if (!trimmed) return fallback
      return trimmed.length > 32 ? trimmed.slice(0, 32) : trimmed
    }

    const fetchMetadata = async (tokenAddress: string, chain: number) => {
      const cached = readCache(chain, tokenAddress)
      if (cached) return cached

      const contract = new Contract(tokenAddress, ERC20_ABI, library)
      const [symbol, name, decimals] = await Promise.all([
        contract.symbol().catch(() => ''),
        contract.name().catch(() => ''),
        contract.decimals().catch(() => 18)
      ])

      const normalized = {
        symbol: sanitizeText(String(symbol), 'TOKEN'),
        name: sanitizeText(String(name), 'Token'),
        decimals: Number(decimals)
      }

      writeCache(chain, tokenAddress, normalized)
      return { ...normalized, updatedAt: Date.now() }
    }

    const updateList = async () => {
      const effectiveChainId = chainId ?? getPrivateChainId()
      const updatedTokens = await Promise.all(
        privateList.tokens.map(async token => {
          const meta = await fetchMetadata(token.address, effectiveChainId)
          return {
            ...token,
            symbol: meta.symbol,
            name: meta.name,
            decimals: meta.decimals
          }
        })
      )

      if (stale) return

      const hasChanges = updatedTokens.some((token, index) => {
        const current = privateList.tokens[index]
        return (
          token.symbol !== current.symbol ||
          token.name !== current.name ||
          token.decimals !== current.decimals
        )
      })

      if (!hasChanges) return

      const nextList: TokenList = {
        ...privateList,
        tokens: updatedTokens,
        version: {
          ...privateList.version,
          patch: privateList.version.patch + 1
        }
      }

      const requestId = `private-meta-${Date.now()}`
      dispatch(fetchTokenList.fulfilled({ url: PRIVATE_CHAIN_LIST_URL, tokenList: nextList, requestId }))
      dispatch(acceptListUpdate(PRIVATE_CHAIN_LIST_URL))
    }

    updateList().catch(error => console.debug('Failed to refresh private token metadata', error))

    return () => {
      stale = true
    }
  }, [chainId, dispatch, isPrivate, library, lists])

  return null
}
