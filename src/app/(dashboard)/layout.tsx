import { AuthProvider } from '@/contexts/AuthContext'
import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </AuthProvider>
  )
}
