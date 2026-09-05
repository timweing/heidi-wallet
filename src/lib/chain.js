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
  'function faucet()',
  'function lastFaucet(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
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
