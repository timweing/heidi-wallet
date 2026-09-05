import { CONFIG } from './config.js'

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v
    else if (k === 'html') n.innerHTML = v
    else if (k === 'dataset') Object.assign(n.dataset, v)
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v)
    else if (v === true) n.setAttribute(k, '')
    else if (v !== false && v != null) n.setAttribute(k, v)
  }
  for (const c of kids.flat()) n.append(c?.nodeType ? c : document.createTextNode(String(c)))
  return n
}

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '–')
export const fmtDate = (s) => (s ? new Date(s * 1000).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) : '–')
export const explorerAddr = (a) => `${CONFIG.EXPLORER}/address/${a}`
export const explorerTx = (h) => `${CONFIG.EXPLORER}/tx/${h}`
export const errText = (e) => e?.shortMessage || e?.details || e?.message || String(e)

// Laeuft die viem-Fehlerkette (e.cause…) ab und sammelt die wirklich nuetzlichen
// Felder: HTTP-Status + URL + Antworttext des Bundlers/Paymasters. Der reine
// shortMessage ist bei Netzwerkfehlern nur "HTTP request failed".
export function errDetail(e) {
  const seen = new Set()
  const parts = []
  let cur = e
  let depth = 0
  while (cur && typeof cur === 'object' && !seen.has(cur) && depth < 8) {
    seen.add(cur)
    depth++
    const bits = []
    if (cur.name) bits.push(cur.name)
    if (cur.status) bits.push(`HTTP ${cur.status}`)
    if (cur.url) bits.push(cur.url.replace(/apikey=[^&]+/, 'apikey=…'))
    const msg = cur.shortMessage || cur.details || cur.message
    if (msg && !bits.some((b) => b === msg)) bits.push(msg)
    if (cur.body) { try { bits.push('body=' + JSON.stringify(cur.body)) } catch {} }
    if (bits.length) parts.push(bits.join(' · '))
    cur = cur.cause
  }
  return parts.length ? [...new Set(parts)].join('\n↳ ') : errText(e)
}
export const vibrate = (p) => { try { navigator.vibrate?.(p) } catch {} }

export function copy(text, note = 'Kopiert') {
  navigator.clipboard?.writeText(text).then(() => toast(note, 'ok'), () => toast('Kopieren nicht moeglich', 'err'))
}

// --- Toasts ---
let host
export function toast(msg, kind = '') {
  if (!host) {
    host = el('div', { class: 'toasts' })
    document.body.append(host)
  }
  const t = el('div', { class: `toast ${kind}` }, msg)
  host.append(t)
  setTimeout(() => {
    t.classList.add('out')
    setTimeout(() => t.remove(), 300)
  }, 4000)
}

// --- aufklappbares Log ---
export function initLog(box) {
  const pre = $('.log-body', box)
  const api = {
    line(msg, kind = '') {
      const t = new Date().toLocaleTimeString('de-CH')
      pre.append(el('div', { class: `log-line ${kind}`, html: `<span class="log-t">${t}</span><span>${msg}</span>` }))
      pre.scrollTop = pre.scrollHeight
      if (kind === 'err') box.open = true
    },
    ok: (m) => api.line(m, 'ok'),
    err: (m) => api.line(m, 'err'),
    dim: (m) => api.line(m, 'dim'),
  }
  $('.log-clear', box)?.addEventListener('click', (e) => {
    e.preventDefault()
    pre.replaceChildren()
  })
  return api
}
