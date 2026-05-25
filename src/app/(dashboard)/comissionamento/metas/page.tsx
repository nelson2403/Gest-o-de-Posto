import { Target } from 'lucide-react'
import { PlaceholderPage } from '../_components/PlaceholderPage'

export default function ComissionamentoMetasPage() {
  return (
    <PlaceholderPage
      titulo="Metas"
      subtitulo="Definição de metas de venda e distribuição entre vendedores"
      icone={Target}
      corAccent="emerald"
      voltarPara={{ href: '/comissionamento', label: 'Voltar ao Dashboard' }}
      features={[
        { titulo: 'Grupos de metas',         descricao: 'Organização hierárquica das metas (ex.: Combustíveis → Gasolina Comum, Etanol).' },
        { titulo: 'Filtros por produto/grupo', descricao: 'Cada meta pode incluir ou excluir produtos, grupos ou sub-grupos específicos.' },
        { titulo: 'Splits por vendedor',     descricao: 'Distribuição do valor total da meta entre membros (goal_splits).' },
        { titulo: 'Períodos',                descricao: 'Metas com início e fim definidos — pode haver várias metas ativas simultaneamente.' },
      ]}
    />
  )
}
