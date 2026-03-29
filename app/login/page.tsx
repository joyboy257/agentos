'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(null)

  // Access search params on client side via useEffect workaround
  if (typeof window !== 'undefined' && !searchParams) {
    setSearchParams(new URLSearchParams(window.location.search))
  }

  const errorParam = searchParams?.get('error')
  const redirectParam = searchParams?.get('redirect')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError(null)

    try {
      const res = await fetch('/api/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send link')
      }

      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (status === 'success') {
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
          maxWidth: 400,
          padding: 40,
          background: 'var(--panel)',
          borderRadius: 12,
          border: '1px solid var(--border)'
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Mail size={24} color="white" />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Check your email</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            We sent a login link to <strong>{email}</strong>
          </p>
        </div>
      </div>
    )
  }

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
        maxWidth: 400,
        padding: 40,
        background: 'var(--panel)',
        borderRadius: 12,
        border: '1px solid var(--border)'
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome to AgentOS</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
          Enter your email to sign in or create an account
        </p>

        {errorParam === 'invalid_or_expired' && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            color: '#ef4444',
            marginBottom: 24,
            fontSize: 13
          }}>
            This link is invalid or has expired. Please try logging in again.
          </div>
        )}

        {errorParam === 'no_token' && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            color: '#ef4444',
            marginBottom: 24,
            fontSize: 13
          }}>
            No token provided. Please use the link from your email.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
              marginBottom: 16,
              boxSizing: 'border-box'
            }}
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            style={{
              width: '100%',
              padding: '12px 24px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              opacity: status === 'loading' ? 0.7 : 1
            }}
          >
            {status === 'loading' ? 'Sending...' : 'Continue with Email'}
          </button>
        </form>

        {error && (
          <p style={{ color: '#ef4444', marginTop: 16, fontSize: 13 }}>{error}</p>
        )}
      </div>
    </div>
  )
}
