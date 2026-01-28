import useParsedQueryString from './useParsedQueryString'
import { useActiveWeb3React } from './index'
import { getPrivateChainId, isPrivateChain } from '../utils/switchNetwork'

export enum Version {
  v1 = 'v1',
  v2 = 'v2'
}

export const DEFAULT_VERSION: Version = Version.v2

export default function useToggledVersion(): Version {
  const { chainId } = useActiveWeb3React()
  const isPrivate = isPrivateChain(chainId ?? getPrivateChainId())
  if (isPrivate) return Version.v2
  const { use } = useParsedQueryString()
  if (!use || typeof use !== 'string') return Version.v2
  if (use.toLowerCase() === 'v1') return Version.v1
  return DEFAULT_VERSION
}
