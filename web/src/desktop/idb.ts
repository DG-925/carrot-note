// Tiny promise wrapper around IndexedDB: one database per user with "rows" and "meta" stores.

export function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows')
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})

export async function readAll<T>(db: IDBDatabase, store: string): Promise<[string, T][]> {
  const tx = db.transaction(store, 'readonly')
  const os = tx.objectStore(store)
  const [keys, values] = await Promise.all([
    new Promise<IDBValidKey[]>((res, rej) => { const r = os.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }),
    new Promise<T[]>((res, rej) => { const r = os.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }),
  ])
  return keys.map((k, i) => [String(k), values[i]])
}

/** Writes and deletes in one transaction. */
export async function write(db: IDBDatabase, store: string, puts: [string, unknown][], dels: string[] = []) {
  if (!puts.length && !dels.length) return
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const [k, v] of puts) os.put(v, k)
  for (const k of dels) os.delete(k)
  await done(tx)
}

export function deleteDb(name: string): Promise<void> {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}
