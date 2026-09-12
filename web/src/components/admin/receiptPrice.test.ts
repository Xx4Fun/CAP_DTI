import { describe, expect, it } from 'vitest'
import { suggestedUnitPrice, toPrice } from './receiptPrice'

describe('suggestedUnitPrice', () => {
  it('prefers the extracted unit price', () => {
    expect(suggestedUnitPrice({ unit_price: '27.00', quantity: '3', observed_price: '81.00' })).toBe(27)
  })

  it('uses the line total only when a single unit was bought', () => {
    expect(suggestedUnitPrice({ quantity: '1', observed_price: '45.00' })).toBe(45)
    expect(suggestedUnitPrice({ quantity: null, observed_price: '45.00' })).toBe(45)
  })

  it('never turns a multi-unit line total into a unit price and never defaults to zero', () => {
    expect(suggestedUnitPrice({ quantity: '2', observed_price: '110.00' })).toBeNull()
    expect(suggestedUnitPrice({ quantity: '0.525', observed_price: '63.00' })).toBeNull()
    expect(suggestedUnitPrice({ quantity: '1', observed_price: null })).toBeNull()
    expect(toPrice('')).toBeNull()
    expect(toPrice('abc')).toBeNull()
  })
})
