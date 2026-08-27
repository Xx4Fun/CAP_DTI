import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearVault, createVault, enableBiometricUnlock, hasBiometricUnlock,
  isBiometricUnlockAvailable, lockVault, readSecret, unlockVault,
  unlockVaultWithBiometrics, writeSecret,
} from './vault'
import type { VaultBiometricProvider } from './vault'

const LEGACY_DB = 'price-watch-field-vault'
const LEGACY_STORE = 'encrypted-values'

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

function biometricProvider(secret = new Uint8Array(32).fill(7)): VaultBiometricProvider {
  return {
    isAvailable: async () => true,
    enroll: async () => ({ credentialId: new Uint8Array([1, 2, 3]), secret }),
    verify: async () => secret,
  }
}

describe('encrypted offline vault', () => {
  beforeEach(async () => { await clearVault() })

  it('does not persist plaintext and requires the correct PIN after locking', async () => {
    await createVault('4321')
    await writeSecret('session', { token: 'private-token' })
    lockVault()
    await expect(unlockVault('1111')).rejects.toThrow('PIN')
    await unlockVault('4321')
    expect(await readSecret<{ token: string }>('session')).toEqual({ token: 'private-token' })
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

  it('reports biometric unlock unavailable when platform verification or PRF is missing', async () => {
    expect(await isBiometricUnlockAvailable({ ...biometricProvider(), isAvailable: async () => false })).toBe(false)
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
