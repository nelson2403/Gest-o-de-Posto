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

  // Lista de postos disponíveis para o filtro
  const listaPosots = [...new Set(manifestos.map((m: any) => m.posto?.nome ?? 'Sem posto mapeado'))].sort()

  // Agrupa por posto para visualização (aplica filtro se selecionado)
  const porPosto = manifestos.reduce((acc: any, m: any, i: number) => {
    const key = m.posto?.nome ?? 'Sem posto mapeado'
    if (filtroPosto && key !== filtroPosto) return acc
    if (!acc[key]) acc[key] = []
    acc[key].push({ ...m, _idx: i })
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Geração de Tarefas Fiscal</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manifestos do AUTOSYSTEM ainda sem tarefa criada ({manifestos.length})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroPosto}
            onChange={e => setFiltroPosto(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm flex-1 sm:flex-none"
          >
            <option value="">Todos os postos</option>
            {listaPosots.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          {selecionados.size > 0 && (
            <button onClick={gerarTarefas} disabled={gerando}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <Plus className="w-4 h-4" />
              {gerando ? 'Gerando...' : `Gerar ${selecionados.size} Tarefa(s)`}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Buscando manifestos no AUTOSYSTEM...</div>
      ) : manifestos.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-white font-medium">Todos os manifestos já possuem tarefa criada</p>
          <p className="text-sm text-gray-400 mt-1">Tente ampliar o período de busca</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Selecionar todos */}
          {(() => {
            const visiveis = Object.values(porPosto).flat() as any[]
            const totalVisiveis = visiveis.length
            const selecionadosVisiveis = visiveis.filter((m: any) => selecionados.has(m._idx)).length
            return (
              <div className="flex items-center gap-3 px-1">
                <input
                  type="checkbox"
                  checked={totalVisiveis > 0 && selecionadosVisiveis === totalVisiveis}
                  onChange={toggleTodos}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-sm text-gray-400">
                  Selecionar todos ({totalVisiveis}) — {selecionados.size} selecionado(s)
                </span>
              </div>
            )
          })()}

          {/* Por posto */}
          {Object.entries(porPosto).map(([postoNome, items]: [string, any]) => (
            <div key={postoNome} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-800/50">
                <Building2 className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-white">{postoNome}</span>
                <span className="text-xs text-gray-500">({items.length} manifesto{items.length > 1 ? 's' : ''})</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="w-10 py-2 px-4"></th>
                    <th className="text-left py-2 px-4 text-xs font-medium text-gray-400 uppercase">Fornecedor</th>
                    <th className="text-left py-2 px-4 text-xs font-medium text-gray-400 uppercase">Emissão</th>
                    <th className="text-right py-2 px-4 text-xs font-medium text-gray-400 uppercase">Valor</th>
                    <th className="text-left py-2 px-4 text-xs font-medium text-gray-400 uppercase">CNPJ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {items.map((m: any) => (
                    <tr
                      key={m._idx}
                      className={`hover:bg-gray-800/30 cursor-pointer ${selecionados.has(m._idx) ? 'bg-blue-900/10' : ''}`}
                      onClick={() => toggle(m._idx)}
                    >
                      <td className="py-2 px-4">
                        <input
                          type="checkbox"
                          checked={selecionados.has(m._idx)}
                          onChange={() => toggle(m._idx)}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 accent-blue-500"
                        />
                      </td>
                      <td className="py-2 px-4 text-sm text-white">{m.emitente_nome}</td>
                      <td className="py-2 px-4 text-sm text-gray-400">{fmtDate(m.data_emissao)}</td>
                      <td className="py-2 px-4 text-right text-sm font-mono font-bold text-white">{fmt(m.valor)}</td>
                      <td className="py-2 px-4 text-xs text-gray-500 font-mono">{m.emitente_cpf}</td>
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
