'use client'

import { LayoutDashboard } from 'lucide-react'
import { PlaceholderPage } from './_components/PlaceholderPage'

export default function ComissionamentoDashboardPage() {
  return (
    <PlaceholderPage
      titulo="Comissionamento — Dashboard"
      subtitulo="Visão geral de comissões, vendas e atingimento de metas"
      icone={LayoutDashboard}
      corAccent="blue"
      features={[
        { titulo: 'KPIs principais',        descricao: 'Total comissionado no mês, número de vendas, ticket médio e produtividade por vendedor.' },
        { titulo: 'Evolução temporal',      descricao: 'Gráfico de área com a movimentação de comissões pelos últimos meses.' },
        { titulo: 'Top vendedores',         descricao: 'Ranking dos membros com maior comissão acumulada no período selecionado.' },
        { titulo: 'Atingimento de metas',   descricao: 'Resumo por grupo de metas mostrando alcançado × planejado.' },
      ]}
    />
  )
}
