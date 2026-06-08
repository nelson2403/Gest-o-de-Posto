export const metadata = {
  title: 'Fechamento de Caixa — PDV',
}

export default function PdvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      {children}
    </div>
  )
}
