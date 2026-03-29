import { redirect } from 'next/navigation'
import { getSessionFromCookie } from '@/lib/auth/session'

export default async function Home() {
  const session = await getSessionFromCookie()

  if (!session) {
    redirect('/login')
  }

  // Authenticated user - show loading placeholder
  // Full two-mode UI will be implemented later
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg)'
    }}>
      <div style={{
        textAlign: 'center',
        color: 'var(--text-muted)'
      }}>
        AgentOS is loading...
      </div>
    </div>
  )
}
