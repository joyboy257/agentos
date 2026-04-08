/**
 * Instagram Graph API Client.
 * https://developers.facebook.com/docs/instagram-api
 *
 * Uses Instagram Basic Display API / Instagram Graph API.
 * Requires Facebook Developer App with Instagram Basic Display or
 * Instagram Graph API permissions.
 */

import type {
  InstagramTokens,
  InstagramUserProfile,
  InstagramMedia,
  InstagramMediaInsights,
  InstagramPostResult,
  InstagramContainerStatus,
} from './types'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const INSTAGRAM_API_BASE = 'https://graph.facebook.com/v19.0'
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token'

// Timeout for API calls (30 seconds)
const INSTAGRAM_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function instagramFetch(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
  options: RequestInit = {}
): Promise<Response> {
  let url = path.startsWith('http') ? path : `${INSTAGRAM_API_BASE}${path}`

  const query = new URLSearchParams({ access_token: accessToken })
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      query.set(k, v)
    }
  }
  url = `${url}${url.includes('?') ? '&' : '?'}${query.toString()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), INSTAGRAM_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

async function instagramPost(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  body: Record<string, unknown>
): Promise<Response> {
  return instagramFetch(path, accessToken, params, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// OAuth Token Management
// ---------------------------------------------------------------------------

/**
 * Exchange authorization code for Instagram/Meta tokens.
 * Handles both Instagram Basic Display API and Instagram Graph API tokens.
 */
export async function exchangeCodeForInstagramTokens(
  code: string,
  redirectUri: string
): Promise<InstagramTokens> {
  const clientId = process.env.INSTAGRAM_CLIENT_ID
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET must be set')
  }

  // Step 1: Exchange code for long-lived access token via Instagram OAuth
  const res = await fetch(INSTAGRAM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Instagram token exchange failed: ${res.status} ${text}`)
  }

  const json = await res.json()

  // json.user_id is the Instagram Business Account ID (or Facebook User ID for basic display)
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}

/**
 * Get long-lived access token from short-lived token (Instagram Basic Display).
 */
export async function getLongLivedInstagramToken(
  shortLivedToken: string
): Promise<InstagramTokens> {
  const clientId = process.env.INSTAGRAM_CLIENT_ID
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET must be set')
  }

  const res = await fetch(
    `${FACEBOOK_TOKEN_URL}?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Instagram long-lived token exchange failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}

/**
 * Refresh an Instagram access token (long-lived tokens can be refreshed).
 */
export async function refreshInstagramAccessToken(
  accessToken: string
): Promise<InstagramTokens> {
  const clientId = process.env.INSTAGRAM_CLIENT_ID
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET must be set')
  }

  const res = await fetch(
    `${FACEBOOK_TOKEN_URL}?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${accessToken}`
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Instagram token refresh failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}

/**
 * Get the Instagram Business Account ID for a user.
 * Requires pages_read_engagement scope.
 */
export async function getInstagramBusinessAccountId(
  accessToken: string
): Promise<string> {
  // Get Facebook pages
  const res = await instagramFetch('/me/accounts', accessToken)
  if (!res.ok) {
    throw Object.assign(
      new Error(`Failed to get Facebook pages: ${res.status}`),
      { status: res.status }
    )
  }

  const json = await res.json()
  const pages = json.data ?? []

  if (!pages.length) {
    throw new Error('No Facebook pages found. Connect a Facebook Page linked to your Instagram Business account.')
  }

  // Get Instagram business account for the first page
  const page = pages[0]
  const igRes = await instagramFetch(`/${page.id}`, accessToken, {
    fields: 'instagram_business_account',
  })

  if (!igRes.ok) {
    throw Object.assign(
      new Error(`Failed to get Instagram business account: ${igRes.status}`),
      { status: igRes.status }
    )
  }

  const igJson = await igRes.json()
  if (!igJson.instagram_business_account) {
    throw new Error('No Instagram Business account linked to this Facebook Page.')
  }

  return igJson.instagram_business_account.id
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

/**
 * Get the Instagram Business profile.
 * Requires instagram_basic + pages_read_engagement scopes.
 */
export async function getUserProfile(
  accessToken: string,
  instagramBusinessAccountId: string
): Promise<InstagramUserProfile> {
  const fields = [
    'id',
    'username',
    'name',
    'biography',
    'website',
    'followers_count',
    'follows_count',
    'media_count',
    'profile_picture_url',
    'business_discovery.username({username}){followers_count,follows_count,media_count}',
  ].join(',')

  const res = await instagramFetch(
    `/${instagramBusinessAccountId}`,
    accessToken,
    { fields }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram getUserProfile failed: ${res.status}`),
      { status: res.status, body: error }
    )
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * Get recent media posts from the Instagram Business account.
 * Requires instagram_basic scope.
 */
export async function getMedia(
  accessToken: string,
  instagramBusinessAccountId: string,
  options: {
    limit?: number
    after?: string
  } = {}
): Promise<{ media: InstagramMedia[]; hasMore: boolean; after?: string }> {
  const { limit = 25, after } = options

  const params: Record<string, string> = { limit: String(limit) }
  if (after) params.after = after

  const fields = [
    'id',
    'caption',
    'media_type',
    'media_url',
    'thumbnail_url',
    'permalink',
    'timestamp',
    'username',
    'children{id,media_type,media_url,thumbnail_url}',
  ].join(',')

  const res = await instagramFetch(
    `/${instagramBusinessAccountId}/media`,
    accessToken,
    { ...params, fields }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram getMedia failed: ${res.status}`),
      { status: res.status, body: error }
    )
  }

  const json = await res.json()
  return {
    media: json.data ?? [],
    hasMore: json.paging?.cursors?.after != null,
    after: json.paging?.cursors?.after,
  }
}

/**
 * Get insights for a specific media post.
 * Requires instagram_insights scope (available on Business accounts).
 */
export async function getInsights(
  accessToken: string,
  instagramBusinessAccountId: string,
  mediaId: string
): Promise<InstagramMediaInsights> {
  void instagramBusinessAccountId // not needed for single media insights

  // First get the media item
  const mediaRes = await instagramFetch(
    `/${mediaId}`,
    accessToken,
    { fields: 'id,caption,media_type,media_url,permalink,timestamp,username' }
  )

  if (!mediaRes.ok) {
    const error = await mediaRes.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram getMedia failed: ${mediaRes.status}`),
      { status: mediaRes.status, body: error }
    )
  }

  const mediaJson = await mediaRes.json()

  // Get insights (only available for stories and feed posts on Business accounts)
  let insightsData: InstagramMediaInsights['insights'] = {
    reach: 0,
    impressions: 0,
    engagement: 0,
    saved: 0,
    comments: 0,
    likes: 0,
  }

  try {
    const insightsRes = await instagramFetch(
      `/${mediaId}/insights`,
      accessToken,
      { metric: 'reach,impressions,engagement,saved,comments,likes' }
    )

    if (insightsRes.ok) {
      const insightsJson = await insightsRes.json()
      const metrics = insightsJson.data ?? []
      for (const m of metrics) {
        if (m.name === 'reach') insightsData.reach = m.values[0]?.value ?? 0
        if (m.name === 'impressions') insightsData.impressions = m.values[0]?.value ?? 0
        if (m.name === 'engagement') insightsData.engagement = m.values[0]?.value ?? 0
        if (m.name === 'saved') insightsData.saved = m.values[0]?.value ?? 0
        if (m.name === 'comments') insightsData.comments = m.values[0]?.value ?? 0
        if (m.name === 'likes') insightsData.likes = m.values[0]?.value ?? 0
      }
    }
  } catch {
    // Insights not available for this media type — return zeros
  }

  return {
    ...mediaJson,
    insights: insightsData,
  }
}

// ---------------------------------------------------------------------------
// Create Post (Image + Caption)
// ---------------------------------------------------------------------------

/**
 * Create an image post with caption.
 * Uses the Instagram Content Publishing API.
 *
 * Step 1: Create a media container (upload image URL or container)
 * Step 2: Publish the container
 *
 * Requires instagram_graph_api_quota_publish permission (approved during development).
 */
export async function createPost(
  accessToken: string,
  instagramBusinessAccountId: string,
  params: {
    imageUrl: string
    caption: string
    locationId?: string
    productTags?: Array<{ product_id: string; x: number; y: number }>
  }
): Promise<InstagramPostResult> {
  const { imageUrl, caption, locationId, productTags } = params

  // Step 1: Create media container
  const containerBody: Record<string, unknown> = {
    image_url: imageUrl,
    caption,
  }
  if (locationId) containerBody.location_id = locationId
  if (productTags) containerBody.product_tags = productTags

  const containerRes = await instagramPost(
    `/${instagramBusinessAccountId}/media`,
    accessToken,
    {},
    containerBody
  )

  if (!containerRes.ok) {
    const error = await containerRes.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram createPost container failed: ${containerRes.status}`),
      { status: containerRes.status, body: error }
    )
  }

  const containerJson = await containerRes.json()
  const creationId = containerJson.id as string

  // Step 2: Publish the container
  const publishRes = await instagramPost(
    `/${instagramBusinessAccountId}/media_publish`,
    accessToken,
    {},
    { creation_id: creationId }
  )

  if (!publishRes.ok) {
    const error = await publishRes.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram publishPost failed: ${publishRes.status}`),
      { status: publishRes.status, body: error }
    )
  }

  const publishJson = await publishRes.json()

  // Return published post details
  return {
    id: publishJson.id,
    caption,
    media_type: 'IMAGE',
    media_url: imageUrl,
    permalink: `https://www.instagram.com/p/${publishJson.id}/`,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Create a story (image or video).
 * Stories expire after 24 hours.
 */
export async function createStory(
  accessToken: string,
  instagramBusinessAccountId: string,
  params: {
    imageUrl: string
    videoUrl?: string
    caption?: string
  }
): Promise<{ id: string; permalink: string }> {
  const { imageUrl, videoUrl, caption } = params

  const storyBody: Record<string, unknown> = {
    image_url: imageUrl,
    share_to_feed: false,
  }
  if (videoUrl) {
    storyBody.video_url = videoUrl
  }
  if (caption) {
    storyBody.caption = caption
  }

  const res = await instagramPost(
    `/${instagramBusinessAccountId}/media`,
    accessToken,
    {},
    storyBody
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram createStory failed: ${res.status}`),
      { status: res.status, body: error }
    )
  }

  const json = await res.json()
  const creationId = json.id as string

  // Publish the story
  const publishRes = await instagramPost(
    `/${instagramBusinessAccountId}/media_publish`,
    accessToken,
    {},
    { creation_id: creationId }
  )

  if (!publishRes.ok) {
    const error = await publishRes.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram publishStory failed: ${publishRes.status}`),
      { status: publishRes.status, body: error }
    )
  }

  const publishJson = await publishRes.json()
  return {
    id: publishJson.id,
    permalink: `https://www.instagram.com/stories/${publishJson.id}/`,
  }
}

/**
 * Check the status of a media container (for async publishing).
 */
export async function getContainerStatus(
  accessToken: string,
  containerId: string
): Promise<InstagramContainerStatus> {
  const res = await instagramFetch(
    `/${containerId}`,
    accessToken,
    { fields: 'status,error_message' }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram getContainerStatus failed: ${res.status}`),
      { status: res.status, body: error }
    )
  }

  return res.json()
}

/**
 * Get the permalink for a published media item.
 */
export async function getMediaPermalink(
  accessToken: string,
  mediaId: string
): Promise<string> {
  const res = await instagramFetch(
    `/${mediaId}`,
    accessToken,
    { fields: 'permalink' }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(
      new Error(`Instagram getMediaPermalink failed: ${res.status}`),
      { status: res.status, body: error }
    )
  }

  const json = await res.json()
  return json.permalink
}
