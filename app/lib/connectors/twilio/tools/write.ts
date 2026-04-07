/**
 * Twilio write tools — SMS sending requires 'needs_approval'.
 */

import { sendSms } from '@/lib/integrations/twilio/client'

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface TwilioWriteTool {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'needs_approval'
  execute(args: Record<string, unknown>, context: { userId: string }): Promise<ToolResult>
}

export const twilioWriteTools: TwilioWriteTool[] = [
  // ── twilio.sms.send ────────────────────────────────────────────────────────
  {
    id: 'twilio.sms.send',
    description: 'Send an SMS message to a phone number. Provide the recipient phone number (E.164 format preferred) and message body.',
    triggers: [
      'send sms',
      'send text message',
      'text message',
      'twilio sms',
      'sms to',
      'text to',
      'send a text',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient phone number (E.164 format: +1234567890)' },
        body: { type: 'string', description: 'SMS message body' },
      },
      required: ['to', 'body'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        sid: { type: 'string' },
        status: { type: 'string' },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const to = args.to as string
      const body = args.body as string

      const result = await sendSms(to, body)

      if (result.success) {
        return {
          success: true,
          data: { sid: result.sid, status: result.status, to: result.to },
        }
      } else {
        return {
          success: false,
          data: null,
          error: `Twilio SMS failed: ${result.errorCode} — ${result.errorMessage}`,
        }
      }
    },
  },
]