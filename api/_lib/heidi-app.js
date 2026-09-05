// =============================================================================
//  Heidi Wallet – Backend (Express)
//  Laeuft als Vercel Serverless Function (api/heidi/[...path].js) ODER lokal
//  ueber server/index.js. Aufgaben:
//   - GET  /config           oeffentliche Adressen / Tarif
//   - GET  /geocode          Reverse-Geocoding (Nominatim / OSM)
//   - POST /parking/start    Parkvorgang protokollieren (optional)
//   - POST /parking/stop     anteilige Rueckerstattung aus der Park-Kasse
//   - POST /voucher/create   Gutschein anlegen (admin) -> ephemeraler Key + Link
// =============================================================================

import express from 'express'
import cors from 'cors'
import {
  createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits,
  isAddress, getAddress,
} from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const {
  RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com',
  PARK_TREASURY_PRIVATE_KEY,
  VOUCHER_ISSUER_PRIVATE_KEY,
  TOKEN_ADDRESS,
  VOUCHER_ADDRESS,
  PARK_RATE_PER_MIN = '5',
  ADMIN_SECRET = '',
  CORS_ORIGIN = '*',
  APP_URL = '',
} = process.env

// Fehlende/ungueltige Env NICHT beim Laden werfen – sonst faellt die ganze
// Function aus (auch /health, /geocode) und Vercel liefert ein undurchsichtiges
// 500/404. Stattdessen sammeln und pro Route pruefen (requireConfig unten).
const CONFIG_ERR = []

// MetaMask exportiert den Key ohne "0x"; viem braucht ihn mit. -> normalisieren.
function loadKey(raw, label) {
  if (!raw) { CONFIG_ERR.push(label); return null }
  const hex = raw.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) { CONFIG_ERR.push(`${label} (kein 32-Byte-Hex)`); return null }
  try { return privateKeyToAccount(`0x${hex}`) }
  catch { CONFIG_ERR.push(`${label} (ungültig)`); return null }
}

const ON_VERCEL = !!process.env.VERCEL
const RATE = BigInt(PARK_RATE_PER_MIN) // Basiseinheiten (2 Dezimalst.) pro Minute
const DECIMALS = 2

const treasury = loadKey(PARK_TREASURY_PRIVATE_KEY, 'PARK_TREASURY_PRIVATE_KEY')
const issuer = VOUCHER_ISSUER_PRIVATE_KEY ? loadKey(VOUCHER_ISSUER_PRIVATE_KEY, 'VOUCHER_ISSUER_PRIVATE_KEY') : treasury

const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
const treasuryWallet = treasury ? createWalletClient({ account: treasury, chain: sepolia, transport: http(RPC_URL) }) : null
const issuerWallet = issuer ? createWalletClient({ account: issuer, chain: sepolia, transport: http(RPC_URL) }) : null

function loadAddr(raw, label, required) {
  if (!raw) { if (required) CONFIG_ERR.push(label); return null }
  try { return getAddress(raw.trim()) }
  catch { CONFIG_ERR.push(`${label} (keine gültige Adresse)`); return null }
}
const TOK = loadAddr(TOKEN_ADDRESS, 'TOKEN_ADDRESS', true)
const VOU = loadAddr(VOUCHER_ADDRESS, 'VOUCHER_ADDRESS', false)

function requireConfig(res) {
  if (CONFIG_ERR.length) {
    res.status(503).json({ error: `Backend nicht konfiguriert – fehlende Env: ${CONFIG_ERR.join(', ')}` })
    return false
  }
  return true
}

const erc20 = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
])
const voucherAbi = parseAbi(['function createVoucher(address ephemeral, uint256 amount)'])

async function send(wallet, params) {
  const hash = await wallet.writeContract(params)
  if (!ON_VERCEL) {
    const r = await publicClient.waitForTransactionReceipt({ hash })
    if (r.status !== 'success') throw new Error(`tx reverted: ${hash}`)
  }
  return hash
}
const asyncH = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e)
  res.status(400).json({ error: e.shortMessage || e.message })
})

// ---------------------------------------------------------------- App

const app = express()
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') return next()
  let d = ''
  req.on('data', (c) => (d += c))
  req.on('end', () => {
    try { req.body = d ? JSON.parse(d) : {} } catch { req.body = {} }
    next()
  })
})
app.use(cors({ origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map((s) => s.trim()) }))

const r = express.Router()

r.get('/health', (_req, res) => res.json({
  ok: CONFIG_ERR.length === 0,
  onVercel: ON_VERCEL,
  missingEnv: CONFIG_ERR,
}))

r.get('/config', (_req, res) => res.json({
  chainId: sepolia.id,
  token: TOK,
  voucher: VOU,
  parkTreasury: treasury?.address ?? null,
  parkRatePerMin: PARK_RATE_PER_MIN,
  decimals: DECIMALS,
  missingEnv: CONFIG_ERR,
}))

// ---- Reverse-Geocoding (Nominatim) mit kleinem Cache ----
const geoCache = new Map()
r.get('/geocode', asyncH(async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('lat/lng erforderlich')
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (geoCache.has(key)) return res.json({ name: geoCache.get(key) })
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`
  const g = await fetch(url, { headers: { 'User-Agent': 'HeidiWallet/1.0 (demo)' } }).then((x) => x.json()).catch(() => null)
  let name = ''
  if (g?.address) {
    const a = g.address
    const street = [a.road, a.house_number].filter(Boolean).join(' ')
    const city = a.city || a.town || a.village || a.municipality || ''
    name = [street, [a.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  }
  name = name || g?.display_name?.split(',').slice(0, 2).join(',') || key
  geoCache.set(key, name)
  res.json({ name })
}))

r.post('/parking/start', asyncH(async (req, res) => {
  // Rein informativ (kein Contract). Antwort bestaetigt nur.
  res.json({ ok: true })
}))

r.post('/parking/stop', asyncH(async (req, res) => {
  if (!requireConfig(res)) return
  const { account, startedAt, durationMin, costBase } = req.body ?? {}
  if (!isAddress(account)) throw new Error('account ungültig')
  const dur = Math.max(1, Math.floor(Number(durationMin)))
  const paid = BigInt(costBase)
  const now = Math.floor(Date.now() / 1000)
  let elapsedMin = Math.ceil((now - Number(startedAt)) / 60)
  elapsedMin = Math.max(0, Math.min(dur, elapsedMin))
  const used = RATE * BigInt(elapsedMin)
  const refund = paid > used ? paid - used : 0n

  let refundTx = null
  if (refund > 0n) {
    refundTx = await send(treasuryWallet, {
      address: TOK, abi: erc20, functionName: 'transfer', args: [getAddress(account), refund],
    })
  }
  res.json({ elapsedMin, refundBase: refund.toString(), refundTx })
}))

// ---- Gutschein anlegen (admin) ----
r.post('/voucher/create', asyncH(async (req, res) => {
  if (!requireConfig(res)) return
  if (!ADMIN_SECRET || req.get('x-admin-secret') !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  if (!VOU) throw new Error('VOUCHER_ADDRESS nicht gesetzt')
  const amountHdi = String(req.body?.amount ?? '')
  const amount = parseUnits(amountHdi, DECIMALS)
  if (amount <= 0n) throw new Error('amount > 0 erforderlich')

  const priv = generatePrivateKey()
  const ephemeral = privateKeyToAccount(priv).address

  const allowance = await publicClient.readContract({ address: TOK, abi: erc20, functionName: 'allowance', args: [issuer.address, VOU] })
  if (allowance < amount) {
    await send(issuerWallet, { address: TOK, abi: erc20, functionName: 'approve', args: [VOU, amount * 100n] })
  }
  const tx = await send(issuerWallet, { address: VOU, abi: voucherAbi, functionName: 'createVoucher', args: [ephemeral, amount] })

  const redeemUrl = `${(APP_URL || '').replace(/\/$/, '')}/?redeem=${priv.replace(/^0x/, '')}`
  res.json({ ok: true, ephemeral, amount: formatUnits(amount, DECIMALS), privKey: priv, redeemUrl, tx })
}))

// Unbekannte Pfade + Fehler immer als JSON (nicht Vercels HTML-404/500).
r.use((req, res) => res.status(404).json({ error: `keine Route: ${req.method} ${req.originalUrl}` }))
r.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err?.shortMessage || err?.message || 'interner Fehler' })
})

app.use('/api/heidi', r)
app.use('/', r)

export default app
