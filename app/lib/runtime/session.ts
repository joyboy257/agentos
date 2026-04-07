/**
 * Session — append-only JSONL transcript for an agent.
 *
 * Based on claw-code's session.rs patterns:
 * - Each agent has its own Session (persistent, append-only transcript)
 * - fork() creates a child session with new ULID, inherits messages, tracks lineage
 * - JSONL format for atomic append-only persistence
 * - dataDir defaults to ~/.agentos
 */

import { ulid } from 'ulid'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: string
  tool_use_id?: string
  tool_name?: string
  output?: string
  is_error?: boolean
}

export interface ConversationMessage {
  role: MessageRole
  blocks: ContentBlock[]
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export interface SessionCompaction {
  count: number
  removed_message_count: number
  summary: string
}

export interface SessionFork {
  parent_session_id: string
  branch_name?: string
}

// JSONL record types
type SessionMetaRecord = {
  type: 'session_meta'
  version: number
  session_id: string
  created_at_ms: number
  updated_at_ms: number
  parent_session_id?: string
  branch_name?: string
}

type MessageRecord = {
  type: 'message'
  message: ConversationMessage
}

type CompactionRecord = {
  type: 'compaction'
  count: number
  removed_message_count: number
  summary: string
}

type JSONLRecord = SessionMetaRecord | MessageRecord | CompactionRecord

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultDataDir(): string {
  return process.env['AGENTOS_DATA_DIR'] || path.join(os.homedir(), '.agentos')
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export class Session {
  version = 1
  session_id: string
  created_at_ms: number
  updated_at_ms: number
  messages: ConversationMessage[] = []
  compaction?: SessionCompaction
  forkInfo?: SessionFork
  private persistencePath?: string
  private _dataDir?: string

  constructor() {
    const now = Date.now()
    this.session_id = `sess-${ulid()}`
    this.created_at_ms = now
    this.updated_at_ms = now
  }

  /**
   * Configure this session to persist JSONL at the given directory.
   * The session file will be `{dataDir}/sessions/{session_id}.jsonl`.
   */
  static withPersistencePath(dataDir: string): Session {
    const session = new Session()
    session._dataDir = dataDir
    session.persistencePath = path.join(dataDir, 'sessions', `${session.session_id}.jsonl`)
    return session
  }

  private _getOrCreatePersistencePath(): string | undefined {
    if (this.persistencePath) return this.persistencePath
    if (!this._dataDir) {
      const dataDir = getDefaultDataDir()
      this._dataDir = dataDir
    }
    this.persistencePath = path.join(this._dataDir, 'sessions', `${this.session_id}.jsonl`)
    return this.persistencePath
  }

  /**
   * fork() creates a new Session with a fresh ULID, copies all messages,
   * and records lineage via parent_session_id and optional branch_name.
   */
  fork(branchName?: string): Session {
    const now = Date.now()
    const forked = new Session()
    forked.session_id = `sess-${ulid()}`
    forked.created_at_ms = now
    forked.updated_at_ms = now
    forked.messages = this.messages.map(m => ({
      ...m,
      blocks: m.blocks.map(b => ({ ...b })),
    }))
    forked.compaction = this.compaction
    forked.forkInfo = {
      parent_session_id: this.session_id,
      branch_name: branchName?.trim() || undefined,
    }
    return forked
  }

  // ---------------------------------------------------------------------------
  // Message mutators
  // ---------------------------------------------------------------------------

  pushMessage(message: ConversationMessage): void {
    this.messages.push(message)
    this.updated_at_ms = Date.now()
    const filePath = this._getOrCreatePersistencePath()
    if (filePath) {
      this._appendJSONL({ type: 'message', message })
    }
  }

  pushUserText(text: string): void {
    this.pushMessage({ role: 'user', blocks: [{ type: 'text', text }] })
  }

  pushAssistantText(text: string, blocks?: ContentBlock[]): void {
    const messageBlocks: ContentBlock[] = blocks ?? [{ type: 'text', text }]
    this.pushMessage({ role: 'assistant', blocks: messageBlocks })
  }

  pushToolResult(
    toolUseId: string,
    toolName: string,
    output: string,
    isError?: boolean
  ): void {
    this.pushMessage({
      role: 'tool',
      blocks: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          tool_name: toolName,
          output,
          is_error: isError ?? false,
        },
      ],
    })
  }

  recordCompaction(summary: string, removedMessageCount: number): void {
    this.compaction = {
      count: this.messages.length,
      removed_message_count: removedMessageCount,
      summary,
    }
    this.updated_at_ms = Date.now()
    const filePath = this._getOrCreatePersistencePath()
    if (filePath) {
      this._appendJSONL({
        type: 'compaction',
        count: this.messages.length,
        removed_message_count: removedMessageCount,
        summary,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Atomic save: writes session meta + all messages + compaction to a temp file,
   * then renames to target path. Safe against partial writes.
   */
  save(): void {
    const filePath = this._getOrCreatePersistencePath()
    if (!filePath) return

    const dir = path.dirname(filePath)
    ensureDir(dir)

    const meta: SessionMetaRecord = {
      type: 'session_meta',
      version: this.version,
      session_id: this.session_id,
      created_at_ms: this.created_at_ms,
      updated_at_ms: this.updated_at_ms,
      ...(this.forkInfo
        ? {
            parent_session_id: this.forkInfo.parent_session_id,
            branch_name: this.forkInfo.branch_name,
          }
        : {}),
    }

    const lines: string[] = [
      JSON.stringify(meta),
      ...this.messages.map((m): MessageRecord => ({ type: 'message', message: m })).map((r) => JSON.stringify(r)),
    ]

    if (this.compaction) {
      lines.push(
        JSON.stringify({
          type: 'compaction',
          count: this.compaction.count,
          removed_message_count: this.compaction.removed_message_count,
          summary: this.compaction.summary,
        })
      )
    }

    const tmpPath = `${filePath}.tmp`
    fs.writeFileSync(tmpPath, lines.join('\n') + '\n', 'utf8')
    fs.renameSync(tmpPath, filePath)
  }

  /**
   * Load a session from its JSONL file.
   */
  static load(dataDir: string, sessionId: string): Session {
    const filePath = path.join(dataDir, 'sessions', `${sessionId}.jsonl`)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId} at ${filePath}`)
    }

    const session = new Session()
    session._dataDir = dataDir
    session.persistencePath = filePath
    session.session_id = sessionId
    session.messages = []
    session.compaction = undefined
    session.forkInfo = undefined

    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim())
    for (const line of lines) {
      const record: JSONLRecord = JSON.parse(line)
      switch (record.type) {
        case 'session_meta':
          session.version = record.version
          session.session_id = record.session_id
          session.created_at_ms = record.created_at_ms
          session.updated_at_ms = record.updated_at_ms
          if (record.parent_session_id) {
            session.forkInfo = {
              parent_session_id: record.parent_session_id,
              branch_name: record.branch_name,
            }
          }
          break
        case 'message':
          session.messages.push(record.message)
          break
        case 'compaction':
          session.compaction = {
            count: record.count,
            removed_message_count: record.removed_message_count,
            summary: record.summary,
          }
          break
      }
    }

    session.updated_at_ms = Date.now()
    return session
  }

  toJSON(): object {
    return {
      version: this.version,
      session_id: this.session_id,
      created_at_ms: this.created_at_ms,
      updated_at_ms: this.updated_at_ms,
      messages: this.messages,
      compaction: this.compaction,
      fork: this.forkInfo,
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _appendJSONL(record: MessageRecord | CompactionRecord): void {
    const filePath = this._getOrCreatePersistencePath()
    if (!filePath) return

    const dir = path.dirname(filePath)
    ensureDir(dir)

    const tmpPath = `${filePath}.tmp`
    const line = JSON.stringify(record) + '\n'

    // If tmp exists, we do an atomic append: read existing + append, then rename
    if (fs.existsSync(tmpPath)) {
      const existing = fs.readFileSync(tmpPath, 'utf8')
      fs.writeFileSync(tmpPath, existing + line, 'utf8')
      fs.renameSync(tmpPath, filePath)
    } else if (fs.existsSync(filePath)) {
      // Append to existing file directly (safe: we only ever append full JSON lines)
      fs.appendFileSync(filePath, line, 'utf8')
    } else {
      // Brand new file
      fs.writeFileSync(filePath, line, 'utf8')
    }
  }
}
