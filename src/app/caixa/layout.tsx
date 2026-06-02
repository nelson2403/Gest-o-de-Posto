export const metadata = {
  title: 'Fechamento de Caixa',
}

export default function CaixaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      {children}
    </div>
  )
}
