// Passkey -> Coinbase Smart Account (Single-Owner) -> Pimlico (gasfrei).

import { http } from 'viem'
import {
  createWebAuthnCredential,
  toWebAuthnAccount,
  toCoinbaseSmartAccount,
  entryPoint06Address,
} from 'viem/account-abstraction'
import { createSmartAccountClient } from 'permissionless'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { publicClient, sepolia } from './chain.js'
import { CONFIG } from './config.js'
import { accountStore } from './store.js'

// Lazy: nicht beim Modul-Laden erstellen, sonst wirft http('') bei fehlendem
// VITE_PIMLICO_API_KEY und die ganze App bleibt weiss.
let _pimlico
function pimlicoClient() {
  if (!CONFIG.BUNDLER_URL) throw new Error('Pimlico nicht konfiguriert – VITE_PIMLICO_API_KEY setzen und neu deployen.')
  return (_pimlico ??= createPimlicoClient({
    transport: http(CONFIG.BUNDLER_URL),
    entryPoint: { address: entryPoint06Address, version: '0.6' },
  }))
}

export const hasStoredAccount = () => !!accountStore.get()?.credential

export async function createPasskeyAccount() {
  const cred = await createWebAuthnCredential({ name: 'Heidi Wallet' })
  accountStore.set({ credential: { id: cred.id, publicKey: cred.publicKey }, address: null })
  return buildAccount()
}

export async function buildAccount() {
  const st = accountStore.get()
  if (!st?.credential) throw new Error('Kein Passkey gespeichert')
  const owner = toWebAuthnAccount({ credential: st.credential })
  const account = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [owner],
    version: '1.1',
    address: st.address || undefined,
  })
  if (!st.address) {
    st.address = account.address
    accountStore.set(st)
  }
  const pc = pimlicoClient()
  const client = createSmartAccountClient({
    account,
    chain: sepolia,
    bundlerTransport: http(CONFIG.BUNDLER_URL),
    paymaster: pc,
    userOperation: {
      estimateFeesPerGas: async () => (await pc.getUserOperationGasPrice()).fast,
    },
  })
  return { account, client }
}

export async function sendCalls(client, calls) {
  const userOpHash = await client.sendUserOperation({ calls })
  const { receipt } = await client.waitForUserOperationReceipt({ hash: userOpHash })
  return { userOpHash, txHash: receipt.transactionHash, block: Number(receipt.blockNumber) }
}

export const forgetAccount = () => accountStore.clear()
