'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Edit2, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalationData {
  approvalId: string
  runId: string
  toolCallId: string
  agentName: string
  summary: string
  toolName: string
  args: Record<string, unknown>
  teamContext?: {
    workerName: string
    taskId: string
    teamId: string
    blastRadius?: string
  }
}

export interface EscalationCardProps {
  agentName: string
  summary: string
  toolName: string
  args: Record<string, unknown>
  onApprove: () => void
  onEdit: (revisedArgs: Record<string, unknown>) => void
  onSkip: () => void
  onCancel: () => void
  position?: { x: number; y: number }
  teamContext?: EscalationData['teamContext']
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converts camelCase or snake_case key to a readable label */
function keyToLabel(key: string): string {
  // Handle special common cases
  const special: Record<string, string> = {
    to: 'Send to',
    from: 'From',
    subject: 'Subject',
    body: 'Body',
    cc: 'CC',
    bcc: 'BCC',
    scheduleDate: 'Schedule date',
    scheduleTime: 'Schedule time',
    templateId: 'Template ID',
    replyTo: 'Reply to',
  }
  if (special[key]) return special[key]

  // Fallback: capitalize first letter of each word
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// EscalationCard
// ---------------------------------------------------------------------------

export function EscalationCard({
  agentName,
  summary,
  toolName,
  args,
  onApprove,
  onEdit,
  onSkip,
  onCancel,
  position,
  teamContext,
}: EscalationCardProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>({ ...args })
  const [submitting, setSubmitting] = useState(false)

  const handleApprove = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onApprove()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditClick = () => {
    setEditedArgs({ ...args })
    setMode('edit')
  }

  const handleBack = () => {
    setMode('view')
    setEditedArgs({ ...args })
  }

  const handleSubmitEdit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onEdit(editedArgs)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onCancel()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSkip()
    } finally {
      setSubmitting(false)
    }
  }

  const argEntries = Object.entries(args)

  return (
    <>
      {/* Dim overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          zIndex: 999,
        }}
      />

      {/* Floating card */}
      <div
        style={{
          position: 'fixed',
          ...(position
            ? { left: position.x, top: position.y }
            : {
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }),
          width: 480,
          maxWidth: 'calc(100vw - 48px)',
          background: '#12121a',
          border: '1.5px solid #f59e0b',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px #f59e0b20',
          zIndex: 1000,
          overflow: 'hidden',
          animation: 'escalationPulse 2s ease-in-out infinite',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid #f59e0b',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <AlertTriangle
            size={20}
            style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: '#fafafa',
                lineHeight: 1.4,
              }}
            >
              {teamContext?.workerName ?? agentName} — needs your input{' '}
              {teamContext && (
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: '#7c3aed',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '1px 5px',
                    verticalAlign: 'middle',
                    marginLeft: 6,
                  }}
                >
                  Team
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Blast radius warning */}
        {teamContext?.blastRadius && (
          <div
            style={{
              padding: '10px 20px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ fontSize: 13, color: '#f87171', fontWeight: 500 }}>
              Impact:{' '}
              <span style={{ fontStyle: 'italic', color: '#fca5a5' }}>{teamContext.blastRadius}</span>
            </span>
          </div>
        )}

        {/* Summary */}
        <div
          style={{
            padding: '14px 20px',
            background: 'rgba(245, 158, 11, 0.08)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: '#fcd34d',
              lineHeight: 1.6,
              fontStyle: 'italic',
            }}
          >
            &ldquo;{summary}&rdquo;
          </p>
        </div>

        {/* Body */}
        {mode === 'view' ? (
          <div style={{ padding: '16px 20px' }}>
            <p
              style={{
                margin: '0 0 10px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: '#6b6b7b',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              What the agent plans to do:
            </p>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <li
                style={{
                  fontSize: 14,
                  color: '#e5e5e5',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                }}
              >
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>•</span>
                <span>Draft reply using &ldquo;{toolName}&rdquo;</span>
              </li>
              {argEntries.map(([key, value]) => (
                <li
                  key={key}
                  style={{
                    fontSize: 14,
                    color: '#c0c0bc',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                  }}
                >
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>•</span>
                  <span>
                    {keyToLabel(key)}:{' '}
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, color: '#e5e5e5' }}>
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* Edit mode */
          <div style={{ padding: '16px 20px' }}>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: '#6b6b7b',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              Edit arguments:
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {argEntries.map(([key, value]) => (
                <div key={key}>
                  <label
                    htmlFor={`escalation-arg-${key}`}
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#a3a3a0',
                      marginBottom: 4,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {keyToLabel(key)}
                  </label>
                  {typeof value === 'string' ? (
                    <input
                      id={`escalation-arg-${key}`}
                      type="text"
                      value={String(editedArgs[key] ?? '')}
                      onChange={(e) =>
                        setEditedArgs((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #2e2e3e',
                        borderRadius: 6,
                        fontSize: 14,
                        background: '#0a0a0f',
                        color: '#e5e5e5',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  ) : typeof value === 'number' ? (
                    <input
                      id={`escalation-arg-${key}`}
                      type="number"
                      value={Number(editedArgs[key] ?? value)}
                      onChange={(e) =>
                        setEditedArgs((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                      }
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #2e2e3e',
                        borderRadius: 6,
                        fontSize: 14,
                        background: '#0a0a0f',
                        color: '#e5e5e5',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <textarea
                      id={`escalation-arg-${key}`}
                      rows={2}
                      value={
                        typeof editedArgs[key] === 'object'
                          ? JSON.stringify(editedArgs[key], null, 2)
                          : String(editedArgs[key] ?? JSON.stringify(value))
                      }
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value)
                          setEditedArgs((prev) => ({ ...prev, [key]: parsed }))
                        } catch {
                          setEditedArgs((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #2e2e3e',
                        borderRadius: 6,
                        fontSize: 14,
                        background: '#0a0a0f',
                        color: '#e5e5e5',
                        boxSizing: 'border-box',
                        outline: 'none',
                        resize: 'vertical',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            borderTop: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          {mode === 'view' ? (
            <>
              <button
                onClick={handleCancel}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  border: '1px solid #2e2e3e',
                  background: 'transparent',
                  color: '#6b6b7b',
                  opacity: submitting ? 0.5 : 1,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                <X size={13} />
                Cancel
              </button>
              <button
                onClick={handleSkip}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  border: '1px solid #2e2e3e',
                  background: 'transparent',
                  color: '#6b6b7b',
                  opacity: submitting ? 0.5 : 1,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                Skip
              </button>
              <button
                onClick={handleEditClick}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  border: '1px solid #7c3aed',
                  background: 'transparent',
                  color: '#a78bfa',
                  opacity: submitting ? 0.5 : 1,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                <Edit2 size={13} />
                Edit &amp; Approve
              </button>
              <button
                onClick={handleApprove}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  opacity: submitting ? 0.5 : 1,
                  fontFamily: 'JetBrains Mono, monospace',
                  boxShadow: '0 0 16px rgba(34, 197, 94, 0.3)',
                }}
              >
                <Check size={13} />
                Approve &amp; Send
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleBack}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  border: '1px solid #2e2e3e',
                  background: 'transparent',
                  color: '#6b6b7b',
                  opacity: submitting ? 0.5 : 1,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                Back
              </button>
              <button
                onClick={handleSubmitEdit}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  opacity: submitting ? 0.5 : 1,
                  fontFamily: 'JetBrains Mono, monospace',
                  boxShadow: '0 0 16px rgba(34, 197, 94, 0.3)',
                }}
              >
                <Check size={13} />
                Submit Edit
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Demo escalation data
// ---------------------------------------------------------------------------

export const DEMO_ESCALATION: EscalationData = {
  approvalId: 'approval-demo-001',
  runId: 'run-demo-001',
  toolCallId: 'toolcall-demo-001',
  agentName: 'Lead Follow-up Worker',
  summary: 'The lead asked about a $50K deal. This exceeds your $10,000 approval limit.',
  toolName: 'Enterprise Response v1',
  args: {
    to: 'ceo@acme.com',
    subject: 'Re: Enterprise Deal Discussion — Next Steps',
    body: 'Hi,\n\nThank you for your interest in our enterprise plan. I would be happy to schedule a call to discuss the $50,000 annual package...\n\nBest,\nMaria',
  },
  teamContext: {
    workerName: 'Lead Research Worker',
    taskId: 'task-lead-research-001',
    teamId: 'team-sales-001',
    blastRadius: 'Email will be sent to a new contact outside approved list',
  },
}