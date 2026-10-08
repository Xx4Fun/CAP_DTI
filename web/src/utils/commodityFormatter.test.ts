import { describe, expect, it } from 'vitest'
import {
  formatCommodityDisplay,
  humanizeCommoditySlug,
  formatPstDate,
  formatPstDateRange,
} from './commodityFormatter'

describe('commodityFormatter', () => {
  it('formats raw DTI titles with categories and units', () => {
    const parsed = formatCommodityDisplay('Bottled Water - Distilled Water - Absolute (1L)')
    expect(parsed.title).toBe('Absolute (1L)')
    expect(parsed.categoryPath).toBe('Bottled Water - Distilled Water')
    expect(parsed.unit).toBe('1L')
  })

  it('humanizes kebab-case commodity slugs into clean titles', () => {
    expect(humanizeCommoditySlug('5-star-esperma-white-20pcspack-03')).toContain('5-Star Esperma White')
    expect(humanizeCommoditySlug('absolute-1l')).toBe('Absolute 1L')
    expect(humanizeCommoditySlug('wilkins-pure-500ml')).toBe('Wilkins Pure 500ml')
    expect(humanizeCommoditySlug('555-bonus-pack-155g')).toBe('555 Bonus Pack 155g')
    expect(humanizeCommoditySlug('cafe-puro-17g')).toBe('Cafe Puro 17g')
  })

  it('formats PST dates cleanly without raw ISO microsecond strings', () => {
    expect(formatPstDate('2026-10-07T00:00:00.000000Z')).toBe('Oct 7, 2026')
    expect(formatPstDate('2026-10-08')).toBe('Oct 8, 2026')
    expect(formatPstDate(null)).toBe('—')
    expect(formatPstDate('')).toBe('—')
  })

  it('formats PST date ranges cleanly', () => {
    expect(formatPstDateRange('2026-10-07T00:00:00.000000Z', '2026-10-08T00:00:00.000000Z')).toBe('Oct 7, 2026 – Oct 8, 2026')
    expect(formatPstDateRange('2026-10-07', null)).toBe('Oct 7, 2026 (Open)')
  })
})
