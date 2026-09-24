import ExcelJS from 'exceljs'
import type { MonitoringMatrixData, MonitoringMatrixEstablishment } from '../types/admin'

function cleanCommodityName(name: string, unit: string | null): string {
  let cleaned = name.trim()
  if (unit && unit.trim()) {
    const u = unit.trim()
    const escaped = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(`\\s*\\(?\\s*${escaped}\\s*\\)?$`, 'i'), '').trim()
    cleaned = cleaned.replace(new RegExp(`\\s*-\\s*\\(?\\s*${escaped}\\s*\\)?$`, 'i'), '').trim()
  }
  // Strip trailing packaging specifications like (155g), (500mL), (1L), (6pcs./pack), (#03)
  cleaned = cleaned.replace(/\s*\(\s*\d+(\.\d+)?\s*(g|kg|ml|l|oz|pcs|pc|pack|can|btl|bottle|sachets?|m)\s*\)$/i, '').trim()
  cleaned = cleaned.replace(/\s*\(\s*#\d+\s*\)$/i, '').trim()
  return cleaned || name
}

/** Lowest, highest and their midpoint across one week's establishments; midpoint computed in whole cents. */
export function weeklyPriceStats(prices: number[]): { min: number; max: number; avg: number } | null {
  if (prices.length === 0) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return { min, max, avg: Math.round((Math.round(min * 100) + Math.round(max * 100)) / 2) / 100 }
}

export function buildMonitoringMatrixWorkbook(data: MonitoringMatrixData, periodLabel: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PRICE-Watch DTI Antique'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Price Monitoring Matrix', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 5, ySplit: 8 }],
    // Wide periods print across several pages with the commodity columns and headers repeated, never shrunk to fit.
    pageSetup: { orientation: 'landscape', paperSize: 9, printTitlesRow: '6:8', printTitlesColumn: 'A:E' },
  })

  // Color Palette - Unified DTI Government Theme
  const navyHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B365D' }, // DTI Deep Authority Navy
  }
  const weekHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F233D' }, // Premium Dark Navy
  }
  const storeHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF23456F' }, // DTI Medium Slate Navy
  }
  const dateHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' }, // Light Slate Ice Tint
  }
  const anomalyFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' }, // Amber warning background
  }
  const zebraFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' }, // Light Slate Tint
  }
  const summaryFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' }, // Cool Slate Fill
  }

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  }

  const headerBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF475569' } },
    bottom: { style: 'thin', color: { argb: 'FF475569' } },
    left: { style: 'thin', color: { argb: 'FF475569' } },
    right: { style: 'thin', color: { argb: 'FF475569' } },
  }

  const dividerRightBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'medium', color: { argb: 'FF64748B' } },
  }

  const doubleBottomBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'double', color: { argb: 'FF1E293B' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  }

  // 1. Calculate dynamic weekly columns: each week's stores, then its MIN / MAX / AVERAGE block
  let currentCol = 6
  type ColumnMapping = { colIndex: number; store: MonitoringMatrixEstablishment }
  type StatColumn = { colIndex: number; kind: 'min' | 'max' | 'avg'; establishments: MonitoringMatrixEstablishment[] }
  const colMappings: ColumnMapping[] = []
  const statCols: StatColumn[] = []
  const statHeaders = [
    { kind: 'min' as const, label: 'MIN', note: 'Lowest' },
    { kind: 'max' as const, label: 'MAX', note: 'Highest' },
    { kind: 'avg' as const, label: 'AVERAGE', note: '(Min+Max)/2' },
  ]
  // The week's closing divider sits on its AVERAGE column
  const borderFor = (col: number, base: Partial<ExcelJS.Borders>) =>
    statCols.some((s) => s.kind === 'avg' && s.colIndex === col)
      ? { ...base, right: { style: 'medium' as const, color: { argb: 'FF64748B' } } }
      : base

  const weeks = data.weeks || []
  if (weeks.length === 0) {
    sheet.mergeCells(6, currentCol, 8, currentCol)
    const emptyCell = sheet.getCell(6, currentCol)
    emptyCell.value = 'No Inspections Recorded in Period'
    emptyCell.fill = weekHeaderFill
    emptyCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    currentCol++
  } else {
    weeks.forEach((week) => {
      const stores = week.establishments || []
      if (stores.length === 0) return

      const weekStartCol = currentCol
      const weekEndCol = currentCol + stores.length + statHeaders.length - 1

      // Row 6: Week Group Header (Merged across all stores and the week's summary columns)
      sheet.mergeCells(6, weekStartCol, 6, weekEndCol)
      const weekCell = sheet.getCell(6, weekStartCol)
      weekCell.value = week.week_label.toUpperCase()
      weekCell.fill = weekHeaderFill
      weekCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      weekCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      weekCell.border = headerBorder

      for (let c = weekStartCol; c <= weekEndCol; c++) {
        sheet.getCell(6, c).fill = weekHeaderFill
        sheet.getCell(6, c).border = headerBorder
      }

      // Store Columns
      stores.forEach((store) => {
        // Row 7: Store Name
        const storeCell = sheet.getCell(7, currentCol)
        storeCell.value = store.store_name
        storeCell.fill = storeHeaderFill
        storeCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
        storeCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        storeCell.border = headerBorder

        // Row 8: Inspection Date
        const dateCell = sheet.getCell(8, currentCol)
        dateCell.value = store.monitoring_date_formatted || store.monitoring_date
        dateCell.fill = dateHeaderFill
        dateCell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF1E293B' } }
        dateCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        dateCell.border = headerBorder

        colMappings.push({ colIndex: currentCol, store })
        currentCol++
      })

      // Weekly MIN / MAX / AVERAGE Columns
      statHeaders.forEach((stat) => {
        const labelCell = sheet.getCell(7, currentCol)
        labelCell.value = stat.label
        labelCell.fill = navyHeaderFill
        labelCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
        labelCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        labelCell.border = headerBorder

        const noteCell = sheet.getCell(8, currentCol)
        noteCell.value = stat.note
        noteCell.fill = summaryFill
        noteCell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF1E293B' } }
        noteCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        noteCell.border = headerBorder

        statCols.push({ colIndex: currentCol, kind: stat.kind, establishments: stores })
        currentCol++
      })
    })
  }

  const lastCol = Math.max(currentCol - 1, 5)

  // 2. Banner Rows (1 to 4) - merged inside the frozen commodity columns so nothing straddles the pane split
  const bannerRows = [
    { text: 'DEPARTMENT OF TRADE AND INDUSTRY — REGION VI (WESTERN VISAYAS)', font: { size: 12, bold: true, color: { argb: 'FF1B365D' } } },
    { text: 'PROVINCIAL OFFICE OF ANTIQUE — CONSUMER PROTECTION DIVISION', font: { size: 10, bold: true, color: { argb: 'FF475569' } } },
    { text: 'WEEKLY COMMODITY PRICE MONITORING MATRIX (R.A. 7581 / PRICE ACT)', font: { size: 11, bold: true, color: { argb: 'FF0F172A' } } },
    {
      text: `Target Pilot Area: San Jose de Buenavista, Antique | Monitored Period: ${periodLabel} | Generated: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}`,
      font: { size: 9, italic: true, color: { argb: 'FF64748B' } },
    },
  ]
  bannerRows.forEach((banner, i) => {
    sheet.mergeCells(i + 1, 1, i + 1, 5)
    const cell = sheet.getCell(i + 1, 1)
    cell.value = banner.text
    cell.font = { name: 'Calibri', ...banner.font }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  })

  // 3. Static Commodity Columns A-E (Rows 6 to 8 vertically merged)
  const staticHeaders = [
    { col: 1, label: 'COMMODITY NAME', align: 'left' as const, width: 30 },
    { col: 2, label: 'UNIT', align: 'center' as const, width: 8 },
    { col: 3, label: 'CATEGORY', align: 'left' as const, width: 16 },
    { col: 4, label: 'CLASSIFICATION', align: 'center' as const, width: 12 },
    { col: 5, label: 'SRP (₱)', align: 'right' as const, width: 10 },
  ]

  staticHeaders.forEach((h) => {
    sheet.mergeCells(6, h.col, 8, h.col)
    for (let r = 6; r <= 8; r++) {
      sheet.getCell(r, h.col).fill = navyHeaderFill
      sheet.getCell(r, h.col).border = headerBorder
    }
    const topCell = sheet.getCell(6, h.col)
    topCell.value = h.label
    topCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
    topCell.alignment = { vertical: 'middle', horizontal: h.align, wrapText: true }
    sheet.getColumn(h.col).width = h.width
  })

  // Track counts per store for summary footer
  const storeMonitoredCounts: Record<number, number> = {}
  const storeAnomalyCounts: Record<number, number> = {}
  colMappings.forEach((m) => {
    storeMonitoredCounts[m.colIndex] = 0
    storeAnomalyCounts[m.colIndex] = 0
  })

  // 4. Data Rows (Row 9+)
  let currentRow = 9
  const commodities = data.commodities || []

  commodities.forEach((comm, idx) => {
    const isZebra = idx % 2 === 1
    const rowFill = isZebra ? zebraFill : undefined

    // Col A: Commodity Name
    const nameCell = sheet.getCell(currentRow, 1)
    nameCell.value = cleanCommodityName(comm.commodity_name, comm.unit)
    nameCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } }
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    nameCell.border = thinBorder
    if (rowFill) nameCell.fill = rowFill

    // Col B: Unit
    const unitCell = sheet.getCell(currentRow, 2)
    unitCell.value = comm.unit || '—'
    unitCell.font = { name: 'Calibri', size: 9 }
    unitCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    unitCell.border = thinBorder
    if (rowFill) unitCell.fill = rowFill

    // Col C: Category
    const catCell = sheet.getCell(currentRow, 3)
    catCell.value = comm.category || 'General'
    catCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } }
    catCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    catCell.border = thinBorder
    if (rowFill) catCell.fill = rowFill

    // Col D: Classification
    const classCell = sheet.getCell(currentRow, 4)
    classCell.value = comm.regulatory_classification
    classCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } }
    classCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    classCell.border = thinBorder
    if (rowFill) classCell.fill = rowFill

    // Col E: SRP
    const srpCell = sheet.getCell(currentRow, 5)
    srpCell.value = comm.srp
    srpCell.numFmt = '#,##0.00'
    srpCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } }
    srpCell.alignment = { vertical: 'middle', horizontal: 'right' }
    srpCell.border = dividerRightBorder
    if (rowFill) srpCell.fill = rowFill

    // Dynamic Columns: Recorded Prices
    colMappings.forEach((map) => {
      const priceCell = sheet.getCell(currentRow, map.colIndex)
      priceCell.border = thinBorder

      const recorded = map.store.prices[comm.id]

      if (recorded && recorded.recorded_price != null) {
        priceCell.value = recorded.recorded_price
        priceCell.numFmt = '#,##0.00'
        priceCell.alignment = { vertical: 'middle', horizontal: 'right' }
        storeMonitoredCounts[map.colIndex] = (storeMonitoredCounts[map.colIndex] || 0) + 1

        if (recorded.is_anomaly) {
          priceCell.fill = anomalyFill
          priceCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFB45309' } }
          storeAnomalyCounts[map.colIndex] = (storeAnomalyCounts[map.colIndex] || 0) + 1
        } else {
          priceCell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } }
          if (rowFill) priceCell.fill = rowFill
        }
      } else {
        priceCell.value = '—'
        priceCell.alignment = { vertical: 'middle', horizontal: 'center' }
        priceCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF94A3B8' } }
        if (rowFill) priceCell.fill = rowFill
      }
    })

    // Weekly Summary Columns: MIN / MAX / AVERAGE of this commodity across the week's establishments
    statCols.forEach((stat) => {
      const statCell = sheet.getCell(currentRow, stat.colIndex)
      const stats = weeklyPriceStats(
        stat.establishments
          .map((store) => store.prices[comm.id]?.recorded_price)
          .filter((price): price is number => price != null),
      )
      statCell.fill = summaryFill
      statCell.border = borderFor(stat.colIndex, thinBorder)
      if (stats) {
        statCell.value = stats[stat.kind]
        statCell.numFmt = '#,##0.00'
        statCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } }
        statCell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else {
        statCell.value = '—'
        statCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF94A3B8' } }
        statCell.alignment = { vertical: 'middle', horizontal: 'center' }
      }
    })

    currentRow++
  })

  // 5. Summary Footer Rows
  // Summary Row 1: Total Monitored Items
  sheet.mergeCells(currentRow, 1, currentRow, 5)
  const sumLabel1 = sheet.getCell(currentRow, 1)
  sumLabel1.value = 'TOTAL MONITORED ITEMS'
  sumLabel1.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
  sumLabel1.fill = navyHeaderFill
  sumLabel1.alignment = { vertical: 'middle', horizontal: 'right' }
  for (let c = 1; c <= 5; c++) {
    sheet.getCell(currentRow, c).fill = navyHeaderFill
    sheet.getCell(currentRow, c).border = thinBorder
  }
  sheet.getCell(currentRow, 5).border = dividerRightBorder

  colMappings.forEach((map) => {
    const sumCell = sheet.getCell(currentRow, map.colIndex)
    const count = storeMonitoredCounts[map.colIndex] || 0
    sumCell.value = `${count} items`
    sumCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1E293B' } }
    sumCell.alignment = { vertical: 'middle', horizontal: 'center' }
    sumCell.fill = summaryFill
    sumCell.border = thinBorder
  })
  statCols.forEach((stat) => {
    const blankCell = sheet.getCell(currentRow, stat.colIndex)
    blankCell.fill = summaryFill
    blankCell.border = borderFor(stat.colIndex, thinBorder)
  })
  sheet.getRow(currentRow).height = 22
  currentRow++

  // Summary Row 2: Price Anomalies Flagged
  sheet.mergeCells(currentRow, 1, currentRow, 5)
  const sumLabel2 = sheet.getCell(currentRow, 1)
  sumLabel2.value = 'PRICE ANOMALIES FLAGGED (>10% SRP)'
  sumLabel2.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
  sumLabel2.fill = weekHeaderFill
  sumLabel2.alignment = { vertical: 'middle', horizontal: 'right' }
  for (let c = 1; c <= 5; c++) {
    sheet.getCell(currentRow, c).fill = weekHeaderFill
    sheet.getCell(currentRow, c).border = doubleBottomBorder
  }
  sheet.getCell(currentRow, 5).border = { ...doubleBottomBorder, right: { style: 'medium', color: { argb: 'FF64748B' } } }

  colMappings.forEach((map) => {
    const anomCell = sheet.getCell(currentRow, map.colIndex)
    const count = storeAnomalyCounts[map.colIndex] || 0
    anomCell.value = count > 0 ? `${count} flagged` : '0'
    anomCell.font = {
      name: 'Calibri',
      size: 9,
      bold: true,
      color: { argb: count > 0 ? 'FFB45309' : 'FF1E293B' },
    }
    anomCell.alignment = { vertical: 'middle', horizontal: 'center' }
    anomCell.fill = count > 0 ? anomalyFill : summaryFill
    anomCell.border = doubleBottomBorder
  })
  statCols.forEach((stat) => {
    const blankCell = sheet.getCell(currentRow, stat.colIndex)
    blankCell.fill = summaryFill
    blankCell.border = borderFor(stat.colIndex, doubleBottomBorder)
  })
  sheet.getRow(currentRow).height = 22
  currentRow++

  // 6. Row Heights and Column Widths
  sheet.getRow(1).height = 30
  sheet.getRow(2).height = 18
  sheet.getRow(3).height = 20
  sheet.getRow(4).height = 30
  sheet.getRow(5).height = 10
  sheet.getRow(6).height = 26
  sheet.getRow(7).height = 40
  sheet.getRow(8).height = 28

  for (let r = 9; r < currentRow - 2; r++) {
    sheet.getRow(r).height = 21
  }

  for (let c = 6; c <= lastCol; c++) {
    sheet.getColumn(c).width = 14
  }

  return workbook
}

export async function exportMonitoringMatrixExcel(data: MonitoringMatrixData, periodLabel: string): Promise<void> {
  const workbook = buildMonitoringMatrixWorkbook(data, periodLabel)

  // Trigger Browser Download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  const dateStr = new Date().toISOString().split('T')[0]
  anchor.download = `DTI_Antique_Price_Monitoring_Matrix_${safePeriod}_${dateStr}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}
