'use client'

import { useState } from 'react'
import { Loader2, Search, CreditCard, User } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type Transacao = { hora: string; nsu: string | null; valor: number; bandeira: string; frentista: string; frentista_login: string }
type ResumoFrentista = { login: string; nome: string; total: number; qtd: number }
type Dados = {
  transacoes: Transacao[]
  resumo: ResumoFrentista[]
  frentistas: { login: string; nome: string }[]
  total_dia: number
  qtd_dia: number
  data: string
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function ConciliacaoCartoes({ postos }: { postos: PostoRow[] }) {
  const [postoId, setPostoId] = useState(postos[0]?.id ?? '')
  const [data, setData]       = useState(HOJE)
  const [operador, setOperador] = useState('')
  const [dados, setDados]     = useState<Dados | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState<string | null>(null)

  async function buscar(operadorArg?: string) {
    if (!postoId) return
    const op = operadorArg != null ? operadorArg : operador
    setLoading(true); setErro(null)
    try {
      const p = new URLSearchParams({ posto_id: postoId, data })
      if (op) p.set('operador', op)
      const r = await fetch(`/api/caixa/cartoes?${p}`, { cache: 'no-store' })
      const txt = await r.text()
      let d: any = null
      try { d = txt ? JSON.parse(txt) : null } catch { /* não-JSON */ }
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      if (!d) throw new Error('Resposta vazia do servidor.')
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
        Transações de <b>cartão</b> lançadas no caixa, por frentista. Cada transação TEF individual tem <b>NSU</b>;
        os lançamentos <b>sem NSU</b> costumam ser os acertos agregados do financeiro (não venda de frentista).
      </p>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
            <select value={postoId} onChange={e => setPostoId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 min-w-[220px]">
              {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dia</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          {dados && dados.frentistas.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frentista</label>
              <select value={operador} onChange={e => { setOperador(e.target.value); buscar(e.target.value) }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
                <option value="">Todos</option>
                {dados.frentistas.map(f => <option key={f.login} value={f.login}>{f.nome}</option>)}
              </select>
            </div>
          )}
          <button onClick={() => buscar()} disabled={loading}
            className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}

      {dados && (
        <>
          {/* Totais */}
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <p className="text-[11px] text-gray-400">Total em cartão no dia</p>
              <p className="text-[20px] font-bold mt-0.5 text-gray-900">{fmt(dados.total_dia)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <p className="text-[11px] text-gray-400">Transações</p>
              <p className="text-[20px] font-bold mt-0.5 text-gray-900">{dados.qtd_dia}</p>
            </div>
          </div>

          {/* Resumo por frentista */}
          {!operador && dados.resumo.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">Total de cartão por frentista</div>
              <div className="divide-y divide-gray-100">
                {dados.resumo.map(f => (
                  <button key={f.login} onClick={() => { setOperador(f.login); buscar(f.login) }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-left">
                    <span className="flex items-center gap-2 text-sm text-gray-800 font-medium"><User className="w-3.5 h-3.5 text-gray-400" /> {f.nome}</span>
                    <span className="text-sm text-gray-600">{f.qtd} transações · <b className="text-gray-900 font-mono">{fmt(f.total)}</b></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transações */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              {operador ? `Transações de ${dados.resumo.find(r => r.login === operador)?.nome ?? operador}` : 'Todas as transações'} · {dados.transacoes.length}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                    <th className="text-left px-4 py-2 font-medium">Hora</th>
                    <th className="text-left px-3 py-2 font-medium">NSU</th>
                    <th className="text-left px-3 py-2 font-medium">Bandeira / Forma</th>
                    <th className="text-left px-3 py-2 font-medium">Frentista</th>
                    <th className="text-right px-4 py-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dados.transacoes.map((t, i) => (
                    <tr key={i} className={`hover:bg-gray-50 ${!t.nsu ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-4 py-2 text-gray-600 font-mono text-[12px]">{t.hora || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-gray-700">
                        {t.nsu ? t.nsu : <span className="text-amber-600 text-[11px]">sem NSU (agregado)</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-[12px] flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-gray-300" /> {t.bandeira}</td>
                      <td className="px-3 py-2 text-gray-700">{t.frentista}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">{fmt(t.valor)}</td>
                    </tr>
                  ))}
                  {dados.transacoes.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Nenhuma transação de cartão neste dia.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!dados && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          Selecione o posto e o dia e clique em Buscar.
        </div>
      )}
    </div>
  )
}
