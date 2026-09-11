import ExcelJS from 'exceljs'
import type { MonitoringMatrixData } from '../types/admin'

function cleanCommodityName(name: string, unit: string | null): string {
  let cleaned = name.trim()
  if (unit) {
    const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(`\\s*\\(?${escaped}\\)?$`, 'i'), '').trim()
  }
  // Strip trailing packaging specifications like (155g), (500mL), (#10), (1kg)
  cleaned = cleaned.replace(/\s*\(\s*\d+(\.\d+)?\s*(g|kg|ml|l|oz|pcs|pc|pack|can|btl|bottle|sachets?|m)\s*\)$/i, '').trim()
  return cleaned || name
}

export async function exportMonitoringMatrixExcel(data: MonitoringMatrixData, periodLabel: string): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PRICE-Watch DTI Antique'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Price Monitoring Matrix', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 5, ySplit: 8 }],
  })

  // Colors & Fills
  const navyHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' }, // DTI Navy
  }
  const weekHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F294A' }, // Deep Navy
  }
  const subHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' }, // Royal Blue
  }
  const dateHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' }, // Soft Blue Tint
  }
  const anomalyFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' }, // Amber warning
  }
  const zebraFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' }, // Light Slate Tint
  }

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  }

  const headerBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  }

  // Row 1-4: Title Banner
  sheet.mergeCells('A1:J1')
  sheet.getCell('A1').value = 'DEPARTMENT OF TRADE AND INDUSTRY — REGION VI (WESTERN VISAYAS)'
  sheet.getCell('A1').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1E3A8A' } }
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' }

  sheet.mergeCells('A2:J2')
  sheet.getCell('A2').value = 'ANTIQUE PROVINCIAL OFFICE — CONSUMER PROTECTION DIVISION'
  sheet.getCell('A2').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } }
  sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' }

  sheet.mergeCells('A3:J3')
  sheet.getCell('A3').value = 'WEEKLY COMMODITY PRICE MONITORING MATRIX (R.A. 7581 / PRICE ACT)'
  sheet.getCell('A3').font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } }
  sheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left' }

  const todayStr = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  sheet.mergeCells('A4:J4')
  sheet.getCell('A4').value = `Target Area: San Jose de Buenavista, Antique | Monitored Period: ${periodLabel} | Exported: ${todayStr}`
  sheet.getCell('A4').font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } }
  sheet.getCell('A4').alignment = { vertical: 'middle', horizontal: 'left' }

  // Rows 6 to 8: Table Column Headers
  // Static Commodity Columns (Columns 1 to 5: A, B, C, D, E)
  sheet.mergeCells('A6:A8')
  sheet.getCell('A6').value = 'COMMODITY NAME'
  sheet.getCell('A6').fill = navyHeaderFill
  sheet.getCell('A6').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A6').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  sheet.getCell('A6').border = headerBorder

  sheet.mergeCells('B6:B8')
  sheet.getCell('B6').value = 'UNIT'
  sheet.getCell('B6').fill = navyHeaderFill
  sheet.getCell('B6').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('B6').alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getCell('B6').border = headerBorder

  sheet.mergeCells('C6:C8')
  sheet.getCell('C6').value = 'CATEGORY'
  sheet.getCell('C6').fill = navyHeaderFill
  sheet.getCell('C6').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('C6').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  sheet.getCell('C6').border = headerBorder

  sheet.mergeCells('D6:D8')
  sheet.getCell('D6').value = 'CLASSIFICATION'
  sheet.getCell('D6').fill = navyHeaderFill
  sheet.getCell('D6').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('D6').alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getCell('D6').border = headerBorder

  sheet.mergeCells('E6:E8')
  sheet.getCell('E6').value = 'SRP (PHP)'
  sheet.getCell('E6').fill = navyHeaderFill
  sheet.getCell('E6').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('E6').alignment = { vertical: 'middle', horizontal: 'right' }
  sheet.getCell('E6').border = headerBorder

  // Dynamic Weekly Columns (Starting at Column F / index 6)
  let currentCol = 6
  type ColumnMapping = {
    colIndex: number
    weekIndex: number
    storeId: number
    storeName: string
    monitoringDate: string
  }
  const colMappings: ColumnMapping[] = []

  const weeks = data.weeks || []
  if (weeks.length === 0) {
    // If no weeks with records, put a placeholder column
    sheet.mergeCells(6, currentCol, 8, currentCol)
    sheet.getCell(6, currentCol).value = 'No Inspections Recorded in Period'
    sheet.getCell(6, currentCol).fill = weekHeaderFill
    sheet.getCell(6, currentCol).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getCell(6, currentCol).alignment = { vertical: 'middle', horizontal: 'center' }
    currentCol++
  } else {
    weeks.forEach((week, wIdx) => {
      const stores = week.establishments || []
      if (stores.length === 0) return

      const weekStartCol = currentCol
      const weekEndCol = currentCol + stores.length - 1

      // Row 6: Week Super Header (e.g. WEEK 1 (Aug 01 - Aug 07))
      if (weekEndCol > weekStartCol) {
        sheet.mergeCells(6, weekStartCol, 6, weekEndCol)
      }
      const weekCell = sheet.getCell(6, weekStartCol)
      weekCell.value = week.week_label.toUpperCase()
      weekCell.fill = weekHeaderFill
      weekCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      weekCell.alignment = { vertical: 'middle', horizontal: 'center' }
      weekCell.border = headerBorder

      // For each store under this week:
      stores.forEach((store) => {
        // Row 7: Store Name
        const storeCell = sheet.getCell(7, currentCol)
        storeCell.value = store.store_name
        storeCell.fill = subHeaderFill
        storeCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
        storeCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        storeCell.border = headerBorder

        // Row 8: Inspection Date
        const dateCell = sheet.getCell(8, currentCol)
        dateCell.value = store.monitoring_date_formatted ? `Date: ${store.monitoring_date_formatted}` : `Date: ${store.monitoring_date}`
        dateCell.fill = dateHeaderFill
        dateCell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF1E3A8A' } }
        dateCell.alignment = { vertical: 'middle', horizontal: 'center' }
        dateCell.border = headerBorder

        colMappings.push({
          colIndex: currentCol,
          weekIndex: wIdx,
          storeId: store.store_id,
          storeName: store.store_name,
          monitoringDate: store.monitoring_date,
        })
        currentCol++
      })
    })
  }

  // Rows 9+: Commodity Data Rows
  let currentRow = 9
  const commodities = data.commodities || []

  commodities.forEach((comm, idx) => {
    const isZebra = idx % 2 === 1
    const rowFill = isZebra ? zebraFill : undefined

    // Col A: Commodity Name (cleaned without unit)
    const nameCell = sheet.getCell(currentRow, 1)
    nameCell.value = cleanCommodityName(comm.commodity_name, comm.unit)
    nameCell.font = { name: 'Arial', size: 9, bold: true }
    nameCell.alignment = { vertical: 'middle', horizontal: 'left' }
    nameCell.border = thinBorder
    if (rowFill) nameCell.fill = rowFill

    // Col B: Unit
    const unitCell = sheet.getCell(currentRow, 2)
    unitCell.value = comm.unit || '—'
    unitCell.font = { name: 'Arial', size: 9 }
    unitCell.alignment = { vertical: 'middle', horizontal: 'center' }
    unitCell.border = thinBorder
    if (rowFill) unitCell.fill = rowFill

    // Col C: Category
    const catCell = sheet.getCell(currentRow, 3)
    catCell.value = comm.category || 'General'
    catCell.font = { name: 'Arial', size: 9 }
    catCell.alignment = { vertical: 'middle', horizontal: 'left' }
    catCell.border = thinBorder
    if (rowFill) catCell.fill = rowFill

    // Col D: Classification (Basic Necessities / Prime Commodities)
    const classCell = sheet.getCell(currentRow, 4)
    classCell.value = comm.regulatory_classification
    classCell.font = { name: 'Arial', size: 9 }
    classCell.alignment = { vertical: 'middle', horizontal: 'center' }
    classCell.border = thinBorder
    if (rowFill) classCell.fill = rowFill

    // Col E: SRP
    const srpCell = sheet.getCell(currentRow, 5)
    srpCell.value = comm.srp
    srpCell.numFmt = '#,##0.00'
    srpCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } }
    srpCell.alignment = { vertical: 'middle', horizontal: 'right' }
    srpCell.border = thinBorder
    if (rowFill) srpCell.fill = rowFill

    // Dynamic Columns: Recorded Prices
    colMappings.forEach((map) => {
      const priceCell = sheet.getCell(currentRow, map.colIndex)
      priceCell.border = thinBorder

      const weekObj = weeks[map.weekIndex]
      const storeObj = weekObj?.establishments.find((e) => e.store_id === map.storeId)
      const recorded = storeObj?.prices[comm.id]

      if (recorded && recorded.recorded_price != null) {
        priceCell.value = recorded.recorded_price
        priceCell.numFmt = '#,##0.00'
        priceCell.alignment = { vertical: 'middle', horizontal: 'right' }

        if (recorded.is_anomaly) {
          // Highlight anomalies in amber/yellow
          priceCell.fill = anomalyFill
          priceCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFB45309' } }
        } else {
          priceCell.font = { name: 'Arial', size: 9 }
          if (rowFill) priceCell.fill = rowFill
        }
      } else {
        priceCell.value = '—'
        priceCell.alignment = { vertical: 'middle', horizontal: 'center' }
        priceCell.font = { name: 'Arial', size: 9, color: { argb: 'FF94A3B8' } }
        if (rowFill) priceCell.fill = rowFill
      }
    })

    currentRow++
  })

  // Set Row Heights
  sheet.getRow(1).height = 20
  sheet.getRow(2).height = 18
  sheet.getRow(3).height = 20
  sheet.getRow(4).height = 18
  sheet.getRow(5).height = 10
  sheet.getRow(6).height = 24
  sheet.getRow(7).height = 26
  sheet.getRow(8).height = 20
  for (let r = 9; r < currentRow; r++) {
    sheet.getRow(r).height = 20
  }

  // Set Column Widths
  sheet.getColumn(1).width = 34 // Commodity Name
  sheet.getColumn(2).width = 12 // Unit
  sheet.getColumn(3).width = 28 // Category
  sheet.getColumn(4).width = 20 // Classification
  sheet.getColumn(5).width = 14 // SRP
  for (let c = 6; c < currentCol; c++) {
    sheet.getColumn(c).width = 24 // Establishment Monitored Price
  }

  // Write Buffer and Trigger Download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const downloadUrl = URL.createObjectURL(blob)

  const cleanPeriodName = periodLabel.toLowerCase().replace(/\s+/g, '_')
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `DTI_Antique_Price_Monitoring_Matrix_${cleanPeriodName}_${timestamp}.xlsx`

  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}
