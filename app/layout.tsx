import './globals.css'
import type { Metadata } from 'next'
import Navigation from '@/components/Navigation'
import { AuthProvider } from '@/context/AuthProvider'
import AuthGate from '@/components/AuthGate'

export const metadata: Metadata = {
  title: {
    default: 'Dogdex – Zawody Psie',
    template: '%s | Dogdex',
  },
  description: 'Platforma do organizacji i zapisu na psie zawody, eventy i spacery',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dogdex',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <meta name="theme-color" content="#0369a1" />
      </head>
      <body className="bg-slate-50 min-h-screen">
        <AuthProvider>
          <AuthGate>
            <Navigation />
            <main className="container mx-auto px-4 py-6" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>{children}</main>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  )
}
