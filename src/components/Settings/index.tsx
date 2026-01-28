import React, { useRef, useContext, useMemo, useState, useEffect } from 'react'
import { Settings, X } from 'react-feather'
import styled from 'styled-components'
import { useOnClickOutside } from '../../hooks/useOnClickOutside'
import {
  useUserSlippageTolerance,
  useExpertModeManager,
  useUserDeadline,
  useDarkModeManager
} from '../../state/user/hooks'
import TransactionSettings from '../TransactionSettings'
import { RowFixed, RowBetween } from '../Row'
import { TYPE } from '../../theme'
import QuestionHelper from '../QuestionHelper'
import Toggle from '../Toggle'
import { ThemeContext } from 'styled-components'
import { AutoColumn } from '../Column'
import { ButtonError, ButtonPrimary } from '../Button'
import { useSettingsMenuOpen, useToggleSettingsMenu } from '../../state/application/hooks'
import { Text } from 'rebass'
import Modal from '../Modal'
import {
  clearConfigFromStorage,
  getChainId,
  getConfigFromStorage,
  getEnvRpcUrl,
  getEnvRouterAddress,
  getEnvTokenAddress,
  getEnvWethAddress,
  getRpcUrl,
  getRouterAddress,
  getTokenAddress,
  getWethAddress,
  saveConfigToStorage
} from '../../utils/appConfig'
import { isAddress } from '../../utils'
import { JsonRpcProvider } from '@ethersproject/providers'
import { Contract } from '@ethersproject/contracts'

const StyledMenuIcon = styled(Settings)`
  height: 20px;
  width: 20px;

  > * {
    stroke: ${({ theme }) => theme.text1};
  }
`

const StyledCloseIcon = styled(X)`
  height: 20px;
  width: 20px;
  :hover {
    cursor: pointer;
  }

  > * {
    stroke: ${({ theme }) => theme.text1};
  }
`

const StyledMenuButton = styled.button`
  position: relative;
  width: 100%;
  height: 100%;
  border: none;
  background-color: transparent;
  margin: 0;
  padding: 0;
  height: 35px;
  background-color: ${({ theme }) => theme.bg3};

  padding: 0.15rem 0.5rem;
  border-radius: 0.5rem;

  :hover,
  :focus {
    cursor: pointer;
    outline: none;
    background-color: ${({ theme }) => theme.bg4};
  }

  svg {
    margin-top: 2px;
  }
`
const EmojiWrapper = styled.div`
  position: absolute;
  bottom: -6px;
  right: 0px;
  font-size: 14px;
`

const StyledMenu = styled.div`
  margin-left: 0.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  border: none;
  text-align: left;
`

const MenuFlyout = styled.span`
  min-width: 20.125rem;
  background-color: ${({ theme }) => theme.bg1};
  box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.01), 0px 4px 8px rgba(0, 0, 0, 0.04), 0px 16px 24px rgba(0, 0, 0, 0.04),
    0px 24px 32px rgba(0, 0, 0, 0.01);

  border: 1px solid ${({ theme }) => theme.bg3};

  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  font-size: 1rem;
  position: absolute;
  top: 3rem;
  right: 0rem;
  z-index: 100;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    min-width: 18.125rem;
    right: -46px;
  `};
`

const Break = styled.div`
  width: 100%;
  height: 1px;
  background-color: ${({ theme }) => theme.bg3};
`

const ModalContentWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 20px;
`

const ConfigInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.bg3};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text1};

  :focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary1};
  }
`

const ConfigRow = styled(AutoColumn)`
  gap: 8px;
`

const ConfigActions = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`

export default function SettingsTab() {
  const node = useRef<HTMLDivElement>()
  const open = useSettingsMenuOpen()
  const toggle = useToggleSettingsMenu()

  const theme = useContext(ThemeContext)
  const [userSlippageTolerance, setUserslippageTolerance] = useUserSlippageTolerance()

  const [deadline, setDeadline] = useUserDeadline()

  const [expertMode, toggleExpertMode] = useExpertModeManager()

  const [darkMode, toggleDarkMode] = useDarkModeManager()

  const chainId = getChainId()
  const storedConfig = useMemo(() => getConfigFromStorage(chainId), [chainId])
  const [rpcUrl, setRpcUrl] = useState<string>(storedConfig?.rpcUrl || getRpcUrl(chainId))
  const [routerAddress, setRouterAddress] = useState<string>(
    storedConfig?.routerAddress || getRouterAddress(chainId)
  )
  const [tokenAddress, setTokenAddress] = useState<string>(
    storedConfig?.tokenAddress || getTokenAddress(chainId)
  )
  const [wethAddress, setWethAddress] = useState<string>(
    storedConfig?.wethAddress || getWethAddress(chainId)
  )
  const [tokenRequired, setTokenRequired] = useState<boolean>(
    storedConfig?.tokenRequired ?? Boolean(storedConfig?.tokenAddress || getEnvTokenAddress())
  )
  const [configError, setConfigError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [pairAddressDisplay, setPairAddressDisplay] = useState<string>('')

  // show confirmation view before turning on
  const [showConfirmation, setShowConfirmation] = useState(false)

  useOnClickOutside(node, open ? toggle : undefined)

  const validateConfig = () => {
    if (!rpcUrl) return 'RPC URL is required.'
    try {
      // eslint-disable-next-line no-new
      new URL(rpcUrl)
    } catch {
      return 'RPC URL is invalid.'
    }
    if (!routerAddress || !isAddress(routerAddress)) return 'Router address is invalid.'
    if (tokenRequired && !tokenAddress) return 'Token address is required.'
    if (tokenAddress && !isAddress(tokenAddress)) return 'Token address is invalid.'
    if (wethAddress && !isAddress(wethAddress)) return 'WETH address is invalid.'
    return null
  }

  const handleSaveConfig = () => {
    const error = validateConfig()
    setConfigError(error)
    if (error) return
    saveConfigToStorage(chainId, {
      rpcUrl,
      routerAddress,
      tokenAddress,
      wethAddress,
      tokenRequired
    })
    setSaveMessage('Saved. Refreshing...')
    setTimeout(() => window.location.reload(), 300)
  }

  const handleTestConnection = async () => {
    const error = validateConfig()
    setConfigError(error)
    if (error) return

    setIsTesting(true)
    setTestMessage(null)
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
      })
      const json = await response.json()
      if (!json?.result) {
        setTestMessage('RPC test failed: no chainId returned.')
        setIsTesting(false)
        return
      }
      const rpcChainId = parseInt(String(json.result), 16)
      if (Number.isNaN(rpcChainId)) {
        setTestMessage('RPC test failed: invalid chainId.')
        setIsTesting(false)
        return
      }
      if (rpcChainId !== chainId) {
        setTestMessage(`ChainId mismatch: RPC=${rpcChainId}, expected=${chainId}.`)
        setIsTesting(false)
        return
      }

      const provider = new JsonRpcProvider(rpcUrl)
      const router = new Contract(routerAddress, ['function factory() view returns (address)'], provider)
      await router.factory()
      setTestMessage('Connection OK.')
    } catch (error) {
      setTestMessage('Connection failed.')
    } finally {
      setIsTesting(false)
    }
  }

  useEffect(() => {
    let stale = false
    const fetchPairAddress = async () => {
      if (!rpcUrl || !routerAddress || !tokenAddress) {
        if (!stale) setPairAddressDisplay('')
        return
      }
      try {
        const provider = new JsonRpcProvider(rpcUrl)
        const router = new Contract(routerAddress, ['function factory() view returns (address)'], provider)
        const factory = await router.factory()
        const weth = wethAddress
        if (!factory || !weth || !tokenAddress) {
          if (!stale) setPairAddressDisplay('')
          return
        }
        const factoryContract = new Contract(factory, ['function getPair(address,address) view returns (address)'], provider)
        const pair = await factoryContract.getPair(weth, tokenAddress)
        if (!stale) setPairAddressDisplay(String(pair))
      } catch (error) {
        if (!stale) setPairAddressDisplay('')
      }
    }

    fetchPairAddress().catch(() => {
      if (!stale) setPairAddressDisplay('')
    })

    return () => {
      stale = true
    }
  }, [rpcUrl, routerAddress, tokenAddress, wethAddress])

  const handleResetConfig = () => {
    clearConfigFromStorage(chainId)
    setRpcUrl(getEnvRpcUrl())
    setRouterAddress(getEnvRouterAddress())
    setTokenAddress(getEnvTokenAddress())
    setWethAddress(getEnvWethAddress())
    setTokenRequired(Boolean(getEnvTokenAddress()))
    setConfigError(null)
    setSaveMessage('Reset to defaults. Refreshing...')
    setTimeout(() => window.location.reload(), 300)
  }


  return (
    // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/30451
    <StyledMenu ref={node as any}>
      <Modal isOpen={showConfirmation} onDismiss={() => setShowConfirmation(false)} maxHeight={100}>
        <ModalContentWrapper>
          <AutoColumn gap="lg">
            <RowBetween style={{ padding: '0 2rem' }}>
              <div />
              <Text fontWeight={500} fontSize={20}>
                Are you sure?
              </Text>
              <StyledCloseIcon onClick={() => setShowConfirmation(false)} />
            </RowBetween>
            <Break />
            <AutoColumn gap="lg" style={{ padding: '0 2rem' }}>
              <Text fontWeight={500} fontSize={20}>
                Expert mode turns off the confirm transaction prompt and allows high slippage trades that often result
                in bad rates and lost funds.
              </Text>
              <Text fontWeight={600} fontSize={20}>
                ONLY USE THIS MODE IF YOU KNOW WHAT YOU ARE DOING.
              </Text>
              <ButtonError
                error={true}
                padding={'12px'}
                onClick={() => {
                  if (window.prompt(`Please type the word "confirm" to enable expert mode.`) === 'confirm') {
                    toggleExpertMode()
                    setShowConfirmation(false)
                  }
                }}
              >
                <Text fontSize={20} fontWeight={500} id="confirm-expert-mode">
                  Turn On Expert Mode
                </Text>
              </ButtonError>
            </AutoColumn>
          </AutoColumn>
        </ModalContentWrapper>
      </Modal>
      <StyledMenuButton onClick={toggle} id="open-settings-dialog-button">
        <StyledMenuIcon />
        {expertMode && (
          <EmojiWrapper>
            <span role="img" aria-label="wizard-icon">
              🧙
            </span>
          </EmojiWrapper>
        )}
      </StyledMenuButton>
      {open && (
        <MenuFlyout>
          <AutoColumn gap="md" style={{ padding: '1rem' }}>
            <Text fontWeight={600} fontSize={14}>
              Transaction Settings
            </Text>
            <TransactionSettings
              rawSlippage={userSlippageTolerance}
              setRawSlippage={setUserslippageTolerance}
              deadline={deadline}
              setDeadline={setDeadline}
            />
            <Text fontWeight={600} fontSize={14}>
              Interface Settings
            </Text>
            <RowBetween>
              <RowFixed>
                <TYPE.black fontWeight={400} fontSize={14} color={theme.text2}>
                  Toggle Expert Mode
                </TYPE.black>
                <QuestionHelper text="Bypasses confirmation modals and allows high slippage trades. Use at your own risk." />
              </RowFixed>
              <Toggle
                id="toggle-expert-mode-button"
                isActive={expertMode}
                toggle={
                  expertMode
                    ? () => {
                        toggleExpertMode()
                        setShowConfirmation(false)
                      }
                    : () => {
                        toggle()
                        setShowConfirmation(true)
                      }
                }
              />
            </RowBetween>
            <RowBetween>
              <RowFixed>
                <TYPE.black fontWeight={400} fontSize={14} color={theme.text2}>
                  Toggle Dark Mode
                </TYPE.black>
              </RowFixed>
              <Toggle isActive={darkMode} toggle={toggleDarkMode} />
            </RowBetween>
            <Text fontWeight={600} fontSize={14}>
              Private Chain Config
            </Text>
            <ConfigRow>
              <TYPE.black fontWeight={400} fontSize={12} color={theme.text2}>
                RPC URL
              </TYPE.black>
              <ConfigInput
                value={rpcUrl}
                onChange={event => {
                  setRpcUrl(event.target.value)
                  setConfigError(null)
                  setSaveMessage(null)
                  setTestMessage(null)
                }}
                placeholder="https://..."
              />
            </ConfigRow>
            <ConfigRow>
              <TYPE.black fontWeight={400} fontSize={12} color={theme.text2}>
                Router Address
              </TYPE.black>
              <ConfigInput
                value={routerAddress}
                onChange={event => {
                  setRouterAddress(event.target.value)
                  setConfigError(null)
                  setSaveMessage(null)
                  setTestMessage(null)
                }}
                placeholder="0x..."
              />
            </ConfigRow>
            <ConfigRow>
              <TYPE.black fontWeight={400} fontSize={12} color={theme.text2}>
                Token Address
              </TYPE.black>
              <ConfigInput
                value={tokenAddress}
                onChange={event => {
                  setTokenAddress(event.target.value)
                  setConfigError(null)
                  setSaveMessage(null)
                  setTestMessage(null)
                }}
                placeholder="0x..."
              />
            </ConfigRow>
            <ConfigRow>
              <TYPE.black fontWeight={400} fontSize={12} color={theme.text2}>
                WETH Address
              </TYPE.black>
              <ConfigInput
                value={wethAddress}
                onChange={event => {
                  setWethAddress(event.target.value)
                  setConfigError(null)
                  setSaveMessage(null)
                  setTestMessage(null)
                }}
                placeholder="0x..."
              />
            </ConfigRow>
            <ConfigRow>
              <TYPE.black fontWeight={400} fontSize={12} color={theme.text2}>
                Pair Address (read-only)
              </TYPE.black>
              <ConfigInput value={pairAddressDisplay} readOnly placeholder="Auto from Router/Factory" />
            </ConfigRow>
            <RowBetween>
              <RowFixed>
                <TYPE.black fontWeight={400} fontSize={14} color={theme.text2}>
                  Require Token Address
                </TYPE.black>
              </RowFixed>
              <Toggle
                isActive={tokenRequired}
                toggle={() => {
                  setTokenRequired(!tokenRequired)
                  setConfigError(null)
                  setSaveMessage(null)
                  setTestMessage(null)
                }}
              />
            </RowBetween>
            <ConfigActions>
              <ButtonPrimary
                padding="8px 12px"
                onClick={handleSaveConfig}
              >
                Save
              </ButtonPrimary>
              <ButtonPrimary padding="8px 12px" onClick={handleTestConnection} disabled={isTesting}>
                {isTesting ? 'Testing...' : 'Test'}
              </ButtonPrimary>
              <ButtonError error={false} padding="8px 12px" onClick={handleResetConfig}>
                Reset
              </ButtonError>
            </ConfigActions>
            {configError && (
              <TYPE.black fontWeight={400} fontSize={12} color={theme.red1}>
                {configError}
              </TYPE.black>
            )}
            {saveMessage && (
              <TYPE.black fontWeight={400} fontSize={12} color={theme.text2}>
                {saveMessage}
              </TYPE.black>
            )}
            {testMessage && (
              <TYPE.black fontWeight={400} fontSize={12} color={theme.text2}>
                {testMessage}
              </TYPE.black>
            )}
          </AutoColumn>
        </MenuFlyout>
      )}
    </StyledMenu>
  )
}
