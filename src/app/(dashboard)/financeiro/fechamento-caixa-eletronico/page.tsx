'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PostoRow { id: string; nome: string }

interface ItemFechamento {
  tipo?:           string
  label:           string
  valor_as:        number | null
  valor_frentista: number | null
  diferenca:       number | null
}

interface Fechamento {
  id:               string
  data_fechamento:  string
  frentista_nome:   string
  turno:            string | null
  total_as:         number | null
  total_frentista:  number | null
  total_diferenca:  number | null
  itens:            ItemFechamento[] | null
  assinatura_img:   string | null
  observacao:       string | null
  postos?:          { nome: string } | null
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ConsultaFechamentoCaixaPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role
  const podeAcessar = ['master', 'adm_financeiro', 'gerente', 'operador_caixa'].includes(role ?? '')

  const [postos,  setPostos]  = useState<PostoRow[]>([])
  const [postoId, setPostoId] = useState('')

  const [fechamentos,  setFechamentos]  = useState<Fechamento[]>([])
  const [dataIni,      setDataIni]      = useState('')
  const [dataFim,      setDataFim]      = useState('')
  const [loading,      setLoading]      = useState(false)
  const [buscou,       setBuscou]       = useState(false)
  const [selectedFech, setSelectedFech] = useState<Fechamento | null>(null)
  // Entradas recalculadas AO VIVO do AUTOSYSTEM (para o veredito bater com o frentista)
  const [entradasLive, setEntradasLive] = useState<number | null>(null)

  // Ao selecionar um fechamento, recalcula as entradas reais do AUTOSYSTEM
  useEffect(() => {
    setEntradasLive(null)
    if (!selectedFech) return
    let cancel = false
    fetch(`/api/caixa/fechamento-conferencia?id=${selectedFech.id}`)
      .then(r => r.json())
      .then(j => { if (!cancel && j?.disponivel) setEntradasLive(j.total_entradas) })
      .catch(() => {})
    return () => { cancel = true }
  }, [selectedFech])

  // Carrega postos
  useEffect(() => {
    fetch('/api/postos-mapeamento')
      .then(r => r.json())
      .then(j => {
        const lista: PostoRow[] = j.data ?? []
        setPostos(lista)
        if (lista.length) setPostoId(lista[0].id)
      })
  }, [])

  async function carregarFechamentos() {
    setLoading(true)
    setBuscou(true)
    setSelectedFech(null)
    const params = new URLSearchParams()
    if (postoId) params.set('posto_id', postoId)
    if (dataIni) params.set('data_ini', dataIni)
    if (dataFim) params.set('data_fim', dataFim)
    const res = await fetch(`/api/caixa/fechamentos?${params}`)
    const j   = await res.json()
    setFechamentos(Array.isArray(j) ? j : [])
    setLoading(false)
  }

  function fmt(v: number | null) {
    if (v === null || v === undefined) return '—'
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  function fmtDif(v: number | null) {
    if (v === null) return { text: '—', cls: 'text-gray-400' }
    if (Math.abs(v) < 0.01) return { text: 'R$ 0,00', cls: 'text-emerald-600' }
    const t = v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    return { text: (v > 0 ? '+' : '') + t, cls: v < 0 ? 'text-red-600' : 'text-amber-600' }
  }

  if (!podeAcessar) {
    return (
      <div className="animate-fade-in">
        <Header title="Fechamento de Caixa Eletrônico" description="Consulta de fechamentos" />
        <div className="p-6 text-center text-gray-400 text-sm">Sem permissão para acessar esta página.</div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Fechamento de Caixa Eletrônico"
        description="Consulte os fechamentos de caixa registrados pelos frentistas"
      />

      <div className="p-4 md:p-6 max-w-5xl space-y-5">

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
              <select
                value={postoId}
                onChange={e => setPostoId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 min-w-[260px]"
              >
                {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data inicial</label>
              <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data final</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div className="flex items-end">
              <button
                onClick={carregarFechamentos}
                disabled={loading}
                className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {loading ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabela */}
        {fechamentos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
            {loading
              ? 'Carregando…'
              : buscou
                ? 'Nenhum fechamento encontrado para este período.'
                : 'Selecione o posto e período e clique em Buscar.'}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Frentista</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Turno</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total Sistema</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total Frentista</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Diferença</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fechamentos.map(f => {
                  const dif = fmtDif(f.total_diferenca)
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{f.data_fechamento?.split('-').reverse().join('/')}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{f.frentista_nome}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{f.turno ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(f.total_as)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(f.total_frentista)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${dif.cls}`}>{dif.text}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedFech(selectedFech?.id === f.id ? null : f)}
                          className="text-orange-500 hover:text-orange-600 text-xs"
                        >
                          {selectedFech?.id === f.id ? 'Fechar' : 'Ver'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Detalhe */}
        {selectedFech && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">
              Fechamento — {selectedFech.frentista_nome} — {selectedFech.data_fechamento?.split('-').reverse().join('/')}
            </h3>

            {(() => {
              // Itens das formas (exclui linha de reconciliação para recompor do zero)
              const baseItens   = (selectedFech.itens ?? []).filter(
                i => i.tipo !== 'nao_lancado' && !(i.label ?? '').startsWith('Não lançado'),
              )
              const sumFormsAS  = baseItens.reduce((s, i) => s + (i.valor_as ?? 0), 0)
              // Entradas reais: ao vivo do AUTOSYSTEM; fallback p/ total salvo
              const entradas    = entradasLive ?? selectedFech.total_as ?? sumFormsAS
              const naoLancado  = parseFloat((entradas - sumFormsAS).toFixed(2))
              const totalSist   = entradas
              const totalFrent  = selectedFech.total_frentista ?? 0
              const totalDif    = parseFloat((totalFrent - totalSist).toFixed(2))
              const ok          = Math.abs(totalDif) < 0.02
              const faltou      = totalDif < 0

              return (
                <>
                  {/* Veredito — igual ao que o frentista vê na conferência */}
                  <div className={`rounded-xl border-2 px-5 py-4 text-center ${
                    ok ? 'bg-emerald-50 border-emerald-300' : faltou ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'
                  }`}>
                    <p className={`text-2xl font-extrabold ${ok ? 'text-emerald-700' : faltou ? 'text-red-700' : 'text-amber-700'}`}>
                      {ok ? '✓ CAIXA CERTO' : faltou ? `FALTANDO ${fmt(Math.abs(totalDif))}` : `SOBRANDO ${fmt(Math.abs(totalDif))}`}
                    </p>
                    <div className="flex justify-center gap-5 mt-2 text-sm text-gray-600 flex-wrap">
                      <span>Total de Entradas: <span className="font-bold text-gray-800">{fmt(totalSist)}</span></span>
                      <span>Frentista declarou: <span className="font-bold text-gray-800">{fmt(totalFrent)}</span></span>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Campo</th>
                          <th className="text-right px-4 py-2 font-medium text-gray-600">Sistema</th>
                          <th className="text-right px-4 py-2 font-medium text-gray-600">Frentista</th>
                          <th className="text-right px-4 py-2 font-medium text-gray-600">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {baseItens.map((item, idx) => {
                          const d = fmtDif(item.diferenca)
                          return (
                            <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                              <td className="px-4 py-2 font-medium text-gray-800">{item.label}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{fmt(item.valor_as)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{fmt(item.valor_frentista)}</td>
                              <td className={`px-4 py-2 text-right ${d.cls}`}>{d.text}</td>
                            </tr>
                          )
                        })}
                        {Math.abs(naoLancado) > 0.02 && (
                          <tr className="bg-amber-50/60">
                            <td className="px-4 py-2 font-medium text-amber-800">Não lançado <span className="text-[11px] text-amber-600">(AUTOSYSTEM)</span></td>
                            <td className="px-4 py-2 text-right text-amber-800">{fmt(naoLancado)}</td>
                            <td className="px-4 py-2 text-right text-gray-400">—</td>
                            <td className={`px-4 py-2 text-right ${fmtDif(-naoLancado).cls}`}>{fmtDif(-naoLancado).text}</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-4 py-2 text-right">{fmt(totalSist)}</td>
                          <td className="px-4 py-2 text-right">{fmt(totalFrent)}</td>
                          <td className={`px-4 py-2 text-right ${fmtDif(totalDif).cls}`}>
                            {fmtDif(totalDif).text}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )
            })()}
            {selectedFech.assinatura_img && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Assinatura:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedFech.assinatura_img} alt="Assinatura" className="h-16 border border-gray-200 rounded-lg" />
              </div>
            )}
            {selectedFech.observacao && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Obs:</span> {selectedFech.observacao}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
