# Testplan – Heidi Wallet (Sepolia)

## Vorbereitung
| # | Punkt | OK |
|---|---|---|
| V1 | `HeidiFranc` + `HeidiVoucher` deployt, Adressen notiert | ☐ |
| V2 | `HeidiVoucher.token()` == `TOKEN_ADDRESS` (Remix) | ☐ |
| V3 | Betreiber-EOA hat Sepolia-ETH **und** HDI (für Rückerstattungen) | ☐ |
| V4 | Pimlico Sponsorship-Policy Sepolia **aktiv** | ☐ |
| V5 | Backend `…/api/heidi/health` → `{"ok":true}`; Env gesetzt | ☐ |
| V6 | Frontend deployt, `…/api/heidi/config` liefert die richtigen Adressen | ☐ |
| V7 | Zwei Geräte/Profile (Handy A/B) für Sende-Tests | ☐ |

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
1. „Parken" → Standortfreigabe erlauben → Adresse erscheint (Reverse-Geocode).
2. Kennzeichen `LU 12345` eingeben, **Merken** → erscheint als Chip.
3. Dauer auf `30` Min → Kosten `1.50 HDI`. **Parken starten** → Transfer an die
   Park-Kasse, aktive Session-Karte mit Countdown.
4. Nach ~1 Min **Früher beenden & Rest zurück** → Backend erstattet ~`1.45 HDI`
   (1 Min genutzt), Verlauf zeigt Rückerstattung als `+`.
5. Ohne Backend erreichbar: „Beendet – Rückerstattung folgt separat", Session
   wird lokal geschlossen.

## T7 · Notfall-Konto
1. „Mehr" → **Neues Konto (Notfall)** → Bestätigen → neuer Passkey, neue Adresse,
   Saldo `0.00`. Altes Guthaben ist über diese App nicht mehr erreichbar.

## T8 · Randfälle
| Fall | Erwartet |
|---|---|
| `VITE_*` fehlt | rote Notiz oben, Log-Eintrag |
| kein HTTPS/localhost | Passkey-/Kamera-Buttons ohne Wirkung |
| Standort verweigert | „Standort nicht freigegeben", Parken trotzdem möglich |
| PWA installiert (Android „App installieren" / iOS „Zum Home-Bildschirm") | Vollbild, eigenes Icon, alle Funktionen wie im Browser |

## Protokoll
| Test | Datum | Ergebnis | Tx / Notiz |
|---|---|---|---|
| T1 | | | |
| T2 | | | |
| T3 | | | |
| T4 | | | |
| T5 | | | |
| T6 | | | |
| T7 | | | |
| T8 | | | |
