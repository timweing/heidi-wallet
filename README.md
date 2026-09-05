# Heidi Wallet

Stablecoin-Wallet (Token **Heidi Franc**, `HDI`, 2 Nachkommastellen) mit
Passkey-Konto, gasfreien Transaktionen, physischen **Gutscheinen** und einer
**Parken**-Funktion. Basiert auf dem Aufbau von `../11_ERC4337`, **ohne**
Admin-GUI, **ohne** Whitelist/Registry/Recovery-Modul – ein Transfer gelingt,
solange das Guthaben reicht.

```
 Passkey (WebAuthn)
   │  signiert UserOperation
   ▼
 Coinbase Smart Account (Single-Owner)  ── gasfrei via Pimlico Paymaster ──▶ Sepolia
   │
   ├─ HeidiFranc (ERC-20, 2 Dezimalst.)   transfer · faucet() · mint() (nur Owner)
   └─ HeidiVoucher (LinkDrop)             createVoucher() · claim(ephemeral, recipient, sig)

 Backend (api/heidi/* bzw. server/)   Reverse-Geocoding · Park-Rückerstattung · Gutschein-Erstellung
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

## Projektstruktur

```
contracts/
  HeidiFranc.sol      ERC-20, 2 Dezimalst., faucet() + mint() (onlyOwner)
  HeidiVoucher.sol    LinkDrop-Gutscheine (ephemeraler Key + Empfänger-Signatur)
src/
  user.js            gesamte Wallet-Logik
  style.css          Design (Schweizer Rot/Creme/Gold)
  lib/               config · chain · smart-account · voucher · qr · store · ui
api/
  heidi/[...path].js  Vercel-Function → Express-App
  _lib/heidi-app.js   /config · /geocode · /parking/stop · /voucher/create
server/index.js       lokaler Dev-Server um dieselbe App
scripts/
  build-logo-icons.mjs  PWA-Icons aus images/logo.png (Platzhalter wenn fehlend)
  create-voucher.mjs    CLI: Gutschein anlegen + druckbaren QR schreiben
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

## Sicherheitshinweis

Lern-/Demo-Code für **Sepolia**. `HeidiFranc` ist ungedeckt. Parken ist eine
UI-Demo (Rückerstattung kommt von einem Backend-Schlüssel, nicht trust-minimiert).
Kennzeichen/Ort/Beträge landen als Klartext-Events auf einer öffentlichen Chain.
Nicht für Mainnet oder echten Wert.
