// ============================================================================
//  Heidi Wallet – Frontend
//  Passkey -> Coinbase Smart Account (Single-Owner) -> Pimlico (gasfrei)
//  Senden / Empfangen (QR) / Freunde / Alpen-Split / Gutschein / Parken / Laden.
// ============================================================================

import { parseUnits, formatUnits, isAddress } from 'viem'
import { CONFIG, configProblems } from './lib/config.js'
import { tokenAbi, voucherAbi, chargerAbi, bikesAbi, getAddress, readBalance, readTokenMeta, isDeployed, readTokenHistory, readVoucher, readChargerMeta, readChargerStatus, readBikesState } from './lib/chain.js'
import { hasStoredAccount, createPasskeyAccount, buildAccount, sendCalls, forgetAccount } from './lib/smart-account.js'
import { friendsStore, historyStore, platesStore, parkingStore } from './lib/store.js'
import { toQRDataURL, buildAddressURI, createScanner } from './lib/qr.js'
import { buildVoucherClaim, voucherAddressFromKey } from './lib/voucher.js'
import { $, $$, el, short, fmtDate, explorerAddr, explorerTx, copy, toast, initLog, errText, errDetail, vibrate } from './lib/ui.js'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true, onOfflineReady: () => toast('App offline nutzbar') })

const log = initLog($('#log'))
let sa = null
let meta = { symbol: CONFIG.SYMBOL, decimals: CONFIG.DECIMALS }
let sendAmount = '0'
let splitRows = []
let parkDur = 60
let parkGeo = { lat: null, lng: null, name: 'Standort wird ermittelt…' }
let parkTimer = 0
let pendingVoucherKey = null
let chargerMeta = null
let chargeTimer = 0
let chargeUnlocked = false // erst nach Scan des Ladesäulen-QR (oder ?charge=-Deeplink)
let bikeDur = 30
let bikeSel = null
let returnStationSel = null
let bikeTimer = 0

const KW_OPTIONS = [5, 10, 15, 20]
const TOKEN = () => getAddress(CONFIG.TOKEN_ADDRESS)
const VOUCHER = () => getAddress(CONFIG.VOUCHER_ADDRESS)
const CHARGER = () => getAddress(CONFIG.CHARGER_ADDRESS)
const BIKES = () => getAddress(CONFIG.BIKES_ADDRESS)
const mmss = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`
const bnMin = (a, b) => (a < b ? a : b)
const fmt = (base) => Number(formatUnits(base, meta.decimals)).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseAmt = (s) => parseUnits(String(s), meta.decimals)

// ---------------------------------------------------------------- helpers

function nameFor(a) {
  return friendsStore.all().find((x) => x.address?.toLowerCase() === a?.toLowerCase())?.name || null
}
function initials(v) {
  if (!v) return '?'
  if (v.startsWith('0x')) return v.slice(2, 4).toUpperCase()
  return v.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}
function addrChip(addr, { link = true } = {}) {
  const inner = link
    ? el('a', { href: explorerAddr(addr), target: '_blank', rel: 'noreferrer' }, short(addr))
    : el('span', {}, short(addr))
  return el('span', { class: 'addr-chip' }, inner, el('button', { title: 'Kopieren', onclick: () => copy(addr) }, '⧉'))
}
async function busy(btn, fn) {
  const els = (Array.isArray(btn) ? btn : [btn]).filter(Boolean)
  els.forEach((b) => (b.disabled = true))
  try {
    return await fn()
  } catch (e) {
    console.error('[busy]', e)
    log.err(errDetail(e))
    toast(errText(e), 'err')
  } finally {
    els.forEach((b) => (b.disabled = false))
  }
}
function resolveRecipient(raw) {
  const v = String(raw || '').trim()
  if (isAddress(v)) return getAddress(v)
  const f = friendsStore.all().find((x) => x.name.toLowerCase() === v.toLowerCase())
  if (f && isAddress(f.address)) return getAddress(f.address)
  throw new Error(`Empfänger unbekannt: ${v}`)
}
async function api(path, opts = {}) {
  const res = await fetch(`${CONFIG.API_URL}${path}`, { headers: { 'content-type': 'application/json' }, ...opts })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
function emptyState(img, text) {
  return el('div', { class: 'empty-illustrated' },
    el('img', { src: img, alt: '', onerror: (e) => (e.target.style.display = 'none') }), el('div', {}, text))
}

// ---------------------------------------------------------------- navigation

const TITLES = { send: 'Senden', receive: 'Empfangen', split: 'Alpen-Split', parking: 'Parken', voucher: 'Gutschein', charge: 'Laden', bike: 'Velo', friends: 'Freunde', history: 'Verlauf', settings: 'Mehr' }

function showView(name) {
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name))
  $$('.bottom-nav .nav-item[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === name))
  const isHome = name === 'home'
  $('#brand-home').hidden = !isHome
  $('#view-title').hidden = isHome
  $('#view-title').textContent = TITLES[name] || ''
  $('#nav-back').hidden = isHome
  window.scrollTo(0, 0)

  if (name === 'home') renderActivity()
  if (name === 'friends') renderFriends()
  if (name === 'send') renderSendFriends()
  if (name === 'receive') updateQR().catch(() => {})
  if (name === 'split') refreshSplitUI()
  if (name === 'history') loadHistory().catch((e) => log.err(errText(e)))
  if (name === 'parking') renderParking()
  if (name === 'voucher') resetVoucherView()
  if (name === 'charge') {
    renderCharge().catch((e) => log.err(errText(e)))
  } else {
    clearTimeout(chargeTimer)
    chargeScanner.stop()
    chargeUnlocked = false // beim Verlassen wieder sperren – Scan an der Säule nötig
  }
  if (name === 'bike') renderBike().catch((e) => log.err(errText(e)))
  else clearTimeout(bikeTimer)
}

// ---------------------------------------------------------------- account

async function initAccount() {
  if (!sa) sa = await buildAccount()
  try {
    meta = await readTokenMeta()
  } catch {}
  $('#sym').textContent = meta.symbol
  $('#send-sym').textContent = meta.symbol
  $('#onboarding').hidden = true
  $('#views').hidden = false
  $('#bottom-nav').hidden = false
  $('#acc-chip-home').replaceChildren(addrChip(sa.account.address))
  $('#set-addr').textContent = sa.account.address
  // Saldo-Kartenbild nur einblenden, wenn vorhanden
  const bgImg = new Image()
  bgImg.onload = () => $('#balance-card').classList.add('has-bg')
  bgImg.src = '/balance-bg.jpg'
  log.ok(`Konto: ${sa.account.address}`)
  showView('home')
  await refresh()

  // Gutschein-Deeplink (?redeem=...)
  const m = location.search.match(/[?&]redeem=(0x)?([0-9a-fA-F]{64})/)
  if (m) {
    history.replaceState(null, '', location.pathname)
    showView('voucher')
    handleVoucher('0x' + m[2]).catch((e) => toast(errText(e), 'err'))
  }

  // Ladestations-Deeplink (?charge=0x...) – zählt als Scan an der Säule
  if (/[?&]charge=0x[0-9a-fA-F]{40}/.test(location.search)) {
    history.replaceState(null, '', location.pathname)
    chargeUnlocked = true
    showView('charge')
  }
}

async function refresh() {
  if (!sa) return
  const a = sa.account.address
  const [bal, deployed] = await Promise.all([readBalance(a).catch(() => 0n), isDeployed(a).catch(() => false)])
  $('#bal').textContent = fmt(bal)
  $('#bal-sub').textContent = `≈ CHF ${fmt(bal)} · Heidi Franc`
  $('#set-onchain').textContent = deployed ? 'ja' : 'noch nicht (Deploy bei 1. Transaktion)'
}

function forgetAndShowOnboarding() {
  forgetAccount()
  sa = null
  $('#views').hidden = true
  $('#bottom-nav').hidden = true
  $('#onboarding').hidden = false
  $('#ob-success').hidden = true
}

// ---------------------------------------------------------------- Home activity

function activityRow({ name, address, purpose, amount, ts, direction = 'out', txHash }) {
  const sub = el('div', { class: 'activity-sub' }, [purpose, fmtDate(ts)].filter(Boolean).join(' · '))
  if (txHash) sub.append(' · ', el('a', { href: explorerTx(txHash), target: '_blank', rel: 'noreferrer' }, 'Tx'))
  return el('div', { class: 'activity-row' },
    el('div', { class: 'avatar' }, initials(name || address)),
    el('div', { class: 'activity-main' }, el('div', { class: 'activity-name' }, name || short(address)), sub),
    el('div', { class: `activity-amount ${direction}` }, `${direction === 'in' ? '+' : '-'}${amount} ${meta.symbol}`),
  )
}
function renderActivity() {
  const box = $('#activity-feed')
  const items = historyStore.all().slice(0, 6)
  box.replaceChildren(
    items.length
      ? el('div', {}, ...items.map((i) => activityRow(i)))
      : emptyState('/empty-activity.png', 'Noch keine Aktivität – sende oder empfange HDI.'),
  )
}
async function loadHistory() {
  const box = $('#history-feed')
  if (!sa) return
  box.replaceChildren(el('div', { class: 'empty' }, 'Lade Verlauf …'))
  try {
    const chain = await readTokenHistory(sa.account.address, { limit: 30 })
    if (!chain.length) {
      box.replaceChildren(emptyState('/empty-activity.png', 'Noch keine Transaktionen gefunden.'))
      return
    }
    box.replaceChildren(...chain.map((x) => activityRow({
      name: nameFor(x.counterparty),
      address: x.counterparty,
      purpose: historyStore.purposeFor(x.txHash),
      amount: fmt(x.amount),
      ts: x.ts,
      direction: x.direction,
      txHash: x.txHash,
    })))
  } catch (e) {
    box.replaceChildren(el('div', { class: 'empty' }, `Verlauf nicht ladbar: ${errText(e)}`))
  }
}

// ---------------------------------------------------------------- Receive

async function updateQR() {
  if (!sa) return ''
  const amount = $('#recv-amount').value.trim()
  const uri = buildAddressURI(sa.account.address, { amount: amount || undefined })
  $('#qr-img').src = await toQRDataURL(uri)
  $('#qr-chip').replaceChildren(addrChip(sa.account.address, { link: false }))
  return uri
}

// ---------------------------------------------------------------- Send

function setSendAmount(v) {
  sendAmount = String(v || '0')
  $('#send-amount-display').textContent = sendAmount
}
function pressKey(k) {
  if (k === 'back') sendAmount = sendAmount.length > 1 ? sendAmount.slice(0, -1) : '0'
  else if (k === '.') { if (!sendAmount.includes('.')) sendAmount += '.' }
  else sendAmount = (sendAmount === '0' ? k : sendAmount + k).slice(0, 12)
  // auf 2 Nachkommastellen begrenzen
  const dot = sendAmount.indexOf('.')
  if (dot >= 0) sendAmount = sendAmount.slice(0, dot + 1 + meta.decimals)
  $('#send-amount-display').textContent = sendAmount
}
function renderSendFriends() {
  $('#send-friends').replaceChildren(...friendsStore.all().map((f) => {
    const btn = el('button', { class: 'chip', type: 'button' }, el('span', { class: 'avatar' }, initials(f.name)), f.name)
    btn.addEventListener('click', () => { $('#send-to').value = f.address; toast(`${f.name} ausgewählt`) })
    return btn
  }))
}
async function confirmSend() {
  try {
    if (!sa) throw new Error('Kein Konto')
    const to = resolveRecipient($('#send-to').value)
    if (!(Number(sendAmount) > 0)) throw new Error('Betrag eingeben')
    const value = parseAmt(sendAmount)
    const purpose = $('#send-purpose').value.trim()
    $('#send-swipe-label').textContent = 'Signiere mit Passkey …'
    toast('Signiere mit Passkey …')
    log.line(`Sende ${sendAmount} ${meta.symbol} → ${short(to)} …`)
    const r = await sendCalls(sa.client, [{ to: TOKEN(), abi: tokenAbi, functionName: 'transfer', args: [to, value] }])
    historyStore.add({ direction: 'out', address: to, name: nameFor(to), amount: fmt(value), purpose, txHash: r.txHash })
    log.ok(`Gesendet · Block ${r.block} · <a href="${explorerTx(r.txHash)}" target="_blank" rel="noreferrer">Tx</a> · Gas gesponsert`)
    vibrate([15, 30, 15])
    toast('Zahlung gesendet – gebührenfrei!', 'ok')
    $('#send-to').value = ''
    $('#send-purpose').value = ''
    setSendAmount('0')
    await refresh()
    showView('home')
  } catch (e) {
    log.err(errText(e))
    toast(errText(e), 'err')
  } finally {
    $('#send-swipe-label').textContent = 'Wischen zum Bestätigen via Passkey'
  }
}
function setupSwipe(trackEl, handleEl, fillEl, onConfirm) {
  let dragging = false
  let originLeft = 0
  let maxX = 0
  const bounds = () => { maxX = Math.max(0, trackEl.clientWidth - handleEl.offsetWidth - 8) }
  const setX = (x) => {
    x = Math.max(0, Math.min(maxX, x))
    handleEl.style.transform = `translateX(${x}px)`
    fillEl.style.width = `${x + handleEl.offsetWidth}px`
    return x
  }
  const reset = () => setX(0)
  function down(e) {
    if (trackEl.classList.contains('busy')) return
    dragging = true
    bounds()
    originLeft = (e.touches ? e.touches[0].clientX : e.clientX) - (handleEl.getBoundingClientRect().left - trackEl.getBoundingClientRect().left)
    handleEl.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    if (!dragging) return
    setX((e.touches ? e.touches[0].clientX : e.clientX) - originLeft)
  }
  async function up() {
    if (!dragging) return
    dragging = false
    const x = handleEl.getBoundingClientRect().left - trackEl.getBoundingClientRect().left
    if (maxX > 0 && x / maxX > 0.75) {
      trackEl.classList.add('busy')
      setX(maxX)
      await onConfirm()
      trackEl.classList.remove('busy')
      reset()
    } else reset()
  }
  handleEl.addEventListener('pointerdown', down)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('resize', bounds)
  bounds()
}

// ---------------------------------------------------------------- Split

function refreshSplitUI() {
  renderSplitFriends()
  renderSplit()
}
function renderSplitFriends() {
  const list = friendsStore.all()
  const box = $('#split-friends')
  if (!list.length) {
    box.replaceChildren(el('div', { class: 'empty' }, 'Noch keine Freunde – unter „Freunde" hinzufügen.'))
    return
  }
  box.replaceChildren(...list.map((f) => {
    const checked = splitRows.some((r) => r.address.toLowerCase() === f.address.toLowerCase())
    const cb = el('input', { type: 'checkbox' })
    cb.checked = checked
    cb.addEventListener('change', () => {
      if (cb.checked) addToSplit(f)
      else {
        splitRows = splitRows.filter((r) => r.address.toLowerCase() !== f.address.toLowerCase())
        renderSplit()
      }
    })
    return el('label', { class: 'check-row' }, cb, el('span', { class: 'avatar' }, initials(f.name)), el('span', { class: 'name' }, f.name))
  }))
}
function renderSplit() {
  const box = $('#split-list')
  if (!splitRows.length) {
    box.replaceChildren(emptyState('/empty-split.png', 'Noch keine Empfänger ausgewählt.'))
    $('#split-sum').textContent = ''
    return
  }
  const table = el('table')
  table.append(el('thead', {}, el('tr', {}, el('th', {}, 'Empfänger'), el('th', {}, 'Betrag'), el('th', {}, ''))))
  const tb = el('tbody')
  splitRows.forEach((r, i) => {
    const amtIn = el('input', { type: 'number', min: '0', step: '0.01', value: r.amount ?? '', style: 'max-width:100px' })
    amtIn.addEventListener('input', () => { splitRows[i].amount = amtIn.value; updateSplitSum() })
    tb.append(el('tr', {},
      el('td', {}, el('span', { class: 'avatar', style: 'width:26px;height:26px;font-size:.65rem;display:inline-flex;margin-right:6px;vertical-align:middle' }, initials(r.name || r.address)), r.name || short(r.address)),
      el('td', {}, amtIn),
      el('td', {}, el('button', { class: 'ghost sm', onclick: () => { splitRows.splice(i, 1); refreshSplitUI() } }, '✕')),
    ))
  })
  table.append(tb)
  box.replaceChildren(table)
  updateSplitSum()
}
function updateSplitSum() {
  const sum = splitRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const total = Number($('#split-total').value) || 0
  const diff = total - sum
  $('#split-sum').textContent =
    `Summe ${sum.toLocaleString('de-CH', { maximumFractionDigits: 2 })} ${meta.symbol}` +
    (total ? ` · ${diff === 0 ? 'passt genau' : diff > 0 ? `${diff.toFixed(2)} übrig` : `${(-diff).toFixed(2)} zu viel`}` : '')
}
function splitEven() {
  const total = Number($('#split-total').value)
  if (!(total > 0) || !splitRows.length) return toast('Gesamtbetrag + Empfänger nötig', 'err')
  const n = splitRows.length
  const each = Math.floor((total / n) * 100) / 100
  splitRows.forEach((r, i) => (r.amount = i === n - 1 ? (total - each * (n - 1)).toFixed(2) : each.toFixed(2)))
  renderSplit()
}
function addToSplit(f) {
  if (splitRows.some((r) => r.address.toLowerCase() === f.address.toLowerCase())) return
  splitRows.push({ address: getAddress(f.address), name: f.name, amount: '' })
  refreshSplitUI()
}
async function doSplit() {
  try {
    if (!sa) throw new Error('Kein Konto')
    const rows = splitRows.filter((r) => Number(r.amount) > 0 && isAddress(r.address))
    if (!rows.length) throw new Error('Keine gültigen Empfänger/Beträge')
    const calls = rows.map((r) => ({ to: TOKEN(), abi: tokenAbi, functionName: 'transfer', args: [getAddress(r.address), parseAmt(r.amount)] }))
    toast('Signiere mit Passkey …')
    log.line(`Alpen-Split an ${rows.length} Empfänger in 1 UserOperation …`)
    const res = await sendCalls(sa.client, calls)
    rows.forEach((r) => historyStore.add({ direction: 'out', address: r.address, name: r.name || nameFor(r.address), amount: fmt(parseAmt(r.amount)), purpose: 'Alpen-Split', txHash: res.txHash }))
    log.ok(`Aufgeteilt · Block ${res.block} · <a href="${explorerTx(res.txHash)}" target="_blank" rel="noreferrer">Tx</a>`)
    vibrate([15, 30, 15])
    toast(`An ${rows.length} gesendet!`, 'ok')
    splitRows = []
    $('#split-total').value = ''
    await refresh()
    showView('home')
  } catch (e) {
    log.err(errText(e))
    toast(errText(e), 'err')
  }
}

// ---------------------------------------------------------------- Friends

function renderFriends() {
  const list = friendsStore.all()
  const box = $('#friends')
  if (!list.length) {
    box.replaceChildren(emptyState('/empty-friends.png', 'Noch keine Freunde gespeichert.'))
  } else {
    const table = el('table')
    const tb = el('tbody')
    list.forEach((f) => {
      tb.append(el('tr', {},
        el('td', {}, el('span', { class: 'avatar', style: 'width:28px;height:28px;font-size:.68rem;display:inline-flex;margin-right:8px;vertical-align:middle' }, initials(f.name)), f.name),
        el('td', {}, addrChip(f.address, { link: false })),
        el('td', {},
          el('button', { class: 'ghost sm', onclick: () => { $('#send-to').value = f.address; showView('send') } }, 'Senden'),
          ' ',
          el('button', { class: 'ghost sm', onclick: () => { friendsStore.remove(f.address); renderFriends() } }, '✕')),
      ))
    })
    table.append(tb)
    box.replaceChildren(table)
  }
  $('#friends-list').replaceChildren(...list.map((f) => el('option', { value: f.address }, f.name)))
}
function addFriend() {
  const name = $('#fr-name').value.trim()
  const addr = $('#fr-addr').value.trim()
  if (!name) return toast('Name fehlt', 'err')
  if (!isAddress(addr)) return toast('Adresse ungültig', 'err')
  friendsStore.upsert({ name, address: getAddress(addr) })
  $('#fr-name').value = $('#fr-addr').value = ''
  renderFriends()
  toast('Freund gespeichert', 'ok')
}

// ---------------------------------------------------------------- Voucher

function resetVoucherView() {
  $('#voucher-result').hidden = true
  $('#voucher-result').replaceChildren()
  voucherScanner.stop()
}
async function handleVoucher(privKey) {
  const box = $('#voucher-result')
  box.hidden = false
  box.replaceChildren(el('div', { class: 'empty' }, 'Gutschein wird geprüft …'))
  let eph
  try {
    eph = voucherAddressFromKey(privKey)
  } catch {
    box.replaceChildren(el('div', { class: 'notice bad' }, 'Ungültiger Gutschein-Code.'))
    return
  }
  let v
  try {
    v = await readVoucher(eph)
  } catch (e) {
    box.replaceChildren(el('div', { class: 'notice bad' }, `Prüfung fehlgeschlagen: ${errText(e)}`))
    return
  }
  if (v.claimed || v.amount === 0n) {
    box.replaceChildren(el('div', { class: 'notice bad' }, 'Dieser Gutschein wurde bereits eingelöst oder ist ungültig.'))
    return
  }
  pendingVoucherKey = privKey
  box.replaceChildren(
    el('div', { class: 'voucher-amount' }, `${fmt(v.amount)} ${meta.symbol}`),
    el('p', { class: 'hint', style: 'text-align:center' }, 'Gutscheinwert – wird deinem Konto gutgeschrieben.'),
    el('button', { class: 'cta-full', onclick: (e) => busy(e.target, () => redeemVoucher(privKey, v.amount)) }, 'Einlösen'),
  )
}
async function redeemVoucher(privKey, amount) {
  if (!sa) throw new Error('Kein Konto')
  const { ephemeral, recipient, signature } = await buildVoucherClaim(privKey, sa.account.address)
  log.line(`Gutschein einlösen (${fmt(amount)} ${meta.symbol}) …`)
  log.line(`claim(ephemeral=${short(ephemeral)}, recipient=${short(recipient)}) → ${short(VOUCHER())}`)
  const r = await sendCalls(sa.client, [{ to: VOUCHER(), abi: voucherAbi, functionName: 'claim', args: [ephemeral, recipient, signature] }])
  historyStore.add({ direction: 'in', address: VOUCHER(), name: 'Gutschein', amount: fmt(amount), purpose: 'Gutschein eingelöst', txHash: r.txHash })
  log.ok(`Eingelöst · <a href="${explorerTx(r.txHash)}" target="_blank" rel="noreferrer">Tx</a>`)
  vibrate([15, 30, 15])
  toast(`${fmt(amount)} ${meta.symbol} gutgeschrieben!`, 'ok')
  pendingVoucherKey = null
  await refresh()
  showView('home')
}

// ---------------------------------------------------------------- Laden (EV-Ladestation)

async function ensureChargerMeta() {
  if (!chargerMeta) chargerMeta = await readChargerMeta()
  return chargerMeta
}

function stationChip(addr) {
  return el('div', { class: 'row', style: 'justify-content:center;gap:6px' },
    el('span', { class: 'muted', style: 'font-size:.78rem' }, 'Stations-Konto'), addrChip(addr))
}

async function renderCharge() {
  clearTimeout(chargeTimer)
  const box = $('#charge-body')
  const scanBtn = $('#btn-charge-scan')
  if (!isAddress(CONFIG.CHARGER_ADDRESS)) {
    scanBtn.hidden = true
    $('#charge-refresh').hidden = true
    box.replaceChildren(emptyState('/empty-charge.png', 'Ladestation nicht konfiguriert – VITE_CHARGER_ADDRESS fehlt.'))
    return
  }
  if (!chargeUnlocked) {
    scanBtn.hidden = false
    $('#charge-refresh').hidden = true
    box.replaceChildren(emptyState('/empty-charge.png', 'Scanne den QR-Code an der Ladesäule, um sie freizuschalten.'))
    return
  }
  scanBtn.hidden = true
  $('#charge-refresh').hidden = false
  box.replaceChildren(el('div', { class: 'empty' }, 'Ladestation wird abgefragt …'))
  let m, st
  try {
    m = await ensureChargerMeta()
    st = await readChargerStatus()
  } catch (e) {
    box.replaceChildren(emptyState('/empty-charge.png', `Station nicht erreichbar: ${errText(e)}`))
    return
  }
  const mine = st.user && sa && st.user.toLowerCase() === sa.account.address.toLowerCase()

  if (!st.free) {
    renderChargeProgress(box, m, st, mine)
    return
  }

  const price = (kw) => fmt(BigInt(kw) * m.pricePerKwBase)
  const grid = el('div', { class: 'kw-grid' }, ...KW_OPTIONS.map((kw) =>
    el('button', { class: 'kw-btn', onclick: (e) => busy([...$$('.kw-btn')], () => startCharge(kw)) },
      el('span', { class: 'kw-n' }, `${kw} kW`),
      el('span', { class: 'kw-p' }, `${price(kw)} ${meta.symbol}`),
    ),
  ))
  box.replaceChildren(
    el('div', { class: 'pill pill-good', style: 'align-self:center' }, 'Station frei'),
    el('p', { class: 'hint', style: 'text-align:center' }, `${fmt(m.pricePerKwBase)} ${meta.symbol} pro kW · Gas gesponsert`),
    grid,
    stationChip(m.stationAccount),
  )
}

function renderChargeProgress(box, m, st, mine) {
  const total = Math.max(1, st.endsAt - st.startedAt)
  const tick = () => {
    const now = Math.floor(Date.now() / 1000)
    const left = Math.max(0, st.endsAt - now)
    const done = left === 0
    const pct = Math.min(100, Math.round(((total - left) / total) * 100))
    const kwNow = Math.min(st.kW, Math.round((st.kW * (total - left)) / total))
    const doneImg = done ? el('img', { src: '/charge-done.png', alt: '', class: 'charge-car', onerror: (e) => e.target.remove() }) : el('span')
    box.replaceChildren(
      doneImg,
      el('div', { class: `pill ${done ? 'pill-good' : 'pill-warn'}`, style: 'align-self:center' }, done ? 'Ladung abgeschlossen' : 'Station lädt'),
      el('div', { class: 'charge-gauge' }, el('div', { class: 'charge-gauge-fill', style: `width:${pct}%` })),
      el('div', { class: 'charge-stat' },
        el('div', {}, el('b', {}, `${kwNow} / ${st.kW} kW`), ' geladen'),
        el('div', {}, done ? 'fertig' : `noch ${mmss(left)}`)),
      el('p', { class: 'hint', style: 'text-align:center' },
        `${mine ? 'Deine Ladung' : `Belegt von ${short(st.user)}`} · ${fmt(st.paid)} ${meta.symbol} bezahlt`),
      done ? el('button', { class: 'cta-full', onclick: () => renderCharge() }, 'Aktualisieren') : el('span'),
      stationChip(m.stationAccount),
    )
    if (!done) chargeTimer = setTimeout(tick, 1000)
  }
  tick()
}

async function startCharge(kW) {
  if (!sa) throw new Error('Kein Konto')
  const m = await ensureChargerMeta()
  const st = await readChargerStatus()
  if (!st.free) { toast('Station ist gerade besetzt', 'err'); return renderCharge() }
  const cost = BigInt(kW) * m.pricePerKwBase
  const bal = await readBalance(sa.account.address).catch(() => 0n)
  if (bal < cost) { toast(`Zu wenig Guthaben – ${fmt(cost)} ${meta.symbol} nötig`, 'err'); return }
  toast('Signiere mit Passkey …')
  log.line(`Laden: ${kW} kW für ${fmt(cost)} ${meta.symbol} …`)
  const r = await sendCalls(sa.client, [
    { to: TOKEN(), abi: tokenAbi, functionName: 'approve', args: [CHARGER(), cost] },
    { to: CHARGER(), abi: chargerAbi, functionName: 'startCharge', args: [kW] },
  ])
  historyStore.add({ direction: 'out', address: CHARGER(), name: 'Ladestation', amount: fmt(cost), purpose: `${kW} kW laden`, txHash: r.txHash })
  log.ok(`Ladung gestartet · Block ${r.block} · <a href="${explorerTx(r.txHash)}" target="_blank" rel="noreferrer">Tx</a> · Gas gesponsert`)
  vibrate([15, 30, 15])
  toast(`${kW} kW – dein Auto wird geladen`, 'ok')
  await refresh()
  await renderCharge()
}

// ---------------------------------------------------------------- Velo-Verleih (on-chain)

async function renderBike() {
  clearTimeout(bikeTimer)
  const box = $('#bike-body')
  const refresh = $('#bike-refresh')
  if (!isAddress(CONFIG.BIKES_ADDRESS)) {
    refresh.hidden = true
    box.replaceChildren(emptyState('/empty-bike.png', 'Velo-Verleih nicht konfiguriert – VITE_BIKES_ADDRESS fehlt.'))
    return
  }
  box.replaceChildren(el('div', { class: 'empty' }, 'Velo-Verleih wird geladen …'))
  let s
  try {
    s = await readBikesState()
  } catch (e) {
    refresh.hidden = true
    box.replaceChildren(emptyState('/empty-bike.png', `Verleih nicht erreichbar: ${errText(e)}`))
    return
  }
  refresh.hidden = false
  const m = { operator: s.operator, depositBase: s.depositBase, penaltyPerMinBase: s.penaltyPerMinBase, stations: s.stations }
  const mine = s.bikes.find((b) => b.renter && sa && b.renter.toLowerCase() === sa.account.address.toLowerCase())
  if (mine) renderBikeActive(box, m, mine)
  else renderBikeForm(box, m, s.bikes)
}

function renderBikeForm(box, m, bikes) {
  const avail = bikes.filter((b) => b.available)
  if (!avail.length) {
    box.replaceChildren(emptyState('/empty-bike.png', 'Gerade sind alle Velos unterwegs – später erneut versuchen.'))
    return
  }
  if (bikeSel == null || !avail.some((b) => b.id === bikeSel)) bikeSel = avail[0].id

  const chips = el('div', { class: 'chip-row' }, ...avail.map((b) =>
    el('button', {
      class: `chip${b.id === bikeSel ? ' sel' : ''}`, type: 'button',
      onclick: () => { bikeSel = b.id; renderBike() },
    }, el('span', { class: 'avatar' }, '🚲'), `Velo ${b.id + 1}`,
      el('span', { class: 'muted', style: 'font-size:.72rem' }, ` · ${m.stations[b.station] ?? '–'}`))))

  const stepper = el('div', { class: 'stepper' },
    el('button', { onclick: () => { bikeDur = Math.max(15, bikeDur - 15); renderBike() } }, '−'),
    el('span', { class: 'val' }, `${bikeDur} Min`),
    el('button', { onclick: () => { bikeDur = Math.min(240, bikeDur + 15); renderBike() } }, '+'))

  box.replaceChildren(
    el('h3', { class: 'sec' }, 'Velo wählen'),
    chips,
    el('h3', { class: 'sec', style: 'margin-top:6px' }, 'Vorgesehene Zeit'),
    stepper,
    el('div', { class: 'fee-hint', style: 'text-align:left;margin-top:8px' },
      'Depot ', el('b', {}, `${fmt(m.depositBase)} ${meta.symbol}`),
      ` – bei pünktlicher Rückgabe voll zurück, sonst −${fmt(m.penaltyPerMinBase)} ${meta.symbol}/Min über der Zeit.`),
    el('button', {
      class: 'cta-full', style: 'margin-top:12px',
      onclick: (e) => busy(e.target, () => rentBike(bikeSel, bikeDur, m)),
    }, `Velo reservieren – Depot ${fmt(m.depositBase)} ${meta.symbol}`),
  )
}

function renderBikeActive(box, m, b) {
  if (returnStationSel == null) returnStationSel = b.station
  const endTs = b.startedAt + b.plannedMin * 60
  const tick = () => {
    const now = Math.floor(Date.now() / 1000)
    const left = endTs - now
    const over = left < 0
    const usedMin = Math.max(0, Math.ceil((now - b.startedAt) / 60))
    const overMin = Math.max(0, usedMin - b.plannedMin)
    const penalty = bnMin(b.deposit, BigInt(overMin) * m.penaltyPerMinBase)
    const refund = b.deposit - penalty
    box.replaceChildren(
      el('div', { class: 'session-card' },
        el('div', { class: 'sub' }, `Velo ${b.id + 1} · Depot ${fmt(b.deposit)} ${meta.symbol}`),
        el('div', { class: 'big' }, over ? `+${mmss(-left)} über` : mmss(left)),
        el('div', { class: 'sub' }, over
          ? `${overMin} Min über · Strafe ${fmt(penalty)} · Rückerstattung ≈ ${fmt(refund)} ${meta.symbol}`
          : `geplant ${b.plannedMin} Min · Depot kommt voll zurück`),
      ),
      el('h3', { class: 'sec', style: 'margin-top:4px' }, 'Rückgabe-Station'),
      el('div', { class: 'chip-row' }, ...m.stations.map((name, i) =>
        el('button', {
          class: `chip${i === returnStationSel ? ' sel' : ''}`, type: 'button',
          onclick: () => { returnStationSel = i; renderBike() },
        }, name))),
      el('button', {
        class: 'cta-full', style: 'margin-top:12px',
        onclick: (e) => busy(e.target, () => returnBike(b, returnStationSel, m)),
      }, 'Velo zurückgeben'),
    )
    bikeTimer = setTimeout(tick, 1000)
  }
  tick()
}

async function rentBike(bikeId, plannedMin, m) {
  if (!sa) throw new Error('Kein Konto')
  if (bikeId == null) return toast('Velo wählen', 'err')
  const bal = await readBalance(sa.account.address).catch(() => 0n)
  if (bal < m.depositBase) { toast(`Zu wenig Guthaben – Depot ${fmt(m.depositBase)} ${meta.symbol} nötig`, 'err'); return }
  toast('Signiere mit Passkey …')
  log.line(`Velo ${bikeId + 1} reservieren · ${plannedMin} Min · Depot ${fmt(m.depositBase)} ${meta.symbol} …`)
  const r = await sendCalls(sa.client, [
    { to: TOKEN(), abi: tokenAbi, functionName: 'approve', args: [BIKES(), m.depositBase] },
    { to: BIKES(), abi: bikesAbi, functionName: 'rent', args: [bikeId, plannedMin] },
  ])
  historyStore.add({ direction: 'out', address: BIKES(), name: 'Velo-Depot', amount: fmt(m.depositBase), purpose: `Velo ${bikeId + 1} · ${plannedMin} Min`, txHash: r.txHash })
  log.ok(`Velo reserviert · Block ${r.block} · <a href="${explorerTx(r.txHash)}" target="_blank" rel="noreferrer">Tx</a> · Gas gesponsert`)
  vibrate([15, 30, 15])
  toast('Velo reserviert – gute Fahrt!', 'ok')
  await refresh()
  await renderBike()
}

async function returnBike(b, stationId, m) {
  if (!sa) throw new Error('Kein Konto')
  const now = Math.floor(Date.now() / 1000)
  const usedMin = Math.max(0, Math.ceil((now - b.startedAt) / 60))
  const overMin = Math.max(0, usedMin - b.plannedMin)
  const penalty = bnMin(b.deposit, BigInt(overMin) * m.penaltyPerMinBase)
  const refund = b.deposit - penalty
  log.line(`Velo ${b.id + 1} zurückgeben → ${m.stations[stationId]} …`)
  const r = await sendCalls(sa.client, [{ to: BIKES(), abi: bikesAbi, functionName: 'returnBike', args: [b.id, stationId] }])
  historyStore.add({
    direction: 'in', address: BIKES(), name: 'Velo-Depot zurück', amount: fmt(refund),
    purpose: `${m.stations[stationId]}${overMin ? ` · ${overMin} Min über · −${fmt(penalty)}` : ' · pünktlich'}`, txHash: r.txHash,
  })
  log.ok(`Zurückgegeben · Depot ${fmt(refund)} ${meta.symbol} zurück · <a href="${explorerTx(r.txHash)}" target="_blank" rel="noreferrer">Tx</a>`)
  vibrate([15, 30, 15])
  toast(`Depot ${fmt(refund)} ${meta.symbol} erstattet`, 'ok')
  returnStationSel = null
  await refresh()
  await renderBike()
}

// ---------------------------------------------------------------- Parking (UI-Demo)

function parkCostBase() {
  return BigInt(parkDur) * BigInt(CONFIG.PARK_RATE_PER_MIN)
}
async function locateForParking() {
  $('#park-loc').textContent = 'Standort wird ermittelt…'
  if (!navigator.geolocation) {
    parkGeo = { lat: null, lng: null, name: 'Standort nicht verfügbar' }
    $('#park-loc').textContent = parkGeo.name
    return
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords
      parkGeo = { lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
      $('#park-loc').textContent = parkGeo.name
      try {
        const g = await api(`/geocode?lat=${lat}&lng=${lng}`)
        if (g.name) {
          parkGeo.name = g.name
          $('#park-loc').textContent = g.name
        }
      } catch {}
    },
    () => {
      parkGeo = { lat: null, lng: null, name: 'Standort nicht freigegeben' }
      $('#park-loc').textContent = parkGeo.name
    },
    { enableHighAccuracy: true, timeout: 8000 },
  )
}
function renderParkPlateChips() {
  $('#park-plate-chips').replaceChildren(...platesStore.all().map((p) =>
    el('button', { class: 'chip', type: 'button', onclick: () => ($('#park-plate').value = p) }, p),
  ))
}
function renderParking() {
  const s = parkingStore.get()
  clearInterval(parkTimer)
  if (s) {
    $('#park-form').hidden = true
    const card = $('#park-active')
    card.hidden = false
    const endTs = s.startTs + s.durationMin * 60
    const tick = () => {
      const left = endTs - Math.floor(Date.now() / 1000)
      const over = left <= 0
      const mm = Math.floor(Math.abs(left) / 60)
      const ss = Math.abs(left) % 60
      card.replaceChildren(
        el('div', { class: 'session-card' },
          el('div', { class: 'sub' }, `${s.plate} · ${s.locName || 'Standort'}`),
          el('div', { class: 'big' }, over ? `abgelaufen` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`),
          el('div', { class: 'sub' }, `bezahlt ${fmt(BigInt(s.costBase))} ${meta.symbol} für ${s.durationMin} Min`),
        ),
        over
          ? el('button', { class: 'cta-full', style: 'margin-top:12px', onclick: (e) => busy(e.target, () => stopParking(true)) }, 'Parkvorgang abschliessen')
          : el('button', { class: 'cta-full', style: 'margin-top:12px', onclick: (e) => busy(e.target, () => stopParking(false)) }, 'Früher beenden & Rest zurück'),
      )
      if (!over) parkTimer = setTimeout(tick, 1000)
    }
    tick()
  } else {
    $('#park-active').hidden = true
    $('#park-form').hidden = false
    $('#park-dur').textContent = parkDur
    $('#park-cost').textContent = `${fmt(parkCostBase())} ${meta.symbol}`
    renderParkPlateChips()
    locateForParking()
  }
}
async function startParking() {
  if (!sa) throw new Error('Kein Konto')
  const plate = $('#park-plate').value.trim().toUpperCase()
  if (!plate) return toast('Kennzeichen fehlen', 'err')
  if (!isAddress(CONFIG.PARK_TREASURY)) return toast('Park-Kasse nicht konfiguriert', 'err')
  const costBase = parkCostBase()
  log.line(`Parken: ${plate}, ${parkDur} Min, ${fmt(costBase)} ${meta.symbol} …`)
  const r = await sendCalls(sa.client, [{ to: TOKEN(), abi: tokenAbi, functionName: 'transfer', args: [getAddress(CONFIG.PARK_TREASURY), costBase] }])
  const session = {
    plate, lat: parkGeo.lat, lng: parkGeo.lng, locName: parkGeo.name,
    startTs: Math.floor(Date.now() / 1000), durationMin: parkDur, costBase: costBase.toString(), txHash: r.txHash,
  }
  parkingStore.set(session)
  platesStore.add(plate)
  historyStore.add({ direction: 'out', address: getAddress(CONFIG.PARK_TREASURY), name: 'Parken', amount: fmt(costBase), purpose: `${plate} · ${parkGeo.name}`, txHash: r.txHash })
  api('/parking/start', { method: 'POST', body: JSON.stringify({ account: sa.account.address, ...session }) }).catch(() => {})
  log.ok(`Parken gestartet · <a href="${explorerTx(r.txHash)}" target="_blank" rel="noreferrer">Tx</a>`)
  vibrate([15, 30, 15])
  toast('Parken gestartet', 'ok')
  renderParking()
}
async function stopParking(expired) {
  const s = parkingStore.get()
  if (!s) return
  if (expired) {
    parkingStore.set(null)
    clearInterval(parkTimer)
    toast('Parkvorgang abgeschlossen', 'ok')
    renderParking()
    return
  }
  try {
    log.line('Parken früher beenden – Rückerstattung anfordern …')
    const res = await api('/parking/stop', {
      method: 'POST',
      body: JSON.stringify({ account: sa.account.address, startedAt: s.startTs, durationMin: s.durationMin, costBase: s.costBase }),
    })
    if (res.refundBase && BigInt(res.refundBase) > 0n) {
      historyStore.add({ direction: 'in', address: getAddress(CONFIG.PARK_TREASURY), name: 'Parken-Rückerstattung', amount: fmt(BigInt(res.refundBase)), purpose: `${res.elapsedMin} Min genutzt`, txHash: res.refundTx })
      log.ok(`Erstattet ${fmt(BigInt(res.refundBase))} ${meta.symbol} · <a href="${explorerTx(res.refundTx)}" target="_blank" rel="noreferrer">Tx</a>`)
      toast(`${fmt(BigInt(res.refundBase))} ${meta.symbol} erstattet`, 'ok')
    } else {
      log.dim('Keine Rückerstattung (volle Dauer genutzt).')
      toast('Parkvorgang beendet', 'ok')
    }
  } catch (e) {
    log.err(`Rückerstattung fehlgeschlagen: ${errText(e)} – Vorgang lokal beendet.`)
    toast('Beendet – Rückerstattung folgt separat', 'err')
  }
  parkingStore.set(null)
  clearInterval(parkTimer)
  await refresh()
  renderParking()
}

// ---------------------------------------------------------------- Scanner

const sendScanner = createScanner($('#send-scan-mount'))
const splitScanner = createScanner($('#split-scan-mount'))
const frScanner = createScanner($('#fr-scan-mount'))
const voucherScanner = createScanner($('#voucher-scan-mount'))
const chargeScanner = createScanner($('#charge-scan-mount'))
const navScanner = createScanner($('#nav-scan-mount'))

function isChargerQR(p) {
  return p.kind === 'address' && isAddress(CONFIG.CHARGER_ADDRESS) &&
    p.address.toLowerCase() === CONFIG.CHARGER_ADDRESS.toLowerCase()
}

function openNavScan() {
  $('#nav-scan-overlay').hidden = false
  navScanner.start((p) => {
    closeNavScan()
    if (p.kind === 'voucher') {
      showView('voucher')
      handleVoucher(p.privKey).catch((e) => toast(errText(e), 'err'))
    } else if (isChargerQR(p)) {
      chargeUnlocked = true
      showView('charge')
    } else {
      showView('send')
      $('#send-to').value = p.address
      if (p.amount) setSendAmount(p.amount)
      toast('Adresse übernommen', 'ok')
    }
  }).catch((e) => { closeNavScan(); toast(errText(e), 'err') })
}
function closeNavScan() {
  navScanner.stop()
  $('#nav-scan-overlay').hidden = true
}

// ---------------------------------------------------------------- wiring

function wire() {
  $('#ob-create').onclick = () => busy($('#ob-create'), async () => {
    await createPasskeyAccount()
    $('#ob-success').hidden = false
    vibrate([15, 30, 15])
    await new Promise((r) => setTimeout(r, 500))
    await initAccount()
  })

  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.nav)))
  $('#nav-back').onclick = () => showView('home')
  $('#nav-scan').onclick = openNavScan
  $('#nav-scan-cancel').onclick = closeNavScan

  // Senden
  $$('#send-keypad button').forEach((b) => b.addEventListener('click', () => pressKey(b.dataset.k)))
  setupSwipe($('#send-swipe'), $('#send-swipe-handle'), $('#send-swipe-fill'), confirmSend)
  $('#send-scan').onclick = () =>
    sendScanner.start((p) => { if (p.kind === 'address') { $('#send-to').value = p.address; if (p.amount) setSendAmount(p.amount); toast('Adresse übernommen', 'ok') } else toast('Kein Adress-QR', 'err') }).catch((e) => toast(errText(e), 'err'))

  // Empfangen
  $('#recv-amount').addEventListener('input', () => updateQR().catch(() => {}))
  $('#btn-share').onclick = async () => {
    const uri = await updateQR()
    if (navigator.share) { try { await navigator.share({ title: 'Heidi Wallet', text: uri }) } catch {} }
    else copy(uri, 'Link kopiert')
  }
  $('#btn-copy-link').onclick = async () => copy(await updateQR(), 'Link kopiert')

  // Split
  $('#split-total').addEventListener('input', updateSplitSum)
  $('#split-even').onclick = splitEven
  $('#btn-split').onclick = () => busy($('#btn-split'), doSplit)
  $('#split-scan').onclick = () =>
    splitScanner.start((p) => { if (p.kind === 'address') { addToSplit({ address: getAddress(p.address), name: p.label || '' }); toast('Empfänger hinzugefügt', 'ok') } }).catch((e) => toast(errText(e), 'err'))

  // Freunde
  $('#fr-add').onclick = addFriend
  $('#fr-scan').onclick = () =>
    frScanner.start((p) => { if (p.kind === 'address') { $('#fr-addr').value = p.address; if (p.label) $('#fr-name').value ||= p.label; toast('Adresse übernommen', 'ok') } }).catch((e) => toast(errText(e), 'err'))

  // Gutschein
  $('#btn-voucher-scan').onclick = () =>
    voucherScanner.start((p) => { if (p.kind === 'voucher') handleVoucher(p.privKey).catch((e) => toast(errText(e), 'err')); else toast('Kein Gutschein-QR', 'err') }).catch((e) => toast(errText(e), 'err'))

  // Laden
  $('#btn-charge-scan').onclick = () =>
    chargeScanner.start((p) => {
      if (isChargerQR(p)) {
        chargeUnlocked = true
        toast('Ladesäule erkannt', 'ok')
        renderCharge().catch((e) => log.err(errText(e)))
      } else {
        toast('Kein Ladesäulen-QR', 'err')
      }
    }).catch((e) => toast(errText(e), 'err'))
  $('#charge-refresh').onclick = () => renderCharge().catch((e) => toast(errText(e), 'err'))

  // Velo
  $('#bike-refresh').onclick = () => renderBike().catch((e) => toast(errText(e), 'err'))

  // Parken
  $('#park-minus').onclick = () => { parkDur = Math.max(15, parkDur - 15); renderParking() }
  $('#park-plus').onclick = () => { parkDur = Math.min(600, parkDur + 15); renderParking() }
  $('#park-plate-save').onclick = () => { const p = $('#park-plate').value.trim().toUpperCase(); if (p) { platesStore.add(p); renderParkPlateChips(); toast('Kennzeichen gemerkt', 'ok') } }
  $('#btn-park-start').onclick = () => busy($('#btn-park-start'), startParking)

  // Verlauf
  $('#history-refresh').onclick = () => busy($('#history-refresh'), loadHistory)

  // Mehr
  $('#btn-faucet').onclick = () => busy($('#btn-faucet'), async () => {
    if (!sa) throw new Error('Kein Konto')
    log.line('Faucet: 100 HDI …')
    const r = await sendCalls(sa.client, [{ to: TOKEN(), abi: tokenAbi, functionName: 'faucet', args: [] }])
    historyStore.add({ direction: 'in', address: TOKEN(), name: 'Faucet', amount: '100.00', purpose: 'Test-Bezug', txHash: r.txHash })
    log.ok(`Faucet ok · <a href="${explorerTx(r.txHash)}" target="_blank" rel="noreferrer">Tx</a>`)
    toast('100 HDI erhalten', 'ok')
    await refresh()
  })
  $('#set-create').onclick = () => busy($('#set-create'), async () => {
    if (!confirm('Neues Konto erstellen? Das bisherige Guthaben ist danach NICHT mehr erreichbar.')) return
    forgetAccount(); sa = null; await createPasskeyAccount(); await initAccount()
  })
  $('#set-load').onclick = () => busy($('#set-load'), async () => { sa = null; await initAccount() })
}

// ---------------------------------------------------------------- boot

;(async function boot() {
  wire()
  const probs = configProblems()
  if (!window.PublicKeyCredential) probs.push('WebAuthn nicht unterstützt')
  if (!window.isSecureContext) probs.push('kein secure context (HTTPS/localhost)')
  if (probs.length) {
    const w = $('#cfg-warn')
    w.hidden = false
    w.textContent = `Konfiguration unvollständig: ${probs.join(' · ')}`
    log.err(probs.join(' · '))
  }
  if (hasStoredAccount()) {
    try {
      await initAccount()
    } catch (e) {
      log.err(errText(e))
      $('#onboarding').hidden = false
    }
  } else {
    $('#onboarding').hidden = false
  }
  setInterval(() => { if (sa) refresh().catch(() => {}) }, 20_000)
})()
