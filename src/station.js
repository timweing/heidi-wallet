// ============================================================================
//  Heidi Ladestation – Simulator-Seite (/station)
//  Liest den HeidiCharger-Contract und zeigt Status + Ladefortschritt.
//  Reiner Lesezugriff, kein Konto, kein Server-Zustand.
// ============================================================================

import { formatUnits } from 'viem'
import { CONFIG } from './lib/config.js'
import { readChargerMeta, readChargerStatus, readBalance, readChargeLog, getAddress } from './lib/chain.js'
import { toQRDataURL } from './lib/qr.js'
import { $, el, short, fmtDate, explorerAddr, explorerTx } from './lib/ui.js'

const fmt = (b) => Number(formatUnits(b ?? 0n, CONFIG.DECIMALS)).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mmss = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

let meta = null
let qrShown = false

function warn(msg) {
  const w = $('#st-warn')
  w.hidden = false
  w.textContent = msg
}

function render(st) {
  const now = Math.floor(Date.now() / 1000)
  const charging = !st.free
  const left = Math.max(0, st.endsAt - now)

  $('#st-lamp').className = 'station-lamp ' + (charging ? 'busy' : 'free')
  $('#st-tag').textContent = charging ? 'BESETZT' : 'FREI'
  $('#st-tag').className = 'role-tag ' + (charging ? 'tag-busy' : 'tag-free')

  const body = $('#st-body')
  if (!charging) {
    $('#st-status').textContent = 'Station frei – bereit zum Laden'
    body.replaceChildren(
      el('p', { class: 'hint', style: 'text-align:center' },
        `${fmt(meta.pricePerKwBase)} ${CONFIG.SYMBOL} pro kW · 5 / 10 / 15 / 20 kW`),
    )
    showQR()
    return
  }

  $('#st-qr').hidden = true
  const total = Math.max(1, st.endsAt - st.startedAt)
  const pct = Math.min(100, Math.round(((total - left) / total) * 100))
  const kwNow = Math.min(st.kW, Math.round((st.kW * (total - left)) / total))
  const done = left === 0
  $('#st-status').textContent = done ? 'Ladung abgeschlossen ✓' : `Lädt – noch ${mmss(left)}`
  const art = el('img', { src: done ? '/charge-done.png' : '/charge-car.png', alt: '', class: 'charge-car' })
  art.addEventListener('error', () => art.remove())
  body.replaceChildren(
    art,
    el('div', { class: 'charge-gauge big' }, el('div', { class: 'charge-gauge-fill', style: `width:${pct}%` })),
    el('div', { class: 'charge-stat' },
      el('div', {}, el('b', {}, `${kwNow} / ${st.kW} kW`)),
      el('div', {}, `${pct}%`)),
    el('p', { class: 'hint', style: 'text-align:center' },
      `Kunde ${short(st.user)} · ${fmt(st.paid)} ${CONFIG.SYMBOL} bezahlt`),
  )
}

async function showQR() {
  $('#st-qr').hidden = false
  if (qrShown) return
  try {
    const url = `${location.origin}/?charge=${getAddress(CONFIG.CHARGER_ADDRESS)}`
    $('#st-qr-img').src = await toQRDataURL(url)
    qrShown = true
  } catch {}
}

async function loadLog() {
  try {
    const rows = await readChargeLog({ limit: 8 })
    const box = $('#st-log')
    if (!rows.length) {
      box.replaceChildren(el('div', { class: 'empty' }, 'Noch keine Ladungen.'))
      return
    }
    box.replaceChildren(...rows.map((r) => {
      const sub = el('div', { class: 'activity-sub' }, `${short(r.user)} · ${fmtDate(r.startedAt)} · `)
      sub.append(el('a', { href: explorerTx(r.txHash), target: '_blank', rel: 'noreferrer' }, 'Tx'))
      return el('div', { class: 'activity-row' },
        el('div', { class: 'avatar' }, '⚡'),
        el('div', { class: 'activity-main' }, el('div', { class: 'activity-name' }, `${r.kW} kW`), sub),
        el('div', { class: 'activity-amount out' }, `${fmt(r.paid)} ${CONFIG.SYMBOL}`))
    }))
  } catch {}
}

async function tick() {
  try {
    if (!meta) meta = await readChargerMeta()
    const st = await readChargerStatus()
    render(st)
    readBalance(meta.stationAccount)
      .then((b) => { $('#st-bal').textContent = `${fmt(b)} ${CONFIG.SYMBOL}` })
      .catch(() => {})
  } catch (e) {
    warn('Station nicht erreichbar: ' + (e?.shortMessage || e?.message || e))
  }
  setTimeout(tick, 2500)
}

;(async function boot() {
  if (!CONFIG.CHARGER_ADDRESS) {
    warn('VITE_CHARGER_ADDRESS ist nicht gesetzt – Ladestation nicht konfiguriert.')
    $('#st-status').textContent = 'Nicht konfiguriert'
    return
  }
  const c = getAddress(CONFIG.CHARGER_ADDRESS)
  $('#st-contract').replaceChildren(el('a', { href: explorerAddr(c), target: '_blank', rel: 'noreferrer' }, short(c)))
  try {
    meta = await readChargerMeta()
    $('#st-acc').replaceChildren(el('a', { href: explorerAddr(meta.stationAccount), target: '_blank', rel: 'noreferrer' }, short(meta.stationAccount)))
  } catch (e) {
    warn('Contract nicht lesbar: ' + (e?.shortMessage || e?.message || e))
  }
  tick()
  loadLog()
  setInterval(loadLog, 15000)
})()
