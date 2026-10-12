// Password vault encryption. Entries are encrypted on the phone with AES-GCM using a key made
// from the vault password (PBKDF2, 210k rounds), so the server only ever stores ciphertext.

const enc = new TextEncoder()
const dec = new TextDecoder()
const CHECK = 'carrot-vault-ok'

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export interface VaultFields { username: string; password: string; url: string; notes: string }

async function derive(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function encryptText(key: CryptoKey, text: string) {
  const iv = random(12)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))
  return { iv: b64(iv), data: b64(data) }
}

export async function decryptText(key: CryptoKey, iv: string, data: string): Promise<string> {
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data)))
}

/** New vault: returns the key and what to store (salt + an encrypted check value). */
export async function createVault(password: string) {
  const salt = random(16)
  const key = await derive(password, salt)
  const check = await encryptText(key, CHECK)
  return { key, meta: { salt: b64(salt), iv: check.iv, check: check.data } }
}

/** The key for [password], or null when the password is wrong. */
export async function openVault(password: string, meta: { salt: string; iv: string; check: string }): Promise<CryptoKey | null> {
  const key = await derive(password, unb64(meta.salt))
  return (await verifyKey(key, meta)) ? key : null
}

export async function verifyKey(key: CryptoKey, meta: { iv: string; check: string }) {
  try { return (await decryptText(key, meta.iv, meta.check)) === CHECK } catch { return false }
}

export const exportKey = async (key: CryptoKey) => b64(await crypto.subtle.exportKey('raw', key))
export const importKey = (raw: string) => crypto.subtle.importKey('raw', unb64(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])

/** A strong random password. */
export function generatePassword(length = 18) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_'
  const bytes = random(length)
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}
