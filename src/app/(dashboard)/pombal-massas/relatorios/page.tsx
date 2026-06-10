'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { RefreshCw, Package, Croissant, Store, TrendingUp } from 'lucide-react'

const fmtBRL = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtNum = (v: number) => (v ?? 0).toLocaleString('pt-BR')

export default function RelatoriosPage() {
  const [dados, setDados] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pombal-massas/relatorios').then(r => r.json()).then(j => { setDados(j); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Relatórios — POMBAL MASSAS" description="Custos, margens, consumo e vendas por loja" />
        <div className="flex justify-center py-20"><RefreshCw className="w-6 h-6 text-orange-400 animate-spin" /></div>
      </div>
    )
  }

  const r = dados?.resumo ?? {}
  const cards = [
    { label: 'Vendas às lojas (entregue)', valor: fmtBRL(r.totalVendas), icon: Store, cor: 'text-emerald-600 bg-emerald-50' },
    { label: 'Total produzido', valor: fmtNum(r.totalProduzido), icon: Croissant, cor: 'text-orange-500 bg-orange-50' },
    { label: 'Estoque de salgados (custo)', valor: fmtBRL(r.valorEstoqueSalgados), icon: Package, cor: 'text-amber-600 bg-amber-50' },
    { label: 'Estoque de insumos', valor: fmtBRL(r.valorEstoqueInsumos), icon: Package, cor: 'text-indigo-600 bg-indigo-50' },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header title="Relatórios — POMBAL MASSAS" description="Custos, margens, consumo e vendas por loja" />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.cor}`}><c.icon className="w-5 h-5" /></div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{c.valor}</p>
                <p className="text-[11px] text-gray-500 leading-tight">{c.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vendas por loja */}
          <Tabela titulo="Vendas por loja" icon={Store}
            head={['Loja', 'Qtd', 'Valor']}
            rows={(dados.vendasPorLoja ?? []).map((v: any) => [v.loja, fmtNum(v.qtd), fmtBRL(v.valor)])}
            vazio="Nenhuma entrega registrada" />

          {/* Produção por salgado */}
          <Tabela titulo="Produção por salgado" icon={Croissant}
            head={['Salgado', 'Produzido', 'Custo']}
            rows={(dados.producaoPorSalgado ?? []).map((p: any) => [p.nome, fmtNum(p.qtd), fmtBRL(p.custo)])}
            vazio="Nenhuma produção registrada" />
        </div>

        {/* Margem por salgado */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Custo × Preço × Margem</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="text-left px-5 py-2.5">Salgado</th>
                <th className="text-right px-4 py-2.5">Custo</th>
                <th className="text-right px-4 py-2.5">Preço</th>
                <th className="text-right px-4 py-2.5">Margem</th>
                <th className="text-right px-5 py-2.5">Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(dados.margemSalgados ?? []).map((s: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-5 py-2.5 font-medium text-gray-800 dark:text-gray-200">{s.nome}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{fmtBRL(s.custo)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-800 dark:text-gray-200 font-semibold">{fmtBRL(s.preco_venda)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${s.margem >= 30 ? 'text-emerald-600' : s.margem >= 10 ? 'text-amber-600' : 'text-red-500'}`}>{s.margem.toFixed(1)}%</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{fmtNum(s.estoque)} {s.unidade}</td>
                </tr>
              ))}
              {(dados.margemSalgados ?? []).length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8 text-sm">Nenhum salgado cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Tabela({ titulo, icon: Icon, head, rows, vazio }: { titulo: string; icon: any; head: string[]; rows: any[][]; vazio: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Icon className="w-4 h-4" /> {titulo}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-[11px] uppercase tracking-wide text-gray-500">
            {head.map((h, i) => <th key={i} className={`px-4 py-2.5 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="text-center text-gray-400 py-8 text-sm">{vazio}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
              {row.map((c, j) => <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'text-left font-medium text-gray-800 dark:text-gray-200' : 'text-right text-gray-600 dark:text-gray-300'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
