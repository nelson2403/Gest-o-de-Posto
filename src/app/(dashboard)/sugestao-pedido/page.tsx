'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import {
  ShoppingCart, Phone, User, RefreshCw, ChevronDown, ChevronUp,
  Truck, AlertTriangle, CheckCircle2, TrendingDown, Package,
  CalendarClock, Fuel, Store, Printer, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type Produto = {
  produto: string
  produto_codigo: string | null
  produto_nome: string
  unid_med: string
  estoque_atual: number
  vendas_15dias: number
  media_diaria: number
  estoque_15dias: number
  sugerido: number
  subgrupo: number | null
  subgrupo_nome: string | null
}

type Fornecedor = {
  fornecedor: { id: string; nome: string; telefone: string | null; contato: string | null; categoria: string }
  dias_visita: number[]
  prazo_entrega_dias: number
}

type SugestaoPosto = {
  empresa: string
  posto_nome: string
  posto_id: string
  fornecedores: Fornecedor[]
  produtos: Produto[]
}

function urgencia(p: Produto): 'critico' | 'baixo' | 'normal' {
  if (p.estoque_atual <= 0) return 'critico'
  const diasRestantes = p.media_diaria > 0 ? p.estoque_atual / p.media_diaria : 99
  if (diasRestantes < 3) return 'critico'
  if (diasRestantes < 7) return 'baixo'
  return 'normal'
}

function StockBar({ atual, necessario }: { atual: number; necessario: number }) {
  const total = Math.max(atual, necessario) || 1
  const pct   = Math.min(100, (atual / total) * 100)
  const cor   = pct < 20 ? 'bg-red-500' : pct < 50 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-1">
      <div className={cn('h-full rounded-full transition-all', cor)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function SugestaoPedidoPage() {
  const [tipo, setTipo]           = useState<'combustivel' | 'conveniencia'>('conveniencia')
  const [sugestoes, setSugestoes] = useState<SugestaoPosto[]>([])
  const [dataIni, setDataIni]     = useState('')
  const [dataFim, setDataFim]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())

  const carregar = useCallback(async (t: string) => {
    setLoading(true)
    const res  = await fetch(`/api/estoque/sugestao-pedido?tipo=${t}`)
    const json = await res.json()
    const data: SugestaoPosto[] = json.sugestoes ?? []
    setSugestoes(data)
    setDataIni(json.dataIni ?? '')
    setDataFim(json.dataFim ?? '')
    setExpanded(new Set(data.map(s => s.empresa)))
    setLoading(false)
  }, [])

  useEffect(() => { carregar(tipo) }, [tipo, carregar])

  const toggleExpanded = (empresa: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(empresa) ? s.delete(empresa) : s.add(empresa); return s })

  const fmtQtd = (n: number, unid: string) =>
    `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} ${unid}`

  const fmtData = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : ''

  const proximaVisita = (dias: number[]) => {
    if (!dias.length) return null
    const hoje = new Date().getDay()
    const sorted = [...dias].sort((a, b) => a - b)
    const proximo = sorted.find(d => d > hoje) ?? sorted[0]
    const diff = proximo > hoje ? proximo - hoje : 7 - hoje + proximo
    if (diff === 0) return { label: 'Hoje', urgente: true }
    if (diff === 1) return { label: 'Amanhã', urgente: true }
    return { label: `${DIAS_SEMANA[proximo]} (em ${diff}d)`, urgente: false }
  }

  function imprimirPedido(s: SugestaoPosto) {
    // Agrupa por subgrupo
    const grupos: Record<string, Produto[]> = {}
    for (const p of s.produtos) {
      const sg = p.subgrupo_nome ?? 'Sem subgrupo'
      if (!grupos[sg]) grupos[sg] = []
      grupos[sg].push(p)
    }

    let linhas = ''
    for (const [sg, prods] of Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b))) {
      linhas += `<tr><td colspan="3" class="sg">${sg}</td></tr>`
      for (const p of prods) {
        const urg = urgencia(p)
        const cor = urg === 'critico' ? 'color:#c00' : urg === 'baixo' ? 'color:#b45309' : ''
        linhas += `<tr>
          <td style="font-family:monospace;${cor}">${p.produto_codigo ?? '—'}</td>
          <td style="${cor}">${p.produto_nome}</td>
          <td style="text-align:right;font-weight:600;${cor}">${fmtQtd(p.sugerido, p.unid_med)}</td>
        </tr>`
      }
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Pedido — ${s.posto_nome}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; font-size: 13px; }
      h2 { margin: 0 0 4px; font-size: 16px; }
      p  { margin: 0 0 16px; color: #555; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; padding: 6px 8px; background: #f0f0f0; border: 1px solid #ccc; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
      td { padding: 5px 8px; border: 1px solid #e0e0e0; }
      tr.sg-row td { background: #e8f0e8; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 4px 8px; }
      @media print { body { margin: 12px; } }
    </style></head><body>
    <h2>Sugestão de Pedido — ${s.posto_nome}</h2>
    <p>Período de referência: ${fmtData(dataIni)} a ${fmtData(dataFim)} &nbsp;·&nbsp; ${s.produtos.length} produto(s)</p>
    <table>
      <thead><tr><th>Código</th><th>Produto</th><th style="text-align:right">Qtd Sugerida</th></tr></thead>
      <tbody>${linhas.replace(/<tr><td colspan="3" class="sg">/g, '<tr class="sg-row"><td colspan="3">')}</tbody>
    </table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  // Totais globais
  const totalCriticos = sugestoes.reduce((acc, s) => acc + s.produtos.filter(p => urgencia(p) === 'critico').length, 0)
  const totalProdutos = sugestoes.reduce((acc, s) => acc + s.produtos.length, 0)
  const totalPostos   = sugestoes.length

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Sugestão de Pedido"
        description={dataIni ? `Baseado nas vendas de ${fmtData(dataIni)} a ${fmtData(dataFim)}` : 'Baseado nas vendas dos últimos 15 dias'}
        actions={
          <button onClick={() => carregar(tipo)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-5">

        {/* Abas tipo */}
        <div className="flex gap-2">
          <button onClick={() => setTipo('conveniencia')}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-xl border-2 transition-all',
              tipo === 'conveniencia'
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/30'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-300 bg-white dark:bg-gray-900'
            )}>
            <Store className="w-4 h-4" /> Conveniência
          </button>
          <button onClick={() => setTipo('combustivel')}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-xl border-2 transition-all',
              tipo === 'combustivel'
                ? 'bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/30'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300 bg-white dark:bg-gray-900'
            )}>
            <Fuel className="w-4 h-4" /> Combustíveis
          </button>
        </div>

        {/* Cards de resumo */}
        {!loading && sugestoes.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <Package className="w-4.5 h-4.5 text-orange-500" />
              </div>
              <div>
                <p className="text-[22px] font-bold text-gray-900 dark:text-gray-100 leading-tight">{totalProdutos}</p>
                <p className="text-[11px] text-gray-500">Produtos para pedir</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Store className="w-4.5 h-4.5 text-blue-500" />
              </div>
              <div>
                <p className="text-[22px] font-bold text-gray-900 dark:text-gray-100 leading-tight">{totalPostos}</p>
                <p className="text-[11px] text-gray-500">Postos com pendência</p>
              </div>
            </div>
            <div className={cn('border rounded-xl px-4 py-3 flex items-center gap-3',
              totalCriticos > 0
                ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
            )}>
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                totalCriticos > 0 ? 'bg-red-100 dark:bg-red-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10'
              )}>
                {totalCriticos > 0
                  ? <AlertTriangle className="w-4.5 h-4.5 text-red-500" />
                  : <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                }
              </div>
              <div>
                <p className={cn('text-[22px] font-bold leading-tight', totalCriticos > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>{totalCriticos}</p>
                <p className="text-[11px] text-gray-500">{totalCriticos > 0 ? 'Itens críticos' : 'Sem críticos'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Lista por posto */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-7 h-7 text-orange-400 animate-spin" />
            <p className="text-[13px] text-gray-400">Calculando sugestões com base no AUTOSYSTEM...</p>
          </div>
        ) : sugestoes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-[14px] font-medium text-gray-600 dark:text-gray-400">Estoque suficiente em todos os postos</p>
            <p className="text-[12px] text-gray-400">Nenhuma sugestão de pedido para {tipo === 'combustivel' ? 'combustíveis' : 'conveniência'}</p>
          </div>
        ) : sugestoes.map(s => {
          const criticos = s.produtos.filter(p => urgencia(p) === 'critico').length
          const baixos   = s.produtos.filter(p => urgencia(p) === 'baixo').length
          const isOpen   = expanded.has(s.empresa)

          // Agrupa produtos por subgrupo para a tabela
          const subgruposUnicos = [...new Set(s.produtos.map(p => p.subgrupo_nome ?? 'Sem subgrupo'))]
            .sort((a, b) => a === 'Sem subgrupo' ? 1 : b === 'Sem subgrupo' ? -1 : a.localeCompare(b))

          return (
            <div key={s.empresa} className={cn('rounded-2xl border-2 overflow-hidden transition-all',
              criticos > 0
                ? 'border-red-200 dark:border-red-500/30'
                : baixos > 0
                  ? 'border-amber-200 dark:border-amber-500/30'
                  : 'border-gray-200 dark:border-gray-800'
            )}>

              {/* Header posto */}
              <div className={cn('flex items-center gap-4 px-5 py-4 transition-colors',
                criticos > 0
                  ? 'bg-red-50 dark:bg-red-500/10'
                  : baixos > 0
                    ? 'bg-amber-50 dark:bg-amber-500/10'
                    : 'bg-gray-50 dark:bg-gray-800/50'
              )}>
                {/* Ícone urgência — clicável para expand */}
                <button
                  onClick={() => toggleExpanded(s.empresa)}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left"
                >
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    criticos > 0 ? 'bg-red-100 dark:bg-red-500/20' : baixos > 0 ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-gray-100 dark:bg-gray-800'
                  )}>
                    {criticos > 0
                      ? <AlertTriangle className="w-5 h-5 text-red-500" />
                      : baixos > 0
                        ? <TrendingDown className="w-5 h-5 text-amber-500" />
                        : <ShoppingCart className="w-5 h-5 text-gray-400" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{s.posto_nome}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] text-gray-500">{s.produtos.length} produto{s.produtos.length !== 1 ? 's' : ''} para pedir</span>
                      {subgruposUnicos.filter(sg => sg !== 'Sem subgrupo').length > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Layers className="w-3 h-3" />
                          {subgruposUnicos.filter(sg => sg !== 'Sem subgrupo').length} subgrupo{subgruposUnicos.filter(sg => sg !== 'Sem subgrupo').length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {criticos > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400"><AlertTriangle className="w-3 h-3" />{criticos} crítico{criticos !== 1 ? 's' : ''}</span>}
                      {baixos > 0  && <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"><TrendingDown className="w-3 h-3" />{baixos} baixo{baixos !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>

                  {/* Fornecedores resumo */}
                  {s.fornecedores.length > 0 && (
                    <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                      {s.fornecedores.slice(0, 2).map((v, i) => {
                        const pv = proximaVisita(v.dias_visita)
                        return (
                          <div key={i} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px]',
                            pv?.urgente
                              ? 'bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/30'
                              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                          )}>
                            <Truck className={cn('w-3 h-3', pv?.urgente ? 'text-orange-500' : 'text-gray-400')} />
                            <span className="font-medium text-gray-700 dark:text-gray-300">{v.fornecedor.nome}</span>
                            {pv && <span className={cn('font-semibold', pv.urgente ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400')}>{pv.label}</span>}
                          </div>
                        )
                      })}
                      {s.fornecedores.length > 2 && <span className="text-[11px] text-gray-400">+{s.fornecedores.length - 2}</span>}
                    </div>
                  )}

                  <div className="flex-shrink-0">
                    {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </button>

                {/* Botão Relatório */}
                <button
                  onClick={() => imprimirPedido(s)}
                  title="Imprimir relatório do pedido"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" /> Relatório
                </button>
              </div>

              {isOpen && (
                <div className="bg-white dark:bg-gray-900">

                  {/* Fornecedores expandido */}
                  {s.fornecedores.length > 0 && (
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-orange-50/60 to-transparent dark:from-orange-500/5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" /> Fornecedores deste posto
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {s.fornecedores.map((v, i) => {
                          const pv = proximaVisita(v.dias_visita)
                          return (
                            <div key={i} className={cn('flex items-start gap-3 px-4 py-3 rounded-xl border',
                              pv?.urgente
                                ? 'bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/30'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                            )}>
                              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                                pv?.urgente ? 'bg-orange-100 dark:bg-orange-500/20' : 'bg-gray-100 dark:bg-gray-700'
                              )}>
                                <Truck className={cn('w-4 h-4', pv?.urgente ? 'text-orange-500' : 'text-gray-400')} />
                              </div>
                              <div>
                                <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{v.fornecedor.nome}</p>
                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                  {v.fornecedor.contato  && <span className="flex items-center gap-1 text-[11px] text-gray-500"><User className="w-3 h-3" />{v.fornecedor.contato}</span>}
                                  {v.fornecedor.telefone && (
                                    <a href={`tel:${v.fornecedor.telefone}`} className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                                      <Phone className="w-3 h-3" />{v.fornecedor.telefone}
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  {pv && (
                                    <span className={cn('flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full',
                                      pv.urgente
                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                    )}>
                                      <CalendarClock className="w-3 h-3" /> {pv.label}
                                    </span>
                                  )}
                                  {v.dias_visita.length > 0 && (
                                    <span className="text-[10px] text-gray-400">
                                      {v.dias_visita.map(d => DIAS_SEMANA[d]).join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tabela de produtos agrupada por subgrupo */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                          <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Código</th>
                          <th className="text-left px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Produto</th>
                          <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Estoque Atual</th>
                          <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vendas 15d</th>
                          <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Média/dia</th>
                          <th className="text-right px-5 py-3 text-[10px] font-bold text-orange-500 uppercase tracking-widest">Sugerido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subgruposUnicos.map(sg => {
                          const prods = s.produtos.filter(p => (p.subgrupo_nome ?? 'Sem subgrupo') === sg)
                          return (
                            <>
                              {/* Cabeçalho do subgrupo */}
                              <tr key={`sg-${sg}`} className="border-b border-gray-100 dark:border-gray-800">
                                <td colSpan={6} className="px-5 py-2 bg-gray-50 dark:bg-gray-800/60">
                                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    <Layers className="w-3 h-3" /> {sg}
                                    <span className="ml-1 font-normal normal-case tracking-normal text-gray-400">({prods.length})</span>
                                  </span>
                                </td>
                              </tr>

                              {prods.map(p => {
                                const urg = urgencia(p)
                                return (
                                  <tr key={p.produto} className={cn('border-b border-gray-50 dark:border-gray-800/50 last:border-0',
                                    urg === 'critico' ? 'bg-red-50/40 dark:bg-red-500/5' : urg === 'baixo' ? 'bg-amber-50/30 dark:bg-amber-500/5' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/20'
                                  )}>
                                    {/* Código interno */}
                                    <td className="px-5 py-3">
                                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500">
                                        {p.produto_codigo ?? '—'}
                                      </span>
                                    </td>

                                    <td className="px-3 py-3">
                                      <div className="flex items-center gap-2">
                                        {urg === 'critico' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                                        {urg === 'baixo'   && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                                        {urg === 'normal'  && <span className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />}
                                        <span className={cn('text-[13px] font-medium',
                                          urg === 'critico' ? 'text-red-700 dark:text-red-400' : urg === 'baixo' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-800 dark:text-gray-200'
                                        )}>{p.produto_nome}</span>
                                      </div>
                                      <StockBar atual={p.estoque_atual} necessario={p.estoque_15dias} />
                                    </td>

                                    <td className="px-4 py-3 text-right">
                                      <span className={cn('text-[13px] tabular-nums font-semibold',
                                        p.estoque_atual <= 0 ? 'text-red-500' : urg === 'baixo' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'
                                      )}>
                                        {fmtQtd(p.estoque_atual, p.unid_med)}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className="text-[13px] tabular-nums text-gray-500 dark:text-gray-400">{fmtQtd(p.vendas_15dias, p.unid_med)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className="text-[13px] tabular-nums text-gray-500 dark:text-gray-400">{fmtQtd(p.media_diaria, p.unid_med)}</span>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                      <span className={cn('inline-flex items-center justify-center min-w-[80px] px-3 py-1 rounded-lg text-[13px] tabular-nums font-bold',
                                        urg === 'critico'
                                          ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                          : urg === 'baixo'
                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                                            : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                                      )}>
                                        {fmtQtd(p.sugerido, p.unid_med)}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
