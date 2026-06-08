export const metadata = {
  title: 'Fechamento de Caixa',
}

// CSS de impressão para cupom térmico (80mm). Sobrescreve o @page A4 global
// apenas nas telas de caixa/PDV. Para 58mm, troque size para 58mm.
const cupomPrintCss = `
@media print {
  @page { size: 80mm auto; margin: 0; }
  html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .cupom-print { width: 80mm !important; max-width: 80mm !important; padding: 3mm !important; box-sizing: border-box; }
  .cupom-print, .cupom-print * { font-size: 11px !important; line-height: 1.3 !important; color: #000 !important; }
  .cupom-print h1 { font-size: 13px !important; font-weight: 700 !important; }
  .cupom-print table { width: 100% !important; table-layout: fixed; }
  .cupom-print td, .cupom-print th { padding: 1px 2px !important; word-break: break-word; }
  .cupom-print img { max-width: 60mm !important; height: auto !important; }
}
`

export default function CaixaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <style dangerouslySetInnerHTML={{ __html: cupomPrintCss }} />
      {children}
    </div>
  )
}
