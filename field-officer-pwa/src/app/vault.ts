const DB_NAME = 'price-watch-field-vault'
const STORE = 'encrypted-values'
const ITERATIONS = 150_000

interface Envelope { iv: number[]; data: number[] }
let activeKey: CryptoKey | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getRaw<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key)
    request.onsuccess = () => { db.close(); resolve(request.result as T | undefined) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

async function setRaw(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(value, key)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
  })
}

async function derive(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltBuffer, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encrypt(value: unknown, key: CryptoKey): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)))
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(data)) }
}

async function decrypt<T>(envelope: Envelope, key: CryptoKey): Promise<T> {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(envelope.iv) }, key, new Uint8Array(envelope.data))
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

export async function hasVault(): Promise<boolean> { return Boolean(await getRaw('salt')) }

export async function createVault(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Use a 4 to 8 digit PIN.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  activeKey = await derive(pin, salt)
  await setRaw('salt', Array.from(salt))
  await setRaw('verifier', await encrypt({ valid: true }, activeKey))
}

export async function unlockVault(pin: string): Promise<void> {
  const salt = await getRaw<number[]>('salt')
  const verifier = await getRaw<Envelope>('verifier')
  if (!salt || !verifier) throw new Error('No offline vault exists on this device.')
  try {
    const key = await derive(pin, new Uint8Array(salt))
    const result = await decrypt<{ valid: boolean }>(verifier, key)
    if (!result.valid) throw new Error()
    activeKey = key
  } catch { throw new Error('The PIN is incorrect.') }
}

export function lockVault() { activeKey = null }

export async function writeSecret(key: string, value: unknown): Promise<void> {
  if (!activeKey) throw new Error('Unlock this device before saving field data.')
  await setRaw(`secret:${key}`, await encrypt(value, activeKey))
}

export async function readSecret<T>(key: string): Promise<T | undefined> {
  if (!activeKey) throw new Error('Unlock this device before opening field data.')
  const value = await getRaw<Envelope>(`secret:${key}`)
  return value ? decrypt<T>(value, activeKey) : undefined
}

export async function deleteSecret(key: string): Promise<void> {
  if (!activeKey) throw new Error('Unlock this device before changing field data.')
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(`secret:${key}`)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
  })
}

export async function clearVault(): Promise<void> {
  activeKey = null
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
