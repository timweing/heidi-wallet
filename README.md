# Heidi Wallet

Stablecoin-Wallet (Token **Heidi Franc**, `HDI`, 2 Nachkommastellen) mit
Passkey-Konto, gasfreien Transaktionen, physischen **Gutscheinen**, einer
**Parken**-Funktion und einer simulierten **EV-Ladestation**. Basiert auf dem
Aufbau von `../11_ERC4337`, **ohne** Admin-GUI, **ohne**
Whitelist/Registry/Recovery-Modul – ein Transfer gelingt, solange das Guthaben
reicht.

> **Stand: 6. September 2026** · Contracts auf Sepolia deployt, Frontend + Backend
> auf Vercel live (`heidi-coin.vercel.app`), Konto/Senden/Faucet/Gutschein/Parken
> durchgetestet. Ladestation neu.

```
 Passkey (WebAuthn)
   │  signiert UserOperation
   ▼
 Coinbase Smart Account (Single-Owner)  ── gasfrei via Pimlico Paymaster ──▶ Sepolia
   │
   ├─ HeidiFranc (ERC-20, 2 Dezimalst.)   transfer · approve · faucet() · mint() (nur Owner)
   ├─ HeidiVoucher (LinkDrop)             createVoucher() · claim(ephemeral, recipient, sig)
   └─ HeidiCharger (EV-Ladestation)       startCharge(kW) → HDI an Stations-Smart-Account · status()

 Backend (api/heidi.js bzw. server/)   Reverse-Geocoding · Park-Rückerstattung · Gutschein-Erstellung
 /station.html                          Simulator-Ansicht der Ladestation (reiner Chain-Lesezugriff)
```

## Funktionen

| Funktion | Umsetzung |
|---|---|
| **Konto erstellen** | Passkey → Coinbase Smart Account. „Neues Konto" (Notfall) = neuer Passkey, neue Adresse – **altes Guthaben ist dann verloren** (kein Recovery). |
| **Senden** | Ziffernblock + Wisch-Bestätigung → `transfer` als gasfreie UserOperation. |
| **Empfangen** | QR-Code (`ethereum:…`) mit optionalem Betrag, „Teilen"/„Link kopieren". |
| **Freundesliste** | Name ↔ Adresse, lokal; Hinzufügen auch per QR-Scan. |
| **Aufteilen (Alpen-Split)** | Freunde auswählen, „Gleich aufteilen", alle Transfers in **einer** UserOperation. |
| **Gutschein** | Physischer Papiergutschein mit QR (LinkDrop). QR trägt einen Einmal-Privatekey; die App signiert damit eine an die eigene Adresse gebundene Nachricht, `HeidiVoucher.claim()` zahlt aus und macht den Gutschein unbrauchbar. **Front-running-sicher.** |
| **Parken** | UI-Demo im Twint-Stil: Kennzeichen wählen, Standort per Geolocation, Dauer einstellen. Zahlung = `transfer` an die Park-Kasse. Früher beenden → das Backend erstattet anteilig aus der Park-Kasse zurück. |
| **Laden (EV)** | Simulierte IoT-Ladestation mit **echtem** Smart Account. Die „Laden"-Ansicht ist gesperrt, bis der **QR-Code an der Säule** gescannt wird (`/station.html`-QR bzw. `?charge=`-Deeplink). Danach: ist die Station frei, wählt man **5 / 10 / 15 / 20 kW**; die Wallet sendet **eine** UserOperation (`approve` + `HeidiCharger.startCharge`), die HDI direkt ans Stations-Smart-Account zahlt. „Ladedauer" = `kW × secondsPerKw` (Zeitraffer), danach ist die Station wieder frei. Live-Fortschritt in der App und auf **`/station.html`**. |

## Projektstruktur

```
contracts/
  HeidiFranc.sol      ERC-20, 2 Dezimalst., faucet() + mint() (onlyOwner)
  HeidiVoucher.sol    LinkDrop-Gutscheine (ephemeraler Key + Empfänger-Signatur)
  HeidiCharger.sol    EV-Ladestation: startCharge(kW), status(), zahlt ans Stations-SA
index.html · station.html   Wallet + Ladestations-Simulator (zwei Vite-Entries)
src/
  user.js            gesamte Wallet-Logik
  station.js         Ladestations-Simulator (nur Lesezugriff)
  style.css          Design (Schweizer Rot/Creme/Gold)
  lib/               config · chain · smart-account · voucher · qr · store · ui
api/
  heidi.js            Vercel-Function → Express-App (rewrite /api/heidi/* in vercel.json)
  _lib/heidi-app.js   /health · /config · /geocode · /parking/start · /parking/stop · /voucher/create
server/index.js       lokaler Dev-Server um dieselbe App
scripts/
  build-logo-icons.mjs     PWA-Icons aus images/logo.png (Platzhalter wenn fehlend)
  create-voucher.mjs       CLI: Gutschein anlegen + druckbaren QR schreiben
  create-station-account.mjs  CLI: Smart Account der Ladestation erzeugen + on-chain deployen
docs/                 DEPLOYMENT · TESTPLAN · DESIGN-BRIEF
```

## Schnellstart (lokal)

```bash
npm install
cp .env.example .env       # VITE_* + Backend-Teil ausfüllen
npm run dev                # http://localhost:5174
npm run server             # Backend auf :8788 (fuer Parken-Rueckerstattung / Geocode)
```

> Frontend erwartet das Backend unter `/api/heidi` (gleiche Domain). Lokal
> `VITE_API_URL=http://localhost:8788/api/heidi` setzen.

Deployment (Remix + Vercel): **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.
Testplan: **[`docs/TESTPLAN.md`](docs/TESTPLAN.md)**.
Grafiken: **[`docs/DESIGN-BRIEF.md`](docs/DESIGN-BRIEF.md)**.

## Häufige Stolpersteine

| Symptom | Ursache / Fix |
|---|---|
| **„HTTP request failed"** beim Senden/Faucet/Einlösen | `VITE_PIMLICO_API_KEY` enthält die **Sponsorship-Policy-ID** statt des **API-Keys** (beide beginnen mit `pim_`). Pimlico antwortet `401 invalid 'apikey'`. Key aus Pimlico → **API Keys** nehmen; die Policy wirkt automatisch. |
| **Leeres UI** (nur rote Kopfzeile) auf Vercel | `VITE_*`-Variablen fehlen im Build oder wurden als **„Sensitive"** gespeichert (dann nicht im Client-Bundle). Als normale („Config") Variablen anlegen und **neu deployen** – `VITE_*` wird beim Build eingebacken. |
| Rote Notiz „Konfiguration unvollständig" | genannte `VITE_*`-Variable fehlt lokal in `.env` bzw. in Vercel. |
| **Rückerstattung schlägt fehl** („HTTP 404/500" / „Backend nicht konfiguriert") | Backend-Env (`PARK_TREASURY_PRIVATE_KEY`, `TOKEN_ADDRESS`, … – **ohne** `VITE_`) fehlt in Vercel. `…/api/heidi/health` → `{"ok":false,"missingEnv":[…]}` zeigt welche. Setzen und neu deployen. |
| `faucet: cooldown` | Test-Bezug ist einmal pro 24 h möglich. |
| `create-voucher.mjs`: „exceeds the balance" | Aussteller-EOA braucht Sepolia-**ETH** *und* **HDI** (Skript sendet normale Transaktionen, nicht gasfrei). |
| „Laden" grau / „Ladestation nicht konfiguriert" | `VITE_CHARGER_ADDRESS` fehlt im Build. Nach `HeidiCharger`-Deploy setzen und neu deployen. |
| Laden: „Station besetzt" obwohl scheinbar frei | Die vorige Ladung läuft laut Chain noch (`endsAt` in der Zukunft). „Aktualisieren" tippen oder `status()` auf Etherscan prüfen. |

## Sicherheitshinweis

Lern-/Demo-Code für **Sepolia**. `HeidiFranc` ist ungedeckt. Parken ist eine
UI-Demo (Rückerstattung kommt von einem Backend-Schlüssel, nicht trust-minimiert).
Die Ladestation ist simuliert – die „Ladedauer" ist ein Zeitraffer, es fliesst
kein Strom; nur die HDI-Zahlung ans Stations-Smart-Account ist real.
Kennzeichen/Ort/Beträge/kW landen als Klartext-Events auf einer öffentlichen Chain.
Nicht für Mainnet oder echten Wert.
