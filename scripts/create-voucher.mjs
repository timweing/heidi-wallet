// Erstellt einen physischen Gutschein (LinkDrop) und schreibt einen druckbaren
// QR-Code nach vouchers-out/.
//
//   cp .env.example .env   # RPC_URL, VOUCHER_ISSUER_PRIVATE_KEY (oder PARK_TREASURY_PRIVATE_KEY),
//                          # TOKEN_ADDRESS, VOUCHER_ADDRESS, APP_URL
//   node scripts/create-voucher.mjs 20        # 20.00 HDI
//   node scripts/create-voucher.mjs 12.50 3   # 3 Gutscheine zu je 12.50 HDI
import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import {
  createPublicClient, createWalletClient, http, parseAbi, parseUnits, getAddress,
} from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import QRCode from 'qrcode'

const {
  RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com',
  VOUCHER_ISSUER_PRIVATE_KEY,
  PARK_TREASURY_PRIVATE_KEY,
  TOKEN_ADDRESS,
  VOUCHER_ADDRESS,
  APP_URL = '',
} = process.env

const KEY = VOUCHER_ISSUER_PRIVATE_KEY || PARK_TREASURY_PRIVATE_KEY
if (!KEY || !TOKEN_ADDRESS || !VOUCHER_ADDRESS) {
  console.error('Fehlt: VOUCHER_ISSUER_PRIVATE_KEY|PARK_TREASURY_PRIVATE_KEY, TOKEN_ADDRESS, VOUCHER_ADDRESS in .env')
  process.exit(1)
}

const amountHdi = process.argv[2]
const count = Math.max(1, parseInt(process.argv[3] || '1', 10))
if (!amountHdi) {
  console.error('Nutzung: node scripts/create-voucher.mjs <Betrag HDI> [Anzahl]')
  process.exit(1)
}
const DECIMALS = 2
const amount = parseUnits(amountHdi, DECIMALS)

const issuer = privateKeyToAccount(KEY.startsWith('0x') ? KEY : '0x' + KEY)
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
const wallet = createWalletClient({ account: issuer, chain: sepolia, transport: http(RPC_URL) })

const TOK = getAddress(TOKEN_ADDRESS)
const VOU = getAddress(VOUCHER_ADDRESS)
const erc20 = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
])
const voucherAbi = parseAbi(['function createVoucher(address ephemeral, uint256 amount)'])

async function wait(hash) {
  const r = await publicClient.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`tx reverted: ${hash}`)
  return hash
}

mkdirSync(new URL('../vouchers-out/', import.meta.url), { recursive: true })

const total = amount * BigInt(count)
const allowance = await publicClient.readContract({ address: TOK, abi: erc20, functionName: 'allowance', args: [issuer.address, VOU] })
if (allowance < total) {
  console.log(`approve(${VOU}, ${amountHdi} x ${count}) …`)
  await wait(await wallet.writeContract({ address: TOK, abi: erc20, functionName: 'approve', args: [VOU, total * 100n] }))
}

for (let i = 0; i < count; i++) {
  const priv = generatePrivateKey()
  const eph = privateKeyToAccount(priv).address
  console.log(`\nGutschein ${i + 1}/${count}: createVoucher(${eph}, ${amountHdi}) …`)
  const tx = await wait(await wallet.writeContract({ address: VOU, abi: voucherAbi, functionName: 'createVoucher', args: [eph, amount] }))

  const url = `${APP_URL.replace(/\/$/, '')}/?redeem=${priv.replace(/^0x/, '')}`
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = new URL(`../vouchers-out/voucher-${amountHdi}HDI-${stamp}-${i + 1}.png`, import.meta.url)
  await QRCode.toFile(file.pathname, url, { width: 600, margin: 2, errorCorrectionLevel: 'M' })

  console.log(`  Betrag:   ${amountHdi} HDI`)
  console.log(`  Tx:       ${tx}`)
  console.log(`  Einlösen: ${url}`)
  console.log(`  QR:       ${file.pathname}`)
}
console.log('\nFertig. QR-PNGs in vouchers-out/ ausdrucken und aufkleben.')
