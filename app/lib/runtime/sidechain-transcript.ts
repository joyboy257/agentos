/**
 * Sidechain Transcript — one append-only JSONL file per task_id.
 *
 * Stored at: {dataDir}/sidechains/{task_id}.jsonl
 *
 * Sidechain transcripts are used for audit: Maria can inspect exactly what
 * any worker agent did. They are NOT passed to other workers (preserves isolation).
 * On worker completion the Team Lead summarizes the sidechain into its own session.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ulid } from 'ulid'
import { type ConversationMessage } from './session'

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
// SidechainTranscript
// ---------------------------------------------------------------------------

export class SidechainTranscript {
  private readonly _taskId: string
  private readonly _dataDir: string
  private readonly _path: string

  constructor(taskId: string, dataDir?: string) {
    this._taskId = taskId
    this._dataDir = dataDir ?? getDefaultDataDir()
    this._path = path.join(this._dataDir, 'sidechains', `${taskId}.jsonl`)
  }

  /** Absolute path to the sidechain JSONL file. */
  get path(): string {
    return this._path
  }

  /**
   * Append a single message record to the sidechain JSONL.
   * Uses atomic write (temp file + rename) to prevent corruption.
   */
  append(message: ConversationMessage): void {
    ensureDir(path.dirname(this._path))

    const record = { type: 'message' as const, task_id: this._taskId, message }
    const line = JSON.stringify(record) + '\n'
    const tmpPath = `${this._path}.tmp`

    if (fs.existsSync(tmpPath)) {
      const existing = fs.readFileSync(tmpPath, 'utf8')
      fs.writeFileSync(tmpPath, existing + line, 'utf8')
      fs.renameSync(tmpPath, this._path)
    } else if (fs.existsSync(this._path)) {
      fs.appendFileSync(this._path, line, 'utf8')
    } else {
      fs.writeFileSync(this._path, line, 'utf8')
    }
  }

  /**
   * Load all messages from the sidechain JSONL.
   * Returns empty array if the file does not exist.
   */
  load(): ConversationMessage[] {
    if (!fs.existsSync(this._path)) {
      return []
    }

    const messages: ConversationMessage[] = []
    const lines = fs.readFileSync(this._path, 'utf8').split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as { type: string; message?: ConversationMessage }
        if (record.type === 'message' && record.message) {
          messages.push(record.message)
        }
      } catch {
        // Skip malformed lines
      }
    }

    return messages
  }

  /**
   * Summarize this sidechain into a single assistant summary message.
   * Used when the Team Lead incorporates a worker's run into its session.
   */
  summarize(): ConversationMessage {
    const messages = this.load()
    const toolMessages = messages.filter(m => m.role === 'tool')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    const toolNames = toolMessages
      .flatMap(m => m.blocks)
      .filter(b => b.type === 'tool_result' && b.tool_name)
      .map(b => b.tool_name as string)

    const uniqueTools = [...new Set(toolNames)]
    const stepCount = assistantMessages.length

    const summaryText =
      `[Sidechain summary for task ${this._taskId}] ` +
      `${messages.length} total messages, ${stepCount} reasoning steps, ` +
      `tools used: ${uniqueTools.length > 0 ? uniqueTools.join(', ') : 'none'}.`

    return {
      role: 'assistant',
      blocks: [{ type: 'text', text: summaryText }],
    }
  }
}
