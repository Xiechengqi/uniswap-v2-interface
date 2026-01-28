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
import { TokenList } from '@uniswap/token-lists'

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

  // private chain token list (local list)
  useEffect(() => {
    let stale = false
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
      const requestId = `private-list-${Date.now()}`
      dispatch(fetchTokenList.fulfilled({ url: PRIVATE_CHAIN_LIST_URL, tokenList: nextList, requestId }))
      if (current) {
        const upgradeType = getVersionUpgrade(current.version, nextList.version)
        if (upgradeType !== VersionUpgrade.NONE) {
          dispatch(acceptListUpdate(PRIVATE_CHAIN_LIST_URL))
        }
      }
    }

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
