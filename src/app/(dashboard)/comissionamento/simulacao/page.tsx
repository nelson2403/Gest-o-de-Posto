import { Calculator } from 'lucide-react'
import { PlaceholderPage } from '../_components/PlaceholderPage'

export default function ComissionamentoSimulacaoPage() {
  return (
    <PlaceholderPage
      titulo="Simulação"
      subtitulo="Simule cálculos de comissão antes de aplicar regras em produção"
      icone={Calculator}
      corAccent="amber"
      voltarPara={{ href: '/comissionamento', label: 'Voltar ao Dashboard' }}
      features={[
        { titulo: 'Cenários hipotéticos', descricao: 'Edite valores de venda, ticket médio e atingimento e veja o resultado em tempo real.' },
        { titulo: 'Comparar esquemas',    descricao: 'Aplique a mesma venda em esquemas diferentes e veja qual paga mais.' },
        { titulo: 'Por vendedor',         descricao: 'Simula o impacto pra um vendedor específico com base nas metas dele.' },
        { titulo: 'Exportar resumo',      descricao: 'Gera PDF ou planilha do cenário pra aprovação interna.' },
      ]}
    />
  )
}
