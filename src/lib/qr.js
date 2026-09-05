// QR erzeugen (qrcode) + Kamera-Scan (jsqr) – beide erst bei Bedarf geladen.

export async function toQRDataURL(text) {
  const { default: QRCode } = await import('qrcode')
  return QRCode.toDataURL(text, { width: 300, margin: 1, errorCorrectionLevel: 'M' })
}

// Erkennt zwei QR-Typen:
//  - Adresse:  "ethereum:0x..@11155111?amount=1&label=Bob"  oder nackte 0x-Adresse
//  - Gutschein: URL mit ?redeem=<64hex> / #k=<64hex>  oder  "heidi-voucher:<64hex>"
export function parseScan(text) {
  const s = String(text)
  const vk = s.match(/(?:[?&#]k=|[?&]redeem=|heidi-voucher:)(0x)?([0-9a-fA-F]{64})/)
  if (vk) return { kind: 'voucher', privKey: '0x' + vk[2].toLowerCase() }

  const m = s.match(/0x[a-fA-F0-9]{40}/)
  if (m) {
    const label = s.match(/[?&]label=([^&]+)/i)
    const amount = s.match(/[?&]amount=([0-9]*\.?[0-9]+)/i)
    return { kind: 'address', address: m[0], label: label ? decodeURIComponent(label[1]) : null, amount: amount ? amount[1] : null }
  }
  return null
}

export function buildAddressURI(address, { label, amount } = {}) {
  let uri = `ethereum:${address}@11155111`
  const q = []
  if (amount) q.push(`amount=${amount}`)
  if (label) q.push(`label=${encodeURIComponent(label)}`)
  return q.length ? `${uri}?${q.join('&')}` : uri
}

export function buildVoucherURL(privKey) {
  const origin = typeof location !== 'undefined' ? location.origin : ''
  return `${origin}/?redeem=${privKey.replace(/^0x/, '')}`
}

// Scanner-Widget: rendert ein <video> in `mount`, ruft onResult(parsed) genau einmal.
export function createScanner(mount) {
  let stream = null
  let raf = 0
  let video = null
  let active = false

  async function start(onResult) {
    if (active) return
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Keine Kamera-API (HTTPS noetig)')
    video = document.createElement('video')
    video.playsInline = true
    video.muted = true
    mount.replaceChildren(video)
    mount.hidden = false
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    video.srcObject = stream
    await video.play().catch(() => {})
    active = true

    const { default: jsQR } = await import('jsqr')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const tick = () => {
      if (!active) return
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        const parsed = code && parseScan(code.data)
        if (parsed) {
          stop()
          onResult(parsed)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    active = false
    cancelAnimationFrame(raf)
    raf = 0
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
    }
    if (video) video.srcObject = null
    mount.hidden = true
    mount.replaceChildren()
  }

  return { start, stop, get active() { return active } }
}
