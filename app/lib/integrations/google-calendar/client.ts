/**
 * Google Calendar API Client — OAuth token management and REST API wrapper.
 * Uses the generic credentials table with provider = 'google-calendar'.
 */

import { getCredential, saveCredential } from '@/lib/db/queries'
import { encrypt, decrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'
import type { CalendarCredentials, EventsListResult, FreeBusyResult, CalendarEvent, CreateEventParams, UpdateEventParams } from './types'

// ---------------------------------------------------------------------------
// OAuth Configuration
// ---------------------------------------------------------------------------

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

// Proactively refresh when within 10 minutes of expiry
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

// ---------------------------------------------------------------------------
// OAuth Token Management
// ---------------------------------------------------------------------------

/**
 * Exchange authorization code for Google Calendar tokens.
 */
export async function exchangeCodeForGoogleCalendarTokens(
  code: string,
  redirectUri: string
): Promise<CalendarCredentials> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set')
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar token exchange failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    token_type: json.token_type,
  }
}

/**
 * Refresh an expired Google Calendar access token.
 */
export async function refreshGoogleCalendarAccessToken(
  refreshToken: string
): Promise<CalendarCredentials> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set')
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar token refresh failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refreshToken,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    token_type: json.token_type,
  }
}

/**
 * Get a valid Google Calendar access token for a user.
 * Proactively refreshes if within TOKEN_REFRESH_BUFFER_MS of expiry.
 */
export async function getGoogleCalendarAccessToken(
  userId: string
): Promise<string | null> {
  const cred = await getCredential(userId, 'google-calendar')
  if (!cred) return null

  let tokens: CalendarCredentials
  try {
    tokens = JSON.parse(decrypt(cred.encrypted_token))
  } catch {
    return null
  }

  // Proactively refresh if expiring soon
  const expiresAtMs = new Date(tokens.expires_at).getTime()
  if (expiresAtMs < Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    if (!tokens.refresh_token) return null
    try {
      tokens = await refreshGoogleCalendarAccessToken(tokens.refresh_token)
      const encrypted = encrypt(JSON.stringify(tokens))
      await saveCredential(
        cred.id,
        userId,
        'google-calendar',
        encrypted,
        new Date(tokens.expires_at)
      )
    } catch {
      return null
    }
  }

  return tokens.access_token
}

/**
 * Store Google Calendar tokens for a user.
 */
export async function saveGoogleCalendarTokensForUser(
  userId: string,
  tokens: CalendarCredentials
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens))
  await saveCredential(nanoid(), userId, 'google-calendar', encrypted, new Date(tokens.expires_at))
}

/**
 * Check if a user has connected Google Calendar.
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const token = await getGoogleCalendarAccessToken(userId)
  return token !== null
}

// ---------------------------------------------------------------------------
// Calendar API Calls
// ---------------------------------------------------------------------------

async function calendarFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * List events from Google Calendar within a date range.
 */
export async function listCalendarEvents(
  accessToken: string,
  params: {
    timeMin?: string // ISO date string
    timeMax?: string // ISO date string
    maxResults?: number
    pageToken?: string
  } = {}
): Promise<EventsListResult> {
  const { timeMin, timeMax, maxResults = 100, pageToken } = params

  const queryParams = new URLSearchParams()
  if (timeMin) queryParams.set('timeMin', timeMin)
  if (timeMax) queryParams.set('timeMax', timeMax)
  queryParams.set('maxResults', String(maxResults))
  if (pageToken) queryParams.set('pageToken', pageToken)

  const res = await calendarFetch(`/calendars/primary/events?${queryParams.toString()}`, accessToken)

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`Google Calendar listEvents failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()

  return {
    events: (json.items ?? []).map((item: any) => ({
      id: item.id,
      summary: item.summary ?? '',
      description: item.description,
      start: item.start?.dateTime ?? item.start?.date ?? '',
      end: item.end?.dateTime ?? item.end?.date ?? '',
      location: item.location,
      attendees: (item.attendees ?? []).map((a: any) => a.email),
      organizer: item.organizer?.email,
      status: item.status,
      created: item.created,
      updated: item.updated,
    })),
    nextPageToken: json.nextPageToken,
    hasMore: !!json.nextPageToken,
  }
}

/**
 * Get a single calendar event by ID.
 */
export async function getCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<CalendarEvent> {
  const res = await calendarFetch(`/calendars/primary/events/${eventId}`, accessToken)

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`Google Calendar getEvent failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const item = await res.json()

  return {
    id: item.id,
    summary: item.summary ?? '',
    description: item.description,
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    location: item.location,
    attendees: (item.attendees ?? []).map((a: any) => a.email),
    organizer: item.organizer?.email,
    status: item.status,
    created: item.created,
    updated: item.updated,
  }
}

/**
 * Check free/busy for a set of email addresses.
 */
export async function getCalendarAvailability(
  accessToken: string,
  emails: string[],
  timeMin: string, // ISO date string
  timeMax: string // ISO date string
): Promise<FreeBusyResult[]> {
  const res = await calendarFetch('/calendars/primary/freeBusy', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: 'UTC',
      items: emails.map((email) => ({ id: email })),
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`Google Calendar freeBusy failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()

  return (json.calendars ?? {}).map((cal: any) => ({
    email: cal.id,
    busy: (cal.busy ?? []).map((b: any) => ({
      start: b.start,
      end: b.end,
    })),
  }))
}

/**
 * Create a calendar event.
 */
export async function createCalendarEvent(
  accessToken: string,
  params: CreateEventParams
): Promise<CalendarEvent> {
  const res = await calendarFetch('/calendars/primary/events', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: {
        dateTime: params.start,
        timeZone: 'UTC',
      },
      end: {
        dateTime: params.end,
        timeZone: 'UTC',
      },
      attendees: (params.attendees ?? []).map((email) => ({ email })),
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`Google Calendar createEvent failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const item = await res.json()

  return {
    id: item.id,
    summary: item.summary ?? '',
    description: item.description,
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    location: item.location,
    attendees: (item.attendees ?? []).map((a: any) => a.email),
    organizer: item.organizer?.email,
    status: item.status,
    created: item.created,
    updated: item.updated,
  }
}

/**
 * Update an existing calendar event.
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  params: UpdateEventParams
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {}
  if (params.summary !== undefined) body.summary = params.summary
  if (params.description !== undefined) body.description = params.description
  if (params.location !== undefined) body.location = params.location
  if (params.start !== undefined) {
    body.start = { dateTime: params.start, timeZone: 'UTC' }
  }
  if (params.end !== undefined) {
    body.end = { dateTime: params.end, timeZone: 'UTC' }
  }
  if (params.attendees !== undefined) {
    body.attendees = params.attendees.map((email) => ({ email }))
  }

  const res = await calendarFetch(`/calendars/primary/events/${eventId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`Google Calendar updateEvent failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const item = await res.json()

  return {
    id: item.id,
    summary: item.summary ?? '',
    description: item.description,
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    location: item.location,
    attendees: (item.attendees ?? []).map((a: any) => a.email),
    organizer: item.organizer?.email,
    status: item.status,
    created: item.created,
    updated: item.updated,
  }
}

/**
 * Delete (cancel) a calendar event.
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await calendarFetch(`/calendars/primary/events/${eventId}`, accessToken, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`Google Calendar deleteEvent failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }
}