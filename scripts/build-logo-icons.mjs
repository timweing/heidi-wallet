// Erzeugt die PWA-Icons + favicon aus images/logo.png (Berg-und-Kreuz-Marke,
// quadratisch). Fehlt die Datei, wird eine schlichte Platzhalter-Marke
// (rotes Feld + weisses Schweizerkreuz) gezeichnet, damit der Build laeuft.
// Reiner Node-Code, kein sharp/ImageMagick noetig.
//
//   node scripts/build-logo-icons.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { inflateSync, deflateSync, crc32 } from 'node:zlib'

const SRC = new URL('../images/logo.png', import.meta.url)
const OUT = (name) => new URL(`../public/${name}`, import.meta.url)

// ---------------------------------------------------------------- PNG decode (8-bit RGB/RGBA)

function decodePNG(buf) {
  let off = 8
  let width, height, bitDepth, colorType
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Nicht unterstuetztes PNG (bitDepth=${bitDepth}, colorType=${colorType}). Erwartet 8-bit RGB/RGBA.`)
  }
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  let prevRow = Buffer.alloc(stride)
  let srcOff = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[srcOff]; srcOff += 1
    const row = raw.subarray(srcOff, srcOff + stride); srcOff += stride
    const outRow = pixels.subarray(y * stride, y * stride + stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? outRow[x - channels] : 0
      const b = prevRow[x]
      const c = x >= channels ? prevRow[x - channels] : 0
      let val = row[x]
      if (filter === 1) val = (val + a) & 0xff
      else if (filter === 2) val = (val + b) & 0xff
      else if (filter === 3) val = (val + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
      outRow[x] = val
    }
    prevRow = outRow
  }
  return { width, height, channels, pixels }
}
function getPx(img, x, y) {
  x = Math.max(0, Math.min(img.width - 1, x))
  y = Math.max(0, Math.min(img.height - 1, y))
  const o = (y * img.width + x) * img.channels
  return [img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]]
}

// ---------------------------------------------------------------- PNG encode (RGB)

function encodePNG(width, height, getPixel) {
  const stride = 1 + width * 3
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(x, y)
      const o = y * stride + 1 + x * 3
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function encodePNG_RGBA(width, height, getPixel) {
  const stride = 1 + width * 4
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y)
      const o = y * stride + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------- Motiv-Quelle

const RED = [0xc1, 0x12, 0x1f]
const CREAM = [0xf5, 0xec, 0xd8]
const WHITE = [0xff, 0xff, 0xff]

let img = null
if (existsSync(SRC)) {
  img = decodePNG(readFileSync(SRC))
  console.log(`Quelle: images/logo.png (${img.width}x${img.height})`)
} else {
  console.warn('images/logo.png fehlt – erzeuge Platzhalter-Marke (rotes Feld + Schweizerkreuz).')
}
const bg = img ? getPx(img, 2, 2) : CREAM

// Schweizerkreuz auf rotem Grund (Platzhalter), normiert auf 0..1.
function placeholderPixel(u, v) {
  const cx = 0.5, cy = 0.5
  const armW = 0.14, armL = 0.34
  const inCross =
    (Math.abs(u - cx) < armW && Math.abs(v - cy) < armL) ||
    (Math.abs(v - cy) < armW && Math.abs(u - cx) < armL)
  const inField = Math.abs(u - cx) < 0.42 && Math.abs(v - cy) < 0.42
  if (inCross) return WHITE
  if (inField) return RED
  return CREAM
}

function sample(x, y, sizeDst, extraPad) {
  const inner = sizeDst * (1 - extraPad)
  const off = (sizeDst - inner) / 2
  if (x < off || y < off || x >= off + inner || y >= off + inner) return bg
  const u = (x - off) / inner
  const v = (y - off) / inner
  if (!img) return placeholderPixel(u, v)
  const side = Math.max(img.width, img.height)
  const sx = u * side, sy = v * side
  const step = Math.max(1, side / sizeDst / 2)
  let r = 0, g = 0, b = 0, n = 0
  for (let dy = -step; dy <= step; dy += step)
    for (let dx = -step; dx <= step; dx += step) {
      const [pr, pg, pb] = getPx(img, Math.round(sx + dx), Math.round(sy + dy))
      r += pr; g += pg; b += pb; n++
    }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

function writeIcon(name, size, extraPad = 0) {
  writeFileSync(OUT(name), encodePNG(size, size, (x, y) => sample(x, y, size, extraPad)))
  console.log(`geschrieben: public/${name} (${size}x${size})`)
}

writeIcon('pwa-512.png', 512, 0.02)
writeIcon('pwa-192.png', 192, 0.02)
writeIcon('apple-touch-icon.png', 180, 0.04)
writeIcon('pwa-maskable-512.png', 512, 0.24)

// favicon.png / qr-mark.png liefert der:die Grafiker:in direkt in public/ (nicht generiert).
// Fehlen sie, wird eine einfache freigestellte Marke als Fallback erzeugt.
for (const [name, size] of [['favicon.png', 256], ['qr-mark.png', 200]]) {
  if (existsSync(OUT(name))) continue
  writeFileSync(OUT(name), encodePNG_RGBA(size, size, (x, y) => {
    const [r, g, b] = sample(x, y, size, 0.02)
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2])
    return [r, g, b, Math.max(0, Math.min(255, Math.round((d / 30) * 255)))]
  }))
  console.log(`geschrieben (Fallback): public/${name}`)
}
