// Geração de PDF e XLS para relatórios do sistema
// PDF: jsPDF + jsPDF-AutoTable
// XLS: SheetJS (xlsx)

// ── Tipos ────────────────────────────────────────────────
export interface ReportColumn {
  header: string
  key: string
  width?: number
}

export interface ReportData {
  title: string
  subtitle?: string
  columns: ReportColumn[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[]
  generatedAt?: string
}

// ── PDF ──────────────────────────────────────────────────
export async function exportPDF(report: ReportData): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Cabeçalho
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(249, 115, 22) // orange-500
  doc.text('Gestão de Postos', 14, 16)

  doc.setFontSize(13)
  doc.setTextColor(30, 30, 30)
  doc.text(report.title, 14, 24)

  if (report.subtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text(report.subtitle, 14, 30)
  }

  const generatedAt = report.generatedAt ?? new Date().toLocaleString('pt-BR')
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(`Gerado em: ${generatedAt}`, 14, 36)

  // Tabela
  autoTable(doc, {
    startY: 42,
    head: [report.columns.map(c => c.header)],
    body: report.rows.map(row => report.columns.map(c => row[c.key] ?? '—')),
    theme: 'grid',
    headStyles: {
      fillColor: [249, 115, 22],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 40, 40],
    },
    alternateRowStyles: {
      fillColor: [253, 247, 240],
    },
    columnStyles: report.columns.reduce((acc, col, i) => {
      if (col.width) acc[i] = { cellWidth: col.width }
      return acc
    }, {} as Record<number, { cellWidth: number }>),
    margin: { left: 14, right: 14 },
    tableLineColor: [230, 230, 230],
    tableLineWidth: 0.1,
  })

  // Rodapé com número de página
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(180, 180, 180)
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    )
    doc.text(
      'Gestão de Postos — Sistema de Controle',
      14,
      doc.internal.pageSize.getHeight() - 8,
    )
  }

  const filename = `${report.title.toLowerCase().replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)
}

// ── XLS ──────────────────────────────────────────────────
export async function exportXLS(report: ReportData): Promise<void> {
  const XLSX = await import('xlsx')

  // Cabeçalho informativo
  const meta = [
    ['Gestão de Postos — Sistema de Controle'],
    [report.title],
    [report.subtitle ?? ''],
    [`Gerado em: ${report.generatedAt ?? new Date().toLocaleString('pt-BR')}`],
    [], // linha em branco
    report.columns.map(c => c.header), // cabeçalhos das colunas
  ]

  // Linhas de dados
  const dataRows = report.rows.map(row =>
    report.columns.map(c => row[c.key] ?? '—')
  )

  const wsData = [...meta, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Largura das colunas
  ws['!cols'] = report.columns.map(c => ({ wch: c.width ?? 20 }))

  // Estilo da linha de cabeçalho (linha 6 = index 5)
  const headerRowIndex = 5
  report.columns.forEach((_, colIndex) => {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex })
    if (!ws[cellAddress]) return
    ws[cellAddress].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: 'F97316' } },
      alignment: { horizontal: 'center' },
    }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 31))

  const filename = `${report.title.toLowerCase().replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, filename)
}
