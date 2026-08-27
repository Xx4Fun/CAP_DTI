const DB_NAME = 'price-watch-field-vault'
const STORE = 'encrypted-values'
const ITERATIONS = 150_000
const METADATA_KEY = 'vault:v2'

interface Envelope { iv: number[]; data: number[] }
interface BiometricWrapper { credentialId: number[]; prfSalt: number[]; wrapper: Envelope }
interface VaultMetadata { version: 2; pinSalt: number[]; pinWrapper: Envelope; verifier: Envelope; biometric?: BiometricWrapper }

export interface VaultBiometricProvider {
  isAvailable(): Promise<boolean>
  enroll(prfSalt: Uint8Array): Promise<{ credentialId: Uint8Array; secret: Uint8Array }>
  verify(credentialId: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array>
}

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

async function deleteRaw(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(key)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
  })
}

async function rawEntries(): Promise<Array<[IDBValidKey, unknown]>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE).objectStore(STORE)
    const keys = store.getAllKeys()
    const values = store.getAll()
    let settled = false
    const finish = () => {
      if (settled || keys.readyState !== 'done' || values.readyState !== 'done') return
      settled = true
      db.close()
      resolve(keys.result.map((key, index) => [key, values.result[index]]))
    }
    keys.onsuccess = finish
    values.onsuccess = finish
    keys.onerror = values.onerror = () => { db.close(); reject(keys.error || values.error) }
  })
}

async function commitMigration(metadata: VaultMetadata, secrets: Array<[string, Envelope]>): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    store.put(metadata, METADATA_KEY)
    secrets.forEach(([key, value]) => store.put(value, key))
    store.delete('salt')
    store.delete('verifier')
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Vault migration aborted.')) }
  })
}

function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bytesBuffer(salt), iterations: ITERATIONS, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

async function importDataKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytesBuffer(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

async function exportDataKey(key: CryptoKey): Promise<number[]> {
  return Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}

async function importDeviceKey(secret: Uint8Array): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', bytesBuffer(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
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

async function verifyDataKey(key: CryptoKey, verifier: Envelope): Promise<void> {
  const result = await decrypt<{ valid: boolean }>(verifier, key)
  if (!result.valid) throw new Error('Invalid vault key.')
}

export async function hasVault(): Promise<boolean> { return Boolean(await getRaw(METADATA_KEY) || await getRaw('salt')) }

export async function createVault(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Use a 4 to 8 digit PIN.')
  const pinSalt = crypto.getRandomValues(new Uint8Array(16))
  const pinKey = await derivePinKey(pin, pinSalt)
  const dataKey = await generateDataKey()
  const metadata: VaultMetadata = {
    version: 2,
    pinSalt: Array.from(pinSalt),
    pinWrapper: await encrypt({ key: await exportDataKey(dataKey) }, pinKey),
    verifier: await encrypt({ valid: true }, dataKey),
  }
  await setRaw(METADATA_KEY, metadata)
  activeKey = dataKey
}

export async function unlockVault(pin: string): Promise<void> {
  activeKey = null
  const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
  if (metadata) {
    try {
      const pinKey = await derivePinKey(pin, new Uint8Array(metadata.pinSalt))
      const wrapped = await decrypt<{ key: number[] }>(metadata.pinWrapper, pinKey)
      const dataKey = await importDataKey(new Uint8Array(wrapped.key))
      await verifyDataKey(dataKey, metadata.verifier)
      activeKey = dataKey
      return
    } catch {
      throw new Error('The PIN is incorrect or the secure vault is damaged.')
    }
  }
  await migrateLegacyVault(pin)
}

async function migrateLegacyVault(pin: string): Promise<void> {
  const salt = await getRaw<number[]>('salt')
  const verifier = await getRaw<Envelope>('verifier')
  if (!salt || !verifier) throw new Error('No offline vault exists on this device.')
  let legacyKey: CryptoKey
  try {
    legacyKey = await derivePinKey(pin, new Uint8Array(salt))
    await verifyDataKey(legacyKey, verifier)
  } catch {
    throw new Error('The PIN is incorrect.')
  }

  try {
    const entries = (await rawEntries()).filter(([key]) => typeof key === 'string' && key.startsWith('secret:')) as Array<[string, Envelope]>
    const plaintext = await Promise.all(entries.map(async ([key, value]) => [key, await decrypt(value, legacyKey)] as [string, unknown]))
    const dataKey = await generateDataKey()
    const pinSalt = crypto.getRandomValues(new Uint8Array(16))
    const pinKey = await derivePinKey(pin, pinSalt)
    const metadata: VaultMetadata = {
      version: 2,
      pinSalt: Array.from(pinSalt),
      pinWrapper: await encrypt({ key: await exportDataKey(dataKey) }, pinKey),
      verifier: await encrypt({ valid: true }, dataKey),
    }
    const encrypted = await Promise.all(plaintext.map(async ([key, value]) => [key, await encrypt(value, dataKey)] as [string, Envelope]))
    await verifyDataKey(dataKey, metadata.verifier)
    await Promise.all(encrypted.map(([, value], index) => decrypt(value, dataKey).then((result) => {
      if (JSON.stringify(result) !== JSON.stringify(plaintext[index][1])) throw new Error('Vault verification failed.')
    })))
    await commitMigration(metadata, encrypted)
    activeKey = dataKey
  } catch {
    activeKey = null
    throw new Error('The vault could not be upgraded safely. Your encrypted work was preserved; unlock with the PIN and try again.')
  }
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
  await deleteRaw(`secret:${key}`)
}

export async function isBiometricUnlockAvailable(provider: VaultBiometricProvider = browserBiometricProvider): Promise<boolean> {
  try { return await provider.isAvailable() } catch { return false }
}

export async function hasBiometricUnlock(): Promise<boolean> { return Boolean((await getRaw<VaultMetadata>(METADATA_KEY))?.biometric) }

export async function enableBiometricUnlock(provider: VaultBiometricProvider = browserBiometricProvider): Promise<void> {
  if (!activeKey) throw new Error('Unlock this device with the PIN before enabling biometric unlock.')
  if (!await isBiometricUnlockAvailable(provider)) throw new Error('Device biometric unlock is unavailable.')
  const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
  if (!metadata) throw new Error('Upgrade the secure vault with the PIN before enabling biometric unlock.')
  const prfSalt = crypto.getRandomValues(new Uint8Array(32))
  const enrollment = await provider.enroll(prfSalt)
  const deviceKey = await importDeviceKey(enrollment.secret)
  await setRaw(METADATA_KEY, {
    ...metadata,
    biometric: {
      credentialId: Array.from(enrollment.credentialId), prfSalt: Array.from(prfSalt),
      wrapper: await encrypt({ key: await exportDataKey(activeKey) }, deviceKey),
    },
  } satisfies VaultMetadata)
}

export async function disableBiometricUnlock(): Promise<void> {
  const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
  if (metadata?.biometric) {
    const { biometric: _removed, ...withoutBiometric } = metadata
    await setRaw(METADATA_KEY, withoutBiometric)
  }
}

export async function unlockVaultWithBiometrics(provider: VaultBiometricProvider = browserBiometricProvider): Promise<void> {
  activeKey = null
  const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
  if (!metadata?.biometric) throw new Error('Biometric unlock is not enabled. Use the device PIN.')
  try {
    const secret = await provider.verify(new Uint8Array(metadata.biometric.credentialId), new Uint8Array(metadata.biometric.prfSalt))
    const deviceKey = await importDeviceKey(secret)
    const wrapped = await decrypt<{ key: number[] }>(metadata.biometric.wrapper, deviceKey)
    const dataKey = await importDataKey(new Uint8Array(wrapped.key))
    await verifyDataKey(dataKey, metadata.verifier)
    activeKey = dataKey
  } catch {
    throw new Error('Biometric verification was not completed. Use the device PIN.')
  }
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

type PrfExtensionResults = { prf?: { results?: { first?: ArrayBuffer } } }

const browserBiometricProvider: VaultBiometricProvider = {
  async isAvailable() {
    if (!window.PublicKeyCredential || !navigator.credentials) return false
    if (!await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) return false
    const api = PublicKeyCredential as typeof PublicKeyCredential & { getClientCapabilities?: () => Promise<Record<string, boolean>> }
    return (await api.getClientCapabilities?.())?.prf === true
  },
  async enroll(prfSalt) {
    const credential = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'PRICE-Watch' },
      user: { id: crypto.getRandomValues(new Uint8Array(32)), name: 'field-officer-device', displayName: 'PRICE-Watch Field Officer' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000, attestation: 'none',
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    } }) as PublicKeyCredential | null
    const secret = (credential?.getClientExtensionResults() as PrfExtensionResults | undefined)?.prf?.results?.first
    if (!credential || !secret) throw new Error('This authenticator does not provide PRF unlock.')
    return { credentialId: new Uint8Array(credential.rawId), secret: new Uint8Array(secret) }
  },
  async verify(credentialId, prfSalt) {
    const credential = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: bytesBuffer(credentialId), type: 'public-key' }], userVerification: 'required', timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    } }) as PublicKeyCredential | null
    const secret = (credential?.getClientExtensionResults() as PrfExtensionResults | undefined)?.prf?.results?.first
    if (!secret) throw new Error('Biometric verification did not produce a device key.')
    return new Uint8Array(secret)
  },
}
