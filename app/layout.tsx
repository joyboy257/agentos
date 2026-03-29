import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentOS — Canva for AI Agents',
  description: 'Visual multi-agent AI orchestration for non-technical business users',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
