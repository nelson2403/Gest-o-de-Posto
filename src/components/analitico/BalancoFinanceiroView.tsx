'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2, AlertCircle, TrendingUp, TrendingDown, Scale,
  ChevronRight, ChevronDown, RefreshCw, Calendar, FileText, User2,
  Building2, CheckCircle2, Clock, Printer, FileText as ReportIcon, Database,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { BalancoResponse, PagarTituloResp, ReceberTituloResp } from '@/app/api/relatorios/balanco-financeiro/route'

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

// ── A Receber: Empresa → Conta → Lançamentos ──────────────────────────
interface ContaReceberLeaf {
  conta_codigo: string
  conta_nome:   string
  titulos:      ReceberTituloResp[]
  total:        number
}

interface EmpresaReceber {
  empresa_id:            number
  empresa_nome:          string
  empresa_nome_reduzido: string
  contas:                ContaReceberLeaf[]
  total:                 number
  qtdTitulos:            number
}

function agruparReceberPorEmpresaEConta(titulos: ReceberTituloResp[]): EmpresaReceber[] {
  const empMap = new Map<number, {
    nome: string; nome_reduzido: string
    contaMap: Map<string, ContaReceberLeaf>
  }>()

  for (const t of titulos) {
    if (!empMap.has(t.empresa)) {
      empMap.set(t.empresa, {
        nome:          t.empresa_nome,
        nome_reduzido: t.empresa_nome_reduzido,
        contaMap:      new Map(),
      })
    }
    const e = empMap.get(t.empresa)!
    if (!e.contaMap.has(t.conta)) {
      e.contaMap.set(t.conta, {
        conta_codigo: t.conta,
        conta_nome:   t.conta_nome || t.conta,
        titulos:      [],
        total:        0,
      })
    }
    const c = e.contaMap.get(t.conta)!
    c.titulos.push(t)
    c.total += t.valor
  }

  const result: EmpresaReceber[] = []
  for (const [empId, info] of empMap) {
    const contas = Array.from(info.contaMap.values()).sort(
      (a, b) => a.conta_codigo.localeCompare(b.conta_codigo, 'pt-BR'),
    )
    for (const c of contas) {
      c.titulos.sort((a, b) => a.vencto.localeCompare(b.vencto))
    }
    const total      = contas.reduce((s, c) => s + c.total, 0)
    const qtdTitulos = contas.reduce((s, c) => s + c.titulos.length, 0)
    result.push({
      empresa_id:            empId,
      empresa_nome:          info.nome,
      empresa_nome_reduzido: info.nome_reduzido,
      contas,
      total,
      qtdTitulos,
    })
  }
  result.sort((a, b) =>
    a.empresa_nome_reduzido.localeCompare(b.empresa_nome_reduzido, 'pt-BR'),
  )
  return result
}

// ── A Pagar: Empresa → Conta → Títulos ─────────────────────────────────
interface ContaPagar {
  conta_codigo: string
  conta_nome:   string
  titulos:      PagarTituloResp[]
  total:        number
  qtdAbertos:   number
  qtdBaixados:  number
}

interface EmpresaPagar {
  empresa_id:            number
  empresa_nome:          string
  empresa_nome_reduzido: string
  contas:                ContaPagar[]
  total:                 number
  qtdAbertos:            number
  qtdBaixados:           number
}

function agruparPorEmpresaEConta(titulos: PagarTituloResp[]): EmpresaPagar[] {
  const empMap = new Map<number, {
    nome: string; nome_reduzido: string
    contaMap: Map<string, ContaPagar>
  }>()

  for (const t of titulos) {
    if (!empMap.has(t.empresa)) {
      empMap.set(t.empresa, {
        nome:          t.empresa_nome,
        nome_reduzido: t.empresa_nome_reduzido,
        contaMap:      new Map(),
      })
    }
    const emp = empMap.get(t.empresa)!
    if (!emp.contaMap.has(t.conta_codigo)) {
      emp.contaMap.set(t.conta_codigo, {
        conta_codigo: t.conta_codigo,
        conta_nome:   t.conta_nome || t.conta_codigo,
        titulos:      [],
        total:        0,
        qtdAbertos:   0,
        qtdBaixados:  0,
      })
    }
    const conta = emp.contaMap.get(t.conta_codigo)!
    conta.titulos.push(t)
    conta.total += t.valor
    if (t.situacao_baixa === 0) conta.qtdAbertos += 1
    else                         conta.qtdBaixados += 1
  }

  const result: EmpresaPagar[] = []
  for (const [empId, info] of empMap) {
    const contas = Array.from(info.contaMap.values()).sort(
      (a, b) => a.conta_codigo.localeCompare(b.conta_codigo, 'pt-BR'),
    )
    // Ordena títulos de cada conta por vencimento ascendente
    for (const c of contas) {
      c.titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    }
    const total       = contas.reduce((s, c) => s + c.total, 0)
    const qtdAbertos  = contas.reduce((s, c) => s + c.qtdAbertos, 0)
    const qtdBaixados = contas.reduce((s, c) => s + c.qtdBaixados, 0)
    result.push({
      empresa_id:            empId,
      empresa_nome:          info.nome,
      empresa_nome_reduzido: info.nome_reduzido,
      contas,
      total,
      qtdAbertos,
      qtdBaixados,
    })
  }
  result.sort((a, b) =>
    a.empresa_nome_reduzido.localeCompare(b.empresa_nome_reduzido, 'pt-BR'),
  )
  return result
}

export function BalancoFinanceiroView() {
  const [resp, setResp]       = useState<BalancoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)

  // Tree inicia recolhida (vazia). Usuário expande conforme precisa.
  const [aberto, setAberto] = useState<Set<string>>(new Set())

  // ── Impressão ─────────────────────────────────────────────────────
  const [printMode, setPrintMode]         = useState<'resumido' | 'detalhado' | null>(null)
  const [showPrintMenu, setShowPrintMenu] = useState(false)
  const printMenuRef = useRef<HTMLDivElement | null>(null)

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

  function imprimir(modo: 'resumido' | 'detalhado') {
    setShowPrintMenu(false)
    setPrintMode(modo)
  }

  // Aciona window.print() depois que o React pinta o modo escolhido,
  // e limpa o estado quando o diálogo de impressão fechar.
  useEffect(() => {
    if (!printMode) return
    const restore = () => setPrintMode(null)
    window.addEventListener('afterprint', restore, { once: true })
    const id = window.requestAnimationFrame(() => window.print())
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('afterprint', restore)
    }
  }, [printMode])

  // Fecha o dropdown de impressão ao clicar fora
  useEffect(() => {
    if (!showPrintMenu) return
    const fn = (e: MouseEvent) => {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node)) {
        setShowPrintMenu(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showPrintMenu])

  const receberPorEmpresa = useMemo(() => agruparReceberPorEmpresaEConta(resp?.receber ?? []), [resp])
  const pagarPorEmpresa   = useMemo(() => agruparPorEmpresaEConta(resp?.pagar ?? []), [resp])

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
      {/* Tudo abaixo é só de tela; o relatório de impressão é renderizado
          em uma seção separada no final do componente. */}
      <div className="space-y-4 print:hidden">
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
          subtitulo={`${resp.pagar.length} título${resp.pagar.length === 1 ? '' : 's'}`}
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
          A Receber: vencimentos a partir de {fmtData(new Date().toISOString().slice(0, 10))}
          <span className="opacity-60"> • {resp.empresas} {resp.empresas === 1 ? 'empresa' : 'empresas'}</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar
          </button>
          <div ref={printMenuRef} className="relative">
            <button
              onClick={() => setShowPrintMenu(v => !v)}
              disabled={loading || !resp}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
              <ChevronDown className={cn('w-3 h-3 opacity-60 transition-transform', showPrintMenu && 'rotate-180')} />
            </button>
            {showPrintMenu && (
              <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden">
                <button
                  onClick={() => imprimir('resumido')}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors"
                >
                  <ReportIcon className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[12.5px] font-semibold text-gray-800">Resumido</p>
                    <p className="text-[11px] text-gray-500">Totais por motivo / empresa</p>
                  </div>
                </button>
                <button
                  onClick={() => imprimir('detalhado')}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <Database className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[12.5px] font-semibold text-gray-800">Detalhado</p>
                    <p className="text-[11px] text-gray-500">Inclui lista de títulos</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* A RECEBER — Empresa → Conta → Lançamentos */}
      <SecaoTreeReceber
        aberto={aberto}
        onToggle={toggle}
        total={resp.totalReceber}
        empresas={receberPorEmpresa}
      />

      {/* A PAGAR — Empresa → Conta → Lançamentos */}
      <SecaoTreePagar
        aberto={aberto}
        onToggle={toggle}
        total={resp.totalPagar}
        empresas={pagarPorEmpresa}
      />
      </div>

      {/* ── Relatório de Impressão (A4 retrato) ──────────────────────── */}
      {printMode && (
        <BalancoPrint
          modo={printMode}
          resp={resp}
          receberPorEmpresa={receberPorEmpresa}
          pagarPorEmpresa={pagarPorEmpresa}
        />
      )}
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

// ─── A Receber (empresa → conta → lançamentos) ──────────────────────────

function SecaoTreeReceber({ aberto, onToggle, total, empresas }: {
  aberto:   Set<string>
  onToggle: (key: string) => void
  total:    number
  empresas: EmpresaReceber[]
}) {
  const tipo = 'receber'
  const isOpen = aberto.has(tipo)
  const totalTitulos = empresas.reduce((s, e) => s + e.qtdTitulos, 0)

  return (
    <div className="rounded-xl bg-white border border-emerald-200 overflow-hidden">
      <button
        onClick={() => onToggle(tipo)}
        className="w-full flex items-center gap-3 px-5 py-4 transition-colors text-left bg-emerald-50 hover:bg-emerald-100/40"
      >
        <div className="w-8 h-8 flex items-center justify-center text-gray-500">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-bold uppercase tracking-tight text-emerald-700">Contas a Receber</h3>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            {totalTitulos} título{totalTitulos === 1 ? '' : 's'} • {empresas.length} {empresas.length === 1 ? 'empresa' : 'empresas'}
          </p>
        </div>
        <p className="text-[18px] font-bold tabular-nums text-emerald-700">
          {fmtBRL(total)}
        </p>
      </button>

      {isOpen && (
        <div>
          {empresas.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-gray-500">
              Nenhum título em aberto a partir de hoje.
            </p>
          ) : (
            empresas.map(emp => (
              <EmpresaReceberRow
                key={emp.empresa_id}
                empresa={emp}
                aberto={aberto}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function EmpresaReceberRow({ empresa, aberto, onToggle }: {
  empresa: EmpresaReceber
  aberto: Set<string>
  onToggle: (key: string) => void
}) {
  const key = `receber:e:${empresa.empresa_id}`
  const isOpen = aberto.has(key)

  return (
    <>
      <button
        onClick={() => onToggle(key)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left border-t border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="w-6 h-6 flex items-center justify-center text-gray-400 ml-7">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span
          className="flex-1 text-[12.5px] font-bold tracking-tight text-gray-800 truncate"
          title={empresa.empresa_nome}
        >
          {empresa.empresa_nome_reduzido}
        </span>
        <span className="text-[11px] text-gray-400">
          {empresa.contas.length} {empresa.contas.length === 1 ? 'conta' : 'contas'} • {empresa.qtdTitulos} {empresa.qtdTitulos === 1 ? 'título' : 'títulos'}
        </span>
        <span className="text-[13.5px] font-bold tabular-nums w-32 text-right text-emerald-700">
          {fmtBRL(empresa.total)}
        </span>
      </button>

      {isOpen && empresa.contas.map(conta => (
        <ContaReceberRow
          key={`${empresa.empresa_id}-${conta.conta_codigo}`}
          empresaId={empresa.empresa_id}
          conta={conta}
          aberto={aberto}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

function ContaReceberRow({ empresaId, conta, aberto, onToggle }: {
  empresaId: number
  conta: ContaReceberLeaf
  aberto: Set<string>
  onToggle: (key: string) => void
}) {
  const key = `receber:e:${empresaId}:c:${conta.conta_codigo}`
  const isOpen = aberto.has(key)

  return (
    <>
      <button
        onClick={() => onToggle(key)}
        className="w-full flex items-center gap-3 px-5 py-2 text-left border-t border-gray-100/70 bg-gray-50/30 hover:bg-gray-50 transition-colors"
      >
        <div className="w-6 h-6 flex items-center justify-center text-gray-400 ml-[60px]">
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <span className="font-mono text-[10.5px] text-gray-400 flex-shrink-0">{conta.conta_codigo}</span>
        <span className="flex-1 text-[12px] font-medium text-gray-700 truncate">
          {conta.conta_nome || conta.conta_codigo}
        </span>
        <span className="text-[10.5px] text-gray-400">
          {conta.titulos.length} {conta.titulos.length === 1 ? 'lanç.' : 'lançs.'}
        </span>
        <span className="text-[12.5px] font-semibold tabular-nums w-32 text-right text-emerald-700">
          {fmtBRL(conta.total)}
        </span>
      </button>

      {isOpen && (
        <div className="bg-white">
          {conta.titulos.map((t, idx) => (
            <TituloReceberRow key={`${conta.conta_codigo}-${idx}`} titulo={t} />
          ))}
        </div>
      )}
    </>
  )
}

function TituloReceberRow({ titulo }: { titulo: ReceberTituloResp }) {
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
        <span className="truncate">{titulo.pessoa || <span className="italic text-gray-400">sem cliente</span>}</span>
      </span>
      <span className="text-[12.5px] font-semibold tabular-nums w-32 text-right flex-shrink-0 text-emerald-700">
        {fmtBRL(titulo.valor)}
      </span>
    </div>
  )
}

// ─── A Pagar (empresa → conta → lançamentos) ────────────────────────────

function SecaoTreePagar({ aberto, onToggle, total, empresas }: {
  aberto:   Set<string>
  onToggle: (key: string) => void
  total:    number
  empresas: EmpresaPagar[]
}) {
  const tipo = 'pagar'
  const isOpen = aberto.has(tipo)
  const totalTitulos = empresas.reduce((s, e) => s + e.contas.reduce((q, c) => q + c.titulos.length, 0), 0)

  return (
    <div className="rounded-xl bg-white border border-rose-200 overflow-hidden">
      <button
        onClick={() => onToggle(tipo)}
        className="w-full flex items-center gap-3 px-5 py-4 transition-colors text-left bg-rose-50 hover:bg-rose-100/40"
      >
        <div className="w-8 h-8 flex items-center justify-center text-gray-500">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-bold uppercase tracking-tight text-rose-700">Contas a Pagar</h3>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            {totalTitulos} título{totalTitulos === 1 ? '' : 's'} • {empresas.length} {empresas.length === 1 ? 'empresa' : 'empresas'}
          </p>
        </div>
        <p className="text-[18px] font-bold tabular-nums text-rose-700">
          {fmtBRL(total)}
        </p>
      </button>

      {isOpen && (
        <div>
          {empresas.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-gray-500">
              Nenhum título a pagar encontrado.
            </p>
          ) : (
            empresas.map(emp => (
              <EmpresaPagarRow
                key={emp.empresa_id}
                empresa={emp}
                aberto={aberto}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function EmpresaPagarRow({ empresa, aberto, onToggle }: {
  empresa: EmpresaPagar
  aberto: Set<string>
  onToggle: (key: string) => void
}) {
  const key = `pagar:e:${empresa.empresa_id}`
  const isOpen = aberto.has(key)

  return (
    <>
      <button
        onClick={() => onToggle(key)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left border-t border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="w-6 h-6 flex items-center justify-center text-gray-400 ml-7">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span
          className="flex-1 text-[12.5px] font-bold tracking-tight text-gray-800 truncate"
          title={empresa.empresa_nome}
        >
          {empresa.empresa_nome_reduzido}
        </span>
        <span className="text-[11px] text-gray-400">
          {empresa.contas.length} {empresa.contas.length === 1 ? 'conta' : 'contas'}
          {' · '}
          {empresa.qtdAbertos > 0 && (
            <span className="text-rose-600 font-medium">{empresa.qtdAbertos} aberto{empresa.qtdAbertos === 1 ? '' : 's'}</span>
          )}
          {empresa.qtdAbertos > 0 && empresa.qtdBaixados > 0 && ' / '}
          {empresa.qtdBaixados > 0 && (
            <span className="text-emerald-600 font-medium">{empresa.qtdBaixados} pago{empresa.qtdBaixados === 1 ? '' : 's'}</span>
          )}
        </span>
        <span className="text-[13.5px] font-bold tabular-nums w-32 text-right text-rose-700">
          {fmtBRL(empresa.total)}
        </span>
      </button>

      {isOpen && empresa.contas.map(conta => (
        <ContaPagarRow
          key={`${empresa.empresa_id}-${conta.conta_codigo}`}
          empresaId={empresa.empresa_id}
          conta={conta}
          aberto={aberto}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

function ContaPagarRow({ empresaId, conta, aberto, onToggle }: {
  empresaId: number
  conta: ContaPagar
  aberto: Set<string>
  onToggle: (key: string) => void
}) {
  const key = `pagar:e:${empresaId}:c:${conta.conta_codigo}`
  const isOpen = aberto.has(key)

  return (
    <>
      <button
        onClick={() => onToggle(key)}
        className="w-full flex items-center gap-3 px-5 py-2 text-left border-t border-gray-100/70 bg-gray-50/30 hover:bg-gray-50 transition-colors"
      >
        <div className="w-6 h-6 flex items-center justify-center text-gray-400 ml-[60px]">
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <span className="font-mono text-[10.5px] text-gray-400 flex-shrink-0">{conta.conta_codigo}</span>
        <span className="flex-1 text-[12px] font-medium text-gray-700 truncate">{conta.conta_nome}</span>
        <span className="text-[10.5px] text-gray-400">
          {conta.titulos.length} {conta.titulos.length === 1 ? 'lanç.' : 'lançs.'}
        </span>
        <span className="text-[12.5px] font-semibold tabular-nums w-32 text-right text-rose-700">
          {fmtBRL(conta.total)}
        </span>
      </button>

      {isOpen && (
        <div className="bg-white">
          {conta.titulos.map((t, idx) => (
            <TituloPagarRow key={`${conta.conta_codigo}-${idx}`} titulo={t} />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Relatório para impressão (A4 retrato) ──────────────────────────────
//
// Estrutura:
//   • Cabeçalho com título + posição (data/hora geração)
//   • 3 KPIs em cartões
//   • Bloco "A Receber" — resumo por motivo (tabela)
//       + (modo detalhado) lista de títulos por motivo+mês
//   • Bloco "A Pagar" — resumo por empresa (tabela)
//       + (modo detalhado) lista de títulos por empresa+conta
//   • Rodapé compacto com totais
//
// Renderiza só em @media print via classe `hidden print:block`. Os utilitários
// globais `print:*` em globals.css garantem A4 retrato + reset de overflow.

function BalancoPrint({ modo, resp, receberPorEmpresa, pagarPorEmpresa }: {
  modo:               'resumido' | 'detalhado'
  resp:               BalancoResponse
  receberPorEmpresa:  EmpresaReceber[]
  pagarPorEmpresa:    EmpresaPagar[]
}) {
  const geradoEm = resp.geradoEm
    ? new Date(resp.geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  const totalReceberQtd = receberPorEmpresa.reduce((s, e) => s + e.qtdTitulos, 0)
  const totalPagarQtd   = pagarPorEmpresa.reduce(
    (s, e) => s + e.contas.reduce((q, c) => q + c.titulos.length, 0), 0,
  )

  return (
    <div className="hidden print:block text-[9pt] text-gray-900">
      {/* ── Cabeçalho ── */}
      <div className="border-b-2 border-gray-800 pb-2 mb-3">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[16pt] font-bold leading-none tracking-tight">Balanço Financeiro</h1>
            <p className="text-[8.5pt] text-gray-700 mt-1">
              Posição em {fmtData(new Date().toISOString().slice(0, 10))} · {resp.empresas} empresa{resp.empresas !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[7.5pt] uppercase tracking-wider text-gray-500">Visão</p>
            <p className="text-[9pt] font-semibold">{modo === 'resumido' ? 'Resumido' : 'Detalhado'}</p>
            <p className="text-[7pt] text-gray-500 mt-1">Gerado {geradoEm}</p>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiPrint
          titulo="A Receber"
          valor={resp.totalReceber}
          sub={`${resp.receber.length} título${resp.receber.length === 1 ? '' : 's'} em aberto`}
          accent="emerald"
        />
        <KpiPrint
          titulo="A Pagar"
          valor={resp.totalPagar}
          sub={`${resp.pagar.length} título${resp.pagar.length === 1 ? '' : 's'} em aberto`}
          accent="rose"
        />
        <KpiPrint
          titulo="Saldo Projetado"
          valor={resp.saldoProjetado}
          sub={resp.saldoProjetado >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
          accent={resp.saldoProjetado >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      {/* ── A Receber ── */}
      <SectionTitle
        titulo="Contas a Receber"
        total={resp.totalReceber}
        sub={`${totalReceberQtd} título${totalReceberQtd !== 1 ? 's' : ''} · ${receberPorEmpresa.length} empresa${receberPorEmpresa.length !== 1 ? 's' : ''}`}
        accent="emerald"
      />

      {/* Tabela resumida por empresa */}
      <table className="w-full mb-3 border-collapse">
        <thead>
          <tr className="bg-emerald-50 text-[7.5pt] uppercase tracking-wide text-gray-700">
            <th className="text-left  px-2 py-1 border-b border-emerald-200 w-[50%]">Empresa</th>
            <th className="text-right px-2 py-1 border-b border-emerald-200 w-[12%]">Contas</th>
            <th className="text-right px-2 py-1 border-b border-emerald-200 w-[12%]">Títulos</th>
            <th className="text-right px-2 py-1 border-b border-emerald-200 w-[26%]">Total</th>
          </tr>
        </thead>
        <tbody>
          {receberPorEmpresa.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-2 py-2 text-center italic text-gray-500">
                Nenhum título em aberto a partir de hoje.
              </td>
            </tr>
          ) : receberPorEmpresa.map(e => (
            <tr key={e.empresa_id} className="border-b border-gray-200">
              <td className="px-2 py-0.5 font-semibold truncate" title={e.empresa_nome}>{e.empresa_nome_reduzido}</td>
              <td className="px-2 py-0.5 text-right text-gray-600 tabular-nums">{e.contas.length}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">{e.qtdTitulos}</td>
              <td className="px-2 py-0.5 text-right tabular-nums font-semibold text-emerald-800">{fmtBRL(e.total)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50 border-t-2 border-emerald-400">
            <td className="px-2 py-1 font-bold uppercase">Total</td>
            <td className="px-2 py-1" />
            <td className="px-2 py-1 text-right tabular-nums font-bold">{totalReceberQtd}</td>
            <td className="px-2 py-1 text-right tabular-nums font-bold text-emerald-800">{fmtBRL(resp.totalReceber)}</td>
          </tr>
        </tbody>
      </table>

      {/* Detalhamento — empresa → conta → lista de títulos */}
      {modo === 'detalhado' && receberPorEmpresa.map(emp => (
        <div key={emp.empresa_id} className="mb-3 print-empresa-block">
          <div className="bg-emerald-100/70 border-l-4 border-emerald-500 px-2 py-1 mb-1 flex items-baseline gap-2">
            <span className="text-[9pt] font-bold text-emerald-900 flex-1 truncate" title={emp.empresa_nome}>
              {emp.empresa_nome_reduzido}
            </span>
            <span className="text-[7.5pt] text-gray-600">
              {emp.qtdTitulos} tít. · {emp.contas.length} contas
            </span>
            <span className="text-[9pt] font-bold tabular-nums text-emerald-900">{fmtBRL(emp.total)}</span>
          </div>
          {emp.contas.map(conta => (
            <div key={conta.conta_codigo} className="mb-1">
              <div className="bg-gray-50 px-2 py-0.5 text-[7.5pt] font-semibold text-gray-700 flex items-baseline gap-2">
                <span className="font-mono text-gray-500">{conta.conta_codigo}</span>
                <span className="flex-1 truncate">{conta.conta_nome || conta.conta_codigo}</span>
                <span className="text-gray-500">{conta.titulos.length} tít.</span>
                <span className="tabular-nums">{fmtBRL(conta.total)}</span>
              </div>
              <table className="w-full text-[7.5pt] border-collapse">
                <thead>
                  <tr className="text-[7pt] text-gray-500 uppercase tracking-wide">
                    <th className="text-left  px-2 py-0.5 w-[14%]">Vencto</th>
                    <th className="text-left  px-2 py-0.5 w-[12%]">Doc.</th>
                    <th className="text-left  px-2 py-0.5">Cliente</th>
                    <th className="text-right px-2 py-0.5 w-[16%]">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {conta.titulos.map((t, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-2 py-0.5 font-mono whitespace-nowrap">{fmtData(t.vencto)}</td>
                      <td className="px-2 py-0.5 font-mono">{t.documento || '—'}</td>
                      <td className="px-2 py-0.5">{t.pessoa || '—'}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums font-semibold">{fmtBRL(t.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}

      {/* ── A Pagar ── */}
      <SectionTitle
        titulo="Contas a Pagar"
        total={resp.totalPagar}
        sub={`${totalPagarQtd} título${totalPagarQtd !== 1 ? 's' : ''} · ${pagarPorEmpresa.length} empresa${pagarPorEmpresa.length !== 1 ? 's' : ''}`}
        accent="rose"
      />

      {/* Tabela resumida por empresa */}
      <table className="w-full mb-3 border-collapse">
        <thead>
          <tr className="bg-rose-50 text-[7.5pt] uppercase tracking-wide text-gray-700">
            <th className="text-left  px-2 py-1 border-b border-rose-200 w-[50%]">Empresa</th>
            <th className="text-right px-2 py-1 border-b border-rose-200 w-[12%]">Contas</th>
            <th className="text-right px-2 py-1 border-b border-rose-200 w-[12%]">Títulos</th>
            <th className="text-right px-2 py-1 border-b border-rose-200 w-[26%]">Total</th>
          </tr>
        </thead>
        <tbody>
          {pagarPorEmpresa.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-2 py-2 text-center italic text-gray-500">
                Nenhum título a pagar.
              </td>
            </tr>
          ) : pagarPorEmpresa.map(e => {
            const qt = e.contas.reduce((s, c) => s + c.titulos.length, 0)
            return (
              <tr key={e.empresa_id} className="border-b border-gray-200">
                <td className="px-2 py-0.5 font-semibold truncate" title={e.empresa_nome}>{e.empresa_nome_reduzido}</td>
                <td className="px-2 py-0.5 text-right text-gray-600 tabular-nums">{e.contas.length}</td>
                <td className="px-2 py-0.5 text-right tabular-nums">{qt}</td>
                <td className="px-2 py-0.5 text-right tabular-nums font-semibold text-rose-800">{fmtBRL(e.total)}</td>
              </tr>
            )
          })}
          <tr className="bg-rose-50 border-t-2 border-rose-400">
            <td className="px-2 py-1 font-bold uppercase">Total</td>
            <td className="px-2 py-1" />
            <td className="px-2 py-1 text-right tabular-nums font-bold">{totalPagarQtd}</td>
            <td className="px-2 py-1 text-right tabular-nums font-bold text-rose-800">{fmtBRL(resp.totalPagar)}</td>
          </tr>
        </tbody>
      </table>

      {/* Detalhamento — empresa → conta → títulos */}
      {modo === 'detalhado' && pagarPorEmpresa.map(emp => (
        <div key={emp.empresa_id} className="mb-3 print-empresa-block">
          <div className="bg-rose-100/70 border-l-4 border-rose-500 px-2 py-1 mb-1 flex items-baseline gap-2">
            <span className="text-[9pt] font-bold text-rose-900 flex-1 truncate" title={emp.empresa_nome}>
              {emp.empresa_nome_reduzido}
            </span>
            <span className="text-[7.5pt] text-gray-600">
              {emp.contas.reduce((s, c) => s + c.titulos.length, 0)} tít. · {emp.contas.length} contas
            </span>
            <span className="text-[9pt] font-bold tabular-nums text-rose-900">{fmtBRL(emp.total)}</span>
          </div>
          {emp.contas.map(conta => (
            <div key={conta.conta_codigo} className="mb-1">
              <div className="bg-gray-50 px-2 py-0.5 text-[7.5pt] font-semibold text-gray-700 flex items-baseline gap-2">
                <span className="font-mono text-gray-500">{conta.conta_codigo}</span>
                <span className="flex-1 truncate">{conta.conta_nome}</span>
                <span className="text-gray-500">{conta.titulos.length} tít.</span>
                <span className="tabular-nums">{fmtBRL(conta.total)}</span>
              </div>
              <table className="w-full text-[7.5pt] border-collapse">
                <thead>
                  <tr className="text-[7pt] text-gray-500 uppercase tracking-wide">
                    <th className="text-left  px-2 py-0.5 w-[14%]">Vencto</th>
                    <th className="text-left  px-2 py-0.5 w-[12%]">Doc.</th>
                    <th className="text-left  px-2 py-0.5">Fornecedor</th>
                    <th className="text-right px-2 py-0.5 w-[16%]">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {conta.titulos.map((t, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-2 py-0.5 font-mono whitespace-nowrap">{fmtData(t.vencimento)}</td>
                      <td className="px-2 py-0.5 font-mono">{t.documento || '—'}</td>
                      <td className="px-2 py-0.5">{t.pessoa || '—'}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums font-semibold">{fmtBRL(t.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}

      {/* Rodapé com saldo projetado */}
      <div className="mt-4 pt-2 border-t-2 border-gray-800">
        <div className="grid grid-cols-3 gap-3 text-[9pt]">
          <div>
            <p className="text-[7.5pt] uppercase tracking-wider text-gray-500">A Receber</p>
            <p className="font-bold text-emerald-700 tabular-nums">{fmtBRL(resp.totalReceber)}</p>
          </div>
          <div>
            <p className="text-[7.5pt] uppercase tracking-wider text-gray-500">A Pagar</p>
            <p className="font-bold text-rose-700 tabular-nums">{fmtBRL(resp.totalPagar)}</p>
          </div>
          <div>
            <p className="text-[7.5pt] uppercase tracking-wider text-gray-500">Saldo Projetado</p>
            <p className={cn(
              'font-bold tabular-nums',
              resp.saldoProjetado >= 0 ? 'text-emerald-700' : 'text-rose-700',
            )}>
              {fmtBRL(resp.saldoProjetado)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiPrint({ titulo, valor, sub, accent }: {
  titulo: string
  valor:  number
  sub:    string
  accent: 'emerald' | 'rose'
}) {
  const cores = accent === 'emerald'
    ? { bg: 'bg-emerald-50', borda: 'border-emerald-300', valor: 'text-emerald-700' }
    : { bg: 'bg-rose-50',    borda: 'border-rose-300',    valor: 'text-rose-700' }
  return (
    <div className={cn('rounded border p-2', cores.bg, cores.borda)}>
      <p className="text-[7pt] uppercase tracking-wider text-gray-600 font-semibold">{titulo}</p>
      <p className={cn('text-[12pt] font-bold tabular-nums leading-tight mt-0.5', cores.valor)}>{fmtBRL(valor)}</p>
      <p className="text-[7pt] text-gray-500 mt-0.5">{sub}</p>
    </div>
  )
}

function SectionTitle({ titulo, total, sub, accent }: {
  titulo: string
  total:  number
  sub:    string
  accent: 'emerald' | 'rose'
}) {
  const cor = accent === 'emerald' ? 'text-emerald-800' : 'text-rose-800'
  return (
    <div className="flex items-baseline gap-3 border-b border-gray-700 pb-1 mb-2 mt-3">
      <h2 className={cn('text-[11pt] font-bold uppercase tracking-tight', cor)}>{titulo}</h2>
      <span className="text-[7.5pt] text-gray-500 flex-1">{sub}</span>
      <span className={cn('text-[11pt] font-bold tabular-nums', cor)}>{fmtBRL(total)}</span>
    </div>
  )
}

function TituloPagarRow({ titulo }: { titulo: PagarTituloResp }) {
  const aberto = titulo.situacao_baixa === 0
  return (
    <div className="flex items-center gap-3 pl-[120px] pr-5 py-1.5 border-t border-gray-100/80 hover:bg-gray-50 transition-colors">
      <span className="text-[11.5px] font-mono text-gray-500 w-20 flex-shrink-0" title="Vencimento">
        {fmtData(titulo.vencimento)}
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
      <span className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0',
        aberto
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200',
      )}>
        {aberto ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
        {aberto ? 'Aberto' : 'Pago'}
      </span>
      <span className="text-[12.5px] font-semibold tabular-nums w-32 text-right flex-shrink-0 text-rose-700">
        {fmtBRL(titulo.valor)}
      </span>
    </div>
  )
}
