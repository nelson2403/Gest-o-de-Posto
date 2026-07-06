'use client'

import { useMemo, useState } from 'react'
import { Loader2, Search, Plus, Pencil, Trash2, AlertTriangle, User } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type CampoDetalhe = { campo: string; antes: string | null; depois: string | null; mudou: boolean }
type Alteracao = {
  tipo: 'insercao' | 'exclusao' | 'alteracao'
  quando: string
  alterou: string
  alterou_login: string
  operador: string
  operador_login: string
  terceiro: boolean
  estacao: string
  documento: string | null
  valor: number | null
  campos: CampoDetalhe[]
}
type LoginNome = { login: string; nome: string }
type Resumo = { total: number; insercoes: number; alteracoes: number; exclusoes: number; terceiros: number }
type Dados = {
  alteracoes: Alteracao[]
  total: number
  resumo: Resumo
  frentistas: LoginNome[]
  usuarios: LoginNome[]
  periodo: { ini: string; fim: string }
}
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const hora = (iso: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

// ── Frases descritivas ─────────────────────────────────────────────────────
const campoVal = (a: Alteracao, campo: string, lado: 'antes' | 'depois') =>
  a.campos.find(c => c.campo === campo)?.[lado] ?? null

function descreverAlteracao(a: Alteracao): string {
  const mud = a.campos.filter(c => c.mudou)
  if (!mud.length) return 'lançamento re-gravado (sem mudança de valor)'
  return mud.map(c => `${c.campo.toLowerCase()} estava "${c.antes ?? '—'}", alterado para "${c.depois ?? '—'}"`).join(' · ')
}
function descreverLinha(a: Alteracao, lado: 'antes' | 'depois'): string {
  const forma = campoVal(a, 'Forma de pagamento', lado) || 'lançamento'
  const valor = campoVal(a, 'Valor', lado)
  const doc   = campoVal(a, 'Documento', lado)
  const pessoa = campoVal(a, 'Pessoa', lado)
  return `${forma}${valor ? ` de ${valor}` : ''}${doc ? ` · autorização/doc ${doc}` : ''}${pessoa ? ` · ${pessoa}` : ''}`
}

const TIPO_INFO = {
  insercao:  { label: 'Inserções', cls: 'text-emerald-700', dot: 'bg-emerald-500', icon: Plus },
  alteracao: { label: 'Alterações', cls: 'text-amber-700', dot: 'bg-amber-500', icon: Pencil },
  exclusao:  { label: 'Exclusões', cls: 'text-red-700', dot: 'bg-red-500', icon: Trash2 },
} as const

export function AlteracoesCaixa({ postos }: { postos: PostoRow[] }) {
  const [postoId, setPostoId] = useState(postos[0]?.id ?? '')
  const [dataIni, setDataIni] = useState(HOJE)
  const [dataFim, setDataFim] = useState(HOJE)
  const [operador, setOperador] = useState('')
  const [alterou, setAlterou] = useState('')
  const [soTerceiros, setSoTerceiros] = useState(false)
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscar(soTerceirosArg?: boolean) {
    if (!postoId) return
    const st = typeof soTerceirosArg === 'boolean' ? soTerceirosArg : soTerceiros
    setLoading(true); setErro(null)
    try {
      const p = new URLSearchParams({ posto_id: postoId })
      if (dataIni) p.set('data_ini', dataIni)
      if (dataFim) p.set('data_fim', dataFim)
      if (operador) p.set('operador', operador)
      if (alterou) p.set('alterou', alterou)
      if (st) p.set('so_terceiros', '1')
      const r = await fetch(`/api/caixa/alteracoes?${p}`, { cache: 'no-store' })
      const txt = await r.text()
      let d: any = null
      try { d = txt ? JSON.parse(txt) : null } catch { /* não-JSON */ }
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status} ao buscar`)
      if (!d) throw new Error('Resposta vazia do servidor (tente um período menor).')
      setDados(d)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Agrupa por QUEM ALTEROU → e dentro, por tipo
  const grupos = useMemo(() => {
    if (!dados) return []
    const m = new Map<string, { alterou: string; terceiro: boolean; alteracao: Alteracao[]; insercao: Alteracao[]; exclusao: Alteracao[] }>()
    for (const a of dados.alteracoes) {
      if (!m.has(a.alterou)) m.set(a.alterou, { alterou: a.alterou, terceiro: false, alteracao: [], insercao: [], exclusao: [] })
      const g = m.get(a.alterou)!
      g[a.tipo].push(a)
      if (a.terceiro) g.terceiro = true
    }
    return [...m.values()].sort((x, y) =>
      (y.alteracao.length + y.insercao.length + y.exclusao.length) - (x.alteracao.length + x.insercao.length + x.exclusao.length))
  }, [dados])

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-5">
      <p className="text-[13px] text-gray-500">
        Histórico detalhado de <b>quem mexeu no caixa dos frentistas</b> — alterações, inserções e exclusões feitas por
        terceiros (e todas as exclusões). Agrupado por quem alterou.
      </p>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
            <select value={postoId} onChange={e => setPostoId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 min-w-[220px]">
              {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">De</label>
            <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Até</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={() => buscar()} disabled={loading}
            className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
        {dados && (
          <div className="flex items-end gap-3 flex-wrap pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frentista (caixa)</label>
              <select value={operador} onChange={e => setOperador(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
                <option value="">Todos os frentistas</option>
                {dados.frentistas.map(f => <option key={f.login} value={f.login}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quem alterou</label>
              <select value={alterou} onChange={e => setAlterou(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
                <option value="">Todos</option>
                {dados.usuarios.map(u => <option key={u.login} value={u.login}>{u.nome}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
              <input type="checkbox" checked={soTerceiros} onChange={e => setSoTerceiros(e.target.checked)} className="w-4 h-4" />
              Só quem não é o frentista
            </label>
            <button onClick={() => buscar()} disabled={loading}
              className="px-4 py-2 border border-orange-300 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-50">
              Aplicar filtros
            </button>
          </div>
        )}
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}

      {/* Resumo */}
      {dados && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ResumoCard label="Alterações" valor={dados.resumo.alteracoes} cls="text-amber-600" />
          <ResumoCard label="Inserções" valor={dados.resumo.insercoes} cls="text-emerald-600" />
          <ResumoCard label="Exclusões" valor={dados.resumo.exclusoes} cls="text-red-600" />
          <ResumoCard label="Por terceiros ⚠" valor={dados.resumo.terceiros} cls="text-red-600" />
        </div>
      )}

      {/* Narrativa agrupada por quem alterou */}
      {dados && (
        grupos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
            Nenhuma alteração no caixa no período/filtro.
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map(g => (
              <div key={g.alterou} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className={`px-5 py-3 border-b flex items-center gap-2 ${g.terceiro ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-200'}`}>
                  <User className={`w-4 h-4 ${g.terceiro ? 'text-red-500' : 'text-gray-400'}`} />
                  <span className="text-[15px] font-bold text-gray-800">{g.alterou}</span>
                  {g.terceiro && <span className="text-[11px] font-semibold text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> mexeu no caixa de outros</span>}
                </div>
                <div className="p-5 space-y-4">
                  {(['alteracao', 'insercao', 'exclusao'] as const).map(tipo => {
                    const lista = g[tipo]
                    if (!lista.length) return null
                    const info = TIPO_INFO[tipo]
                    const Icon = info.icon
                    return (
                      <div key={tipo}>
                        <p className={`text-[13px] font-bold mb-1.5 flex items-center gap-1.5 ${info.cls}`}>
                          <Icon className="w-3.5 h-3.5" /> {info.label} ({lista.length})
                        </p>
                        <ul className="space-y-1.5">
                          {lista.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-[13px] text-gray-700">
                              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${info.dot}`} />
                              <span>
                                {tipo === 'alteracao' && descreverAlteracao(a)}
                                {tipo === 'insercao' && <>Inseriu {descreverLinha(a, 'depois')}</>}
                                {tipo === 'exclusao' && <>Excluiu {descreverLinha(a, 'antes')}</>}
                                <span className="text-gray-400 text-[11px]">
                                  {' — '}caixa de <b className="text-gray-500">{a.operador}</b> · {hora(a.quando)}
                                  {a.estacao ? ` · ${a.estacao}` : ''}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {!dados && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          Selecione o posto e período e clique em Buscar.
        </div>
      )}
    </div>
  )
}

function ResumoCard({ label, valor, cls }: { label: string; valor: number; cls: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`text-[20px] font-bold mt-0.5 ${cls}`}>{valor}</p>
    </div>
  )
}
