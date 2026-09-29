import { describe, expect, it } from 'vitest'
import type { MonitoringMatrixData, MonitoringMatrixEstablishment } from '../types/admin'
import { buildMonitoringMatrixWorkbook, weeklyPriceStats } from './monitoringExcelExport'

const store = (id: number, name: string, prices: MonitoringMatrixEstablishment['prices']): MonitoringMatrixEstablishment => ({
  store_id: id, store_name: name, monitoring_date: '2026-09-01', monitoring_date_formatted: 'Sep 01, 2026', prices,
})

const data: MonitoringMatrixData = {
  period: 'last_4_weeks',
  date_range: { from: null, to: null },
  generated_at: '2026-09-24T00:00:00Z',
  commodities: [
    { id: 1, commodity_name: 'Rice', unit: 'kg', category: 'Grains', regulatory_classification: 'Basic Necessities', srp: 50 },
    { id: 2, commodity_name: 'Sardines', unit: 'can', category: 'Canned', regulatory_classification: 'Basic Necessities', srp: 20 },
    { id: 3, commodity_name: 'Sugar', unit: 'kg', category: 'Sweeteners', regulatory_classification: 'Prime Commodities', srp: 70 },
  ],
  weeks: [
    { week_number: 1, week_key: 'w1', week_label: 'Week 1', starts_at: '', ends_at: '', establishments: [
      store(1, 'Store A', { 1: { recorded_price: 48, is_anomaly: false } }),
    ] },
    { week_number: 2, week_key: 'w2', week_label: 'Week 2', starts_at: '', ends_at: '', establishments: [
      store(1, 'Store A', { 1: { recorded_price: 49, is_anomaly: false }, 2: { recorded_price: 1, is_anomaly: false } }),
      store(2, 'Store B', { 1: { recorded_price: 56, is_anomaly: true }, 2: { recorded_price: 1.01, is_anomaly: false } }),
      store(3, 'Store C', { 1: { recorded_price: 51, is_anomaly: false } }),
    ] },
  ],
}

describe('buildMonitoringMatrixWorkbook', () => {
  const sheet = buildMonitoringMatrixWorkbook(data, 'Last 4 Weeks').worksheets[0]
  // Columns: A-E static | F Store A, G-I week 1 MIN/MAX/AVG | J-L stores, M-O week 2 MIN/MAX/AVG
  const value = (address: string) => sheet.getCell(address).value

  it('closes every week with MIN, MAX and AVERAGE columns under the week header', () => {
    expect(['G7', 'H7', 'I7'].map(value)).toEqual(['MIN', 'MAX', 'AVERAGE'])
    expect(['M7', 'N7', 'O7'].map(value)).toEqual(['MIN', 'MAX', 'AVERAGE'])
    expect(sheet.getCell('O6').master.address).toBe('J6')
    expect(sheet.getCell('I8').value).toBe('(Min+Max)/2')
  })

  it('computes per-item stats across the week establishments, including anomalies', () => {
    // Rice week 2: 49, 56, 51
    expect(['M9', 'N9', 'O9'].map(value)).toEqual([49, 56, 52.5])
    // Sardines week 2: half-cent midpoint of 1.00 and 1.01
    expect(['M10', 'N10', 'O10'].map(value)).toEqual([1, 1.01, 1.01])
    // Sugar: nobody recorded it
    expect(['M11', 'N11', 'O11'].map(value)).toEqual(['—', '—', '—'])
    // Week 1 single store
    expect(['G9', 'H9', 'I9'].map(value)).toEqual([48, 48, 48])
  })

  it('leaves the stat columns blank in the footer and keeps store counts', () => {
    expect(value('J12')).toBe('2 items')
    expect(['M12', 'N12', 'O12', 'M13', 'N13', 'O13'].map(value)).toEqual([null, null, null, null, null, null])
    expect(value('K13')).toBe('1 flagged')
  })

  it('keeps the banner and repeated print headers without frozen panes', () => {
    expect(sheet.getCell('E1').master.address).toBe('A1')
    expect(sheet.getCell('F1').master.address).toBe('F1')
    expect(sheet.views[0]).toMatchObject({ showGridLines: false })
    expect(sheet.views[0]).not.toHaveProperty('state', 'frozen')
    expect(sheet.views[0]).not.toHaveProperty('xSplit')
    expect(sheet.views[0]).not.toHaveProperty('ySplit')
    expect(sheet.pageSetup).toMatchObject({ orientation: 'landscape', printTitlesRow: '6:8', printTitlesColumn: 'A:E' })
    expect(sheet.pageSetup.fitToPage).toBeFalsy()
    expect(value('F8')).toBe('Sep 01, 2026')
    expect(sheet.getCell('O9').border.right?.style).toBe('medium')
    expect(sheet.getCell('L9').border.right?.style).toBe('thin')
  })

  it('fits long labels and centers the SRP column', () => {
    expect([1, 2, 3, 4, 5, 6].map((col) => sheet.getColumn(col).width)).toEqual([40, 8, 34, 20, 12, 18])
    expect(sheet.getRow(7).height).toBe(48)
    expect(sheet.getRow(9).height).toBeUndefined()
    expect(sheet.getCell('A9').alignment.wrapText).toBe(true)
    expect(sheet.getCell('C9').alignment.wrapText).toBe(true)
    expect(sheet.getCell('D9').alignment.wrapText).toBe(true)
    expect(sheet.getCell('E6').alignment.horizontal).toBe('center')
    expect(sheet.getCell('E9').alignment.horizontal).toBe('center')
    expect(sheet.getCell('F9').alignment.horizontal).toBe('right')
    expect(sheet.getCell('A3').font.size).toBe(14)
    expect(sheet.getCell('A9').font.size).toBe(10)
  })

  it('gives longer store names more header height', () => {
    const longName = 'Sample Retail Chain Branch With Several Extra Words And A Very Long Location Description'
    const longStoreData: MonitoringMatrixData = {
      ...data,
      weeks: [{ ...data.weeks[0], establishments: [store(1, longName, {})] }],
    }
    const longStoreSheet = buildMonitoringMatrixWorkbook(longStoreData, 'Last 4 Weeks').worksheets[0]

    expect(longStoreSheet.getRow(7).height).toBeGreaterThan(48)
    expect(longStoreSheet.getCell('F7').alignment.wrapText).toBe(true)
  })
})

describe('weeklyPriceStats', () => {
  it('returns null when no price was recorded', () => {
    expect(weeklyPriceStats([])).toBeNull()
  })
})
