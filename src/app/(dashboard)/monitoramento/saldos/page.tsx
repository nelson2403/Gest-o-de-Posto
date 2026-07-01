'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Landmark, Loader2, RefreshCw, CheckCircle2, AlertTriangle, CircleDashed, FileQuestion, MessageSquarePlus, MessageSquareText, X } from 'lucide-react'

type Status = 'ok' | 'diverge' | 'sem_inicial' | 'sem_extrato'
type SaldoConta = {
  conta_id: string
  posto_id: string | null
  posto_nome: string
  conta_codigo: string
  conta_numero: string | null
  data_extrato: string | null
  saldo_banco: number | null
  saldo_inicial_lancado: number
  saldo_autosystem: number | null
  divergencia: number | null
  status: Status
  observacao: string
  obs_atualizado_em: string | null
  obs_atualizado_por: string | null
}
type Dados = { contas: SaldoConta[]; gerado_em: string }

const fmt = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtData = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

const STATUS_INFO: Record<Status, { label: string; cls: string; icon: React.ElementType }> = {
  ok:          { label: 'Conciliada',     cls: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  diverge:     { label: 'Diverge',        cls: 'bg-red-100 text-red-700',      icon: AlertTriangle },
  sem_inicial: { label: 'Sem inicial',    cls: 'bg-amber-100 text-amber-700',  icon: CircleDashed },
  sem_extrato: { label: 'Sem extrato',    cls: 'bg-gray-100 text-gray-500',    icon: FileQuestion },
}

function StatusPill({ s }: { s: Status }) {
  const info = STATUS_INFO[s]
  const Icon = info.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${info.cls}`}>
      <Icon className="w-3 h-3" /> {info.label}
    </span>
  )
}

function ResumoCard({ titulo, valor, cls }: { titulo: string; valor: React.ReactNode; cls: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] text-gray-400">{titulo}</p>
      <p className={`text-[18px] font-bold mt-0.5 ${cls}`}>{valor}</p>
    </div>
  )
}

type Banco = 'sicoob' | 'stone'

export default function MonitoramentoSaldosPage() {
  const [banco, setBanco]     = useState<Banco>('sicoob')
  const [dados, setDados]     = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)

  // Edição de observação
  const [editando, setEditando] = useState<SaldoConta | null>(null)
  const [obsTexto, setObsTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroObs, setErroObs]   = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/monitoramento/saldos?banco=${banco}`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao carregar')
      setDados(d); setErro(null)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [banco])

  const abrirEdicao = (c: SaldoConta) => { setEditando(c); setObsTexto(c.observacao ?? ''); setErroObs(null) }

  const salvarObs = async () => {
    if (!editando) return
    setSalvando(true); setErroObs(null)
    try {
      const r = await fetch('/api/monitoramento/saldos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_id: editando.conta_id, observacao: obsTexto }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar')
      // Atualiza localmente sem recarregar tudo
      setDados(prev => prev && ({
        ...prev,
        contas: prev.contas.map(x => x.conta_id === editando.conta_id
          ? { ...x, observacao: obsTexto, obs_atualizado_em: d.atualizado_em, obs_atualizado_por: d.atualizado_por }
          : x),
      }))
      setEditando(null)
    } catch (e: any) {
      setErroObs(e.message)
    } finally {
      setSalvando(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [carregar])

  const resumo = useMemo(() => {
    const c = dados?.contas ?? []
    return {
      ok:          c.filter(x => x.status === 'ok').length,
      diverge:     c.filter(x => x.status === 'diverge').length,
      sem_inicial: c.filter(x => x.status === 'sem_inicial').length,
      sem_extrato: c.filter(x => x.status === 'sem_extrato').length,
      saldoBanco:  c.reduce((s, x) => s + (x.saldo_banco ?? 0), 0),
    }
  }, [dados])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900">Monitoramento de Saldos Bancários</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Banco (extrato) × AUTOSYSTEM, por conta <span className="capitalize">{banco}</span>
              {dados ? ` · atualizado ${new Date(dados.gerado_em).toLocaleTimeString('pt-BR')}` : ''} · auto a cada 60s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor de banco */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {(['sicoob', 'stone'] as Banco[]).map((b) => (
              <button
                key={b}
                onClick={() => setBanco(b)}
                className={`h-8 px-3 rounded-md text-[12px] font-semibold capitalize transition ${
                  banco === b ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <button onClick={carregar} className="flex items-center gap-1.5 h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[13px] text-red-700">{erro}</div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <ResumoCard titulo="Conciliadas"   valor={resumo.ok}          cls="text-green-600" />
        <ResumoCard titulo="Divergentes"   valor={resumo.diverge}     cls="text-red-600" />
        <ResumoCard titulo="Sem inicial"   valor={resumo.sem_inicial} cls="text-amber-600" />
        <ResumoCard titulo="Sem extrato"   valor={resumo.sem_extrato} cls="text-gray-400" />
        <ResumoCard titulo="Saldo total (banco)" valor={`R$ ${fmt(resumo.saldoBanco)}`} cls="text-gray-900 text-[15px]" />
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                <th className="text-left font-semibold px-4 py-2.5">Posto</th>
                <th className="text-left font-semibold px-3 py-2.5">Conta</th>
                <th className="text-center font-semibold px-3 py-2.5">Extrato</th>
                <th className="text-right font-semibold px-3 py-2.5">Saldo banco</th>
                <th className="text-right font-semibold px-3 py-2.5">Saldo AUTOSYSTEM</th>
                <th className="text-right font-semibold px-3 py-2.5">Divergência</th>
                <th className="text-center font-semibold px-4 py-2.5">Status</th>
                <th className="text-left font-semibold px-4 py-2.5">Motivo / Obs.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(dados?.contas ?? []).map((c) => (
                <tr key={c.conta_id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{c.posto_nome}</td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono text-[12px]">
                    {c.conta_numero ?? c.conta_codigo}
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-500 text-[12px]">{fmtData(c.data_extrato)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-800">{fmt(c.saldo_banco)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmt(c.saldo_autosystem)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                    c.status === 'ok' ? 'text-green-600'
                    : c.status === 'diverge' ? 'text-red-600'
                    : 'text-gray-300'
                  }`}>
                    {fmt(c.divergencia)}
                  </td>
                  <td className="px-4 py-2.5 text-center"><StatusPill s={c.status} /></td>
                  <td className="px-4 py-2.5 max-w-[240px]">
                    {c.observacao ? (
                      <button onClick={() => abrirEdicao(c)} className="group flex items-start gap-1.5 text-left w-full" title="Editar observação">
                        <MessageSquareText className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-[12px] text-gray-600 line-clamp-2 group-hover:text-gray-900">{c.observacao}</span>
                      </button>
                    ) : (
                      <button onClick={() => abrirEdicao(c)} className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-emerald-600">
                        <MessageSquarePlus className="w-3.5 h-3.5" /> adicionar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!dados?.contas?.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Nenhuma conta {banco} encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        O saldo do AUTOSYSTEM é calculado como <b>saldo inicial lançado + movimentos acumulados</b> até a data do último
        extrato anexado. Enquanto o saldo inicial não for lançado, a conta aparece como <b>“Sem inicial”</b> e a
        divergência reflete o acumulado a corrigir.
      </p>

      {/* Modal de observação */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !salvando && setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div>
                <h3 className="text-[14px] font-bold text-gray-900">Motivo da divergência</h3>
                <p className="text-[11px] text-gray-400">{editando.posto_nome} · conta {editando.conta_numero ?? editando.conta_codigo}</p>
              </div>
              <button onClick={() => !salvando && setEditando(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-400">Divergência atual</span>
                <span className={`font-mono font-semibold ${editando.status === 'diverge' ? 'text-red-600' : editando.status === 'ok' ? 'text-green-600' : 'text-gray-500'}`}>
                  R$ {fmt(editando.divergencia)}
                </span>
              </div>
              <textarea
                value={obsTexto}
                onChange={e => setObsTexto(e.target.value)}
                rows={5}
                maxLength={2000}
                autoFocus
                placeholder="Ex.: diferença de recebíveis de cartão ainda não liquidados; lançamento pendente no AUTOSYSTEM; taxa não conciliada…"
                className="w-full border border-gray-200 rounded-lg p-3 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {editando.obs_atualizado_em && (
                <p className="text-[11px] text-gray-400">
                  Última atualização: {new Date(editando.obs_atualizado_em).toLocaleString('pt-BR')}
                  {editando.obs_atualizado_por ? ` · por ${editando.obs_atualizado_por}` : ''}
                </p>
              )}
              {erroObs && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-[12px] text-red-700">{erroObs}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
              <button onClick={() => setEditando(null)} disabled={salvando} className="h-9 px-3 text-[13px] text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancelar</button>
              <button onClick={salvarObs} disabled={salvando} className="h-9 px-4 text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
