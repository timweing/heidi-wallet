# Heidi Wallet — Design-Briefing für Grafiker:in

Neue App auf Basis des angehängten Logos und UI-Konzepts. Es ist ein
**Stablecoin-Wallet** (Token „Heidi Franc", Symbol `HDI`), Thema **Schweizer
Alpen / Heidi**. Alle Grafiken sollen die Bildsprache des Logos fortführen:
flache, illustrative Vektorgrafik, warme Erdtöne, **kein** Fotorealismus, **kein**
3D, **keine** Schrift im Bild (ausser bei OG-/Share-Bild).

> **Wichtig – Motive umstellen:** Das mitgeschickte Konzept stammt aus einem
> Vorprojekt; im Hintergrund sind noch **bhutanische Tempel**. Bitte durch
> **Schweizer Alpenmotive** ersetzen: Chalets/Bauernhäuser, Kirchtürme, Tannen,
> Kühe & Ziegen, Edelweiss, Alphütten, Bergpanorama (Matterhorn).

## Farbpalette (Richtwerte aus dem Konzept, final durch Designer)

| Rolle | Hex |
|---|---|
| Rot primär (Buttons, Marke) | `#C1121F` |
| Rot tief (Verläufe, Text auf Creme) | `#7B0D16` |
| Karten-Verlauf (Saldo) | `#A50E1A` → `#5E0A11` |
| Creme Hintergrund | `#F5ECD8` |
| Karten-Creme | `#FCF6EA` |
| Tinte / Text | `#3E0A0D` |
| Text gedämpft | `#8C6F5A` |
| Gold-Akzent (runde Quick-Action-Buttons) | `#C9A227` (hell `#E3C878`) |
| Weiss (Schweizerkreuz, Kontrast) | `#FFFFFF` |
| Status „erfolgreich / verifiziert" | gedämpftes Alpengrün `#3E7C59` |

Kein Dark Mode.

---

## Assets

### 1 · App-Icon (Priorität hoch)
- **Inhalt:** die **Matterhorn-Silhouette mit weissem Schweizerkreuz** aus dem
  Logo, als **eigenständige Marke** (ohne Wortmarke, ohne „Wallet"-Text, ohne die
  geschwungene Spur links – nur der markante Berg mit Kreuz).
- **Format:** 1 Master-PNG **1024 × 1024 px**, Motiv mittig mit ~12 % Rand
  (Sicherheitszone fürs Masken). Hintergrund: Creme `#F5ECD8` **oder** transparent.
- Wir generieren daraus 512/192/maskable/Apple-Touch automatisch.
- **Dateiname:** `logo.png` (in `images/`)

### 2 · Favicon-Motiv (vereinfacht)
- **Inhalt:** dasselbe Berg-und-Kreuz-Zeichen, **zweifarbig flach** (Rot-Silhouette
  + weisses Kreuz), ohne feine Details.
- **Format:** SVG bevorzugt; alternativ PNG **256 × 256 px**, transparent.
- **Dateiname:** `favicon-mark.svg` (bzw. `.png`)

### 3 · Saldo-Karten-Hintergrund („Alpenguthaben")
- **Inhalt:** tiefroter Verlauf, darin sehr dezent eine **Matterhorn-Silhouette**
  und ein **halbtransparentes Schweizerkreuz** als Wasserzeichen. Weiche Formen,
  keine harten Kanten.
- **Sicherheitszone:** obere zwei Drittel + linke Hälfte müssen **durchgehend
  dunkelrot / kontrastarm** bleiben (dort steht weisser Text: „Alpenguthaben",
  grosser Betrag, „User"-Badge). Helligkeit darf nach rechts unten zunehmen.
- **Format:** JPG, **2400 × 1200 px** (Verhältnis 2:1), sRGB. Wird per
  `background-size: cover` eingesetzt (kann seitlich leicht beschnitten werden).
- **Dateiname:** `balance-bg.jpg`

### 4 · Onboarding-Illustration („Zoll-Setup" / Passkey)
- **Inhalt:** ein **Vorhängeschloss mit Fingerabdruck**, eingebettet in eine
  Alpenszene (Berge, Chalet, Tannen), rot/gold auf Creme. Freundlich, „sicher &
  gemütlich". Keine technischen Blockchain-Symbole.
- **Format:** PNG **640 × 640 px**, transparenter Hintergrund.
- **Dateiname:** `onboarding-hero.png`

### 5 · Leerzustand-Illustrationen (5 Stück)
Jeweils PNG **240 × 240 px**, transparent, **ohne Text im Bild** (die App setzt
die deutsche Bildunterschrift selbst):

| Datei | Motiv | Kontext |
|---|---|---|
| `empty-activity.png` | leere Milchkanne oder Kuhglocke | „Noch keine Aktivität" |
| `empty-friends.png` | zwei Alpenkinder-Silhouetten (Heidi & Peter) bzw. kleine Gruppe | „Noch keine Freunde" |
| `empty-split.png` | Alpen-Wegweiser / Wanderweg-Markierung | „Noch keine Empfänger" (Split) |
| `empty-parking.png` | kleines Auto neben einer Tanne / Parkschild mit Edelweiss | „Kein Parkvorgang aktiv" |
| `empty-voucher.png` | gefalteter Papiergutschein / goldenes Alpen-Ticket | „Kein Gutschein gescannt" |

### 6 · Parken-Kopfbild
- **Inhalt:** ein Auto, das neben einem Chalet parkt, Bergpanorama dahinter.
- **Format:** PNG **640 × 400 px**, transparent.
- **Dateiname:** `parking-hero.png`

### 7 · Gutschein-Illustration
- **Inhalt:** ein **physischer Papiergutschein** mit verziertem Alpen-Rahmen,
  einem angedeuteten QR-Feld und einem „Heidi"-Siegel/Stempel. Vermittelt
  „echtes Papier in der Hand".
- **Format:** PNG **640 × 400 px**, transparent.
- **Dateiname:** `voucher-hero.png`

### 8 · Fest-Girlande (Deko, „Empfangen"-Screen)
- **Inhalt:** eine horizontale **Wimpelkette / Alpen-Girlande** (rot/creme,
  wie im Konzept über dem QR-Code).
- **Format:** PNG **1600 × 220 px**, transparent, links/rechts ausblendend.
- **Dateiname:** `bunting.png`

### 9 · QR-Center-Logo
- **Inhalt:** kleines quadratisches Berg-und-Kreuz-Zeichen (wie Favicon), wird
  mittig in generierte QR-Codes gelegt.
- **Format:** PNG **200 × 200 px**, transparent.
- **Dateiname:** `qr-mark.png`

### 10 · Social-Share-Bild (Open Graph)
- **Inhalt:** volle Wortmarke — Berg-und-Kreuz-Zeichen + „Heidi Wallet" +
  Tagline (z. B. „Alpenguthaben für alle" / „Mindful Community Wallet"),
  zentriert auf Creme.
- **Format:** exakt **1200 × 630 px**, PNG oder JPG.
- **Dateiname:** `og-image.png`

---

## Übergabe
- Alles in **sRGB**. Dateien in den Ordner `images/` legen (grosse Originale)
  bzw. `public/` — wir optimieren Grösse/Kompression selbst.
- Reihenfolge: erst **App-Icon (1)** und **Saldo-Hintergrund (3)**, Rest kann folgen.
