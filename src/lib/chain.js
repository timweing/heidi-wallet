import { createPublicClient, http, parseAbi, getAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { CONFIG } from './config.js'

export { sepolia, getAddress }

export const publicClient = createPublicClient({ chain: sepolia, transport: http(CONFIG.RPC_URL) })

export const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function faucet()',
  'function lastFaucet(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

export const chargerAbi = parseAbi([
  'function token() view returns (address)',
  'function stationAccount() view returns (address)',
  'function pricePerKwBase() view returns (uint256)',
  'function secondsPerKw() view returns (uint256)',
  'function isFree() view returns (bool)',
  'function quote(uint8 kW) view returns (uint256)',
  'function startCharge(uint8 kW)',
  'function status() view returns (bool free, address user, uint8 kW, uint64 startedAt, uint64 endsAt, uint256 paid, uint256 remaining)',
  'event ChargeStarted(address indexed user, uint8 kW, uint256 paid, uint64 startedAt, uint64 endsAt)',
])
const ChargeStartedEvent = chargerAbi.find((x) => x.type === 'event' && x.name === 'ChargeStarted')

export const bikesAbi = parseAbi([
  'function token() view returns (address)',
  'function operator() view returns (address)',
  'function depositBase() view returns (uint256)',
  'function penaltyPerMinBase() view returns (uint256)',
  'function bikeCount() view returns (uint256)',
  'function stationCount() view returns (uint256)',
  'function stations(uint256) view returns (string)',
  'function bikeInfo(uint8 bikeId) view returns (address renter, uint64 startedAt, uint32 plannedMin, uint256 deposit, uint8 station, uint256 usedMin, uint256 overMin, uint256 penalty)',
  'function rent(uint8 bikeId, uint32 plannedMin)',
  'function returnBike(uint8 bikeId, uint8 stationId)',
  'event Rented(uint8 indexed bikeId, address indexed renter, uint32 plannedMin, uint256 deposit, uint64 startedAt)',
  'event Returned(uint8 indexed bikeId, address indexed renter, uint8 stationId, uint256 usedMin, uint256 penalty, uint256 refund)',
])

export const voucherAbi = parseAbi([
  'function amountOf(address) view returns (uint256)',
  'function claimed(address) view returns (bool)',
  'function previewVoucher(address ephemeral) view returns (uint256 amount, bool isClaimed)',
  'function claimHash(address recipient) view returns (bytes32)',
  'function claim(address ephemeral, address recipient, bytes signature)',
])

const tokenEvents = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
const TransferEvent = tokenEvents[0]

const TOK = () => getAddress(CONFIG.TOKEN_ADDRESS)
const VOU = () => getAddress(CONFIG.VOUCHER_ADDRESS)
const CHG = () => getAddress(CONFIG.CHARGER_ADDRESS)
const BIKE = () => getAddress(CONFIG.BIKES_ADDRESS)
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

export async function readBalance(address) {
  return publicClient.readContract({ address: TOK(), abi: tokenAbi, functionName: 'balanceOf', args: [getAddress(address)] })
}

export async function readTokenMeta() {
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: TOK(), abi: tokenAbi, functionName: 'symbol' }).catch(() => CONFIG.SYMBOL),
    publicClient.readContract({ address: TOK(), abi: tokenAbi, functionName: 'decimals' }).catch(() => CONFIG.DECIMALS),
  ])
  return { symbol, decimals: Number(decimals) }
}

export async function isDeployed(address) {
  const code = await publicClient.getCode({ address: getAddress(address) })
  return !!code && code !== '0x'
}

export async function faucetLastClaim(address) {
  return publicClient.readContract({ address: TOK(), abi: tokenAbi, functionName: 'lastFaucet', args: [getAddress(address)] }).catch(() => 0n)
}

export async function readVoucher(ephemeralAddr) {
  const [amount, isClaimed] = await publicClient.readContract({
    address: VOU(), abi: voucherAbi, functionName: 'previewVoucher', args: [getAddress(ephemeralAddr)],
  })
  return { amount, claimed: isClaimed }
}

// ---------------------------------------------------------------- EV-Ladestation

export async function readChargerMeta() {
  const [stationAccount, pricePerKwBase, secondsPerKw] = await Promise.all([
    publicClient.readContract({ address: CHG(), abi: chargerAbi, functionName: 'stationAccount' }),
    publicClient.readContract({ address: CHG(), abi: chargerAbi, functionName: 'pricePerKwBase' }),
    publicClient.readContract({ address: CHG(), abi: chargerAbi, functionName: 'secondsPerKw' }),
  ])
  return { stationAccount: getAddress(stationAccount), pricePerKwBase, secondsPerKw }
}

export async function readChargerStatus() {
  const [free, user, kW, startedAt, endsAt, paid, remaining] = await publicClient.readContract({
    address: CHG(), abi: chargerAbi, functionName: 'status',
  })
  return {
    free,
    user: user === '0x0000000000000000000000000000000000000000' ? null : getAddress(user),
    kW: Number(kW),
    startedAt: Number(startedAt),
    endsAt: Number(endsAt),
    paid,
    remaining: Number(remaining),
  }
}

// ---------------------------------------------------------------- Velo-Verleih

export async function readBikesState() {
  const [operator, depositBase, penaltyPerMinBase, bikeCountBn, stationCountBn] = await Promise.all([
    publicClient.readContract({ address: BIKE(), abi: bikesAbi, functionName: 'operator' }),
    publicClient.readContract({ address: BIKE(), abi: bikesAbi, functionName: 'depositBase' }),
    publicClient.readContract({ address: BIKE(), abi: bikesAbi, functionName: 'penaltyPerMinBase' }),
    publicClient.readContract({ address: BIKE(), abi: bikesAbi, functionName: 'bikeCount' }),
    publicClient.readContract({ address: BIKE(), abi: bikesAbi, functionName: 'stationCount' }),
  ])
  const nBikes = Number(bikeCountBn)
  const nStations = Number(stationCountBn)
  const stations = await Promise.all(
    Array.from({ length: nStations }, (_, i) =>
      publicClient.readContract({ address: BIKE(), abi: bikesAbi, functionName: 'stations', args: [BigInt(i)] })),
  )
  const infos = await Promise.all(
    Array.from({ length: nBikes }, (_, id) =>
      publicClient.readContract({ address: BIKE(), abi: bikesAbi, functionName: 'bikeInfo', args: [id] })),
  )
  const bikes = infos.map(([renter, startedAt, plannedMin, deposit, station, usedMin, overMin, penalty], id) => ({
    id,
    renter: renter === ZERO_ADDR ? null : getAddress(renter),
    available: renter === ZERO_ADDR,
    startedAt: Number(startedAt),
    plannedMin: Number(plannedMin),
    deposit,
    station: Number(station),
    usedMin: Number(usedMin),
    overMin: Number(overMin),
    penalty,
  }))
  return { operator: getAddress(operator), depositBase, penaltyPerMinBase, stations, bikes }
}

export async function readChargeLog({ limit = 8 } = {}) {
  const latest = await publicClient.getBlockNumber()
  const from = latest > 100000n ? latest - 100000n : 0n
  const logs = await scanLogs(CHG(), ChargeStartedEvent, from, latest)
  return logs
    .map((l) => ({
      user: getAddress(l.args.user),
      kW: Number(l.args.kW),
      paid: l.args.paid,
      startedAt: Number(l.args.startedAt),
      endsAt: Number(l.args.endsAt),
      txHash: l.transactionHash,
      block: l.blockNumber,
    }))
    .sort((a, b) => Number(b.block - a.block))
    .slice(0, limit)
}

// getLogs mit Fallback auf kleine Block-Fenster (RPC-Range-Limits).
async function scanLogs(address, event, fromBlock, toBlock, args) {
  try {
    return await publicClient.getLogs({ address, event, args, fromBlock, toBlock })
  } catch {
    const out = []
    const step = 9000n
    for (let s = fromBlock; s <= toBlock; s += step) {
      const e = s + step - 1n > toBlock ? toBlock : s + step - 1n
      out.push(...(await publicClient.getLogs({ address, event, args, fromBlock: s, toBlock: e })))
    }
    return out
  }
}

// On-chain Transfer-Historie (ein-/ausgehend) einer Adresse, neueste zuerst.
export async function readTokenHistory(address, { limit = 25 } = {}) {
  const a = getAddress(address)
  const latest = await publicClient.getBlockNumber()
  const from = CONFIG.TOKEN_FROM_BLOCK ?? (latest > 150000n ? latest - 150000n : 0n)
  const [asTo, asFrom] = await Promise.all([
    scanLogs(TOK(), TransferEvent, from, latest, { to: a }),
    scanLogs(TOK(), TransferEvent, from, latest, { from: a }),
  ])
  const merged = [
    ...asTo.map((l) => ({ direction: 'in', counterparty: getAddress(l.args.from), amount: l.args.value, block: l.blockNumber, txHash: l.transactionHash, logIndex: l.logIndex })),
    ...asFrom.map((l) => ({ direction: 'out', counterparty: getAddress(l.args.to), amount: l.args.value, block: l.blockNumber, txHash: l.transactionHash, logIndex: l.logIndex })),
  ]
  merged.sort((x, y) => (y.block === x.block ? y.logIndex - x.logIndex : Number(y.block - x.block)))
  const top = merged.slice(0, limit)
  const blocks = [...new Set(top.map((x) => x.block))]
  const stamps = new Map(
    await Promise.all(blocks.map(async (b) => [b, Number((await publicClient.getBlock({ blockNumber: b })).timestamp)])),
  )
  return top.map((x) => ({ ...x, ts: stamps.get(x.block) }))
}
