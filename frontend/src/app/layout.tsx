import type { Metadata } from 'next'
import { Sora, Inter } from 'next/font/google'
import './globals.css'

const sora  = Sora({ subsets: ['latin'], variable: '--font-sora',  weight: ['400','500','600','700'], display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', weight: ['300','400','500','600'], display: 'swap' })

export const metadata: Metadata = {
  title:       'Daily Report | Gruppo Visconti',
  description: 'Gestione report giornalieri collaboratori',
  robots:      'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${sora.variable} ${inter.variable}`}>
      <body className="font-sans antialiased bg-slate-50 text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  )
}
