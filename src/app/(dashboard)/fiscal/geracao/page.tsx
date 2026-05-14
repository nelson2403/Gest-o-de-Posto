'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, Plus, RefreshCw, Building2, CheckCircle2 } from 'lucide-react'

function fmt(v: number) {
  return v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function FiscalGeracaoPage() {
  const [manifestos, setManifestos]     = useState<any[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [loading, setLoading]           = useState(true)
  const [gerando, setGerando]           = useState(false)
  const [filtroPosto, setFiltroPosto]   = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setSelecionados(new Set())
    const r = await fetch('/api/fiscal/manifestos')
    setManifestos(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function toggleTodos() {
    const visiveis = manifestos
      .map((m: any, i: number) => ({ m, i }))
      .filter(({ m }) => !filtroPosto || (m.posto?.nome ?? 'Sem posto mapeado') === filtroPosto)
      .map(({ i }) => i)
    const todosVisiveis = visiveis.every(i => selecionados.has(i))
    const s = new Set(selecionados)
    if (todosVisiveis) visiveis.forEach(i => s.delete(i))
    else visiveis.forEach(i => s.add(i))
    setSelecionados(s)
  }

  function toggle(i: number) {
    const s = new Set(selecionados)
    s.has(i) ? s.delete(i) : s.add(i)
    setSelecionados(s)
  }

  async function gerarTarefas() {
    if (!selecionados.size) return alert('Selecione ao menos um manifesto')
    setGerando(true)
    const selecionadosList = [...selecionados].map(i => manifestos[i])
    const r = await fetch('/api/fiscal/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestos: selecionadosList }),
    })
    const result = await r.json()
    setGerando(false)
    alert(`${result.criadas} tarefa(s) criada(s) com sucesso!`)
    carregar()
  }

  const listaPosots = [...new Set(manifestos.map((m: any) => m.posto?.nome ?? 'Sem posto mapeado'))].sort()

  const porPosto = manifestos.reduce((acc: any, m: any, i: number) => {
    const key = m.posto?.nome ?? 'Sem posto mapeado'
    if (filtroPosto && key !== filtroPosto) return acc
    if (!acc[key]) acc[key] = []
    acc[key].push({ ...m, _idx: i })
    return acc
  }, {})

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900 leading-tight">Geração de Tarefas Fiscal</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Manifestos do AUTOSYSTEM ainda sem tarefa criada ({manifestos.length})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroPosto}
            onChange={e => setFiltroPosto(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-[12px] shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 flex-1 sm:flex-none sm:w-56"
          >
            <option value="">Todos os postos</option>
            {listaPosots.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <button
            onClick={carregar}
            disabled={loading}
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-[12px] font-medium transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          {selecionados.size > 0 && (
            <button
              onClick={gerarTarefas}
              disabled={gerando}
              className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {gerando ? 'Gerando...' : `Gerar ${selecionados.size} Tarefa(s)`}
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-[13px]">
          Buscando manifestos no AUTOSYSTEM...
        </div>
      ) : manifestos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-gray-800">Todos os manifestos já possuem tarefa criada</p>
          <p className="text-[12px] text-gray-400 mt-1">Tente ampliar o período de busca</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Selecionar todos */}
          {(() => {
            const visiveis = Object.values(porPosto).flat() as any[]
            const totalVisiveis = visiveis.length
            const selecionadosVisiveis = visiveis.filter((m: any) => selecionados.has(m._idx)).length
            return (
              <div className="flex items-center gap-2.5 px-1">
                <input
                  type="checkbox"
                  checked={totalVisiveis > 0 && selecionadosVisiveis === totalVisiveis}
                  onChange={toggleTodos}
                  className="w-4 h-4 accent-indigo-600"
                />
                <span className="text-[12px] text-gray-500">
                  Selecionar todos ({totalVisiveis}) — {selecionados.size} selecionado(s)
                </span>
              </div>
            )
          })()}

          {/* Por posto */}
          {Object.entries(porPosto).map(([postoNome, items]: [string, any]) => (
            <div key={postoNome} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">

              {/* Cabeçalho do posto */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <Building2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <span className="text-[12px] font-semibold text-gray-800">{postoNome}</span>
                <span className="text-[11px] text-gray-400">({items.length} manifesto{items.length > 1 ? 's' : ''})</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[12px] md:text-[13px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-white">
                      <th className="w-10 py-2 px-4" />
                      <th className="text-left py-2 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Fornecedor</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Emissão</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Valor</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">CNPJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((m: any) => (
                      <tr
                        key={m._idx}
                        onClick={() => toggle(m._idx)}
                        className={`cursor-pointer transition-colors hover:bg-indigo-50/40 ${selecionados.has(m._idx) ? 'bg-indigo-50' : ''}`}
                      >
                        <td className="py-2 px-4">
                          <input
                            type="checkbox"
                            checked={selecionados.has(m._idx)}
                            onChange={() => toggle(m._idx)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 accent-indigo-600"
                          />
                        </td>
                        <td className="py-2 px-4 text-gray-800 font-medium">{m.emitente_nome}</td>
                        <td className="py-2 px-4 text-gray-500">{fmtDate(m.data_emissao)}</td>
                        <td className="py-2 px-4 text-right font-semibold tabular-nums text-gray-800">{fmt(m.valor)}</td>
                        <td className="py-2 px-4 text-gray-400 font-mono text-[11px]">{m.emitente_cpf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
