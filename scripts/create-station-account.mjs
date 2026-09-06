// Erzeugt das Smart Account der EV-Ladestation (echtes ERC-4337 Konto) und
// deployt es on-chain, damit es sichtbar „real" ist. Reiner Node-Code.
//
//   node scripts/create-station-account.mjs
//
// Liest aus .env (dotenv):
//   PIMLICO_API_KEY | VITE_PIMLICO_API_KEY   – fuer den gasfreien Deploy-UserOp
//   RPC_URL | VITE_RPC_URL                   – Sepolia-RPC (optional, hat Default)
//   STATION_OWNER_PRIVATE_KEY               – optional: bestehenden Owner-Key wiederverwenden
import 'dotenv/config'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { toCoinbaseSmartAccount, entryPoint06Address } from 'viem/account-abstraction'
import { createSmartAccountClient } from 'permissionless'
import { createPimlicoClient } from 'permissionless/clients/pimlico'

const RPC = process.env.RPC_URL || process.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const K = process.env.PIMLICO_API_KEY || process.env.VITE_PIMLICO_API_KEY
const BUNDLER = process.env.BUNDLER_URL || process.env.VITE_BUNDLER_URL || (K ? `https://api.pimlico.io/v2/sepolia/rpc?apikey=${K}` : '')

const PRICE_PER_KW = 30 // 0.30 HDI je kW (HDI hat 2 Dezimalstellen)
const SECONDS_PER_KW = 6 // Zeitraffer: 20 kW -> 120 s

let key = process.env.STATION_OWNER_PRIVATE_KEY
const generated = !key
if (!key) key = generatePrivateKey()
if (!key.startsWith('0x')) key = '0x' + key

const owner = privateKeyToAccount(key)
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) })
const account = await toCoinbaseSmartAccount({ client: publicClient, owners: [owner], version: '1.1' })

console.log('\n=== Heidi-Ladestation · Smart Account ===')
console.log('Owner-Key      :', key, generated ? '(NEU generiert – sicher speichern!)' : '(aus STATION_OWNER_PRIVATE_KEY)')
console.log('Owner-Adresse  :', owner.address)
console.log('Station-SA      :', account.address)

const code = await publicClient.getCode({ address: account.address })
if (code && code !== '0x') {
  console.log('Status         : bereits on-chain deployt ✓')
} else if (!BUNDLER) {
  console.log('Status         : NICHT deployt – kein Pimlico-Key gefunden.')
  console.log('                 Setze VITE_PIMLICO_API_KEY in .env und starte erneut,')
  console.log('                 oder ignoriere es: das Konto deployt sich beim 1. ausgehenden UserOp selbst.')
} else {
  console.log('Status         : deploye on-chain via Pimlico (No-Op UserOperation) …')
  const pimlico = createPimlicoClient({
    transport: http(BUNDLER),
    entryPoint: { address: entryPoint06Address, version: '0.6' },
  })
  const client = createSmartAccountClient({
    account,
    chain: sepolia,
    bundlerTransport: http(BUNDLER),
    paymaster: pimlico,
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  })
  const hash = await client.sendUserOperation({ calls: [{ to: account.address, value: 0n, data: '0x' }] })
  const rcpt = await client.waitForUserOperationReceipt({ hash })
  console.log('Deploy-Tx      :', rcpt.receipt.transactionHash)
  console.log('Status         : deployt ✓')
}

console.log('\nNächste Schritte:')
console.log(' 1. contracts/HeidiCharger.sol in Remix deployen, Constructor:')
console.log('      token_          = <HeidiFranc-Adresse>')
console.log(`      stationAccount_ = ${account.address}`)
console.log(`      pricePerKwBase_ = ${PRICE_PER_KW}            (= ${(PRICE_PER_KW / 100).toFixed(2)} HDI je kW)`)
console.log(`      secondsPerKw_   = ${SECONDS_PER_KW}             (Zeitraffer der Ladedauer)`)
console.log(' 2. VITE_CHARGER_ADDRESS = <HeidiCharger-Adresse>  in .env / Vercel setzen, neu deployen.')
if (generated) console.log(' 3. STATION_OWNER_PRIVATE_KEY = <obiger Owner-Key>  in .env speichern (nur nötig, falls die Station später aktiv werden soll).')
console.log('')
