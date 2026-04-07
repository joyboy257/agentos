/**
 * Google Calendar API Types
 */

export interface CalendarCredentials {
  access_token: string
  refresh_token?: string
  expires_at: string // ISO date string
  token_type: string
}

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: string // ISO date string
  end: string // ISO date string
  location?: string
  attendees?: string[]
  organizer?: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  created?: string
  updated?: string
}

export interface EventsListResult {
  events: CalendarEvent[]
  nextPageToken?: string
  hasMore: boolean
}

export interface FreeBusyResult {
  email: string
  busy: Array<{ start: string; end: string }>
}

export interface AvailabilityResult {
  availabilities: FreeBusyResult[]
}

export interface CreateEventParams {
  summary: string
  description?: string
  start: string // ISO date string
  end: string // ISO date string
  location?: string
  attendees?: string[]
}

export interface UpdateEventParams {
  summary?: string
  description?: string
  start?: string
  end?: string
  location?: string
  attendees?: string[]
}