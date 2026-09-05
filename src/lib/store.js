// localStorage-Wrapper. Alles bleibt im Browser dieses Geraets.

const read = (k, fb) => {
  try {
    const v = JSON.parse(localStorage.getItem(k))
    return v ?? fb
  } catch {
    return fb
  }
}
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {}
}

const P = 'heidi:v1:'

// Eigenes Konto (Passkey + Smart-Account-Adresse)
export const accountStore = {
  get: () => read(P + 'account', null),
  set: (v) => write(P + 'account', v),
  clear: () => localStorage.removeItem(P + 'account'),
}

function listStore(key) {
  return {
    all: () => read(key, []),
    save: (list) => write(key, list),
    upsert(item, matchKey = 'address') {
      const list = read(key, [])
      const mv = String(item[matchKey] || '').toLowerCase()
      const i = list.findIndex((x) => String(x[matchKey] || '').toLowerCase() === mv)
      if (i >= 0) list[i] = { ...list[i], ...item }
      else list.push(item)
      write(key, list)
      return list
    },
    remove(val, matchKey = 'address') {
      const list = read(key, []).filter((x) => String(x[matchKey] || '').toLowerCase() !== String(val).toLowerCase())
      write(key, list)
      return list
    },
  }
}

// Freundesliste [{ name, address }]
export const friendsStore = listStore(P + 'friends')

// Auto-Kennzeichen fuers Parken [{ plate, label? }] -> matchKey 'plate'
export const platesStore = {
  all: () => read(P + 'plates', []),
  add(plate) {
    const list = read(P + 'plates', [])
    const p = plate.trim().toUpperCase()
    if (p && !list.includes(p)) list.unshift(p)
    write(P + 'plates', list.slice(0, 8))
    return list
  },
  remove(plate) {
    const list = read(P + 'plates', []).filter((x) => x !== plate)
    write(P + 'plates', list)
    return list
  },
}

// Aktiver Parkvorgang (nur einer) | null
export const parkingStore = {
  get: () => read(P + 'parking', null),
  set: (v) => (v ? write(P + 'parking', v) : localStorage.removeItem(P + 'parking')),
}

// Lokal protokollierte Aktionen fuer den Aktivitaets-Feed.
export const historyStore = {
  all: () => read(P + 'history', []),
  add(entry) {
    const list = read(P + 'history', [])
    list.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Math.floor(Date.now() / 1000), ...entry })
    write(P + 'history', list.slice(0, 200))
  },
  purposeFor(txHash) {
    return read(P + 'history', []).find((x) => x.txHash?.toLowerCase() === txHash?.toLowerCase())?.purpose || ''
  },
}

export const prefs = {
  get: (k, fb) => read(`${P}pref:${k}`, fb),
  set: (k, v) => write(`${P}pref:${k}`, v),
}
