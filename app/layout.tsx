import type { Metadata } from 'next'
import { useEffect } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentOS — Canva for AI Agents',
  description: 'Visual multi-agent AI orchestration for non-technical business users',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('[sw] registration failed:', err)
      })
    }
    // Expose VAPID public key to client via window.ENV
    ;(window as unknown as { ENV: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: string } }).ENV = {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    }
  }, [])

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
