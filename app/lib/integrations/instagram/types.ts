/**
 * Instagram Graph API types.
 * https://developers.facebook.com/docs/instagram-api
 */

export interface InstagramTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  instagramBusinessAccountId?: string
}

export interface InstagramUserProfile {
  id: string
  username: string
  name: string
  biography: string
  website: string
  followers_count: number
  follows_count: number
  media_count: number
  profile_picture_url: string
  business_discovery?: {
    followers_count: number
    follows_count: number
    media_count: number
  }
}

export interface InstagramMedia {
  id: string
  caption: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS'
  media_url: string
  thumbnail_url?: string
  permalink: string
  timestamp: string
  username: string
  children?: {
    data: Array<{ id: string; media_type: string; media_url: string; thumbnail_url?: string }>
  }
}

export interface InstagramMediaInsights {
  id: string
  caption: string
  media_type: string
  media_url: string
  permalink: string
  timestamp: string
  insights: {
    reach: number
    impressions: number
    engagement: number
    saved: number
    comments: number
    likes: number
  }
}

export interface InstagramStory {
  id: string
  media_type: 'IMAGE' | 'VIDEO'
  media_url: string
  permalink: string
  timestamp: string
  insights?: {
    impressions: number
    reach: number
    replies: number
    exits: number
  }
}

export interface InstagramPostResult {
  id: string
  caption: string
  media_type: string
  media_url: string
  permalink: string
  timestamp: string
}

export interface InstagramContainerStatus {
  id: string
  status: 'IN_PROGRESS' | 'FINISHED' | 'ERROR'
  error_message?: string
}

export interface InstagramPublishStatus {
  id: string
  permalink: string
}
