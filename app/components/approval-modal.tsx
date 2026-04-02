'use client'

/**
 * approval-modal.tsx — DOC-04
 *
 * In-app human approval modal.
 *
 * Appears when the runner emits an `approval_required` SSE event.
 * Shows a plain-English summary ("Alex the agent wants to send this email
 * to 47 people"), the field list, and three actions:
 *
 *  [Approve]  — accepts the tool call with original args
 *  [Edit]     — user modifies args → re-submit → re-approval required
 *  [Cancel]   — skips the tool call (downstream agents receive skip signal)
 *
 * Edit flow: User edits args → calls PUT /api/approvals/:approvalId with
 * revised args → iteration counter increments (capped at MAX_APPROVAL_ITERATIONS=3)
 * → new approval_required emitted → if MAX reached, auto-skip.
 *
 * Snapshot display: Reads the frozen reasoning trace from the snapshot
 * (via capturePointInTime at the moment approval was requested).
 * Subsequent live events are NOT shown in the modal.
 */

import { useState } from 'react'
import { X, Edit2, Check, AlertTriangle } from 'lucide-react'
import type { ApprovalRequiredEvent } from '@/lib/tracing/event-schema'
import type { ReasoningSnapshot } from '@/lib/tracing/event-buffer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalModalProps {
  /** The approval_required event that triggered this modal */
  event: ApprovalRequiredEvent
  /** Frozen reasoning snapshot at the time approval was requested */
  snapshot?: ReasoningSnapshot | null
  /** Plain-English summary from the event */
  summary: string
  /** On approve — calls PUT /api/approvals/:approvalId with { decision: 'approved' } */
  onApprove: (approvalId: string, toolCallId: string, revisedArgs?: Record<string, unknown>) => void
  /** On cancel — calls PUT /api/approvals/:approvalId with { decision: 'cancelled' } */
  onCancel: (approvalId: string, toolCallId: string) => void
  /** Called when the modal is dismissed (X button or Escape) */
  onDismiss: (approvalId: string) => void
  /** Optional pre-filled args for edit mode */
  initialArgs?: Record<string, unknown>
}

interface SnapshotTimelineEntry {
  sequence: number
  type: string
  summary: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function SnapshotPanel({ snapshot }: { snapshot?: ReasoningSnapshot | null }) {
  if (!snapshot || snapshot.events.length === 0) {
    return (
      <div className="snapshot-panel snapshot-empty">
        <p>No reasoning trace captured yet.</p>
      </div>
    )
  }

  const timeline: SnapshotTimelineEntry[] = snapshot.events.map((e) => {
    let summary = ''
    const eventType = e.type
    const content = e.content as Record<string, unknown>
    switch (eventType) {
      case 'observation':
        summary = (content.text as string) ?? ''
        break
      case 'classification':
        summary = `Classified: ${content.label ?? ''}`
        break
      case 'decision':
        summary = `Decided: ${content.chosen ?? ''}`
        break
      case 'action':
        summary = `Action: ${content.action ?? ''}`
        break
      case 'warning':
        summary = `Warning: ${content.text ?? ''}`
        break
      case 'approval_required':
        summary = `Approval required: ${content.summary ?? ''}`
        break
      case 'approval_resolved':
        summary = `Approval ${content.decision ?? ''}`
        break
      case 'status':
        summary = `Status: ${content.status ?? ''}`
        break
      case 'done':
        summary = 'Run completed'
        break
      case 'error':
        summary = `Error: ${content.message ?? ''}`
        break
      default: {
        summary = `[${eventType}]`
      }
    }

    return {
      sequence: e.sequence,
      type: e.type,
      summary,
      timestamp: e.timestamp,
    }
  })

  return (
    <div className="snapshot-panel">
      <div className="snapshot-header">
        <span className="snapshot-label">Reasoning trace at approval request</span>
        <span className="snapshot-count">{snapshot.events.length} events</span>
      </div>
      <div className="snapshot-timeline">
        {timeline.map((entry, i) => (
          <div key={i} className={`snapshot-entry snapshot-entry-${entry.type}`}>
            <span className="snapshot-seq">#{entry.sequence}</span>
            <span className="snapshot-type">{entry.type}</span>
            <span className="snapshot-summary">{entry.summary}</span>
            <span className="snapshot-time">{formatTimestamp(entry.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SuggestionCard — shows post-run escalation suggestions in the modal
// ---------------------------------------------------------------------------

interface Suggestion {
  id: string
  proposal_headline: string
  proposal_detail: string
}

interface SuggestionCardProps {
  suggestions: Suggestion[]
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
}

function SuggestionCard({ suggestions, onAccept, onDismiss }: SuggestionCardProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleAccept = async (id: string) => {
    setLoadingId(id)
    try {
      await onAccept(id)
    } finally {
      setLoadingId(null)
    }
  }

  const handleDismiss = async (id: string) => {
    setLoadingId(id)
    try {
      await onDismiss(id)
    } finally {
      setLoadingId(null)
    }
  }

  if (suggestions.length === 0) return null

  return (
    <div className="suggestion-section">
      <div className="suggestion-divider" />
      <div className="suggestion-header">
        <span className="suggestion-label">While I&apos;m here —</span>
      </div>
      {suggestions.map((s) => (
        <div key={s.id} className="suggestion-card">
          <p className="suggestion-headline">{s.proposal_headline}</p>
          <p className="suggestion-detail">{s.proposal_detail}</p>
          <div className="suggestion-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleAccept(s.id)}
              disabled={loadingId !== null}
            >
              {loadingId === s.id ? 'Scheduling...' : 'Schedule It'}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleDismiss(s.id)}
              disabled={loadingId !== null}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
      <style jsx>{`
        .suggestion-section {
          padding: 0 24px 16px;
        }
        .suggestion-divider {
          height: 1px;
          background: var(--border, #e5e7eb);
          margin-bottom: 16px;
        }
        .suggestion-header {
          margin-bottom: 12px;
        }
        .suggestion-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #6b7280);
        }
        .suggestion-card {
          background: var(--accent, #f3f4f6);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 8px;
        }
        .suggestion-headline {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }
        .suggestion-detail {
          margin: 0 0 12px;
          font-size: 13px;
          color: var(--text-muted, #6b7280);
          line-height: 1.4;
        }
        .suggestion-actions {
          display: flex;
          gap: 8px;
        }
        .btn-sm {
          padding: 6px 12px;
          font-size: 13px;
        }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ApprovalModal
// ---------------------------------------------------------------------------

export function ApprovalModal({
  event,
  snapshot,
  summary,
  onApprove,
  onCancel,
  onDismiss,
  initialArgs,
  suggestions = [],
  onSuggestionAccept,
  onSuggestionDismiss,
}: ApprovalModalProps & {
  suggestions?: Suggestion[]
  onSuggestionAccept?: (id: string) => Promise<void>
  onSuggestionDismiss?: (id: string) => Promise<void>
}) {
  const { toolCallId, iteration, maxIterations } = event.content
  const approvalId = toolCallId // toolCallId is used as the approvalId in our design

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>(
    initialArgs ?? Object.fromEntries(event.content.fields.map((f) => [f.name, f.value]))
  )
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isMaxIterations = iteration >= maxIterations

  const handleApprove = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onApprove(approvalId, toolCallId)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = () => {
    setMode('edit')
  }

  const handleCancel = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onCancel(approvalId, toolCallId)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitEdit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onApprove(approvalId, toolCallId, editedArgs)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDismiss = () => {
    onDismiss(approvalId)
  }

  return (
    <div className="approval-modal-backdrop" onClick={handleDismiss}>
      <div className="approval-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <AlertTriangle size={18} className="modal-warning-icon" />
            <h2 className="modal-title">Approval Required</h2>
            <span className="modal-iteration">
              {iteration}/{maxIterations}
            </span>
          </div>
          {isMaxIterations && (
            <p className="modal-max-warn">
              This is your final approval attempt. After this, the tool will be skipped automatically.
            </p>
          )}
          <button className="modal-close" onClick={handleDismiss} aria-label="Dismiss">
            <X size={18} />
          </button>
        </div>

        {/* Summary */}
        <div className="modal-summary">
          <p className="summary-text">{summary}</p>
        </div>

        {/* Fields */}
        {mode === 'view' && (
          <div className="modal-fields">
            <h3 className="fields-heading">Details</h3>
            <table className="fields-table">
              <tbody>
                {event.content.fields.map((field) => (
                  <tr key={field.name} className="field-row">
                    <td className="field-label">
                      {field.label ?? field.name}
                    </td>
                    <td className="field-value">
                      {typeof field.value === 'object'
                        ? JSON.stringify(field.value, null, 2)
                        : String(field.value ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit mode */}
        {mode === 'edit' && (
          <div className="modal-edit">
            <h3 className="edit-heading">Modify Arguments</h3>
            <p className="edit-note">
              Editing requires a new approval. This uses iteration {Math.min(iteration + 1, maxIterations)} of {maxIterations}.
            </p>
            {event.content.fields.map((field) => (
              <div key={field.name} className="edit-field">
                <label className="edit-label" htmlFor={`arg-${field.name}`}>
                  {field.label ?? field.name}
                </label>
                {typeof field.value === 'string' ? (
                  <input
                    id={`arg-${field.name}`}
                    className="edit-input"
                    value={String(editedArgs[field.name] ?? '')}
                    onChange={(e) =>
                      setEditedArgs((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                ) : typeof field.value === 'number' ? (
                  <input
                    id={`arg-${field.name}`}
                    type="number"
                    className="edit-input"
                    value={Number(editedArgs[field.name] ?? field.value)}
                    onChange={(e) =>
                      setEditedArgs((prev) => ({ ...prev, [field.name]: Number(e.target.value) }))
                    }
                  />
                ) : typeof field.value === 'boolean' ? (
                  <label className="edit-checkbox">
                    <input
                      id={`arg-${field.name}`}
                      type="checkbox"
                      checked={Boolean(editedArgs[field.name])}
                      onChange={(e) =>
                        setEditedArgs((prev) => ({ ...prev, [field.name]: e.target.checked }))
                      }
                    />
                    {String(editedArgs[field.name])}
                  </label>
                ) : (
                  <textarea
                    id={`arg-${field.name}`}
                    className="edit-textarea"
                    rows={3}
                    value={
                      typeof editedArgs[field.name] === 'object'
                        ? JSON.stringify(editedArgs[field.name], null, 2)
                        : String(editedArgs[field.name] ?? JSON.stringify(field.value))
                    }
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value)
                        setEditedArgs((prev) => ({ ...prev, [field.name]: parsed }))
                      } catch {
                        setEditedArgs((prev) => ({ ...prev, [field.name]: e.target.value }))
                      }
                    }}
                  />
                )}
              </div>
            ))}
            <div className="edit-reason">
              <label className="edit-label" htmlFor="approval-reason">
                Reason for edit (optional)
              </label>
              <input
                id="approval-reason"
                className="edit-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you modifying these arguments?"
              />
            </div>
          </div>
        )}

        {/* Snapshot timeline */}
        {mode === 'view' && <SnapshotPanel snapshot={snapshot} />}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <SuggestionCard
            suggestions={suggestions}
            onAccept={async (id) => {
              if (!onSuggestionAccept) return
              await onSuggestionAccept(id)
            }}
            onDismiss={async (id) => {
              if (!onSuggestionDismiss) return
              await onSuggestionDismiss(id)
            }}
          />
        )}

        {/* Actions */}
        <div className="modal-actions">
          {mode === 'view' ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleEdit}
                disabled={isMaxIterations}
                title={isMaxIterations ? 'Max iterations reached' : 'Edit and resubmit'}
              >
                <Edit2 size={14} />
                Edit
              </button>
              <button
                className="btn btn-primary"
                onClick={handleApprove}
                disabled={submitting}
              >
                <Check size={14} />
                Approve
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setMode('view')}
                disabled={submitting}
              >
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmitEdit}
                disabled={submitting}
              >
                Submit for Re-approval
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .approval-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 24px;
        }
        .approval-modal {
          background: var(--bg, #fff);
          border-radius: 12px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
        }
        .modal-header {
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border, #e5e7eb);
          position: relative;
        }
        .modal-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .modal-warning-icon {
          color: #f59e0b;
          flex-shrink: 0;
        }
        .modal-title {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--text-primary, #111827);
        }
        .modal-iteration {
          margin-left: auto;
          font-size: 12px;
          background: var(--border, #e5e7eb);
          padding: 2px 8px;
          border-radius: 999px;
          color: var(--text-muted, #6b7280);
        }
        .modal-max-warn {
          margin: 8px 0 0;
          font-size: 13px;
          color: #dc2626;
          background: #fef2f2;
          border-radius: 6px;
          padding: 8px 12px;
        }
        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted, #6b7280);
          padding: 4px;
          border-radius: 4px;
        }
        .modal-close:hover {
          background: var(--border, #e5e7eb);
        }
        .modal-summary {
          padding: 16px 24px;
          background: var(--accent, #f3f4f6);
          border-bottom: 1px solid var(--border, #e5e7eb);
        }
        .summary-text {
          margin: 0;
          font-size: 15px;
          line-height: 1.5;
          color: var(--text-primary, #111827);
        }
        .modal-fields {
          padding: 16px 24px;
          border-bottom: 1px solid var(--border, #e5e7eb);
        }
        .fields-heading,
        .edit-heading {
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #6b7280);
          margin: 0 0 12px;
        }
        .fields-table {
          width: 100%;
          border-collapse: collapse;
        }
        .field-row td {
          padding: 6px 0;
          font-size: 14px;
          vertical-align: top;
        }
        .field-label {
          color: var(--text-muted, #6b7280);
          width: 120px;
          padding-right: 16px !important;
        }
        .field-value {
          color: var(--text-primary, #111827);
          font-family: monospace;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .modal-edit {
          padding: 16px 24px;
          border-bottom: 1px solid var(--border, #e5e7eb);
        }
        .edit-note {
          font-size: 13px;
          color: var(--text-muted, #6b7280);
          margin: 0 0 16px;
        }
        .edit-field {
          margin-bottom: 12px;
        }
        .edit-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary, #111827);
          margin-bottom: 4px;
        }
        .edit-input,
        .edit-textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 6px;
          font-size: 14px;
          background: var(--bg, #fff);
          color: var(--text-primary, #111827);
          box-sizing: border-box;
          font-family: inherit;
        }
        .edit-textarea {
          resize: vertical;
          min-height: 80px;
        }
        .edit-reason {
          margin-top: 16px;
        }
        .edit-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          cursor: pointer;
        }
        .snapshot-panel {
          border-bottom: 1px solid var(--border, #e5e7eb);
        }
        .snapshot-empty {
          padding: 16px 24px;
          color: var(--text-muted, #6b7280);
          font-size: 14px;
        }
        .snapshot-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 24px 8px;
        }
        .snapshot-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #6b7280);
        }
        .snapshot-count {
          font-size: 12px;
          color: var(--text-muted, #6b7280);
        }
        .snapshot-timeline {
          max-height: 200px;
          overflow-y: auto;
          padding: 0 24px 12px;
        }
        .snapshot-entry {
          display: grid;
          grid-template-columns: 40px 90px 1fr auto;
          gap: 8px;
          align-items: start;
          padding: 4px 0;
          font-size: 12px;
          border-bottom: 1px solid var(--border, #f3f4f6);
        }
        .snapshot-entry:last-child {
          border-bottom: none;
        }
        .snapshot-seq {
          color: var(--text-muted, #6b7280);
          font-family: monospace;
        }
        .snapshot-type {
          color: var(--text-muted, #6b7280);
          text-transform: lowercase;
        }
        .snapshot-summary {
          color: var(--text-primary, #111827);
          line-height: 1.4;
        }
        .snapshot-time {
          color: var(--text-muted, #6b7280);
          white-space: nowrap;
        }
        .modal-actions {
          padding: 16px 24px;
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: opacity 0.15s;
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-primary {
          background: #2563eb;
          color: #fff;
          border-color: #2563eb;
        }
        .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .btn-secondary {
          background: var(--bg, #fff);
          color: var(--text-primary, #111827);
          border-color: var(--border, #d1d5db);
        }
        .btn-secondary:hover:not(:disabled) {
          background: var(--accent, #f3f4f6);
        }
      `}</style>
    </div>
  )
}
