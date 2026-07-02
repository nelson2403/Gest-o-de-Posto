'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, Printer, ArrowLeft, Building2, Users, TrendingUp, DollarSign } from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────────────────────
type MembroRole = 'supervisor' | 'manager' | 'pit_boss' | 'oil_changer' | 'seller'

interface Membro {
  vendedor_id: string; nome: string; role: MembroRole | null; cadastrado: boolean
  vendas_count: number; faturamento: number; lucro: number; comissao: number
}
interface PostoBloco {
  posto_id: string; posto_nome: string
  faturamento: number; lucro: number; comissao_total: number
  qtd_membros_comissionados: number
  membros: Membro[]
  erro?: string
}
interface Resp {
  esquema: { id: string; nome: string }
  periodo: { ini: string; fim: string }
  totais: {
    postos: number; membros_comissionados: number
    faturamento: number; lucro: number; comissao: number
  }
  postos: PostoBloco[]
}

// ── Constantes/Helpers ───────────────────────────────────────────────────────
const ROLE_LABEL: Record<MembroRole, string> = {
  manager: 'Gerente', supervisor: 'Supervisor',
  pit_boss: 'Chefe de Pista', oil_changer: 'Trocador de Óleo', seller: 'Vendedor',
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const fmtQtd = (v: number) => v.toLocaleString('pt-BR')
const fmtData = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function AprovacaoRelatorioPage() {
  const sp = useSearchParams()
  const esquemaId = sp.get('esquema_id') ?? ''
  const dataIni   = sp.get('data_ini')   ?? ''
  const dataFim   = sp.get('data_fim')   ?? ''

  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!esquemaId || !dataIni || !dataFim) {
      setErro('Parâmetros esquema_id, data_ini e data_fim são obrigatórios')
      setLoading(false)
      return
    }
    fetch(`/api/comissionamento/aprovacao?esquema_id=${esquemaId}&data_ini=${dataIni}&data_fim=${dataFim}`)
      .then(r => r.json())
      .then((j: Resp | { error: string }) => {
        if ('error' in j) throw new Error(j.error)
        setData(j)
      })
      .catch(e => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [esquemaId, dataIni, dataFim])

  const pctByPosto = useMemo(() => {
    if (!data) return new Map<string, number>()
    const total = data.totais.comissao
    const m = new Map<string, number>()
    for (const p of data.postos) m.set(p.posto_id, total > 0 ? (p.comissao_total / total) * 100 : 0)
    return m
  }, [data])

  if (loading) return <FullPage><Loader2 className="w-6 h-6 animate-spin text-orange-600" /><p className="text-[13px] text-gray-500 mt-2">Consolidando comissões da rede…</p></FullPage>
  if (erro)   return <FullPage><AlertCircle className="w-6 h-6 text-rose-600" /><p className="text-[13px] text-rose-700 mt-2">{erro}</p></FullPage>
  if (!data)  return null

  return (
    <div className="bg-gray-50 min-h-screen print:bg-white">
      {/* Barra de ações — some no print */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center justify-between">
          <Link href="/comissionamento/relatorios" className="text-[12.5px] text-gray-600 hover:text-orange-600 flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao relatório do posto
          </Link>
          <button
            onClick={() => window.print()}
            className="h-8 px-3 rounded-md bg-gray-900 text-white text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-gray-800"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 print:px-0 print:py-3 space-y-4">
        {/* Cabeçalho */}
        <header className="border-b-2 border-gray-900 pb-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Comissionamento</p>
          <h1 className="text-[22px] font-bold text-gray-900 mt-0.5">Relatório de Aprovação — Rede</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12.5px] text-gray-700">
            <p><span className="text-gray-500">Esquema:</span> <b>{data.esquema.nome}</b></p>
            <p><span className="text-gray-500">Período:</span> <b>{fmtData(data.periodo.ini)} a {fmtData(data.periodo.fim)}</b></p>
          </div>
        </header>

        {/* KPIs da rede */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2 print:gap-1">
          <Kpi icone={Building2}   label="Postos"       valor={fmtQtd(data.totais.postos)}                cor="blue"    />
          <Kpi icone={Users}       label="Membros pagos" valor={fmtQtd(data.totais.membros_comissionados)} cor="purple"  />
          <Kpi icone={TrendingUp}  label="Faturamento"  valor={fmtBRL(data.totais.faturamento)}           cor="emerald" />
          <Kpi icone={DollarSign}  label="A pagar"      valor={fmtBRL(data.totais.comissao)}              cor="orange"  destacado />
        </section>

        {/* Blocos por posto */}
        {data.postos.map((p, i) => (
          <PostoCard
            key={p.posto_id}
            idx={i + 1}
            posto={p}
            pctRede={pctByPosto.get(p.posto_id) ?? 0}
          />
        ))}

        {/* Rodapé com totais + assinatura */}
        <footer className="border-t-2 border-gray-900 pt-3 mt-4 print:mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-gray-700">TOTAL GERAL — {data.totais.postos} posto{data.totais.postos === 1 ? '' : 's'}, {data.totais.membros_comissionados} membro{data.totais.membros_comissionados === 1 ? '' : 's'} a pagar</p>
            <p className="text-[24px] font-bold text-orange-700 tabular-nums">{fmtBRL(data.totais.comissao)}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 pt-6 mt-2 print:pt-8">
            <div className="border-t border-gray-400 pt-1">
              <p className="text-[10.5px] text-gray-500 uppercase tracking-wide">Elaborado por</p>
            </div>
            <div className="border-t border-gray-400 pt-1">
              <p className="text-[10.5px] text-gray-500 uppercase tracking-wide">Autorizado pelo proprietário</p>
            </div>
          </div>
          <p className="text-[9.5px] text-gray-400 text-center pt-2">
            Emitido em {new Date().toLocaleString('pt-BR')} · Sistema de gestão Pedra do Pombal
          </p>
        </footer>
      </div>

      {/* Estilos print — remove hover/sombras, força cores CMYK-safe */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-break-inside { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">{children}</div>
}

function Kpi({ icone: Icone, label, valor, cor, destacado }: {
  icone: React.ComponentType<{ className?: string }>
  label: string; valor: string
  cor: 'blue' | 'purple' | 'emerald' | 'orange'
  destacado?: boolean
}) {
  const cores = {
    blue:    'bg-blue-50 text-blue-800 border-blue-200',
    purple:  'bg-purple-50 text-purple-800 border-purple-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    orange:  'bg-orange-50 text-orange-900 border-orange-300',
  }
  return (
    <div className={`rounded-lg border ${cores[cor]} px-3 py-2 no-break-inside ${destacado ? 'border-2' : ''}`}>
      <div className="flex items-center gap-1.5">
        <Icone className="w-3.5 h-3.5 opacity-70" />
        <p className="text-[9.5px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
      </div>
      <p className={`font-bold tabular-nums ${destacado ? 'text-[19px]' : 'text-[15px]'}`}>{valor}</p>
    </div>
  )
}

function PostoCard({ idx, posto, pctRede }: { idx: number; posto: PostoBloco; pctRede: number }) {
  return (
    <section className="bg-white border border-gray-300 rounded-lg overflow-hidden no-break-inside print:border-gray-500 print:rounded-none">
      {/* Cabeçalho do posto */}
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9.5px] uppercase tracking-widest text-gray-500 font-semibold">Posto {idx}</p>
          <h2 className="text-[14.5px] font-bold text-gray-900 truncate">{posto.posto_nome}</h2>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[9.5px] uppercase tracking-widest text-gray-500 font-semibold">Comissão do posto</p>
          <p className="text-[18px] font-bold text-orange-700 tabular-nums">{fmtBRL(posto.comissao_total)}</p>
          <p className="text-[9.5px] text-gray-500">{fmtPct(pctRede)} da rede</p>
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-3 border-b border-gray-200 divide-x divide-gray-200 text-center bg-gray-50/60">
        <MiniKpi label="Faturamento" valor={fmtBRL(posto.faturamento)} />
        <MiniKpi label="Lucro bruto" valor={fmtBRL(posto.lucro)}       cor="emerald" />
        <MiniKpi label={`Membros pagos (${posto.qtd_membros_comissionados})`} valor={fmtQtd(posto.membros.length) + ' com atividade'} pequeno />
      </div>

      {posto.erro ? (
        <div className="px-4 py-2 text-[12px] text-rose-800 bg-rose-50">
          <b>Erro ao calcular:</b> {posto.erro}
        </div>
      ) : posto.membros.length === 0 ? (
        <p className="px-4 py-3 text-[11.5px] text-gray-500 italic">Sem membros com atividade no período.</p>
      ) : (
        <table className="w-full text-[11.5px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-[9.5px] uppercase tracking-wider text-gray-500">
              <th className="text-left  px-3 py-1.5">Membro</th>
              <th className="text-left  px-3 py-1.5 w-32">Cargo</th>
              <th className="text-right px-3 py-1.5 w-16">Vendas</th>
              <th className="text-right px-3 py-1.5 w-28 hidden md:table-cell print:table-cell">Faturamento</th>
              <th className="text-right px-3 py-1.5 w-24">Comissão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {posto.membros.map(m => (
              <tr key={m.vendedor_id} className={m.comissao > 0 ? '' : 'opacity-60'}>
                <td className="px-3 py-1 text-gray-800">
                  {m.nome}
                  {!m.cadastrado && <span className="ml-1.5 text-[9px] text-amber-700">(não cadastrado)</span>}
                </td>
                <td className="px-3 py-1 text-gray-600">{m.role ? ROLE_LABEL[m.role] : '—'}</td>
                <td className="px-3 py-1 text-right tabular-nums text-gray-700">{fmtQtd(m.vendas_count)}</td>
                <td className="px-3 py-1 text-right tabular-nums text-gray-700 hidden md:table-cell print:table-cell">{fmtBRL(m.faturamento)}</td>
                <td className={`px-3 py-1 text-right tabular-nums font-semibold ${m.comissao > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                  {fmtBRL(m.comissao)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function MiniKpi({ label, valor, cor, pequeno }: {
  label: string; valor: string; cor?: 'emerald'; pequeno?: boolean
}) {
  return (
    <div className="px-3 py-1.5">
      <p className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold">{label}</p>
      <p className={`font-semibold tabular-nums ${pequeno ? 'text-[11px] text-gray-600' : 'text-[12.5px]'} ${cor === 'emerald' ? 'text-emerald-800' : 'text-gray-900'}`}>
        {valor}
      </p>
    </div>
  )
}
