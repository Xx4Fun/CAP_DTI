const DB_NAME = 'price-watch-field-vault'
const STORE = 'encrypted-values'
const ITERATIONS = 150_000
const METADATA_KEY = 'vault:v2'
const SESSION_KEY = 'price-watch-field-session-key'
const SESSION_WRAPPER = 'price-watch-field-session-wrapper'

interface Envelope { iv: number[]; data: number[] }
interface BiometricWrapper { credentialId: number[]; prfSalt: number[]; wrapper: Envelope }
interface VaultMetadata { version: 2; pinSalt: number[]; pinWrapper: Envelope; verifier: Envelope; pinLength?: number; biometric?: BiometricWrapper }
export interface VaultUnlockResult { requiresPinMigration: boolean }
export type BiometricAvailability = 'available' | 'browser-unsupported' | 'platform-authenticator-unavailable' | 'prf-unsupported'

export interface VaultBiometricProvider {
  isAvailable(): Promise<boolean>
  enroll(prfSalt: Uint8Array): Promise<{ credentialId: Uint8Array; secret: Uint8Array }>
  verify(credentialId: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array>
}

let activeKey: CryptoKey | null = null

function clearVaultSession(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_WRAPPER)
}

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
    try {
      transaction.objectStore(STORE).put(value, key)
    } catch (error) {
      transaction.abort()
      db.close()
      reject(error)
      return
    }
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

async function rememberVaultSession(key: CryptoKey): Promise<void> {
  if (typeof sessionStorage === 'undefined') return
  const sessionKey = await generateDataKey()
  const wrapper = await encrypt({ key: await exportDataKey(key) }, sessionKey)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(await exportDataKey(sessionKey)))
  sessionStorage.setItem(SESSION_WRAPPER, JSON.stringify(wrapper))
}

export async function restoreVaultSession(): Promise<boolean> {
  activeKey = null
  if (typeof sessionStorage === 'undefined') return false
  const rawSessionKey = sessionStorage.getItem(SESSION_KEY)
  const rawWrapper = sessionStorage.getItem(SESSION_WRAPPER)
  if (!rawSessionKey || !rawWrapper) return false
  try {
    const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
    if (!metadata) throw new Error('Vault metadata is missing.')
    const sessionKey = await importDataKey(new Uint8Array(JSON.parse(rawSessionKey) as number[]))
    const wrapped = await decrypt<{ key: number[] }>(JSON.parse(rawWrapper) as Envelope, sessionKey)
    const dataKey = await importDataKey(new Uint8Array(wrapped.key))
    await verifyDataKey(dataKey, metadata.verifier)
    activeKey = dataKey
    return true
  } catch {
    clearVaultSession()
    return false
  }
}

export async function hasVault(): Promise<boolean> { return Boolean(await getRaw(METADATA_KEY) || await getRaw('salt')) }
export async function getVaultPinLength(): Promise<number | null> { return (await getRaw<VaultMetadata>(METADATA_KEY))?.pinLength ?? null }

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
    pinLength: pin.length,
  }
  await setRaw(METADATA_KEY, metadata)
  activeKey = dataKey
  await rememberVaultSession(dataKey)
}

export async function unlockVault(pin: string): Promise<VaultUnlockResult> {
  activeKey = null
  clearVaultSession()
  const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
  if (metadata) {
    try {
      const pinKey = await derivePinKey(pin, new Uint8Array(metadata.pinSalt))
      const wrapped = await decrypt<{ key: number[] }>(metadata.pinWrapper, pinKey)
      const dataKey = await importDataKey(new Uint8Array(wrapped.key))
      await verifyDataKey(dataKey, metadata.verifier)
      const pinLength = metadata.pinLength ?? pin.length
      if (metadata.pinLength === undefined) await setRaw(METADATA_KEY, { ...metadata, pinLength })
      activeKey = dataKey
      const result = { requiresPinMigration: pinLength !== 4 }
      if (!result.requiresPinMigration) await rememberVaultSession(dataKey)
      return result
    } catch {
      activeKey = null
      throw new Error('The PIN is incorrect or the secure vault is damaged.')
    }
  }
  return migrateLegacyVault(pin)
}

async function migrateLegacyVault(pin: string): Promise<VaultUnlockResult> {
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
      pinLength: pin.length,
    }
    const encrypted = await Promise.all(plaintext.map(async ([key, value]) => [key, await encrypt(value, dataKey)] as [string, Envelope]))
    await verifyDataKey(dataKey, metadata.verifier)
    await Promise.all(encrypted.map(([, value], index) => decrypt(value, dataKey).then((result) => {
      if (JSON.stringify(result) !== JSON.stringify(plaintext[index][1])) throw new Error('Vault verification failed.')
    })))
    await commitMigration(metadata, encrypted)
    activeKey = dataKey
    const result = { requiresPinMigration: pin.length !== 4 }
    if (!result.requiresPinMigration) await rememberVaultSession(dataKey)
    return result
  } catch {
    activeKey = null
    throw new Error('The vault could not be upgraded safely. Your encrypted work was preserved; unlock with the PIN and try again.')
  }
}

export async function rewrapVaultPin(pin: string): Promise<void> {
  if (!activeKey) throw new Error('Unlock the existing vault before changing its PIN.')
  if (!/^\d{4}$/.test(pin)) throw new Error('Use exactly four digits.')
  const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
  if (!metadata) throw new Error('No secure vault exists on this device.')
  const pinSalt = crypto.getRandomValues(new Uint8Array(16))
  const pinKey = await derivePinKey(pin, pinSalt)
  const nextMetadata: VaultMetadata = {
    ...metadata,
    pinSalt: Array.from(pinSalt),
    pinWrapper: await encrypt({ key: await exportDataKey(activeKey) }, pinKey),
    pinLength: 4,
  }
  await setRaw(METADATA_KEY, nextMetadata)
  await rememberVaultSession(activeKey)
}

export function lockVault() { activeKey = null; clearVaultSession() }

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

async function detectBrowserBiometricAvailability(): Promise<BiometricAvailability> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) return 'browser-unsupported'
  const api = window.PublicKeyCredential as typeof PublicKeyCredential & { getClientCapabilities?: () => Promise<Record<string, boolean>> }
  if (!api.getClientCapabilities) return 'browser-unsupported'
  if (!await api.isUserVerifyingPlatformAuthenticatorAvailable()) return 'platform-authenticator-unavailable'
  return (await api.getClientCapabilities())['extension:prf'] === true ? 'available' : 'prf-unsupported'
}

export async function getBiometricUnlockAvailability(provider: VaultBiometricProvider = browserBiometricProvider): Promise<BiometricAvailability> {
  try {
    if (provider === browserBiometricProvider) return await detectBrowserBiometricAvailability()
    return await provider.isAvailable() ? 'available' : 'prf-unsupported'
  } catch {
    return 'browser-unsupported'
  }
}

export async function isBiometricUnlockAvailable(provider: VaultBiometricProvider = browserBiometricProvider): Promise<boolean> {
  return await getBiometricUnlockAvailability(provider) === 'available'
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

export async function unlockVaultWithBiometrics(provider: VaultBiometricProvider = browserBiometricProvider): Promise<VaultUnlockResult> {
  activeKey = null
  clearVaultSession()
  const metadata = await getRaw<VaultMetadata>(METADATA_KEY)
  if (!metadata?.biometric) throw new Error('Biometric unlock is not enabled. Use the device PIN.')
  try {
    const secret = await provider.verify(new Uint8Array(metadata.biometric.credentialId), new Uint8Array(metadata.biometric.prfSalt))
    const deviceKey = await importDeviceKey(secret)
    const wrapped = await decrypt<{ key: number[] }>(metadata.biometric.wrapper, deviceKey)
    const dataKey = await importDataKey(new Uint8Array(wrapped.key))
    await verifyDataKey(dataKey, metadata.verifier)
    activeKey = dataKey
    const result = { requiresPinMigration: metadata.pinLength !== 4 }
    if (!result.requiresPinMigration) await rememberVaultSession(dataKey)
    return result
  } catch {
    throw new Error('Biometric verification was not completed. Use the device PIN.')
  }
}

export async function clearVault(): Promise<void> {
  activeKey = null
  clearVaultSession()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

type PrfExtensionResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

const browserBiometricProvider: VaultBiometricProvider = {
  async isAvailable() {
    return await detectBrowserBiometricAvailability() === 'available'
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
    if (!credential) throw new Error('Biometric enrollment was not completed.')
    const credentialId = new Uint8Array(credential.rawId)
    const prf = (credential.getClientExtensionResults() as PrfExtensionResults | undefined)?.prf
    if (prf?.results?.first) return { credentialId, secret: new Uint8Array(prf.results.first) }
    if (prf?.enabled !== true) throw new Error('This authenticator does not provide PRF unlock.')
    return { credentialId, secret: await browserBiometricProvider.verify(credentialId, prfSalt) }
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
