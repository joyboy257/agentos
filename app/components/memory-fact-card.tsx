/**
 * MemoryFactCard — displays a single fact with confirm/deny buttons.
 *
 * Used in the Activity Log "Learned Facts" tab and the dedicated Memory page.
 *
 * Props:
 *  - fact: MemoryFact record from memory-operations
 *  - onConfirm(factId): called when Maria clicks Confirm
 *  - onDeny(factId): called when Maria clicks Deny
 *  - sourceRunId: optional run ID to link to the source run
 */

'use client'

import { useState } from 'react'

export interface MemoryFactData {
  id: string
  user_id: string
  fact_text: string
  source_run_id: string | null
  confirmed_at: string | null
  denied_at: string | null
  created_at: string
}

interface Props {
  fact: MemoryFactData
  onConfirm: (factId: string) => void
  onDeny: (factId: string) => void
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MemoryFactCard({ fact, onConfirm, onDeny }: Props) {
  const [pending, setPending] = useState<'confirm' | 'deny' | null>(null)

  async function handleConfirm() {
    setPending('confirm')
    await onConfirm(fact.id)
    setPending(null)
  }

  async function handleDeny() {
    setPending('deny')
    await onDeny(fact.id)
    setPending(null)
  }

  const isConfirmed = !!fact.confirmed_at
  const isDenied = !!fact.denied_at

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e5e3',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Fact text */}
      <p
        style={{
          fontSize: 14,
          margin: '0 0 12px',
          lineHeight: 1.6,
          fontStyle: isDenied ? 'italic' : 'normal',
          color: isDenied ? '#9ca3af' : '#1a1a18',
        }}
      >
        {fact.fact_text}
      </p>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {/* Left: source + timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {fact.source_run_id && (
            <a
              href={`/activity?run=${fact.source_run_id}`}
              style={{
                fontSize: 12,
                color: '#6366f1',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Run #{fact.source_run_id.slice(0, 8).toUpperCase()}
            </a>
          )}
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {formatDate(fact.created_at)}
          </span>
          {isConfirmed && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#16a34a',
                background: '#dcfce7',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              Confirmed
            </span>
          )}
          {isDenied && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#dc2626',
                background: '#fee2e2',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              Denied
            </span>
          )}
        </div>

        {/* Right: action buttons */}
        {!isConfirmed && !isDenied && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleConfirm}
              disabled={pending !== null}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid #16a34a',
                background: pending === 'confirm' ? '#f0fdf4' : 'transparent',
                color: '#16a34a',
                fontSize: 13,
                fontWeight: 600,
                cursor: pending ? 'default' : 'pointer',
                opacity: pending && pending !== 'confirm' ? 0.5 : 1,
              }}
            >
              {pending === 'confirm' ? 'Confirming...' : 'Confirm'}
            </button>
            <button
              onClick={handleDeny}
              disabled={pending !== null}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid #dc2626',
                background: pending === 'deny' ? '#fef2f2' : 'transparent',
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600,
                cursor: pending ? 'default' : 'pointer',
                opacity: pending && pending !== 'deny' ? 0.5 : 1,
              }}
            >
              {pending === 'deny' ? 'Denying...' : 'Deny'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
