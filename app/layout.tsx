import './globals.css'
import type { Metadata } from 'next'
import Navigation from '@/components/Navigation'
import { AuthProvider } from '@/context/AuthProvider'
import AuthGate from '@/components/AuthGate'
import { Inter, Playfair_Display } from 'next/font/google'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from '@vercel/speed-insights/next';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-playfair',
  display: 'swap',
})

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
    <html lang="pl" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        <meta name="theme-color" content="#1E3932" />
      </head>
      <body className="bg-background min-h-screen font-sans">
        <AuthProvider>
          <AuthGate>
            <div className="flex min-h-screen">
              <Navigation />
              <div className="flex-1 min-w-0 md:pl-[260px]">
                <main
                  className="min-h-screen px-4 pt-[76px] pb-6 md:px-8 md:py-8"
                  style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
                >
                  {children}
                </main>
              </div>
            </div>
          </AuthGate>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
