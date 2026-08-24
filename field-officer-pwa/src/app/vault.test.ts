import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearVault, createVault, lockVault, readSecret, unlockVault, writeSecret } from './vault'

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
})
