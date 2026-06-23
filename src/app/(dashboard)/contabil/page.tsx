import { redirect } from 'next/navigation'

export default function ContabilPage() {
  // O índice de Contábil sempre aponta para a Visão Geral — assim o item
  // de menu do topbar `/contabil` (caso vire link direto futuramente)
  // já entra na sub-página padrão sem mostrar uma tela vazia.
  redirect('/contabil/visao-geral')
}
