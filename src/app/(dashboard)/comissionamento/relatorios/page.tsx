import { FileText } from 'lucide-react'
import { PlaceholderPage } from '../_components/PlaceholderPage'

export default function ComissionamentoRelatoriosPage() {
  return (
    <PlaceholderPage
      titulo="Relatórios de Comissionamento"
      subtitulo="Apuração mensal, demonstrativos por vendedor e relatório imprimível"
      icone={FileText}
      corAccent="sky"
      voltarPara={{ href: '/comissionamento', label: 'Voltar ao Dashboard' }}
      features={[
        { titulo: 'Apuração por período',       descricao: 'Resumo do que cada membro tem a receber no mês — base, gatilhos e total final.' },
        { titulo: 'Demonstrativo individual',   descricao: 'Página detalhada por vendedor mostrando cada venda, regra aplicada e valor de comissão.' },
        { titulo: 'Versão imprimível (A4)',     descricao: 'Layout retrato pronto para impressão / assinatura do recibo.' },
        { titulo: 'Exportação',                 descricao: 'Exporta o demonstrativo em PDF ou CSV pra integração com folha de pagamento.' },
      ]}
    />
  )
}
