# Deployment – Heidi Wallet

## 0 · Voraussetzungen
- Browser-Wallet (MetaMask) auf **Sepolia**, ~0.1 Sepolia-ETH. Faucets: Google
  Cloud Web3 Faucet, pk910 PoW-Faucet.
- Eine **Deployer/Betreiber-EOA** – ihr Private Key wird später zur „Park-Kasse"
  und zum Gutschein-Aussteller im Backend.
- Node ≥ 20, Pimlico-Account (Chain Sepolia aktiv, Sponsorship-Policy **aktiv**).

## 1 · Contracts (Remix)
<https://remix.ethereum.org> → `contracts/HeidiFranc.sol` und
`contracts/HeidiVoucher.sol` anlegen. Compiler **0.8.24+**, Optimization an.
OpenZeppelin-Imports löst Remix automatisch von npm auf.

### 1.1 `HeidiFranc`
- Constructor `owner_` = **deine EOA**.
- Deploy → Adresse = **`TOKEN_ADDRESS`**.
- Die EOA erhält 1'000'000.00 HDI Startguthaben.

### 1.2 `HeidiVoucher`
- Constructor `token_` = `TOKEN_ADDRESS` aus 1.1.
- Deploy → Adresse = **`VOUCHER_ADDRESS`**.

## 2 · Park-Kasse befüllen
Die EOA (= `PARK_TREASURY`) braucht HDI, um Rückerstattungen zu zahlen. Sie hat
schon Startguthaben; sonst in Remix `HeidiFranc.mint(deineEOA, 100000)` (= 1000.00 HDI).

## 3 · Backend deployen (im selben Vercel-Projekt, `api/heidi/*`)
Server-Env **ohne** `VITE_`-Präfix (Vercel → Settings → Environment Variables):

```
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
PARK_TREASURY_PRIVATE_KEY=0x…        (deine EOA – Secret)
TOKEN_ADDRESS=0x…
VOUCHER_ADDRESS=0x…
PARK_RATE_PER_MIN=5                  (0.05 HDI/min = 3 HDI/h)
ADMIN_SECRET=<zufällig>              (Secret, schützt /voucher/create)
APP_URL=https://DEIN-FRONTEND.vercel.app
```

Prüfen: `https://DEIN-APP.vercel.app/api/heidi/health` → `{"ok":true}`.

## 4 · Frontend-Env (`VITE_*`, gleiches Vercel-Projekt)
```
VITE_PIMLICO_API_KEY=pim_…
VITE_TOKEN_ADDRESS=0x…              (= TOKEN_ADDRESS)
VITE_VOUCHER_ADDRESS=0x…           (= VOUCHER_ADDRESS)
VITE_PARK_TREASURY=0x…             (Adresse deiner EOA)
VITE_PARK_RATE_PER_MIN=5
VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# VITE_API_URL nicht nötig – Default "/api/heidi"
```

## 5 · Bauen & deployen
```bash
npm install
vercel --prod        # Frontend + api/heidi Function in einem Deploy
```
`vercel.json` setzt `maxDuration: 60` für die Function.

## 6 · Pimlico
Sponsorship-Policy für Sepolia **aktiv**. Optional Contract-Restriction auf
`TOKEN_ADDRESS` + `VOUCHER_ADDRESS`.

## 7 · Gutscheine erzeugen
```bash
cp .env.example .env         # Backend-Teil ausfüllen (Key + Adressen + APP_URL)
node scripts/create-voucher.mjs 20        # 20.00 HDI
node scripts/create-voucher.mjs 12.50 5   # 5 Stück à 12.50 HDI
```
QR-PNGs landen in `vouchers-out/` → ausdrucken. Alternativ per Backend:
`POST /api/heidi/voucher/create` mit Header `x-admin-secret` und `{"amount":"20"}`.

## 8 · Contracts verifizieren (optional)
Remix-Plugin „Contract Verification – Etherscan" für beide Contracts, damit die
App-Nutzer den Code auf `sepolia.etherscan.io` sehen.
