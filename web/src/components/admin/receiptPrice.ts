export const toPrice = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Suggested per-unit price for a receipt item: the extracted unit price, or the line total when exactly one unit was
 * bought. With any other quantity and no unit price the value is unknown and the evaluator must enter it.
 */
export const suggestedUnitPrice = (item: { unit_price?: unknown; observed_price?: unknown; quantity?: unknown }): number | null => {
  const unitPrice = toPrice(item.unit_price)
  if (unitPrice !== null) return unitPrice
  const quantity = toPrice(item.quantity)
  return quantity === null || quantity === 1 ? toPrice(item.observed_price) : null
}
