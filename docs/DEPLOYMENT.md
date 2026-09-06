# Deployment – Heidi Wallet

_Stand: 6. September 2026. Referenz-Deployment: `heidi-coin.vercel.app` (Sepolia)._

## 0 · Voraussetzungen
- Browser-Wallet (MetaMask) auf **Sepolia**, ~0.1 Sepolia-ETH. Faucets: Google
  Cloud Web3 Faucet, pk910 PoW-Faucet.
- Eine **Deployer/Betreiber-EOA** – ihr Private Key wird später zur „Park-Kasse"
  und zum Gutschein-Aussteller im Backend.
- Node ≥ 20, Pimlico-Account (Chain Sepolia aktiv, Sponsorship-Policy **aktiv**).

## 1 · Contracts (Remix)
<https://remix.ethereum.org> → `contracts/HeidiFranc.sol` und
`contracts/HeidiVoucher.sol` anlegen. Compiler **0.8.26–0.8.28**, Optimization an.
OpenZeppelin-Imports (`@openzeppelin/contracts@5.1.0/…`, im Quelltext gepinnt)
löst Remix automatisch von npm auf.

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

## 3 · Backend deployen (im selben Vercel-Projekt, `api/heidi.js`)
Server-Env **ohne** `VITE_`-Präfix (Vercel → Settings → Environment Variables):

```
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
PARK_TREASURY_PRIVATE_KEY=0x…        (deine EOA – Secret)
VOUCHER_ISSUER_PRIVATE_KEY=0x…       (optional, Secret; sonst = Park-Kasse)
TOKEN_ADDRESS=0x…
VOUCHER_ADDRESS=0x…
PARK_RATE_PER_MIN=5                  (0.05 HDI/min = 3 HDI/h)
ADMIN_SECRET=<zufällig>              (Secret, schützt /voucher/create)
APP_URL=https://DEIN-FRONTEND.vercel.app
# CORS_ORIGIN nur nötig, wenn das Frontend auf einer anderen Domain läuft
```

Diese Backend-Werte dürfen als **„Sensitive"** angelegt werden (Gegenteil der
`VITE_*` aus Schritt 4) – sie laufen nur serverseitig.

Prüfen: `https://DEIN-APP.vercel.app/api/heidi/health` → `{"ok":true}`.
Bei `{"ok":false,"missingEnv":[…]}` fehlen genau diese Variablen in Vercel –
setzen und **neu deployen**. (Ohne sie liefert `/parking/stop` „Backend nicht
konfiguriert", in der App sichtbar als Fehler bei der Rückerstattung.)

## 4 · Frontend-Env (`VITE_*`, gleiches Vercel-Projekt)
```
VITE_PIMLICO_API_KEY=pim_…          (API-KEY, nicht die Policy-ID – siehe 6)
VITE_TOKEN_ADDRESS=0x…              (= TOKEN_ADDRESS)
VITE_VOUCHER_ADDRESS=0x…           (= VOUCHER_ADDRESS)
VITE_CHARGER_ADDRESS=0x…           (optional, EV-Ladestation – siehe 8)
VITE_PARK_TREASURY=0x…             (Adresse deiner EOA)
VITE_PARK_RATE_PER_MIN=5
VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# VITE_API_URL nicht nötig – Default "/api/heidi"
```

> ⚠️ **`VITE_*` in Vercel als normale Variable anlegen, nicht als „Sensitive".**
> `VITE_*`-Werte werden **beim Build** ins Client-Bundle eingebacken; als
> „Sensitive"/Secret markierte Werte stehen dem Build nicht zur Verfügung →
> die App lädt mit leerem UI (nur Kopfzeile). Im CLI-Dialog von
> `vercel env add VITE_PIMLICO_API_KEY production` **nicht** die Vorgabe
> „Keep private" bestätigen, sondern „**Expose to anyone visiting your site**"
> wählen (sonst wird die Variable in `PIMLICO_API_KEY` umbenannt). Über das
> Web-Dashboard: Haken bei „Sensitive" **weglassen**.

## 5 · Bauen & deployen
```bash
npm install
vercel --prod        # Frontend + api/heidi Function in einem Deploy
```
`vercel.json` setzt `maxDuration: 60` für die Function. **Nach jeder Änderung an
`VITE_*`-Variablen neu deployen** – sie werden nur beim Build übernommen.

## 6 · Pimlico – API-Key ≠ Policy-ID

1. Pimlico-Dashboard → **API Keys** → Key kopieren. **Dieser** Wert gehört in
   `VITE_PIMLICO_API_KEY` (bzw. `VITE_BUNDLER_URL`).
2. Pimlico-Dashboard → **Sponsorship Policies** → Policy für **Sepolia** anlegen
   und **aktiv** schalten. Die Policy-ID (beginnt ebenfalls mit `pim_…`) wird
   **nirgends** in die Env eingetragen – sie greift automatisch für den Key.
3. Optional: Contract-Restriction der Policy auf `TOKEN_ADDRESS` +
   `VOUCHER_ADDRESS` (beide eintragen, sonst wird `claim`/`faucet` nicht gesponsert).

> **Falscher Wert = `401 invalid 'apikey'`**, in der App sichtbar als
> „HTTP request failed" bei Senden/Faucet/Gutschein einlösen. Schnelltest:
> ```bash
> curl -s -X POST "https://api.pimlico.io/v2/sepolia/rpc?apikey=DEIN_KEY" \
>   -H 'content-type: application/json' \
>   -d '{"jsonrpc":"2.0","id":1,"method":"pimlico_getUserOperationGasPrice","params":[]}'
> ```
> muss ein `result` liefern, kein `401`.

## 7 · Gutscheine erzeugen
```bash
cp .env.example .env         # Backend-Teil ausfüllen (Key + Adressen + APP_URL)
node scripts/create-voucher.mjs 20        # 20.00 HDI
node scripts/create-voucher.mjs 12.50 5   # 5 Stück à 12.50 HDI
```

> Die Aussteller-EOA (`VOUCHER_ISSUER_PRIVATE_KEY`, sonst `PARK_TREASURY_PRIVATE_KEY`)
> braucht Sepolia-**ETH** *und* **HDI** – das Skript sendet normale Transaktionen
> (nicht gasfrei). Fehlt eins, bricht es mit „exceeds the balance" ab.

QR-PNGs landen in `vouchers-out/` → ausdrucken. Alternativ per Backend:
`POST /api/heidi/voucher/create` mit Header `x-admin-secret` und `{"amount":"20"}`.

## 8 · EV-Ladestation (optional)

Simulierte IoT-Ladestation mit echtem Smart Account. Reihenfolge wichtig – das
Smart Account muss existieren, bevor der Contract deployt wird.

### 8.1 · Stations-Smart-Account erzeugen
```bash
# .env muss VITE_PIMLICO_API_KEY (+ optional VITE_RPC_URL) enthalten
node scripts/create-station-account.mjs
```
Gibt **Owner-Key**, **Owner-Adresse** und **Station-SA** aus und deployt das
Konto on-chain (gasfreie No-Op-UserOperation über Pimlico). Owner-Key sicher
notieren; `STATION_OWNER_PRIVATE_KEY` in `.env` ist nur nötig, falls die Station
später aktiv werden soll.

### 8.2 · `HeidiCharger` deployen (Remix)
`contracts/HeidiCharger.sol`, Constructor:

| Param | Wert |
|---|---|
| `token_` | `TOKEN_ADDRESS` (HeidiFranc) |
| `stationAccount_` | Station-SA aus 8.1 |
| `pricePerKwBase_` | `30`  (= 0.30 HDI je kW) |
| `secondsPerKw_` | `6`  (Zeitraffer: 20 kW ≈ 2 min) |

Deploy → Adresse = **`CHARGER_ADDRESS`**.

### 8.3 · Frontend-Env
```
VITE_CHARGER_ADDRESS=0x…      (= CHARGER_ADDRESS)
```
Als **Config** anlegen, `vercel --prod` neu. Ohne die Variable ist „Laden"
inaktiv (kein Fehler). Danach:
- Wallet → **Laden**: Station frei → kW wählen → eine UserOperation.
- Simulator: `https://DEIN-APP.vercel.app/station` (bzw. `/station.html`).

Die Station braucht **kein** Backend und **kein** ETH – sie empfängt nur HDI.

## 9 · Contracts verifizieren (optional)
Remix-Plugin „Contract Verification – Etherscan" für alle Contracts, damit die
App-Nutzer den Code auf `sepolia.etherscan.io` sehen.
