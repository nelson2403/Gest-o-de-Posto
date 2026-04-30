'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Banknote, Settings, Loader2, AlertCircle, RefreshCw, X, Search, Check, Minus,
  ChevronRight, ChevronDown, Building2, ArrowUp, ArrowDown, ArrowUpDown,
  Calendar, FileText,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import type { ControleDinheiroResponse } from '@/app/api/controle-dinheiro/saldos/route'
import type { DrillResponse } from '@/app/api/controle-dinheiro/drill/route'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const fmtDataLonga = (iso: string) => {
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const d = new Date(`${iso}T00:00:00`)
  return `${dias[d.getDay()]}, ${fmtData(iso)}`
}

interface PlanoContaRow {
  hierarquia: string
  nome:       string
  grid:       string
  natureza:   'Débito' | 'Crédito'
}

interface ContaSelecionada {
  conta_grid:   string
  conta_codigo: string
  conta_nome:   string | null
}

// Default: do primeiro dia do mês corrente até hoje.
function defaultPeriodo(): { dataIni: string; dataFim: string } {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fmt  = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { dataIni: fmt(ini), dataFim: fmt(hoje) }
}

export default function ControleDinheiroPage() {
  const [resp, setResp]               = useState<ControleDinheiroResponse | null>(null)
  const [loading, setLoading]         = useState(true)
  const [erro, setErro]               = useState<string | null>(null)
  const [showConfig, setShowConfig]   = useState(false)
  const [aberto, setAberto]           = useState<Set<number>>(new Set())

  // Período de análise (data_ini, data_fim)
  const [dataIni, setDataIni] = useState<string>(() => defaultPeriodo().dataIni)
  const [dataFim, setDataFim] = useState<string>(() => defaultPeriodo().dataFim)

  // Drill por conta (chave = `${empresa_id}:${conta_codigo}`)
  const [contasAbertas, setContasAbertas] = useState<Set<string>>(new Set())
  const [drillCache, setDrillCache]       = useState<Map<string, DrillResponse>>(new Map())
  const [drillLoading, setDrillLoading]   = useState<Set<string>>(new Set())
  const [drillError, setDrillError]       = useState<Map<string, string>>(new Map())
  // Dias ABERTOS (default = recolhidos). Chave = `${empresa_id}:${conta_codigo}:${data}`
  const [diasAbertos, setDiasAbertos]     = useState<Set<string>>(new Set())

  function toggleDia(diaKey: string) {
    setDiasAbertos(prev => {
      const n = new Set(prev)
      if (n.has(diaKey)) n.delete(diaKey)
      else               n.add(diaKey)
      return n
    })
  }

  async function toggleConta(empresaId: number, contaCodigo: string) {
    const key = `${empresaId}:${contaCodigo}`
    if (contasAbertas.has(key)) {
      setContasAbertas(prev => { const n = new Set(prev); n.delete(key); return n })
      return
    }
    if (!drillCache.has(key)) {
      setDrillLoading(prev => new Set(prev).add(key))
      setDrillError(prev => { const n = new Map(prev); n.delete(key); return n })
      try {
        const params = new URLSearchParams({ empresa_id: String(empresaId), conta_codigo: contaCodigo })
        if (dataIni) params.set('data_ini', dataIni)
        if (dataFim) params.set('data_fim', dataFim)
        const r = await fetch(`/api/controle-dinheiro/drill?${params.toString()}`)
        const j = await r.json()
        if (!r.ok || j.error) {
          setDrillError(prev => new Map(prev).set(key, j.error ?? `Erro HTTP ${r.status}`))
        } else {
          setDrillCache(prev => new Map(prev).set(key, j as DrillResponse))
        }
      } catch (e) {
        setDrillError(prev => new Map(prev).set(key, e instanceof Error ? e.message : String(e)))
      } finally {
        setDrillLoading(prev => { const n = new Set(prev); n.delete(key); return n })
      }
    }
    setContasAbertas(prev => new Set(prev).add(key))
  }

  // Ordenação da tabela de empresas
  type SortField = 'nome' | 'saldoFinal'
  type SortDir   = 'asc' | 'desc'
  const [sortField, setSortField] = useState<SortField>('saldoFinal')
  const [sortDir, setSortDir]     = useState<SortDir>('desc')

  function trocarSort(campo: SortField) {
    if (sortField === campo) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(campo)
      setSortDir(campo === 'nome' ? 'asc' : 'desc')
    }
  }

  const empresasOrdenadas = useMemo(() => {
    if (!resp) return []
    const arr = [...resp.empresas]
    arr.sort((a, b) => {
      const sign = sortDir === 'asc' ? 1 : -1
      if (sortField === 'nome') {
        return sign * a.empresa_nome.localeCompare(b.empresa_nome, 'pt-BR', { sensitivity: 'base' })
      }
      return sign * (a.saldoFinal - b.saldoFinal)
    })
    return arr
  }, [resp, sortField, sortDir])

  async function carregar() {
    setLoading(true)
    setErro(null)
    // Invalida drill cache (período mudou; cálculos diários ficam inválidos)
    setDrillCache(new Map())
    setDrillError(new Map())
    setContasAbertas(new Set())
    setDiasAbertos(new Set())
    try {
      const params = new URLSearchParams()
      if (dataIni) params.set('data_ini', dataIni)
      if (dataFim) params.set('data_fim', dataFim)
      const r = await fetch(`/api/controle-dinheiro/saldos?${params.toString()}`)
      const json = await r.json()
      if (!r.ok || json.error) setErro(json.error ?? `Erro HTTP ${r.status}`)
      else setResp(json as ControleDinheiroResponse)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleEmp(id: number) {
    setAberto(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <>
      <Header
        title="Controle de Dinheiro"
        description="Saldo das contas de caixa por empresa"
        actions={
          <>
            <button
              onClick={carregar}
              disabled={loading}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 text-gray-700 text-[12.5px] font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Atualizar
            </button>
            <button
              onClick={() => setShowConfig(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 text-white text-[12.5px] font-semibold hover:bg-black"
            >
              <Settings className="w-3.5 h-3.5" />
              Configurar contas
            </button>
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Filtro de período */}
        <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-white border border-gray-200">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Data inicial
            </label>
            <input
              type="date"
              value={dataIni}
              onChange={(e) => setDataIni(e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Data final
            </label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={carregar}
            disabled={loading}
            className="h-10 px-4 rounded-lg bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Aplicar
          </button>
          <button
            onClick={() => {
              const { dataIni: i, dataFim: f } = defaultPeriodo()
              setDataIni(i); setDataFim(f)
            }}
            disabled={loading}
            className="h-10 px-3 rounded-lg border border-gray-300 text-gray-600 text-[12.5px] hover:bg-gray-50 disabled:opacity-50"
          >
            Mês atual
          </button>
          <button
            onClick={() => { setDataIni(''); setDataFim('') }}
            disabled={loading}
            className="h-10 px-3 rounded-lg border border-gray-300 text-gray-600 text-[12.5px] hover:bg-gray-50 disabled:opacity-50"
          >
            Todo o período
          </button>
        </div>

        {erro && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Erro ao carregar saldos</p>
              <p className="text-[12px] opacity-80">{erro}</p>
            </div>
            <button onClick={carregar} className="text-[12px] font-medium underline">Tentar novamente</button>
          </div>
        )}

        {loading && !resp && (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {resp && !loading && resp.totalContas === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center bg-white rounded-xl border border-dashed border-gray-300">
            <Banknote className="w-10 h-10 text-gray-300" />
            <div>
              <p className="text-[15px] font-semibold text-gray-700">Nenhuma conta configurada</p>
              <p className="text-[12.5px] text-gray-500 mt-1 max-w-md">
                Antes de visualizar os saldos, selecione quais contas do plano de contas
                serão tratadas como contas de caixa.
              </p>
            </div>
            <button
              onClick={() => setShowConfig(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gray-900 text-white text-[13px] font-semibold hover:bg-black"
            >
              <Settings className="w-3.5 h-3.5" />
              Configurar contas
            </button>
          </div>
        )}

        {resp && !loading && resp.totalContas > 0 && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                titulo="Saldo Inicial"
                valor={resp.totalGeralSaldoInicial}
                icon={Banknote}
                accent={resp.totalGeralSaldoInicial >= 0 ? 'emerald' : 'rose'}
                desc="Antes do período selecionado"
              />
              <KpiCard
                titulo="Entradas"
                valor={resp.totalGeralDebitar}
                icon={Banknote}
                accent="emerald"
                desc="Débitos no período"
              />
              <KpiCard
                titulo="Saídas"
                valor={resp.totalGeralCreditar}
                icon={Banknote}
                accent="rose"
                desc="Créditos no período"
              />
              <KpiCard
                titulo="Saldo Final"
                valor={resp.totalGeralSaldoFinal}
                icon={Banknote}
                accent={resp.totalGeralSaldoFinal >= 0 ? 'emerald' : 'rose'}
                desc={`${resp.empresas.length} empresa(s) • ${resp.totalContas} conta(s)`}
              />
            </div>

            {/* Tree empresas → contas */}
            <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px]">
                        <button
                          onClick={() => trocarSort('nome')}
                          className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                        >
                          Empresa / Conta
                          <SortIcon active={sortField === 'nome'} dir={sortDir} />
                        </button>
                      </th>
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[130px]">Saldo Inicial</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[130px]">Entradas</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[130px]">Saídas</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[130px]">Saldo Líquido</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[150px] bg-gray-100">
                        <button
                          onClick={() => trocarSort('saldoFinal')}
                          className="flex items-center gap-1 ml-auto hover:text-gray-900 transition-colors"
                        >
                          Saldo Final
                          <SortIcon active={sortField === 'saldoFinal'} dir={sortDir} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresasOrdenadas.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-[13px] text-gray-500">
                          Nenhuma movimentação encontrada para as contas configuradas.
                        </td>
                      </tr>
                    ) : (
                      empresasOrdenadas.map(emp => {
                        const isOpen = aberto.has(emp.empresa_id)
                        return (
                          <>
                            <tr
                              key={`emp-${emp.empresa_id}`}
                              className="border-b border-gray-100 bg-gray-50/40 hover:bg-gray-100/60 cursor-pointer transition-colors"
                              onClick={() => toggleEmp(emp.empresa_id)}
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 flex items-center justify-center text-gray-400">
                                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </span>
                                  <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  <span className="font-semibold text-gray-800 uppercase tracking-tight">{emp.empresa_nome}</span>
                                  <span className="text-[10.5px] text-gray-400 ml-1">
                                    ({emp.contas.length} {emp.contas.length === 1 ? 'conta' : 'contas'})
                                  </span>
                                </div>
                              </td>
                              <td className={cn(
                                'px-3 py-2.5 text-right tabular-nums font-medium',
                                emp.saldoInicial < 0 ? 'text-rose-700' : 'text-gray-700',
                              )}>
                                {fmtBRL(emp.saldoInicial)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                                {fmtBRL(emp.totalDebitar)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-rose-700">
                                {fmtBRL(emp.totalCreditar)}
                              </td>
                              <td className={cn(
                                'px-3 py-2.5 text-right tabular-nums font-medium',
                                emp.saldoLiquido < 0 ? 'text-rose-700' : 'text-emerald-700',
                              )}>
                                {fmtBRL(emp.saldoLiquido)}
                              </td>
                              <td className={cn(
                                'px-4 py-2.5 text-right tabular-nums font-bold bg-gray-50',
                                emp.saldoFinal < 0 ? 'text-rose-700' : 'text-emerald-700',
                              )}>
                                {fmtBRL(emp.saldoFinal)}
                              </td>
                            </tr>
                            {isOpen && emp.contas.map(c => {
                              const drillKey = `${emp.empresa_id}:${c.conta_codigo}`
                              const isContaOpen = contasAbertas.has(drillKey)
                              const isDrillLoading = drillLoading.has(drillKey)
                              const drill = drillCache.get(drillKey)
                              const dErr = drillError.get(drillKey)
                              return (
                                <Fragment key={`emp-${emp.empresa_id}-${c.conta_grid}`}>
                                  <tr
                                    className="border-b border-gray-100 hover:bg-gray-50/40 cursor-pointer transition-colors"
                                    onClick={() => toggleConta(emp.empresa_id, c.conta_codigo)}
                                  >
                                    <td className="px-4 py-1.5 pl-14">
                                      <div className="flex items-center gap-2.5">
                                        <span className="w-4 h-4 flex items-center justify-center text-gray-400 flex-shrink-0">
                                          {isDrillLoading
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : isContaOpen
                                              ? <ChevronDown className="w-3 h-3" />
                                              : <ChevronRight className="w-3 h-3" />}
                                        </span>
                                        <span className="font-mono text-[11px] text-gray-400 w-24 flex-shrink-0">{c.conta_codigo}</span>
                                        <span className="text-[12.5px] text-gray-700 truncate">{c.conta_nome}</span>
                                      </div>
                                    </td>
                                    <td className={cn(
                                      'px-3 py-1.5 text-right tabular-nums',
                                      c.saldoInicial < 0 ? 'text-rose-600' : 'text-gray-700',
                                    )}>
                                      {fmtBRL(c.saldoInicial)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{fmtBRL(c.totalDebitar)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-rose-700">{fmtBRL(c.totalCreditar)}</td>
                                    <td className={cn(
                                      'px-3 py-1.5 text-right tabular-nums',
                                      c.saldoLiquido < 0 ? 'text-rose-600' : 'text-gray-700',
                                    )}>
                                      {fmtBRL(c.saldoLiquido)}
                                    </td>
                                    <td className={cn(
                                      'px-4 py-1.5 text-right tabular-nums font-medium bg-gray-50',
                                      c.saldoFinal < 0 ? 'text-rose-600' : 'text-gray-900',
                                    )}>
                                      {fmtBRL(c.saldoFinal)}
                                    </td>
                                  </tr>

                                  {/* Erro do drill */}
                                  {isContaOpen && dErr && (
                                    <tr className="border-b border-gray-100 bg-red-50/60">
                                      <td colSpan={6} className="px-4 py-2 pl-20 text-[12px] text-red-700">
                                        <span className="font-medium">Erro:</span> {dErr}
                                      </td>
                                    </tr>
                                  )}

                                  {/* Drill expandido: dias e lançamentos */}
                                  {isContaOpen && !dErr && drill && drill.dias.length === 0 && (
                                    <tr className="border-b border-gray-100 bg-gray-50/40">
                                      <td colSpan={6} className="px-4 py-3 pl-20 text-center text-[11.5px] text-gray-500 italic">
                                        Nenhum lançamento no período para esta conta.
                                      </td>
                                    </tr>
                                  )}
                                  {isContaOpen && !dErr && drill && drill.dias.map(dia => {
                                    const diaKey      = `${drillKey}:${dia.data}`
                                    const isDiaOpen   = diasAbertos.has(diaKey)
                                    const saldoZerado = Math.abs(dia.saldoFinal) < 0.005
                                    return (
                                    <Fragment key={diaKey}>
                                      <tr
                                        className={cn(
                                          'border-b cursor-pointer',
                                          saldoZerado
                                            ? 'border-amber-300 bg-amber-100/80 hover:bg-amber-200/80'
                                            : 'border-gray-100 bg-blue-50/30 hover:bg-blue-50/60',
                                        )}
                                        onClick={() => toggleDia(diaKey)}
                                      >
                                        <td className="px-4 py-1.5 pl-24">
                                          <div className={cn(
                                            'flex items-center gap-2 text-[11.5px] font-medium',
                                            saldoZerado ? 'text-amber-900' : 'text-gray-700',
                                          )}>
                                            <span className={cn('w-3.5 h-3.5 flex items-center justify-center', saldoZerado ? 'text-amber-600' : 'text-gray-400')}>
                                              {isDiaOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            </span>
                                            <Calendar className={cn('w-3 h-3', saldoZerado ? 'text-amber-600' : 'text-gray-400')} />
                                            {fmtDataLonga(dia.data)}
                                            <span className={cn('text-[10px] ml-1', saldoZerado ? 'text-amber-700/80' : 'text-gray-400')}>({dia.lancamentos.length} lanç.)</span>
                                            {saldoZerado && (
                                              <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide bg-amber-500 text-white">
                                                <AlertCircle className="w-2.5 h-2.5" /> Saldo zerado
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className={cn('px-3 py-1.5 text-right tabular-nums text-[11.5px]', dia.saldoInicial < 0 ? 'text-rose-600' : 'text-gray-600')}>{fmtBRL(dia.saldoInicial)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-[11.5px] text-emerald-700">{fmtBRL(dia.entradas)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-[11.5px] text-rose-700">{fmtBRL(dia.saidas)}</td>
                                        <td />
                                        <td className={cn(
                                          'px-4 py-1.5 text-right tabular-nums text-[11.5px] font-semibold',
                                          saldoZerado
                                            ? 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
                                            : cn('bg-blue-50/30', dia.saldoFinal < 0 ? 'text-rose-700' : 'text-emerald-700'),
                                        )}>{fmtBRL(dia.saldoFinal)}</td>
                                      </tr>
                                      {isDiaOpen && dia.lancamentos.map((l, idx) => {
                                        // Linha 1 visível: motivo + histórico (preferencial)
                                        // Linha 2 (em cinza): documento + pessoa
                                        const principal = l.motivo || l.historico
                                          ? [l.motivo, l.historico].filter(Boolean).join(' · ')
                                          : ''
                                        const secundario = [l.documento, l.pessoa].filter(Boolean).join(' · ')
                                        return (
                                          <tr key={`${drillKey}-${dia.data}-${idx}`} className="border-b border-gray-100/70 hover:bg-gray-50/40">
                                            <td className="px-4 py-1 pl-32">
                                              <div className="flex items-center gap-2 text-[11px] text-gray-600">
                                                <FileText className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />
                                                <span className="truncate">
                                                  {principal || <span className="italic text-gray-400">(sem motivo)</span>}
                                                  {secundario && <span className="text-gray-400 ml-2">· {secundario}</span>}
                                                </span>
                                              </div>
                                            </td>
                                            <td />
                                            <td className="px-3 py-1 text-right tabular-nums text-[11px] text-emerald-700">
                                              {l.direcao === 'D' ? fmtBRL(l.valor) : ''}
                                            </td>
                                            <td className="px-3 py-1 text-right tabular-nums text-[11px] text-rose-700">
                                              {l.direcao === 'C' ? fmtBRL(l.valor) : ''}
                                            </td>
                                            <td />
                                            <td className="bg-gray-50/60" />
                                          </tr>
                                        )
                                      })}
                                    </Fragment>
                                    )
                                  })}
                                </Fragment>
                              )
                            })}
                          </>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showConfig && (
        <ConfiguracaoModal
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); carregar() }}
        />
      )}
    </>
  )
}

// ─── Modal de configuração ────────────────────────────────────

function ConfiguracaoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [contas, setContas]               = useState<PlanoContaRow[] | null>(null)
  const [loadingContas, setLoadingContas] = useState(true)
  const [erro, setErro]                   = useState<string | null>(null)
  const [selecionadas, setSelecionadas]   = useState<Set<string>>(new Set())
  const [original, setOriginal]           = useState<Set<string>>(new Set())
  const [saving, setSaving]               = useState(false)
  const [filtro, setFiltro]               = useState('')
  const [expanded, setExpanded]           = useState<Set<string>>(new Set())

  // Carrega plano de contas + config atual em paralelo
  useEffect(() => {
    let cancel = false
    Promise.all([
      fetch('/api/autosystem/plano-contas').then(r => r.json()),
      fetch('/api/controle-dinheiro/config').then(r => r.json()),
    ])
      .then(([pcJson, cfgJson]) => {
        if (cancel) return
        if (pcJson.error) { setErro(pcJson.error); return }
        const raw = (pcJson.contas ?? []) as Array<Omit<PlanoContaRow, 'grid'> & { grid: string | number }>
        const ps: PlanoContaRow[] = raw.map(c => ({ ...c, grid: String(c.grid) }))
        setContas(ps)
        // Expande raízes por default
        const raizes = ps.filter(c => c.hierarquia.split('.').filter(Boolean).length === 1).map(c => c.hierarquia)
        setExpanded(new Set(raizes))
        // Pré-marca as já configuradas
        const sels = new Set<string>(((cfgJson.contas ?? []) as ContaSelecionada[]).map(c => c.conta_grid))
        setSelecionadas(sels)
        setOriginal(new Set(sels))
      })
      .catch(e => { if (!cancel) setErro(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancel) setLoadingContas(false) })
    return () => { cancel = true }
  }, [])

  // Tree do plano de contas
  const tree = useMemo(() => contas ? buildTree(contas) : [], [contas])
  const filtroMatched = useMemo(() => {
    if (!filtro.trim() || !contas) return null
    const q = filtro.trim().toLowerCase()
    const out = new Set<string>()
    contas.forEach(c => {
      if (c.hierarquia.toLowerCase().includes(q) ||
          c.nome.toLowerCase().includes(q) ||
          c.grid.includes(q)) {
        const parts = c.hierarquia.split('.').filter(Boolean)
        for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('.'))
      }
    })
    return out
  }, [filtro, contas])

  function toggleConta(grid: string) {
    setSelecionadas(prev => {
      const n = new Set(prev)
      if (n.has(grid)) n.delete(grid); else n.add(grid)
      return n
    })
  }

  function toggleExpand(codigo: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
      return n
    })
  }

  const dirty = !setEqual(selecionadas, original)

  async function handleSalvar() {
    if (!contas) return
    setSaving(true)
    const sels: ContaSelecionada[] = []
    for (const c of contas) {
      if (selecionadas.has(c.grid)) {
        sels.push({ conta_grid: c.grid, conta_codigo: c.hierarquia, conta_nome: c.nome })
      }
    }
    try {
      const r = await fetch('/api/controle-dinheiro/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contas: sels }),
      })
      const j = await r.json()
      if (!r.ok || j.error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: j.error })
        setSaving(false)
        return
      }
      toast({ title: 'Configuração salva' })
      onSaved()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e instanceof Error ? e.message : String(e) })
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
            <Settings className="w-4 h-4 text-gray-700" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-gray-900">Contas de Caixa</h2>
            <p className="text-[11.5px] text-gray-500">
              Selecione as contas do plano de contas que serão acompanhadas no Controle de Dinheiro
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por código ou nome"
              className="w-full pl-9 pr-3 h-10 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingContas ? (
            <div className="flex justify-center py-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : erro ? (
            <div className="flex items-start gap-2 m-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[13px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Erro ao carregar plano de contas</p>
                <p className="text-[12px] opacity-80">{erro}</p>
              </div>
            </div>
          ) : !tree.length ? (
            <p className="text-center py-16 text-[13px] text-gray-500">Nenhuma conta encontrada</p>
          ) : (
            tree.map(node => (
              <ContaNodeRow
                key={node.conta.hierarquia}
                node={node}
                depth={0}
                expanded={expanded}
                forceExpand={filtroMatched}
                selecionadas={selecionadas}
                toggleExpand={toggleExpand}
                toggleConta={toggleConta}
                nodeMatches={(n) => filtroMatched ? filtroMatched.has(n.conta.hierarquia) : true}
              />
            ))
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50/50">
          <span className="flex-1 text-[12px] text-gray-500">
            {selecionadas.size} {selecionadas.size === 1 ? 'conta selecionada' : 'contas selecionadas'}
            {dirty && <span className="text-amber-600 ml-2">• alterações não salvas</span>}
          </span>
          <button
            onClick={onClose}
            className="px-3 h-9 border border-gray-300 text-gray-700 rounded-lg text-[12.5px] font-medium hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={!dirty || saving}
            className="px-3 h-9 bg-gray-900 text-white rounded-lg text-[12.5px] font-semibold hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tree helpers + node ──────────────────────────────────────

interface ContaNode {
  conta:    PlanoContaRow
  children: ContaNode[]
}

function buildTree(contas: PlanoContaRow[]): ContaNode[] {
  const sorted = [...contas].sort((a, b) =>
    a.hierarquia.localeCompare(b.hierarquia, 'pt-BR', { numeric: true })
  )
  const map = new Map<string, ContaNode>()
  sorted.forEach(c => map.set(c.hierarquia, { conta: c, children: [] }))
  const roots: ContaNode[] = []
  sorted.forEach(c => {
    const node = map.get(c.hierarquia)!
    const parts = c.hierarquia.split('.').filter(Boolean)
    if (parts.length <= 1) { roots.push(node); return }
    let parentCodigo: string | null = null
    for (let i = parts.length - 1; i >= 1; i--) {
      const cand = parts.slice(0, i).join('.')
      if (map.has(cand)) { parentCodigo = cand; break }
    }
    if (parentCodigo) map.get(parentCodigo)!.children.push(node)
    else              roots.push(node)
  })
  return roots
}

function setEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function ContaNodeRow({
  node, depth, expanded, forceExpand, selecionadas, toggleExpand, toggleConta, nodeMatches,
}: {
  node: ContaNode; depth: number
  expanded: Set<string>; forceExpand: Set<string> | null
  selecionadas: Set<string>
  toggleExpand: (codigo: string) => void
  toggleConta: (grid: string) => void
  nodeMatches: (n: ContaNode) => boolean
}) {
  if (!nodeMatches(node) && !node.children.some(c => recursiveMatches(c, nodeMatches))) return null

  const hasChildren = node.children.length > 0
  const isOpen = forceExpand ? forceExpand.has(node.conta.hierarquia) : expanded.has(node.conta.hierarquia)
  const grids = collectGrids(node)
  const checkedCount = grids.filter(g => selecionadas.has(g)).length
  const state: 'unchecked' | 'checked' | 'indeterminate' =
    checkedCount === 0 ? 'unchecked'
      : checkedCount === grids.length ? 'checked'
      : 'indeterminate'

  function onToggleSubtree() {
    const allChecked = state === 'checked'
    grids.forEach(g => {
      if (allChecked) selecionadas.delete(g)
      else selecionadas.add(g)
    })
    toggleConta(grids[0])  // dispara re-render
  }

  return (
    <>
      <div
        style={{ paddingLeft: 16 + depth * 22 }}
        className="flex items-center gap-2 h-9 pr-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
      >
        {hasChildren ? (
          <button
            onClick={() => toggleExpand(node.conta.hierarquia)}
            disabled={!!forceExpand}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 flex-shrink-0 disabled:opacity-50"
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : <span className="w-5 h-5 flex-shrink-0" />}

        <button
          onClick={hasChildren ? onToggleSubtree : () => toggleConta(node.conta.grid)}
          className={cn(
            'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
            state === 'unchecked'     && 'border-gray-300 hover:border-blue-500',
            state === 'checked'       && 'border-blue-600 bg-blue-600 text-white',
            state === 'indeterminate' && 'border-blue-500 bg-blue-500 text-white',
          )}
        >
          {state === 'checked'       && <Check className="w-3 h-3" />}
          {state === 'indeterminate' && <Minus className="w-3 h-3" />}
        </button>

        <span className="text-[11.5px] font-mono text-gray-400 w-20 truncate flex-shrink-0">{node.conta.hierarquia}</span>
        <span className="flex-1 text-[12.5px] text-gray-700 truncate">{node.conta.nome}</span>
        <span className={cn(
          'text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0',
          node.conta.natureza === 'Crédito'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-rose-100 text-rose-700',
        )}>
          {node.conta.natureza}
        </span>
      </div>
      {hasChildren && isOpen && node.children.map(child => (
        <ContaNodeRow
          key={child.conta.hierarquia}
          node={child} depth={depth + 1}
          expanded={expanded} forceExpand={forceExpand}
          selecionadas={selecionadas}
          toggleExpand={toggleExpand} toggleConta={toggleConta}
          nodeMatches={nodeMatches}
        />
      ))}
    </>
  )
}

function collectGrids(node: ContaNode): string[] {
  const out: string[] = [node.conta.grid]
  node.children.forEach(c => out.push(...collectGrids(c)))
  return out
}

function recursiveMatches(node: ContaNode, matches: (n: ContaNode) => boolean): boolean {
  if (matches(node)) return true
  return node.children.some(c => recursiveMatches(c, matches))
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-40" />
  return dir === 'asc'
    ? <ArrowUp className="w-3 h-3" />
    : <ArrowDown className="w-3 h-3" />
}

function KpiCard({ titulo, valor, icon: Icon, accent, desc }: {
  titulo: string
  valor: number
  icon:  React.ElementType
  accent: 'emerald' | 'rose'
  desc?: string
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{titulo}</p>
          <p className={cn(
            'text-[22px] font-bold tabular-nums mt-1 leading-none',
            accent === 'emerald' ? 'text-emerald-600' : 'text-rose-600',
          )}>
            {fmtBRL(valor)}
          </p>
          {desc && <p className="text-[11.5px] text-gray-400 mt-1.5">{desc}</p>}
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
