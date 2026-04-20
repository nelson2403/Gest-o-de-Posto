import { AuthProvider } from '@/contexts/AuthContext'
import { Topbar } from '@/components/layout/Topbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
        <Topbar />
        <main className="flex-1 min-w-0 w-full overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </AuthProvider>
  )
}
