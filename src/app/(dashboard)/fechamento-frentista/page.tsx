'use client'

import { useEffect, useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { Tag, Loader2, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PostoRow { id: string; nome: string }
interface Campo {
  tipo:   string
  label:  string
  ordem:  number
  ativo:  boolean
  grupo:  string | null
}

interface FormaRow {
  chave: string   // "PROFROTA", "STONE - PIX", "STONE - VISA CREDITO", etc.
  grupo: string | null
}

const TIPOS_DISPONIVEIS: { tipo: string; label: string }[] = [
  { tipo: 'dinheiro',           label: 'Dinheiro' },
  { tipo: 'pix',                label: 'PIX' },
  { tipo: 'pix_cnpj',           label: 'PIX CNPJ' },
  { tipo: 'cartoes',            label: 'Cartões (TEF)' },
  { tipo: 'cartoes_frotas',     label: 'Cartões Frotas' },
  { tipo: 'notas_promissorias', label: 'Notas Promissórias' },
  { tipo: 'cheque',             label: 'Cheque' },
]

const GRUPOS = [
  { value: 'dinheiro', label: 'Dinheiro', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'pix',      label: 'PIX',      color: 'bg-cyan-100 text-cyan-800 border-cyan-200'   },
  { value: 'cartoes',  label: 'Cartões',  color: 'bg-blue-100 text-blue-800 border-blue-200'   },
  { value: 'frotas',   label: 'Frotas',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'cheques',  label: 'Cheques',  color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'notas',    label: 'Notas/Crédito', color: 'bg-orange-100 text-orange-800 border-orange-200' },
] as const

// Grupos para mapeamento AUTOSYSTEM → campo do formulário
const GRUPOS_AS = [
  { value: 'dinheiro',           label: 'Dinheiro',           color: 'bg-green-100 text-green-800 border-green-200'   },
  { value: 'pix',                label: 'PIX',                color: 'bg-cyan-100 text-cyan-800 border-cyan-200'     },
  { value: 'pix_cnpj',           label: 'PIX CNPJ',           color: 'bg-sky-100 text-sky-800 border-sky-200'        },
  { value: 'cartoes',            label: 'Cartões',            color: 'bg-blue-100 text-blue-800 border-blue-200'     },
  { value: 'frotas',             label: 'Frotas',             color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'a_prazo',            label: 'A Prazo',            color: 'bg-gray-100 text-gray-600 border-gray-200'     },
  { value: 'cheque',             label: 'Cheque',             color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'notas_promissorias', label: 'Notas Promissórias', color: 'bg-orange-100 text-orange-800 border-orange-200' },
] as const

// ── Componente principal ──────────────────────────────────────────────────────

export default function FechamentoFrentistaPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role
  const podeAcessar = ['master', 'adm_financeiro', 'operador_caixa'].includes(role ?? '')

  const [postos,  setPostos]  = useState<PostoRow[]>([])
  const [postoId, setPostoId] = useState('')
  const [tab,     setTab]     = useState<'campos' | 'contas' | 'fechamentos'>('contas')
  const [campos,  setCampos]  = useState<Campo[]>([])
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  // Formas de pagamento TEF
  const [formas,        setFormas]        = useState<FormaRow[]>([])
  const [formasLoading, setFormasLoading] = useState(false)
  const [formasSalvando, setFormasSalvando] = useState<Record<string, boolean>>({})
  const [formasSalvo,    setFormasSalvo]    = useState<Record<string, boolean>>({})
  const [buscaFormas,    setBuscaFormas]    = useState('')

  // Fechamentos
  const [fechamentos,  setFechamentos]  = useState<any[]>([])
  const [fDataIni,     setFDataIni]     = useState('')
  const [fDataFim,     setFDataFim]     = useState('')
  const [fLoading,     setFLoading]     = useState(false)
  const [selectedFech, setSelectedFech] = useState<any | null>(null)

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

  // Carrega campos quando posto muda
  useEffect(() => {
    if (!postoId) return
    fetch(`/api/caixa/config?posto_id=${postoId}`)
      .then(r => r.json())
      .then(j => {
        const cs: Campo[] = j.campos ?? []
        const existentes = new Set(cs.map(c => c.tipo))
        const extras = TIPOS_DISPONIVEIS
          .filter(t => !existentes.has(t.tipo))
          .map((t, idx) => ({ tipo: t.tipo, label: t.label, ordem: cs.length + idx + 1, ativo: false, grupo: null }))
        setCampos([...cs, ...extras].sort((a, b) => a.ordem - b.ordem))
      })
  }, [postoId])

  // Carrega formas de pagamento TEF (global, não por posto)
  useEffect(() => {
    if (tab !== 'contas') return
    setFormasLoading(true)
    fetch('/api/caixa/config-contas')
      .then(r => r.json())
      .then(j => { setFormas(j.formas ?? []); setFormasLoading(false) })
  }, [tab])

  async function salvarCampos() {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/caixa/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posto_id: postoId, campos }),
    })
    setSaving(false)
    setMsg(res.ok ? 'Campos salvos com sucesso!' : 'Erro ao salvar')
    setTimeout(() => setMsg(''), 3000)
  }

  function toggleCampo(tipo: string) {
    setCampos(prev => prev.map(c => c.tipo === tipo ? { ...c, ativo: !c.ativo } : c))
  }

  function editarLabel(tipo: string, label: string) {
    setCampos(prev => prev.map(c => c.tipo === tipo ? { ...c, label } : c))
  }

  function editarGrupo(tipo: string, grupo: string | null) {
    setCampos(prev => prev.map(c => c.tipo === tipo ? { ...c, grupo } : c))
  }

  async function salvarForma(forma: FormaRow, novoGrupo: string | null) {
    setFormasSalvando(p => ({ ...p, [forma.chave]: true }))
    const res = await fetch('/api/caixa/config-contas', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ operadora_chave: forma.chave, grupo: novoGrupo }),
    })
    const json = await res.json()
    if (!json.error) {
      setFormas(prev => prev.map(f => f.chave === forma.chave ? { ...f, grupo: novoGrupo } : f))
      setFormasSalvo(p => ({ ...p, [forma.chave]: true }))
      setTimeout(() => setFormasSalvo(p => ({ ...p, [forma.chave]: false })), 1800)
    }
    setFormasSalvando(p => ({ ...p, [forma.chave]: false }))
  }

  async function carregarFechamentos() {
    setFLoading(true)
    const params = new URLSearchParams({ posto_id: postoId })
    if (fDataIni) params.set('data_ini', fDataIni)
    if (fDataFim) params.set('data_fim', fDataFim)
    const res = await fetch(`/api/caixa/fechamentos?${params}`)
    const j   = await res.json()
    setFechamentos(Array.isArray(j) ? j : [])
    setFLoading(false)
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

  const formasFiltradas = useMemo(() =>
    formas.filter(f => f.chave.toLowerCase().includes(buscaFormas.toLowerCase())),
    [formas, buscaFormas],
  )

  const statsFormas = useMemo(() => ({
    total:        formas.length,
    configuradas: formas.filter(f => f.grupo).length,
    semGrupo:     formas.filter(f => !f.grupo).length,
  }), [formas])

  if (!podeAcessar) {
    return (
      <div className="animate-fade-in">
        <Header title="Fechamento de Caixa" description="Configuração do formulário de fechamento" />
        <div className="p-6 text-center text-gray-400 text-sm">Sem permissão para acessar esta página.</div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Fechamento de Caixa Eletrônico"
        description="Configure as formas de pagamento e visualize fechamentos"
      />

      <div className="p-4 md:p-6 max-w-5xl space-y-5">

        {/* Posto seletor */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Posto:</label>
          <select
            value={postoId}
            onChange={e => setPostoId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <div className="ml-auto">
            <a
              href="/caixa"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Abrir tela do frentista
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 gap-1">
          {([
            ['contas',      'Formas de Pagamento AUTOSYSTEM'],
            ['campos',      'Campos do Formulário'],
            ['fechamentos', 'Fechamentos'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Formas de Pagamento AUTOSYSTEM ──────────────────────────── */}
        {tab === 'contas' && (
          <div className="space-y-4">

            {/* Grupos disponíveis */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Grupos disponíveis</p>
              <p className="text-[12px] text-gray-500 mb-3">
                Vincule cada forma de pagamento do AUTOSYSTEM (PROFROTA, PIX-STONE, TEF STONE…) ao grupo
                correspondente. Os valores serão somados automaticamente na coluna "Sistema" da conferência.
              </p>
              <div className="flex flex-wrap gap-2">
                {GRUPOS_AS.map(g => (
                  <span key={g.value} className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border', g.color)}>
                    <Tag className="w-3 h-3" />
                    {g.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Resumo */}
            {!formasLoading && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total de formas', value: statsFormas.total,        color: 'text-gray-700' },
                  { label: 'Configuradas',    value: statsFormas.configuradas,  color: 'text-green-700' },
                  { label: 'Sem grupo',       value: statsFormas.semGrupo,      color: statsFormas.semGrupo > 0 ? 'text-amber-600' : 'text-gray-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                    <p className="text-[11px] text-gray-400">{s.label}</p>
                    <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={buscaFormas}
                onChange={e => setBuscaFormas(e.target.value)}
                placeholder="Buscar forma de pagamento..."
                className="w-full h-9 pl-9 pr-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>

            {/* Tabela */}
            {formasLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-[13px]">Carregando formas de pagamento do AUTOSYSTEM...</span>
              </div>
            ) : formasFiltradas.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <p className="text-[13px]">
                  {buscaFormas
                    ? 'Nenhuma forma encontrada para esta busca.'
                    : 'Nenhuma forma encontrada. Os postos precisam ter transações TEF registradas no AUTOSYSTEM.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-[11px]">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Forma de pagamento</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 w-52">Grupo</th>
                        <th className="px-4 py-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formasFiltradas.map((forma, i) => {
                        const isSaving   = formasSalvando[forma.chave]
                        const isSaved    = formasSalvo[forma.chave]
                        const grupoAtual = GRUPOS_AS.find(g => g.value === forma.grupo)

                        return (
                          <tr
                            key={forma.chave}
                            className={cn(
                              'border-b border-gray-100 last:border-0 transition-colors',
                              i % 2 !== 0 ? 'bg-gray-50/30' : '',
                              !forma.grupo && 'bg-amber-50/20',
                            )}
                          >
                            <td className="px-4 py-2.5 font-medium text-gray-800">{forma.chave}</td>
                            <td className="px-4 py-2.5">
                              <select
                                value={forma.grupo ?? ''}
                                onChange={e => salvarForma(forma, e.target.value || null)}
                                disabled={isSaving}
                                className={cn(
                                  'w-full h-8 px-2 text-[12px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-60 cursor-pointer',
                                  grupoAtual
                                    ? cn('font-semibold', grupoAtual.color)
                                    : 'border-amber-200 bg-amber-50 text-amber-700',
                                )}
                              >
                                <option value="">— Sem grupo —</option>
                                {GRUPOS_AS.map(g => (
                                  <option key={g.value} value={g.value}>{g.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-center w-8">
                              {isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mx-auto" />
                              ) : isSaved ? (
                                <Check className="w-3.5 h-3.5 text-green-500 mx-auto" />
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Campos do Formulário ─────────────────────────────────────── */}
        {tab === 'campos' && (
          <div className="space-y-4">

            {/* Legenda de grupos */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Grupos disponíveis</p>
              <div className="flex flex-wrap gap-2">
                {GRUPOS.map(g => (
                  <span key={g.value} className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border', g.color)}>
                    <Tag className="w-3 h-3" />
                    {g.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Tabela de formas de pagamento */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Formas de pagamento</h2>
                <p className="text-xs text-gray-500 mt-0.5">Ative cada forma de pagamento e associe-a a um grupo para exibição no formulário.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[11px]">
                      <th className="text-center px-4 py-2.5 font-semibold text-gray-600 w-16">Ativo</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Tipo</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Nome exibido</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-52">Grupo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campos.map((campo, i) => {
                      const grupoAtual = GRUPOS.find(g => g.value === campo.grupo)
                      return (
                        <tr
                          key={campo.tipo}
                          className={cn(
                            'border-b border-gray-100 last:border-0 transition-colors',
                            i % 2 !== 0 ? 'bg-gray-50/30' : '',
                            campo.ativo && !campo.grupo ? 'bg-amber-50/20' : '',
                          )}
                        >
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => toggleCampo(campo.tipo)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${campo.ativo ? 'bg-orange-500' : 'bg-gray-200'}`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${campo.ativo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{campo.tipo}</td>
                          <td className="px-4 py-2.5">
                            <input
                              value={campo.label}
                              onChange={e => editarLabel(campo.tipo, e.target.value)}
                              className="w-full h-8 px-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={campo.grupo ?? ''}
                              onChange={e => editarGrupo(campo.tipo, e.target.value || null)}
                              className={cn(
                                'w-full h-8 px-2 text-[12px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer',
                                grupoAtual
                                  ? cn('font-semibold', grupoAtual.color)
                                  : 'border-amber-200 bg-amber-50 text-amber-700',
                              )}
                            >
                              <option value="">— Sem grupo —</option>
                              {GRUPOS.map(g => (
                                <option key={g.value} value={g.value}>{g.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                {msg && <span className="text-sm text-emerald-600">{msg}</span>}
                <button
                  onClick={salvarCampos}
                  disabled={saving || !postoId}
                  className="ml-auto px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? 'Salvando…' : 'Salvar Campos'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Fechamentos ─────────────────────────────────────────────── */}
        {tab === 'fechamentos' && (
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data inicial</label>
                <input type="date" value={fDataIni} onChange={e => setFDataIni(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data final</label>
                <input type="date" value={fDataFim} onChange={e => setFDataFim(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <button
                onClick={carregarFechamentos}
                disabled={fLoading}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {fLoading ? 'Buscando…' : 'Buscar'}
              </button>
            </div>

            {fechamentos.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
                {fLoading ? 'Carregando…' : 'Clique em Buscar para ver os fechamentos.'}
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
                          <td className="px-4 py-3 text-gray-500">{f.turno ?? '—'}</td>
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
                      {(selectedFech.itens ?? []).map((item: any, idx: number) => {
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
        )}
      </div>
    </div>
  )
}
