// Zentrale Konfiguration – aus VITE_*-Env (landen im Browser-Bundle -> nur oeffentliche Werte).

const K = import.meta.env.VITE_PIMLICO_API_KEY

export const CONFIG = {
  RPC_URL: import.meta.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  PIMLICO_API_KEY: K,
  BUNDLER_URL:
    import.meta.env.VITE_BUNDLER_URL || (K ? `https://api.pimlico.io/v2/sepolia/rpc?apikey=${K}` : ''),

  TOKEN_ADDRESS: import.meta.env.VITE_TOKEN_ADDRESS,
  VOUCHER_ADDRESS: import.meta.env.VITE_VOUCHER_ADDRESS,
  CHARGER_ADDRESS: import.meta.env.VITE_CHARGER_ADDRESS, // EV-Ladestation (HeidiCharger), optional
  PARK_TREASURY: import.meta.env.VITE_PARK_TREASURY,
  PARK_RATE_PER_MIN: Number(import.meta.env.VITE_PARK_RATE_PER_MIN || 5), // HDI-Basiseinheiten/Min

  API_URL: (import.meta.env.VITE_API_URL || '/api/heidi').replace(/\/$/, ''),

  TOKEN_FROM_BLOCK: import.meta.env.VITE_TOKEN_FROM_BLOCK ? BigInt(import.meta.env.VITE_TOKEN_FROM_BLOCK) : null,

  EXPLORER: 'https://sepolia.etherscan.io',
  CHAIN_ID: 11155111,
  DECIMALS: 2,
  SYMBOL: 'HDI',
}

export function configProblems() {
  const p = []
  if (!CONFIG.TOKEN_ADDRESS) p.push('VITE_TOKEN_ADDRESS')
  if (!CONFIG.BUNDLER_URL) p.push('VITE_PIMLICO_API_KEY')
  return p
}
