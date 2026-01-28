import React, { Suspense } from 'react'
import { HashRouter, Route, Switch, Link } from 'react-router-dom'
import styled from 'styled-components'
import GoogleAnalyticsReporter from '../components/analytics/GoogleAnalyticsReporter'
import Header from '../components/Header'
import Popups from '../components/Popups'
import Web3ReactManager from '../components/Web3ReactManager'
import DarkModeQueryParamReader from '../theme/DarkModeQueryParamReader'
import AddLiquidity from './AddLiquidity'
import {
  RedirectDuplicateTokenIds,
  RedirectOldAddLiquidityPathStructure,
  RedirectToAddLiquidity
} from './AddLiquidity/redirects'
import MigrateV1 from './MigrateV1'
import MigrateV1Exchange from './MigrateV1/MigrateV1Exchange'
import RemoveV1Exchange from './MigrateV1/RemoveV1Exchange'
import Pool from './Pool'
import PoolFinder from './PoolFinder'
import RemoveLiquidity from './RemoveLiquidity'
import { RedirectOldRemoveLiquidityPathStructure } from './RemoveLiquidity/redirects'
import Swap from './Swap'
import { RedirectPathToSwapOnly, RedirectToSwap } from './Swap/redirects'
import { useActiveWeb3React } from '../hooks'
import { getPrivateChainId, isPrivateChain } from '../utils/switchNetwork'
import AppBody from './AppBody'
import { LightCard } from '../components/Card'
import { TYPE } from '../theme'
import { ButtonPrimary } from '../components/Button'

const AppWrapper = styled.div`
  display: flex;
  flex-flow: column;
  align-items: flex-start;
  overflow-x: hidden;
`

const HeaderWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  width: 100%;
  justify-content: space-between;
`

const BodyWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 160px;
  align-items: center;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 10;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
      padding: 16px;
  `};

  z-index: 1;
`

const Marginer = styled.div`
  margin-top: 5rem;
`

function V1NotSupported() {
  return (
    <AppBody>
      <LightCard padding="40px">
        <TYPE.body textAlign="center">V1 is not available on this network.</TYPE.body>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <ButtonPrimary as={Link} to="/swap">
            Go to Swap
          </ButtonPrimary>
        </div>
      </LightCard>
    </AppBody>
  )
}

function AppRoutes() {
  const { chainId } = useActiveWeb3React()
  const isPrivate = isPrivateChain(chainId ?? getPrivateChainId())

  return (
    <Switch>
      <Route exact strict path="/swap" component={Swap} />
      <Route exact strict path="/swap/:outputCurrency" component={RedirectToSwap} />
      <Route exact strict path="/send" component={RedirectPathToSwapOnly} />
      <Route exact strict path="/find" component={PoolFinder} />
      <Route exact strict path="/pool" component={Pool} />
      <Route exact strict path="/create" component={RedirectToAddLiquidity} />
      <Route exact path="/add" component={AddLiquidity} />
      <Route exact path="/add/:currencyIdA" component={RedirectOldAddLiquidityPathStructure} />
      <Route exact path="/add/:currencyIdA/:currencyIdB" component={RedirectDuplicateTokenIds} />
      <Route exact strict path="/remove/:tokens" component={RedirectOldRemoveLiquidityPathStructure} />
      <Route exact strict path="/remove/:currencyIdA/:currencyIdB" component={RemoveLiquidity} />
      {isPrivate ? (
        <>
          <Route exact strict path="/remove/v1/:address" component={V1NotSupported} />
          <Route exact strict path="/migrate/v1" component={V1NotSupported} />
          <Route exact strict path="/migrate/v1/:address" component={V1NotSupported} />
        </>
      ) : (
        <>
          <Route exact strict path="/remove/v1/:address" component={RemoveV1Exchange} />
          <Route exact strict path="/migrate/v1" component={MigrateV1} />
          <Route exact strict path="/migrate/v1/:address" component={MigrateV1Exchange} />
        </>
      )}
      <Route component={RedirectPathToSwapOnly} />
    </Switch>
  )
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <HashRouter>
        <Route component={GoogleAnalyticsReporter} />
        <Route component={DarkModeQueryParamReader} />
        <AppWrapper>
          <HeaderWrapper>
            <Header />
          </HeaderWrapper>
          <BodyWrapper>
            <Popups />
            <Web3ReactManager>
              <AppRoutes />
            </Web3ReactManager>
            <Marginer />
          </BodyWrapper>
        </AppWrapper>
      </HashRouter>
    </Suspense>
  )
}
