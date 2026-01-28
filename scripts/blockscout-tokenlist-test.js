#!/usr/bin/env node
/* eslint-disable no-console */
const { getAddress } = require('@ethersproject/address')

const DEFAULT_URL = 'https://ebits.hk1.natnps.cn'
const baseUrl = (process.argv[2] || DEFAULT_URL).replace(/\/$/, '')
const chainId = Number(process.argv[3] || '84531')

const endpoints = [
  `${baseUrl}/api/v2/tokens`,
  `${baseUrl}/api?module=token&action=tokenlist`,
  `${baseUrl}/api?module=token&action=tokenlist&limit=1000`
]

function normalizeTokens(payload) {
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.result)
    ? payload.result
    : []

  const tokens = []
  for (const item of items) {
    const address = item.address || item.contractAddress
    try {
      if (!address) continue
      const checked = getAddress(address)
      const decimals = Number(item.decimals)
      tokens.push({
        chainId,
        address: checked,
        symbol: item.symbol || item.tokenSymbol || 'TOKEN',
        name: item.name || item.tokenName || 'Token',
        decimals: Number.isFinite(decimals) ? decimals : 18
      })
    } catch {
      // skip invalid address
    }
  }
  return tokens
}

async function fetchTokens(url) {
  const response = await fetch(url)
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  return { response, data, text }
}

async function main() {
  console.log(`Blockscout base URL: ${baseUrl}`)
  console.log(`ChainId: ${chainId}`)
  for (const endpoint of endpoints) {
    try {
      const { response, data } = await fetchTokens(endpoint)
      const allowOrigin = response.headers.get('access-control-allow-origin')
      console.log(`\n[${response.status}] ${endpoint}`)
      console.log(`access-control-allow-origin: ${allowOrigin || '(missing)'}`)
      if (!data) {
        console.log('Response is not JSON.')
        continue
      }
      const tokens = normalizeTokens(data)
      console.log(`tokens: ${tokens.length}`)
      console.log('sample:', tokens.slice(0, 5))
    } catch (error) {
      console.error(`Failed to fetch ${endpoint}`, error?.message || error)
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
