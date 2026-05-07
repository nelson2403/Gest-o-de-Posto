import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/contexts/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gestão de Postos — Sistema de Controle',
  description: 'Sistema de gestão de acessos e maquininhas para redes de postos de combustíveis',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Gestão de Postos',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Gestão de Postos" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();(function(){try{var o=new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes'&&m.target.id==='adr_distai'){m.target.removeAttribute('id');m.target.removeAttribute('hidden');}m.addedNodes.forEach&&m.addedNodes.forEach(function(n){if(n&&n.id==='adr_distai'){n.removeAttribute('id');n.removeAttribute('hidden');}});});});o.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['id','hidden']});setTimeout(function(){o.disconnect();},5000);}catch(e){}})();` }} />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
