/**
 * Twilio types for SMS notifications.
 */

export interface TwilioSmsMessage {
  sid: string
  to: string
  from: string
  body: string
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed'
  dateCreated: string
  dateSent?: string
  errorCode?: string
  errorMessage?: string
}

export interface TwilioSmsResult {
  success: boolean
  sid?: string
  status?: string
  to?: string
  errorCode?: string
  errorMessage?: string
}
