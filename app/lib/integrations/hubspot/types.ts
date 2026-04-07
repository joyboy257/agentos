/**
 * HubSpot types for CRM objects.
 */

export interface HubSpotTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
}

export interface HubSpotContact {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    phone?: string
    company?: string
    createdate?: string
    lastmodifieddate?: string
    lifecyclestage?: string
  }
}

export interface HubSpotCompany {
  id: string
  properties: {
    name?: string
    domain?: string
    phone?: string
    address?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    createdate?: string
    lastmodifieddate?: string
  }
}

export interface HubSpotDeal {
  id: string
  properties: {
    dealname?: string
    amount?: string
    dealstage?: string
    closedate?: string
    createdate?: string
    hs_lastmodifieddate?: string
    pipeline?: string
    hs_deal_stage_probability?: string
    description?: string
  }
}

export interface HubSpotTicket {
  id: string
  properties: {
    subject?: string
    content?: string
    hs_ticket_priority?: string
    hs_pipeline?: string
    hs_ticket_state?: string
    createdate?: string
    hs_lastmodifieddate?: string
  }
}

export interface HubSpotNote {
  id: string
  properties: {
    hs_note_body?: string
    createdate?: string
    hs_lastmodifieddate?: string
    hs_timestamp?: string
  }
  associations?: {
    contacts?: string[]
    companies?: string[]
    deals?: string[]
  }
}

export interface HubSpotSearchResult<T> {
  results: T[]
  hasMore: boolean
  after?: string
  total?: number
}
