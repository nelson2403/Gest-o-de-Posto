import { ComissionamentoTabs } from './_components/ComissionamentoTabs'

// Layout do módulo Comissionamento — adiciona uma barra de abas sticky no topo
// para navegar entre Dashboard, Membros, Categorias, Metas, Esquemas, Simulação
// e Relatórios. As páginas filhas mantêm seu próprio Header / conteúdo.
//
// O componente é server-render-safe (não tem 'use client') — só o
// ComissionamentoTabs interno é client component porque consome usePathname.
export default function ComissionamentoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <ComissionamentoTabs />
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  )
}
