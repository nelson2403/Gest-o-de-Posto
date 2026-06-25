'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  X, Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, ArrowRight,
  Info, Download as DownloadIcon,
} from 'lucide-react'

interface Props {
  onClose:        () => void
  onImported:     (info: { total_recebidas: number; total_validas: number; total_gravadas: number }) => void
}

interface PreviewRow { codigo: string; descricao: string }

export function ImportarPlanoModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  // Após upload, mostramos as primeiras colunas e o usuário escolhe quais
  // representam código e descrição.
  const [headers, setHeaders]   = useState<string[]>([])
  const [rowsRaw, setRowsRaw]   = useState<Record<string, unknown>[]>([])
  const [colCodigo, setColCodigo]       = useState<string>('')
  const [colDescricao, setColDescricao] = useState<string>('')
  const [limpar, setLimpar]     = useState(false)

  const [erro, setErro]       = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function parseFile(file: File) {
    setErro(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) { setErro('Arquivo vazio'); return }
        const wb = XLSX.read(data, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        if (!sheetName) { setErro('Planilha sem abas'); return }
        const ws = wb.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        if (!json.length) { setErro('Planilha sem dados'); return }

        const cols = Object.keys(json[0])
        setHeaders(cols)
        setRowsRaw(json)

        // Auto-detect: procura por colunas com nomes comuns
        const lc = cols.map(c => c.toLowerCase())
        const findIdx = (cands: string[]) => lc.findIndex(c => cands.some(s => c.includes(s)))

        const idxCodigo = findIdx(['cod', 'cta', 'conta'])
        const idxDesc   = findIdx(['desc', 'nome', 'denomin', 'histor'])

        if (idxCodigo >= 0) setColCodigo(cols[idxCodigo])
        else                setColCodigo(cols[0] ?? '')

        if (idxDesc >= 0 && idxDesc !== idxCodigo) setColDescricao(cols[idxDesc])
        else                                       setColDescricao(cols[1] ?? cols[0] ?? '')
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    }
    reader.onerror = () => setErro('Falha ao ler o arquivo')
    reader.readAsArrayBuffer(file)
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  const preview: PreviewRow[] = colCodigo
    ? rowsRaw.slice(0, 6).map(r => ({
        codigo:    String(r[colCodigo] ?? '').trim(),
        descricao: colDescricao ? String(r[colDescricao] ?? '').trim() : '',
      }))
    : []

  // Validação rápida da contagem que efetivamente vai entrar
  const validas = colCodigo
    ? rowsRaw.filter(r => String(r[colCodigo] ?? '').trim().length > 0).length
    : 0

  function baixarModelo() {
    // Gera um .xlsx modelo direto no front e dispara o download.
    // Demonstra a estrutura mínima esperada (Código, Descrição) com 4 exemplos.
    const linhas = [
      { 'Código': '1',       'Descrição': 'Ativo' },
      { 'Código': '1.1',     'Descrição': 'Ativo Circulante' },
      { 'Código': '1.1.001', 'Descrição': 'Caixa Geral' },
      { 'Código': '1.1.002', 'Descrição': 'Banco do Brasil c/c' },
      { 'Código': '2',       'Descrição': 'Passivo' },
      { 'Código': '2.1',     'Descrição': 'Passivo Circulante' },
      { 'Código': '2.1.001', 'Descrição': 'Fornecedores' },
    ]
    const ws = XLSX.utils.json_to_sheet(linhas)
    ws['!cols'] = [{ wch: 12 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plano de Contas')
    XLSX.writeFile(wb, 'modelo_plano_contas.xlsx')
  }

  async function importar() {
    if (!colCodigo) { toast({ variant: 'destructive', title: 'Selecione a coluna do código' }); return }
    setSalvando(true)
    try {
      const linhas = rowsRaw
        .map(r => ({
          codigo:    String(r[colCodigo] ?? '').trim(),
          descricao: colDescricao ? String(r[colDescricao] ?? '').trim() : '',
        }))
        .filter(l => l.codigo.length > 0)

      const r = await fetch('/api/contabil/plano-contas/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limpar, linhas }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)

      onImported({
        total_recebidas: Number(json.total_recebidas ?? 0),
        total_validas:   Number(json.total_validas ?? 0),
        total_gravadas:  Number(json.total_gravadas ?? 0),
      })
      onClose()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao importar', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-600" />
            <h3 className="text-[13.5px] font-semibold text-gray-800">Importar plano de contas</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Estrutura esperada — só aparece antes do upload */}
          {rowsRaw.length === 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-600" />
                  <p className="text-[12px] font-semibold text-blue-900">Como estruturar o arquivo</p>
                </div>
                <button onClick={baixarModelo}
                  className="h-7 px-2 rounded text-[11px] font-medium border border-blue-300 bg-white hover:bg-blue-50 text-blue-700 flex items-center gap-1">
                  <DownloadIcon className="w-3 h-3" /> Baixar modelo .xlsx
                </button>
              </div>

              <p className="text-[11.5px] text-blue-900/80 mb-2">
                A planilha deve ter <strong>duas colunas</strong> na primeira aba: <strong>Código</strong> e <strong>Descrição</strong>.
                A primeira linha é o cabeçalho. Use <strong>códigos hierárquicos separados por ponto</strong> (ex.: <code className="bg-white px-1 rounded">1.1.001</code>) para que o plano apareça em árvore.
              </p>

              <div className="rounded border border-blue-200 bg-white overflow-x-auto">
                <table className="w-full text-[11.5px] min-w-[420px]">
                  <thead className="bg-blue-100/60">
                    <tr className="text-blue-900 text-[10.5px] uppercase tracking-wide">
                      <th className="text-left font-semibold px-3 py-1.5 w-[110px]">Código</th>
                      <th className="text-left font-semibold px-3 py-1.5">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr className="border-t border-blue-100"><td className="px-3 py-1">1</td>      <td className="px-3 py-1 font-sans">Ativo</td></tr>
                    <tr className="border-t border-blue-100"><td className="pl-6 pr-3 py-1">1.1</td>   <td className="px-3 py-1 font-sans">Ativo Circulante</td></tr>
                    <tr className="border-t border-blue-100"><td className="pl-9 pr-3 py-1">1.1.001</td><td className="px-3 py-1 font-sans">Caixa Geral</td></tr>
                    <tr className="border-t border-blue-100"><td className="pl-9 pr-3 py-1">1.1.002</td><td className="px-3 py-1 font-sans">Banco do Brasil c/c</td></tr>
                    <tr className="border-t border-blue-100"><td className="px-3 py-1">2</td>      <td className="px-3 py-1 font-sans">Passivo</td></tr>
                    <tr className="border-t border-blue-100"><td className="pl-6 pr-3 py-1">2.1.001</td><td className="px-3 py-1 font-sans">Fornecedores</td></tr>
                  </tbody>
                </table>
              </div>

              <ul className="mt-2 text-[10.5px] text-blue-900/70 space-y-0.5 list-disc list-inside">
                <li>Os <strong>nomes das colunas podem variar</strong> ("Conta", "Cod", "Nome", "Histórico" etc.) — a tela seguinte permite escolher qual é qual.</li>
                <li>Linhas com código vazio são ignoradas.</li>
                <li>Códigos duplicados: o último vence.</li>
                <li>Colunas extras na planilha são ignoradas (Natureza, Tipo, etc.).</li>
              </ul>
            </div>
          )}

          {/* Upload */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onPickFile}
            />
            <button onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-lg bg-amber-50/40 hover:bg-amber-50 transition-colors">
              <Upload className="w-5 h-5 text-amber-600" />
              <div className="text-center">
                <p className="text-[12.5px] font-semibold text-amber-700">
                  {rowsRaw.length > 0 ? 'Substituir arquivo' : 'Clique para escolher um arquivo'}
                </p>
                <p className="text-[10.5px] text-gray-500">Formatos aceitos: .xlsx, .xls, .csv</p>
              </div>
            </button>
          </div>

          {erro && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-[12px]">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <p>{erro}</p>
            </div>
          )}

          {rowsRaw.length > 0 && (
            <>
              {/* Escolha de colunas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10.5px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
                    Coluna do <strong className="text-amber-700">código</strong>
                  </label>
                  <select value={colCodigo} onChange={e => setColCodigo(e.target.value)}
                    className="w-full h-8 px-2 border border-gray-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                    <option value="">(selecione)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10.5px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
                    Coluna da <strong className="text-amber-700">descrição</strong> (opcional)
                  </label>
                  <select value={colDescricao} onChange={e => setColDescricao(e.target.value)}
                    className="w-full h-8 px-2 border border-gray-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                    <option value="">(nenhuma)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">
                  Pré-visualização (primeiras 6 linhas)
                </p>
                <div className="border border-gray-200 rounded overflow-x-auto">
                  <table className="w-full text-[12px] min-w-[420px]">
                    <thead className="bg-gray-50">
                      <tr className="text-gray-500 text-[10.5px] uppercase tracking-wide">
                        <th className="text-left font-semibold px-3 py-1.5 w-[140px]">Código</th>
                        <th className="text-left font-semibold px-3 py-1.5">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 font-mono">{p.codigo || <span className="text-red-500">(vazio)</span>}</td>
                          <td className="px-3 py-1.5 text-gray-700">{p.descricao || <span className="text-gray-300 italic">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Opções + resumo */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={limpar} onChange={e => setLimpar(e.target.checked)}
                    className="accent-red-500 w-3.5 h-3.5" />
                  <span className="text-[12px] text-gray-700">
                    Limpar plano atual antes de importar <span className="text-red-600 text-[11px]">(substitui tudo)</span>
                  </span>
                </label>
                <div className="text-[11.5px] text-gray-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <strong className="text-emerald-700 tabular-nums">{validas.toLocaleString('pt-BR')}</strong> linhas válidas
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} disabled={salvando}
            className="h-8 px-3 rounded border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-white">
            Cancelar
          </button>
          <button onClick={importar} disabled={salvando || !rowsRaw.length || !colCodigo}
            className={cn(
              'h-8 px-3 rounded text-[12px] font-semibold text-white flex items-center gap-1.5',
              salvando || !rowsRaw.length || !colCodigo
                ? 'bg-gray-300'
                : 'bg-amber-600 hover:bg-amber-700',
            )}>
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Importar
          </button>
        </div>
      </div>
    </div>
  )
}
