'use client'

import { useState } from 'react'
import { Loader2, Search, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type Alteracao = {
  tipo: 'insercao' | 'exclusao' | 'alteracao'
  quando: string
  alterou: string
  operador: string
  operador_login: string
  terceiro: boolean
  dia: string | null
  motivo: string
  valor: number | null
  valor_antes: number | null
  documento: string | null
  mlid: string | null
}
type LoginNome = { login: string; nome: string }
type Dados = {
  alteracoes: Alteracao[]
  total: number
  frentistas: LoginNome[]
  usuarios: LoginNome[]
  periodo: { ini: string; fim: string }
}
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const fmt = (n: number | null) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtQuando = (iso: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const TIPO_INFO = {
  insercao:  { label: 'Inserção',  cls: 'bg-emerald-100 text-emerald-700', icon: Plus },
  alteracao: { label: 'Alteração', cls: 'bg-amber-100 text-amber-700',     icon: Pencil },
  exclusao:  { label: 'Exclusão',  cls: 'bg-red-100 text-red-700',         icon: Trash2 },
} as const

export function AlteracoesCaixa({ postos }: { postos: PostoRow[] }) {
  const [postoId, setPostoId] = useState(postos[0]?.id ?? '')
  const [dataIni, setDataIni] = useState(HOJE)
  const [dataFim, setDataFim] = useState(HOJE)
  const [operador, setOperador] = useState('')
  const [alterou, setAlterou] = useState('')
  const [tipo, setTipo] = useState('')
  const [soTerceiros, setSoTerceiros] = useState(false)
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscar() {
    if (!postoId) return
    setLoading(true); setErro(null)
    try {
      const p = new URLSearchParams({ posto_id: postoId })
      if (dataIni) p.set('data_ini', dataIni)
      if (dataFim) p.set('data_fim', dataFim)
      if (operador) p.set('operador', operador)
      if (alterou) p.set('alterou', alterou)
      if (tipo) p.set('tipo', tipo)
      if (soTerceiros) p.set('so_terceiros', '1')
      const r = await fetch(`/api/caixa/alteracoes?${p}`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao buscar')
      setDados(d)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-5">
      <p className="text-[13px] text-gray-500">
        Todo o histórico de <b>inserções, alterações e exclusões</b> nos lançamentos do caixa. Quando <b>quem alterou</b> é
        diferente do <b>frentista</b> dono do caixa, a linha fica <span className="text-red-600 font-medium">destacada</span>.
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
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Até</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <button onClick={buscar} disabled={loading}
            className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
        {/* Filtros pós-busca (populados do resultado) */}
        {dados && (
          <div className="flex items-end gap-3 flex-wrap pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frentista (caixa)</label>
              <select value={operador} onChange={e => { setOperador(e.target.value) }}
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
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Operação</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Todas</option>
                <option value="insercao">Inserção</option>
                <option value="alteracao">Alteração</option>
                <option value="exclusao">Exclusão</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
              <input type="checkbox" checked={soTerceiros} onChange={e => setSoTerceiros(e.target.checked)} className="w-4 h-4" />
              Só quem não é o frentista
            </label>
            <button onClick={buscar} disabled={loading}
              className="px-4 py-2 border border-orange-300 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-50">
              Aplicar filtros
            </button>
          </div>
        )}
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}

      {/* Resultado */}
      {dados && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
            {dados.total} alteração(ões) no período {dados.periodo.ini.split('-').reverse().join('/')} a {dados.periodo.fim.split('-').reverse().join('/')}
            {dados.total > dados.alteracoes.length && ` · exibindo ${dados.alteracoes.length}`}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2 font-medium">Data / Hora</th>
                  <th className="text-left px-3 py-2 font-medium">Operação</th>
                  <th className="text-left px-3 py-2 font-medium">Quem alterou</th>
                  <th className="text-left px-3 py-2 font-medium">Frentista (caixa)</th>
                  <th className="text-left px-3 py-2 font-medium">Documento</th>
                  <th className="text-left px-3 py-2 font-medium">Motivo</th>
                  <th className="text-right px-4 py-2 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados.alteracoes.map((a, i) => {
                  const info = TIPO_INFO[a.tipo]
                  const Icon = info.icon
                  return (
                    <tr key={i} className={a.terceiro ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap text-[12px]">{fmtQuando(a.quando)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${info.cls}`}>
                          <Icon className="w-3 h-3" /> {info.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {a.terceiro && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline mr-1" />}
                        {a.alterou || '—'}
                      </td>
                      <td className={`px-3 py-2 ${a.terceiro ? 'text-red-700 font-medium' : 'text-gray-600'}`}>{a.operador || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 font-mono text-[12px]">{a.documento || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 text-[12px]">{a.motivo}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800 whitespace-nowrap">
                        {a.tipo === 'alteracao' && a.valor_antes != null
                          ? <span><span className="text-gray-400 line-through">{fmt(a.valor_antes)}</span> → {fmt(a.valor)}</span>
                          : fmt(a.valor)}
                      </td>
                    </tr>
                  )
                })}
                {dados.alteracoes.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Nenhuma alteração no período/filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!dados && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          Selecione o posto e período e clique em Buscar.
        </div>
      )}
    </div>
  )
}
