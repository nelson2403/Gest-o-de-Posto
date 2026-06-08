'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PostoRow { id: string; nome: string }

interface ItemFechamento {
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
                  {(selectedFech.itens ?? []).map((item, idx) => {
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
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right">{fmt(selectedFech.total_as)}</td>
                    <td className="px-4 py-2 text-right">{fmt(selectedFech.total_frentista)}</td>
                    <td className={`px-4 py-2 text-right ${fmtDif(selectedFech.total_diferenca).cls}`}>
                      {fmtDif(selectedFech.total_diferenca).text}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
