import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveUnreadableDrafts, clearVault, createVault, enableBiometricUnlock, getBiometricUnlockAvailability, getVaultPinLength, hasBiometricUnlock,
  isBiometricUnlockAvailable, lockVault, readSecret, restoreVaultSession,
  requestPersistentStorage, rewrapVaultPin, unlockVault, unlockVaultWithBiometrics, writeSecret,
} from './vault'
import type { VaultBiometricProvider } from './vault'

const LEGACY_DB = 'price-watch-field-vault'
const LEGACY_STORE = 'encrypted-values'
const sessionValues = new Map<string, string>()
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  get length() { return sessionValues.size },
  clear: () => sessionValues.clear(),
  getItem: (key: string) => sessionValues.get(key) ?? null,
  key: (index: number) => [...sessionValues.keys()][index] ?? null,
  removeItem: (key: string) => { sessionValues.delete(key) },
  setItem: (key: string, value: string) => { sessionValues.set(key, value) },
} })

async function legacyKey(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function legacyEnvelope(value: unknown, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)))
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(data)) }
}

async function seedLegacyVault(corruptSecret = false) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await legacyKey('4321', salt)
  const verifier = await legacyEnvelope({ valid: true }, key)
  const secret = corruptSecret ? { iv: [1], data: [2] } : await legacyEnvelope({ token: 'legacy-token' }, key)
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(LEGACY_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(LEGACY_STORE, 'readwrite')
    const store = transaction.objectStore(LEGACY_STORE)
    store.put(Array.from(salt), 'salt')
    store.put(verifier, 'verifier')
    store.put(secret, 'secret:session')
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
  })
}

async function rawRecord(key: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(LEGACY_STORE).objectStore(LEGACY_STORE).get(key)
    request.onsuccess = () => { db.close(); resolve(request.result) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

async function rawKeys() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = db.transaction(LEGACY_STORE).objectStore(LEGACY_STORE).getAllKeys()
    request.onsuccess = () => { db.close(); resolve(request.result) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

function biometricProvider(secret = new Uint8Array(32).fill(7)): VaultBiometricProvider {
  return {
    isAvailable: async () => true,
    enroll: async () => ({ credentialId: new Uint8Array([1, 2, 3]), secret }),
    verify: async () => secret,
  }
}

describe('encrypted offline vault', () => {
  beforeEach(async () => { sessionStorage.clear(); await clearVault() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('requests durable browser storage when the platform supports it', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persist } })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('continues when durable browser storage is unsupported', async () => {
    vi.stubGlobal('navigator', {})
    await expect(requestPersistentStorage()).resolves.toBeNull()
  })

  it('does not persist plaintext and requires the correct PIN after locking', async () => {
    await createVault('4321')
    expect(await getVaultPinLength()).toBe(4)
    await writeSecret('session', { token: 'private-token' })
    lockVault()
    await expect(unlockVault('1111')).rejects.toThrow('PIN')
    await unlockVault('4321')
    expect(await readSecret<{ token: string }>('session')).toEqual({ token: 'private-token' })
  })

  it('archives only draft records while preserving the locked vault and queued evidence', async () => {
    await createVault('4321')
    await writeSecret('session', { token: 'current-session' })
    await writeSecret('queue', [{ client_uuid: 'queued-1' }])
    await writeSecret('drafts', [{ client_uuid: 'draft-1' }])
    await writeSecret('active-draft', { client_uuid: 'legacy-draft' })
    const draftsEnvelope = await rawRecord('secret:drafts')
    const legacyEnvelope = await rawRecord('secret:active-draft')
    lockVault()

    await archiveUnreadableDrafts()

    expect(await rawRecord('secret:drafts')).toBeUndefined()
    expect(await rawRecord('secret:active-draft')).toBeUndefined()
    const keys = (await rawKeys()).map(String)
    const archivedDrafts = keys.find((key) => key.startsWith('recovery:drafts:'))
    const archivedLegacy = keys.find((key) => key.startsWith('recovery:active-draft:'))
    expect(archivedDrafts && await rawRecord(archivedDrafts)).toEqual(draftsEnvelope)
    expect(archivedLegacy && await rawRecord(archivedLegacy)).toEqual(legacyEnvelope)
    await unlockVault('4321')
    expect(await readSecret('session')).toEqual({ token: 'current-session' })
    expect(await readSecret('queue')).toEqual([{ client_uuid: 'queued-1' }])
  })

  it('refuses to replace an existing vault and its encrypted records', async () => {
    await createVault('4321')
    await writeSecret('drafts', [{ client_uuid: 'preserved-draft' }])

    await expect(createVault('9876')).rejects.toThrow('already exists')

    lockVault()
    await unlockVault('4321')
    expect(await readSecret('drafts')).toEqual([{ client_uuid: 'preserved-draft' }])
  })

  it('uses PIN and biometric verification to unwrap the same vault data key', async () => {
    const provider = biometricProvider()
    await createVault('4321')
    await writeSecret('draft', { client_uuid: 'draft-1' })
    await enableBiometricUnlock(provider)
    expect(await hasBiometricUnlock()).toBe(true)

    lockVault()
    await unlockVaultWithBiometrics(provider)
    expect(await readSecret('draft')).toEqual({ client_uuid: 'draft-1' })

    lockVault()
    await unlockVault('4321')
    expect(await readSecret('draft')).toEqual({ client_uuid: 'draft-1' })
  })

  it('keeps PIN recovery available when biometric verification fails', async () => {
    const provider = biometricProvider()
    await createVault('4321')
    await writeSecret('queue', [{ client_uuid: 'queued-1' }])
    await enableBiometricUnlock(provider)
    lockVault()

    await expect(unlockVaultWithBiometrics({ ...provider, verify: async () => { throw new Error('cancelled') } }))
      .rejects.toThrow('Biometric verification was not completed')
    await expect(readSecret('queue')).rejects.toThrow('Unlock this device')

    await unlockVault('4321')
    expect(await readSecret('queue')).toEqual([{ client_uuid: 'queued-1' }])
  })

  it('explains biometric cancellation or timeout while preserving PIN recovery', async () => {
    const provider = biometricProvider()
    await createVault('4321')
    await enableBiometricUnlock(provider)
    lockVault()

    await expect(unlockVaultWithBiometrics({
      ...provider,
      verify: async () => { throw new DOMException('cancelled', 'NotAllowedError') },
    })).rejects.toThrow('canceled or timed out')

    await expect(readSecret('session')).rejects.toThrow('Unlock this device')
  })

  it('explains when the saved biometric credential is no longer available', async () => {
    const provider = biometricProvider()
    await createVault('4321')
    await enableBiometricUnlock(provider)
    lockVault()

    await expect(unlockVaultWithBiometrics({
      ...provider,
      verify: async () => { throw new DOMException('missing', 'NotFoundError') },
    })).rejects.toThrow('re-enable biometric unlock')
  })

  it('reports biometric unlock unavailable when platform verification or PRF is missing', async () => {
    expect(await isBiometricUnlockAvailable({ ...biometricProvider(), isAvailable: async () => false })).toBe(false)
  })

  it('detects PRF support using the WebAuthn extension capability key', async () => {
    const MockPublicKeyCredential = class {
      static async isUserVerifyingPlatformAuthenticatorAvailable() { return true }
      static async getClientCapabilities() { return { 'extension:prf': true, prf: false } }
    }
    vi.stubGlobal('PublicKeyCredential', MockPublicKeyCredential)
    vi.stubGlobal('window', { PublicKeyCredential: MockPublicKeyCredential })
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: {} })

    expect(await isBiometricUnlockAvailable()).toBe(true)
  })

  it('finishes PRF enrollment with an assertion when registration returns only enabled', async () => {
    const secret = new Uint8Array(32).fill(9)
    const MockPublicKeyCredential = class {
      static async isUserVerifyingPlatformAuthenticatorAvailable() { return true }
      static async getClientCapabilities() { return { 'extension:prf': true } }
    }
    const create = vi.fn().mockResolvedValue({
      rawId: new Uint8Array([4, 5, 6]).buffer,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
    })
    const get = vi.fn().mockResolvedValue({
      getClientExtensionResults: () => ({ prf: { results: { first: secret.buffer } } }),
    })
    vi.stubGlobal('PublicKeyCredential', MockPublicKeyCredential)
    vi.stubGlobal('window', { PublicKeyCredential: MockPublicKeyCredential })
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } })

    await createVault('4321')
    await enableBiometricUnlock()

    expect(await hasBiometricUnlock()).toBe(true)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('distinguishes outdated browsers from missing platform authenticators and PRF support', async () => {
    const BrowserWithoutCapabilities = class {
      static async isUserVerifyingPlatformAuthenticatorAvailable() { return true }
    }
    vi.stubGlobal('PublicKeyCredential', BrowserWithoutCapabilities)
    vi.stubGlobal('window', { PublicKeyCredential: BrowserWithoutCapabilities })
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: {} })
    expect(await getBiometricUnlockAvailability()).toBe('browser-unsupported')

    const NoPlatformAuthenticator = class {
      static async isUserVerifyingPlatformAuthenticatorAvailable() { return false }
      static async getClientCapabilities() { return { 'extension:prf': true } }
    }
    vi.stubGlobal('PublicKeyCredential', NoPlatformAuthenticator)
    vi.stubGlobal('window', { PublicKeyCredential: NoPlatformAuthenticator })
    expect(await getBiometricUnlockAvailability()).toBe('platform-authenticator-unavailable')

    const NoPrf = class {
      static async isUserVerifyingPlatformAuthenticatorAvailable() { return true }
      static async getClientCapabilities() { return { 'extension:prf': false } }
    }
    vi.stubGlobal('PublicKeyCredential', NoPrf)
    vi.stubGlobal('window', { PublicKeyCredential: NoPrf })
    expect(await getBiometricUnlockAvailability()).toBe('prf-unsupported')
  })

  it('restores the data key only within the same browser session and clears it on explicit lock', async () => {
    await createVault('4321')
    await writeSecret('draft', { client_uuid: 'same-session' })
    expect(sessionStorage.length).toBeGreaterThan(0)

    expect(await restoreVaultSession()).toBe(true)
    expect(await readSecret('draft')).toEqual({ client_uuid: 'same-session' })

    lockVault()
    expect(sessionStorage.length).toBe(0)
    expect(await restoreVaultSession()).toBe(false)
  })

  it('rejects a corrupt session wrapper and removes the shortcut', async () => {
    await createVault('4321')
    sessionStorage.setItem('price-watch-field-session-wrapper', '{"iv":[1],"data":[2]}')
    expect(await restoreVaultSession()).toBe(false)
    expect(sessionStorage.length).toBe(0)
    await expect(readSecret('draft')).rejects.toThrow('Unlock this device')
  })

  it('rewraps the same encrypted data key under a new four-digit PIN without changing evidence', async () => {
    const provider = biometricProvider()
    await createVault('123456')
    await writeSecret('queue', [{ client_uuid: 'evidence-1' }])
    await enableBiometricUnlock(provider)
    lockVault()
    expect(await unlockVault('123456')).toEqual({ requiresPinMigration: true })

    await rewrapVaultPin('2468')
    lockVault()
    await expect(unlockVault('123456')).rejects.toThrow('PIN')
    await unlockVault('2468')
    expect(await readSecret('queue')).toEqual([{ client_uuid: 'evidence-1' }])
    expect(await hasBiometricUnlock()).toBe(true)
  })

  it('keeps the previous PIN wrapper when a migration write is interrupted', async () => {
    await createVault('123456')
    await writeSecret('draft', { client_uuid: 'preserved-draft' })
    lockVault()
    await unlockVault('123456')
    const originalPut = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new Error('simulated interruption') })
    await expect(rewrapVaultPin('2468')).rejects.toThrow('simulated interruption')
    put.mockRestore()

    lockVault()
    await unlockVault('123456')
    expect(await readSecret('draft')).toEqual({ client_uuid: 'preserved-draft' })
    IDBObjectStore.prototype.put = originalPut
  })

  it('transactionally migrates a legacy PIN vault after the next correct unlock', async () => {
    await seedLegacyVault()
    await unlockVault('4321')
    expect(await readSecret('session')).toEqual({ token: 'legacy-token' })
    expect(await rawRecord('vault:v2')).toBeTruthy()
    expect(await rawRecord('salt')).toBeUndefined()
  })

  it('preserves the legacy envelope when any migration value is corrupted', async () => {
    await seedLegacyVault(true)
    await expect(unlockVault('4321')).rejects.toThrow('preserved')
    expect(await rawRecord('salt')).toBeTruthy()
    expect(await rawRecord('vault:v2')).toBeUndefined()
  })
})
