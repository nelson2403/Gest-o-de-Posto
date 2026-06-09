'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Croissant, Wheat, Package, ChevronRight, ClipboardList } from 'lucide-react'

const fmtBRL = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function PombalMassasPainel() {
  const [salgados, setSalgados] = useState<any[]>([])
  const [insumos, setInsumos]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/pombal-massas/salgados').then(r => r.json()),
      fetch('/api/pombal-massas/insumos').then(r => r.json()),
    ]).then(([s, i]) => {
      setSalgados(s.salgados ?? [])
      setInsumos(i.insumos ?? [])
      setLoading(false)
    })
  }, [])

  const valorInsumos = insumos.reduce((a, i) => a + (Number(i.estoque) || 0) * (Number(i.custo_unitario) || 0), 0)

  const cards = [
    { label: 'Salgados cadastrados', valor: salgados.length, icon: Croissant, cor: 'text-orange-500 bg-orange-50' },
    { label: 'Matérias-primas',      valor: insumos.length,  icon: Wheat,     cor: 'text-amber-600 bg-amber-50' },
    { label: 'Valor em insumos',     valor: fmtBRL(valorInsumos), icon: Package, cor: 'text-emerald-600 bg-emerald-50' },
  ]

  const atalhos = [
    { href: '/pombal-massas/salgados', label: 'Salgados', desc: 'Cadastro, custo, preço e estoque', icon: Croissant },
    { href: '/pombal-massas/insumos',  label: 'Matérias-primas', desc: 'Insumos, custo e estoque', icon: Wheat },
    { href: '/pombal-massas/pedidos',  label: 'Pedidos das lojas', desc: 'Em breve (Fase 3)', icon: ClipboardList, breve: true },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header title="POMBAL MASSAS" description="Produção e distribuição de salgados para as lojas" />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${c.cor}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{loading ? '…' : c.valor}</p>
                <p className="text-[12px] text-gray-500">{c.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Atalhos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {atalhos.map(a => (
            a.breve ? (
              <div key={a.href} className="bg-white dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl px-5 py-4 opacity-60">
                <div className="flex items-center gap-3">
                  <a.icon className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">{a.label}</p>
                    <p className="text-[12px] text-gray-400">{a.desc}</p>
                  </div>
                </div>
              </div>
            ) : (
              <Link key={a.href} href={a.href}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-5 py-4 hover:border-orange-300 hover:shadow-sm transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                    <a.icon className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{a.label}</p>
                    <p className="text-[12px] text-gray-500">{a.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400" />
                </div>
              </Link>
            )
          ))}
        </div>
      </div>
    </div>
  )
}
