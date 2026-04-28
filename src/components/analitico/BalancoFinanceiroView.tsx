'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Loader2, AlertCircle, TrendingUp, TrendingDown, Scale,
  ChevronRight, ChevronDown, RefreshCw, Calendar, FileText, User2,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { BalancoResponse } from '@/app/api/relatorios/balanco-financeiro/route'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const fmtMesLabel = (iso: string) => {
  const [y, m] = iso.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${meses[Number(m) - 1]}/${y}`
}

interface Titulo {
  vencto:    string
  valor:     number
  documento: string | null
  motivo:    string
  pessoa:    string
  conta:     string
  empresa:   number
}

interface GrupoMes {
  mes:      string         // YYYY-MM
  titulos:  Titulo[]
  total:    number
}

interface GrupoMotivo {
  motivo:   string         // nome do motivo (ou "(sem motivo)")
  meses:    GrupoMes[]
  total:    number
  contagem: number
}

// Agrupa títulos primeiro por MOTIVO, depois por mês de vencimento.
function agruparPorMotivoEMes(titulos: Titulo[]): GrupoMotivo[] {
  const motivoMap = new Map<string, Map<string, GrupoMes>>()
  for (const t of titulos) {
    const motivo = t.motivo || '(sem motivo)'
    const mes = t.vencto.slice(0, 7)
    if (!motivoMap.has(motivo)) motivoMap.set(motivo, new Map())
    const mesMap = motivoMap.get(motivo)!
    if (!mesMap.has(mes)) mesMap.set(mes, { mes, titulos: [], total: 0 })
    const g = mesMap.get(mes)!
    g.titulos.push(t)
    g.total += t.valor
  }
  const result: GrupoMotivo[] = []
  for (const [motivo, mesMap] of motivoMap) {
    const meses = Array.from(mesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes))
    const total = meses.reduce((s, g) => s + g.total, 0)
    const contagem = meses.reduce((s, g) => s + g.titulos.length, 0)
    result.push({ motivo, meses, total, contagem })
  }
  // Maior valor primeiro
  result.sort((a, b) => b.total - a.total)
  return result
}

export function BalancoFinanceiroView() {
  const [resp, setResp]       = useState<BalancoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)

  const [aberto, setAberto] = useState<Set<string>>(new Set(['receber', 'pagar']))

  async function carregar() {
    setLoading(true)
    setErro(null)
    try {
      const r = await fetch('/api/relatorios/balanco-financeiro')
      const json = await r.json()
      if (!r.ok || json.error) setErro(json.error ?? `Erro HTTP ${r.status}`)
      else setResp(json as BalancoResponse)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  function toggle(key: string) {
    setAberto(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  const receberPorMotivo = useMemo(() => agruparPorMotivoEMes(resp?.receber ?? []), [resp])
  const pagarPorMotivo   = useMemo(() => agruparPorMotivoEMes(resp?.pagar   ?? []), [resp])

  if (loading && !resp) {
    return (
      <div className="flex justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (erro) {
    return (
      <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium">Erro ao carregar balanço financeiro</p>
          <p className="text-[12px] opacity-80">{erro}</p>
        </div>
        <button onClick={carregar} className="text-[12px] font-medium underline">Tentar novamente</button>
      </div>
    )
  }

  if (!resp) return null

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          titulo="A Receber"
          valor={resp.totalReceber}
          subtitulo={`${resp.receber.length} título${resp.receber.length === 1 ? '' : 's'} em aberto`}
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          titulo="A Pagar"
          valor={resp.totalPagar}
          subtitulo={`${resp.pagar.length} título${resp.pagar.length === 1 ? '' : 's'} em aberto`}
          icon={TrendingDown}
          accent="rose"
        />
        <KpiCard
          titulo="Saldo Projetado"
          valor={resp.saldoProjetado}
          subtitulo={resp.saldoProjetado >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
          icon={Scale}
          accent={resp.saldoProjetado >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      {/* Header com refresh */}
      <div className="flex items-center justify-between text-[11.5px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          Vencimentos a partir de {fmtData(new Date().toISOString().slice(0, 10))}
          <span className="opacity-60"> • {resp.empresas} {resp.empresas === 1 ? 'empresa' : 'empresas'}</span>
        </span>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Atualizar
        </button>
      </div>

      {/* A RECEBER */}
      <SecaoTree
        tipo="receber"
        aberto={aberto}
        onToggle={toggle}
        titulo="Contas a Receber"
        cor="emerald"
        total={resp.totalReceber}
        contagem={resp.receber.length}
        motivos={receberPorMotivo}
      />

      {/* A PAGAR */}
      <SecaoTree
        tipo="pagar"
        aberto={aberto}
        onToggle={toggle}
        titulo="Contas a Pagar"
        cor="rose"
        total={resp.totalPagar}
        contagem={resp.pagar.length}
        motivos={pagarPorMotivo}
      />
    </div>
  )
}

// ─── Componentes ──────────────────────────────────────────────

interface KpiCardProps {
  titulo:    string
  valor:     number
  subtitulo: string
  icon:      React.ElementType
  accent:    'emerald' | 'rose'
}

function KpiCard({ titulo, valor, subtitulo, icon: Icon, accent }: KpiCardProps) {
  const isPositive = valor >= 0
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{titulo}</p>
          <p className={cn(
            'text-[22px] font-bold tabular-nums mt-1 leading-none',
            accent === 'emerald' && isPositive && 'text-emerald-600',
            accent === 'rose' && 'text-rose-600',
            accent === 'emerald' && !isPositive && 'text-rose-600',
          )}>
            {fmtBRL(valor)}
          </p>
          <p className="text-[11.5px] text-gray-400 mt-1.5">{subtitulo}</p>
        </div>
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
          accent === 'emerald' ? 'bg-emerald-50' : 'bg-rose-50',
        )}>
          <Icon className={cn('w-5 h-5', accent === 'emerald' ? 'text-emerald-600' : 'text-rose-600')} />
        </div>
      </div>
    </div>
  )
}

interface SecaoTreeProps {
  tipo:     'receber' | 'pagar'
  aberto:   Set<string>
  onToggle: (key: string) => void
  titulo:   string
  cor:      'emerald' | 'rose'
  total:    number
  contagem: number
  motivos:  GrupoMotivo[]
}

function SecaoTree({ tipo, aberto, onToggle, titulo, cor, total, contagem, motivos }: SecaoTreeProps) {
  const isOpen = aberto.has(tipo)
  const acentos = cor === 'emerald'
    ? { texto: 'text-emerald-700', bg: 'bg-emerald-50', bgHover: 'hover:bg-emerald-100/40', border: 'border-emerald-200' }
    : { texto: 'text-rose-700',    bg: 'bg-rose-50',    bgHover: 'hover:bg-rose-100/40',    border: 'border-rose-200' }

  return (
    <div className={cn('rounded-xl bg-white border overflow-hidden', acentos.border)}>
      {/* Header da seção (clicável) */}
      <button
        onClick={() => onToggle(tipo)}
        className={cn(
          'w-full flex items-center gap-3 px-5 py-4 transition-colors text-left',
          acentos.bg, acentos.bgHover,
        )}
      >
        <div className="w-8 h-8 flex items-center justify-center text-gray-500">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn('text-[14px] font-bold uppercase tracking-tight', acentos.texto)}>{titulo}</h3>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            {contagem} título{contagem === 1 ? '' : 's'} • {motivos.length} {motivos.length === 1 ? 'motivo' : 'motivos'}
          </p>
        </div>
        <p className={cn('text-[18px] font-bold tabular-nums', acentos.texto)}>
          {fmtBRL(total)}
        </p>
      </button>

      {/* Lista de motivos */}
      {isOpen && (
        <div>
          {motivos.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-gray-500">
              Nenhum título em aberto a partir de hoje.
            </p>
          ) : (
            motivos.map(motivo => (
              <GrupoMotivoRow
                key={motivo.motivo}
                tipo={tipo}
                grupo={motivo}
                aberto={aberto}
                onToggle={onToggle}
                cor={cor}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function GrupoMotivoRow({ tipo, grupo, aberto, onToggle, cor }: {
  tipo: 'receber' | 'pagar'
  grupo: GrupoMotivo
  aberto: Set<string>
  onToggle: (key: string) => void
  cor: 'emerald' | 'rose'
}) {
  const key = `${tipo}:m:${grupo.motivo}`
  const isOpen = aberto.has(key)
  const corValor = cor === 'emerald' ? 'text-emerald-700' : 'text-rose-700'

  return (
    <>
      <button
        onClick={() => onToggle(key)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left border-t border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="w-6 h-6 flex items-center justify-center text-gray-400 ml-7">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <span className="flex-1 text-[12.5px] font-bold uppercase tracking-tight text-gray-800 truncate">
          {grupo.motivo}
        </span>
        <span className="text-[11px] text-gray-400">
          {grupo.contagem} {grupo.contagem === 1 ? 'título' : 'títulos'} • {grupo.meses.length} {grupo.meses.length === 1 ? 'mês' : 'meses'}
        </span>
        <span className={cn('text-[13.5px] font-bold tabular-nums w-32 text-right', corValor)}>
          {fmtBRL(grupo.total)}
        </span>
      </button>

      {isOpen && grupo.meses.map(mes => (
        <GrupoMesRow
          key={`${grupo.motivo}-${mes.mes}`}
          tipo={tipo}
          motivoNome={grupo.motivo}
          grupo={mes}
          aberto={aberto}
          onToggle={onToggle}
          cor={cor}
        />
      ))}
    </>
  )
}

function GrupoMesRow({ tipo, motivoNome, grupo, aberto, onToggle, cor }: {
  tipo: 'receber' | 'pagar'
  motivoNome: string
  grupo: GrupoMes
  aberto: Set<string>
  onToggle: (key: string) => void
  cor: 'emerald' | 'rose'
}) {
  const key = `${tipo}:m:${motivoNome}:${grupo.mes}`
  const isOpen = aberto.has(key)
  const corValor = cor === 'emerald' ? 'text-emerald-700' : 'text-rose-700'

  return (
    <>
      <button
        onClick={() => onToggle(key)}
        className="w-full flex items-center gap-3 px-5 py-2 text-left border-t border-gray-100/70 bg-gray-50/30 hover:bg-gray-50 transition-colors"
      >
        <div className="w-6 h-6 flex items-center justify-center text-gray-400 ml-[60px]">
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <span className="flex-1 text-[12px] font-medium text-gray-600 capitalize">
          {fmtMesLabel(grupo.mes)}
        </span>
        <span className="text-[10.5px] text-gray-400">
          {grupo.titulos.length} {grupo.titulos.length === 1 ? 'título' : 'títulos'}
        </span>
        <span className={cn('text-[12.5px] font-semibold tabular-nums w-32 text-right', corValor)}>
          {fmtBRL(grupo.total)}
        </span>
      </button>

      {/* Lista de títulos */}
      {isOpen && (
        <div className="bg-white">
          {grupo.titulos.map((t, idx) => (
            <TituloRow key={`${grupo.mes}-${idx}`} titulo={t} cor={cor} />
          ))}
        </div>
      )}
    </>
  )
}

function TituloRow({ titulo, cor }: { titulo: Titulo; cor: 'emerald' | 'rose' }) {
  const corValor = cor === 'emerald' ? 'text-emerald-700' : 'text-rose-700'

  return (
    <div className="flex items-center gap-3 pl-[120px] pr-5 py-1.5 border-t border-gray-100/80 hover:bg-gray-50 transition-colors">
      <span className="text-[11.5px] font-mono text-gray-500 w-20 flex-shrink-0">
        {fmtData(titulo.vencto)}
      </span>
      {titulo.documento && (
        <span className="flex items-center gap-1 text-[11px] text-gray-500 flex-shrink-0">
          <FileText className="w-3 h-3" />
          {titulo.documento}
        </span>
      )}
      <span className="flex items-center gap-1 text-[11.5px] text-gray-700 flex-1 min-w-0 truncate">
        <User2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <span className="truncate">{titulo.pessoa || <span className="italic text-gray-400">sem fornecedor</span>}</span>
      </span>
      <span className={cn('text-[12.5px] font-semibold tabular-nums w-32 text-right flex-shrink-0', corValor)}>
        {fmtBRL(titulo.valor)}
      </span>
    </div>
  )
}
