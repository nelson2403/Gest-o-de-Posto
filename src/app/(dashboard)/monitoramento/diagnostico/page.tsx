'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { Loader2, Search, AlertTriangle, Copy, Target, CheckCircle2 } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type Conta = { id: string; banco: string; conta: string | null }
type Lanc = { direcao: 'entrada' | 'saida'; valor: number; motivo: string; pessoa: string; documento: string; duplicado: boolean; casaPulo: boolean }
type Pulo = { data: string; jump: number; saldo_auto: number; saldo_banco: number | null; duplicados: number; lancamentos: Lanc[] }
type Dados = { posto_nome: string; conta_numero: string | null; banco: string | null; divergencia_atual: number | null; desde: string; pulos: Pulo[] }

const PERMITIDO = ['master', 'operador_conciliador']
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (d: string) => d ? d.split('-').reverse().join('/') : ''

export default function DiagnosticoPage() {
  const { usuario } = useAuthContext()
  const [postos, setPostos] = useState<PostoRow[]>([])
  const [postoId, setPostoId] = useState('')
  const [contas, setContas] = useState<Conta[]>([])
  const [contaId, setContaId] = useState('')
  const [desde, setDesde] = useState('2026-06-01')
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/postos-mapeamento').then(r => r.json()).then(j => { const l = j.data ?? []; setPostos(l); setPostoId(l[0]?.id ?? '') }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!postoId) { setContas([]); setContaId(''); return }
    fetch(`/api/caixa/conciliacao/contas?posto_id=${postoId}`).then(r => r.json())
      .then(j => { const c = j.contas ?? []; setContas(c); setContaId(c[0]?.id ?? '') }).catch(() => setContas([]))
  }, [postoId])

  async function buscar() {
    if (!contaId) { setErro('Selecione a conta.'); return }
    setLoading(true); setErro(null)
    try {
      const p = new URLSearchParams({ conta_id: contaId, desde })
      const r = await fetch(`/api/monitoramento/diagnostico?${p}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setDados(j)
    } catch (e: any) { setErro(e.message); setDados(null) } finally { setLoading(false) }
  }

  if (!PERMITIDO.includes(usuario?.role ?? '')) {
    return <div className="animate-fade-in"><Header title="Diagnóstico de Divergências" description="Saldos bancários" /><div className="p-6 text-center text-gray-400 text-sm">Sem permissão.</div></div>
  }

  return (
    <div className="animate-fade-in">
      <Header title="Diagnóstico de Divergências" description="Acha onde a divergência de saldo entrou e os lançamentos suspeitos" />
      <div className="p-4 md:p-6 space-y-5 max-w-4xl">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-end gap-3 flex-wrap">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
            <select value={postoId} onChange={e => setPostoId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[220px]">
              {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Conta</label>
            <select value={contaId} onChange={e => setContaId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[190px]">
              {contas.length === 0 && <option value="">Nenhuma conta</option>}
              {contas.map(c => <option key={c.id} value={c.id}>{c.banco}{c.conta ? ` — ${c.conta}` : ''}</option>)}
            </select></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
          <button onClick={buscar} disabled={loading} className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Diagnosticar
          </button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}

        {dados && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-[13px] text-gray-500">{dados.posto_nome} · {dados.banco} {dados.conta_numero}</span>
              <span className="ml-auto text-[13px]">Divergência atual: <b className={dados.divergencia_atual && Math.abs(dados.divergencia_atual) > 0.02 ? 'text-red-600' : 'text-emerald-600'}>{dados.divergencia_atual == null ? '—' : money(dados.divergencia_atual)}</b></span>
            </div>

            {dados.pulos.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-10 text-center text-emerald-700 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" /><span className="text-sm font-medium">Nenhuma divergência encontrada no período. Saldo batendo! 🎉</span>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[13px] text-gray-500">{dados.pulos.length} ponto(s) onde a divergência entrou. Os lançamentos <b className="text-amber-700">duplicados</b> e os que <b className="text-red-600">batem com o valor</b> estão no topo de cada dia.</p>
                {dados.pulos.map((pl, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-red-50 flex items-center gap-2 flex-wrap">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-[14px] font-bold text-red-800">Entrou {money(pl.jump)} em {dataBR(pl.data)}</span>
                      <span className="text-[11px] text-gray-500">saldo sistema {money(pl.saldo_auto)} · banco {pl.saldo_banco == null ? '—' : money(pl.saldo_banco)}</span>
                      {pl.duplicados > 0 && <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1"><Copy className="w-3 h-3" /> {pl.duplicados} duplicado(s)</span>}
                    </div>
                    <ul className="divide-y divide-gray-50 max-h-[360px] overflow-y-auto">
                      {pl.lancamentos.map((l, j) => {
                        const bg = l.casaPulo ? 'bg-red-50' : l.duplicado ? 'bg-amber-50' : ''
                        return (
                          <li key={j} className={`px-5 py-2 flex items-center gap-3 text-[13px] ${bg}`}>
                            <span className={`font-semibold w-[100px] flex-shrink-0 text-right ${l.direcao === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>{l.direcao === 'entrada' ? '+' : '−'}{money(l.valor)}</span>
                            <span className="truncate text-gray-700 flex-1">{l.motivo}{l.pessoa ? ` · ${l.pessoa}` : ''}{l.documento ? ` · ${l.documento}` : ''}</span>
                            {l.casaPulo && <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0"><Target className="w-3 h-3" /> bate com o pulo</span>}
                            {l.duplicado && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0"><Copy className="w-3 h-3" /> duplicado</span>}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!dados && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">Selecione o posto e a conta e clique em Diagnosticar.</div>
        )}
      </div>
    </div>
  )
}
