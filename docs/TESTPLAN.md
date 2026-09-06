# Testplan – Heidi Wallet (Sepolia)

_Stand: 6. September 2026._

## Vorbereitung
| # | Punkt | OK |
|---|---|---|
| V1 | `HeidiFranc` + `HeidiVoucher` deployt, Adressen notiert | ☐ |
| V2 | `HeidiVoucher.token()` == `TOKEN_ADDRESS` (Remix) | ☐ |
| V3 | Betreiber-EOA hat Sepolia-ETH **und** HDI (für Rückerstattungen + Gutschein-Erstellung) | ☐ |
| V4a | `VITE_PIMLICO_API_KEY` = **API-Key** (nicht die Policy-ID); `curl …pimlico_getUserOperationGasPrice` → `result` | ☐ |
| V4b | Pimlico Sponsorship-Policy Sepolia **aktiv**, ggf. Contract-Restriction auf Token + Voucher | ☐ |
| V5 | Backend `…/api/heidi/health` → `{"ok":true}`; Env gesetzt | ☐ |
| V6 | Frontend deployt, `…/api/heidi/config` liefert die richtigen Adressen; UI lädt (nicht nur Kopfzeile) | ☐ |
| V7 | Zwei Geräte/Profile (Handy A/B) für Sende-Tests | ☐ |
| V8 | *(für T7)* `HeidiCharger` deployt (`stationAccount()` = Station-SA), `VITE_CHARGER_ADDRESS` gesetzt | ☐ |
| V9 | *(für T8)* `HeidiBikes` deployt (`bikeCount()` / `stationCount()` > 0), `VITE_BIKES_ADDRESS` gesetzt | ☐ |

## T1 · Konto & Faucet
1. `/` öffnen → **Passkey jetzt aktivieren** → Smart-Account-Adresse erscheint.
2. Reload → Konto wird automatisch geladen (kein erneutes Onboarding).
3. „Mehr" → **100 HDI Test-Bezug** → Saldo zeigt `100.00 HDI`. Zweiter Klick
   innerhalb 24 h → Fehler „faucet: cooldown".

## T2 · Senden
1. „Senden" → Empfänger `ADDR_B` (scannen oder einfügen), Betrag per Ziffernblock
   `12.50`, Verwendungszweck „Kaffee".
2. Wisch-Slider bis Ende → Passkey-Dialog → „Zahlung gesendet – gebührenfrei!".
3. A: `-12.50`, B (nach Reload): `+12.50`. Verlauf zeigt beide Einträge.
4. Negativtest: `999999` senden ohne Deckung → Revert, kein Abzug.

## T3 · Empfangen
1. „Empfangen" → Betrag `5` eintragen → QR aktualisiert sich.
2. „Link kopieren" → Link enthält `ethereum:0x…@11155111?amount=5`.
3. Auf Handy B scannen → Sende-Screen mit vorausgefüllter Adresse + Betrag.

## T4 · Freunde & Alpen-Split
1. „Freunde" → Anna/Markus mit Adressen speichern (auch per Scan testen).
2. „Aufteilen" → Anna + Markus anhaken, Gesamtbetrag `9` → **Gleich aufteilen**
   (je 4.50) → **Gemeinsame Zahlung senden** → **eine** Tx mit zwei Transfers.

## T5 · Gutschein (LinkDrop)
1. `node scripts/create-voucher.mjs 20` → QR-PNG in `vouchers-out/` + Einlöse-Link.
2. In der App „Gutschein" → **Gutschein scannen** (QR vom Bildschirm/Ausdruck)
   → zeigt `20.00 HDI` → **Einlösen** → Passkey → Saldo `+20.00`.
3. Denselben QR erneut scannen → „bereits eingelöst oder ungültig".
4. Deeplink-Test: Einlöse-Link direkt im Browser öffnen → App springt in die
   Gutschein-Ansicht und prüft automatisch.

## T6 · Parken
*Zugriff: Home → **Unterwegs** → Parken (Untermenü). Zurück-Pfeil führt nach „Unterwegs" zurück.*
1. „Parken" → Standortfreigabe erlauben → Adresse erscheint (Reverse-Geocode).
2. Kennzeichen `LU 12345` eingeben, **Merken** → erscheint als Chip.
3. Dauer auf `30` Min → Kosten `1.50 HDI`. **Parken starten** → Transfer an die
   Park-Kasse, aktive Session-Karte mit Countdown.
4. Nach ~1 Min **Früher beenden & Rest zurück** → Backend erstattet ~`1.45 HDI`
   (1 Min genutzt), Verlauf zeigt Rückerstattung als `+`.
5. Ohne Backend erreichbar: „Beendet – Rückerstattung folgt separat", Session
   wird lokal geschlossen.

## T7 · Laden (EV-Ladestation)
Voraussetzung: `HeidiCharger` deployt, `VITE_CHARGER_ADDRESS` gesetzt, Wallet hat HDI.
1. `/station.html` öffnen → **FREI**, grünes Lämpchen, QR sichtbar, Stations-Konto + Guthaben.
2. Wallet → **Unterwegs → Laden** → zeigt **nur** „Ladesäule scannen" (keine kW-Auswahl ohne Scan).
   „Ladesäule scannen" → QR von `/station.html` scannen → Toast „Ladesäule erkannt" →
   „Station frei", vier Buttons `5 / 10 / 15 / 20 kW` mit Preis (`0.30 HDI` pro kW → 5 kW = `1.50`).
   *(Alternativ: QR mit der Handy-Kamera → Deeplink `?charge=…` öffnet die Wallet direkt in „Laden".)*
3. **10 kW** tippen → Passkey → Toast „10 kW – dein Auto wird geladen". Verlauf: `-3.00 HDI`,
   Zweck „10 kW laden". Etherscan: HDI ging an das **Stations-Smart-Account**. Auf
   `/station.html` erscheint die Ladung unter **„Letzte Ladungen"**.
4. App zeigt Fortschrittsbalken + „noch mm:ss"; `/station.html` zeigt **BESETZT** (rot,
   Puls), `%` und `kW von 10`. Nach `10 × 6 s = 60 s` → beide zeigen „abgeschlossen",
   Station wieder **FREI**.
5. Während einer laufenden Ladung erneut kW tippen → „Station ist gerade besetzt".
6. QR von `/station.html` mit dem Wallet-Scanner (FAB) scannen → springt direkt in „Laden" (freigeschaltet).
7. „Laden" verlassen und neu öffnen → wieder gesperrt, „Ladesäule scannen" nötig.
8. Ohne `VITE_CHARGER_ADDRESS`: „Laden" zeigt „Ladestation nicht konfiguriert" (kein Crash).

## T8 · Velo-Verleih
Voraussetzung: `HeidiBikes` deployt, `VITE_BIKES_ADDRESS` gesetzt, Wallet hat HDI (≥ Depot).
1. Wallet → **Unterwegs → Velo** → Liste freier Velos (Chips „Velo 1 · Bahnhof" …), Zeit-Stepper,
   Depot-Betrag (`20.00 HDI`).
2. **Velo 1** wählen, Zeit `30` Min, **Velo reservieren** → Passkey (eine UserOp
   `approve` + `rent`). Verlauf: `-20.00 HDI` „Velo 1 · 30 Min". Etherscan:
   Depot liegt im **HeidiBikes-Contract**.
3. Aktive Karte: Countdown ab `30:00`, „Depot kommt voll zurück". Rückgabe-Station-Chips.
4. **Vor** Ablauf **Dorfplatz** wählen → **Velo zurückgeben** → Passkey → Toast
   „Depot 20.00 HDI erstattet", Verlauf `+20.00` „Dorfplatz · pünktlich". Velo wieder frei an „Dorfplatz".
5. Zweite Miete, `15` Min, ~2 Min über die Zeit warten → Karte zeigt „X Min über · Strafe …
   Rückerstattung ≈ …". Zurückgeben → Depot **minus** Strafe zurück, Strafe geht an `operator`.
6. Während einer laufenden Miete `Velo` erneut öffnen → zeigt direkt die aktive Karte (kein Doppel-Mieten).
7. Ohne `VITE_BIKES_ADDRESS`: „Velo" zeigt „Velo-Verleih nicht konfiguriert" (kein Crash).

## T9 · Notfall-Konto
1. „Mehr" → **Neues Konto (Notfall)** → Bestätigen → neuer Passkey, neue Adresse,
   Saldo `0.00`. Altes Guthaben ist über diese App nicht mehr erreichbar.

## T10 · Randfälle
| Fall | Erwartet |
|---|---|
| Home: **Unterwegs** antippen | Untermenü mit Parken / Laden / Velo; Zurück-Pfeil aus einem Eintrag führt nach „Unterwegs", von dort nach Home |
| `VITE_*` fehlt | rote Notiz oben, Log-Eintrag |
| kein HTTPS/localhost | Passkey-/Kamera-Buttons ohne Wirkung |
| Standort verweigert | „Standort nicht freigegeben", Parken trotzdem möglich |
| PWA installiert (Android „App installieren" / iOS „Zum Home-Bildschirm") | Vollbild, eigenes Icon, alle Funktionen wie im Browser |

## Fehlerbilder → Ursache

| Im Log / auf dem Schirm | Ursache & Fix |
|---|---|
| **„HTTP request failed"** bei Senden / Faucet / Gutschein einlösen | `VITE_PIMLICO_API_KEY` enthält die **Sponsorship-Policy-ID** statt des **API-Keys**, oder der Key ist abgelaufen/domänenbeschränkt → Pimlico `401`. Key aus „API Keys" nehmen, ggf. Domain-Restriction lockern, neu deployen. Die neue Log-Zeile zeigt jetzt `HTTP 401 · …pimlico.io… · body=…`. |
| **Leeres UI**, nur rote Kopfzeile (Vercel) | `VITE_*` fehlen im Build oder als „Sensitive" angelegt. Als normale Variablen anlegen, `vercel --prod` neu. |
| **„Konfiguration unvollständig: VITE_…"** (rote Notiz) | genannte Variable fehlt in `.env` / Vercel. |
| Gutschein zeigt Betrag, aber **„bereits eingelöst oder ungültig"** danach | QR schon benutzt, oder `VITE_VOUCHER_ADDRESS` ≠ Contract, in dem der Gutschein erstellt wurde. |
| `faucet: cooldown` | Test-Bezug nur alle 24 h. |
| **Rückerstattung: „HTTP 404" / „HTTP 500"** bzw. „Backend nicht konfiguriert – fehlende Env: …" | Die **Backend-Env** (`PARK_TREASURY_PRIVATE_KEY`, `TOKEN_ADDRESS`, …, **ohne** `VITE_`) fehlt in Vercel → Function startet nicht. `…/api/heidi/health` zeigt `missingEnv`. Variablen setzen, `vercel --prod` neu. |
| Parken „Rückerstattung folgt separat" | Backend nicht erreichbar (`/api/heidi/health` prüfen) – Session wurde lokal beendet. |
| Laden: **„Ladestation nicht konfiguriert"** | `VITE_CHARGER_ADDRESS` fehlt im Build. Setzen, `vercel --prod` neu. |
| Laden: **„Station nicht erreichbar"** / `/station.html` rote Notiz | `VITE_CHARGER_ADDRESS` zeigt nicht auf einen `HeidiCharger`-Contract auf Sepolia, oder RPC down. Adresse + `VITE_RPC_URL` prüfen. |
| Laden: **„Station besetzt"** trotz freier Säule | Chain-`status()` sagt `endsAt` liegt noch in der Zukunft. „Aktualisieren" tippen; ggf. bis `endsAt` warten. |
| Velo: **„Velo-Verleih nicht konfiguriert"** | `VITE_BIKES_ADDRESS` fehlt im Build. Setzen, `vercel --prod` neu. |
| Velo: **„nicht dein Velo"** beim Zurückgeben | Miete läuft auf einer anderen Adresse (z. B. nach „Neues Konto"). Nur die mietende Adresse kann zurückgeben. |
| Velo: Rückerstattung kleiner als erwartet | Überzeit – Strafe `penaltyPerMinBase × Minuten über `plannedMin``, gedeckelt aufs Depot. |

## Protokoll
| Test | Datum | Ergebnis | Tx / Notiz |
|---|---|---|---|
| T1 | | | |
| T2 | | | |
| T3 | | | |
| T4 | | | |
| T5 | | | |
| T6 | | | |
| T7 (Laden) | | | |
| T8 (Velo) | | | |
| T9 | | | |
| T10 | | | |
