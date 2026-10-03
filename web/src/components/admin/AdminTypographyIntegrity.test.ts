import { describe, expect, it } from 'vitest'
import storeMapSource from './StoreMap.tsx?raw'
import citizenTipReviewSource from './CitizenTipReview.tsx?raw'
import storeManagerSource from './StoreManager.tsx?raw'

const adminOperationalSources = [
  storeMapSource,
  citizenTipReviewSource,
  storeManagerSource,
]

describe('Admin operational typography', () => {
  it('uses the shared icon and status language instead of native emoji labels', () => {
    for (const source of adminOperationalSources) {
      expect(['📈', '🧾', '📍', '📩', '✅', '⚠️'].some((label) => source.includes(label))).toBe(false)
    }
  })
})