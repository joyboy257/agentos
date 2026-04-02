# Plan: Connector Implementation — Drive, Slack, HubSpot

**Date:** 2026-04-02
**Type:** feat
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v5 — MVP Tool Integrations
**ARCHITECTURE Ref:** `docs/ARCHITECTURE-01-capability-registry.md`, `docs/ARCHITECTURE-02-mcp-client.md`

---

## 1. Context

Perplexity Computer has 400+ app connectors. AgentOS MVP ships with Gmail only (read + send). The three most impactful missing connectors for the Maria persona are:

| Connector | Why Maria Needs It | Priority |
|---|---|---|
| **Google Drive** | Agents read/write her business documents, spreadsheets, and shared files | P0 — MVP |
| **Slack** | Internal team notifications and alerts | P1 — Phase 2 |
| **HubSpot** | Lead management and CRM data | P1 — Phase 2 |

The MCP client infrastructure exists (`app/lib/mcp/mcp-client.ts`) — OAuth flow, token refresh, manifest caching, and tool mapping are architected. Each connector needs: OAuth connection UI, per-connector tool exposure, and capability registry entries wired to the MCP client.

This plan covers all three connectors.

---

## 2. Architecture

### 2.1 Connector Architecture (Existing)

```
┌─────────────────────────────────────────────────────┐
│                 AgentOS                             │
│                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐  │
│  │ Capability  │───▶│   MCP Client             │  │
│  │ Registry    │    │   mcp-client.ts          │  │
│  │             │    │   ──────────────────     │  │
│  │ email:read  │    │   • OAuth handshake      │  │
│  │ email:send  │    │   • Token refresh        │  │
│  │ slack:post  │    │   • Manifest caching     │  │
│  │ drive:read  │    │   • Tool name mapping    │  │
│  │ hubspot:*   │    │   • Audit logging       │  │
│  └─────────────┘    └──────────┬───────────────┘  │
│                                │                   │
│                    ┌──────────▼───────────┐       │
│                    │   MCP Server         │       │
│                    │   (Zapier / n8n)     │       │
│                    │   4000+ tools        │       │
│                    └──────────┬───────────┘       │
│                               │                   │
│              ┌────────────────┼────────────┐      │
│              │                │            │      │
│              ▼                ▼            ▼      │
│          Gmail          Google Drive   HubSpot     │
└─────────────────────────────────────────────────────┘
```

### 2.2 What Already Exists

| Component | File | Status |
|---|---|---|
| MCP Client core | `app/lib/mcp/mcp-client.ts` | ✅ Built |
| Token refresh | `app/lib/mcp/token-refresh.ts` | ✅ Built |
| Manifest caching | `app/lib/mcp/manifest-cache.ts` | ✅ Built |
| Tool mapper | `app/lib/mcp/tool-mapper.ts` | ✅ Built |
| Gmail OAuth | `app/lib/gmail/oauth.ts` | ✅ Built |
| Gmail client | `app/lib/gmail/client.ts` | ✅ Built |
| Gmail capability entries | `ARCHITECTURE-01` | ✅ Schema exists |
| Slack capability entries | `ARCHITECTURE-01` | ✅ Schema exists |
| Drive capability entries | `ARCHITECTURE-01` | ✅ Schema exists |
| HubSpot capability entries | `ARCHITECTURE-01` | ⚠️ Partial (leads only) |

### 2.3 What Needs to Be Built

For each connector:
1. **OAuth credentials** — API key, client ID/secret, or MCP server connection string
2. **Connector UI** — "Connect [App]" button + OAuth flow in the settings/connectors panel
3. **Capability wiring** — Register connector capabilities in the registry, map to MCP tools
4. **Tool implementation** — Wire MCP tool calls through `executeTool` middleware
5. **Test** — End-to-end OAuth + tool invocation test

---

## 3. Connector Prioritization

### P0 — Google Drive

**Why P0:** Maria works with spreadsheets and documents daily. Every Monday she cleans a CSV — that CSV lives in Drive. A Drive connector means the agent can read the CSV autonomously, write outputs to Drive, and share them — completing the full "Monday automation" loop Damian describes.

**Capabilities needed:**
- `drive:read` — list files, read file content
- `drive:write` — upload, update files
- `drive:find` — search by name, type, modified date

**OAuth:** Google OAuth 2.0 (same pattern as Gmail — `gmail/oauth.ts` is the reference implementation)

**MCP tool mapping:**
- `drive://files.list` → `drive:read`
- `drive://files.get` → `drive:read`
- `drive://files.create` → `drive:write`
- `drive://files.update` → `drive:write`

---

### P1 — Slack

**Why P1:** Maria's HVAC business uses Slack for team communication. When the agent escalates, it should DM Maria on Slack, not just send an email. Slack notifications are faster and more attention-grabbing than email for urgent escalations.

**Capabilities needed:**
- `slack:post` — post message to channel or DM
- `slack:conversations` — list channels (for routing)

**OAuth:** Slack OAuth 2.0 via MCP server

**MCP tool mapping:**
- `slack://chat.postMessage` → `slack:post`
- `slack://conversations.open` → `slack:post`

---

### P1 — HubSpot

**Why P1:** Maria's lead pipeline lives in HubSpot. Without it, the agent can only read emails. With HubSpot, it can pull leads, update deal stages, and create follow-up tasks — full CRM lifecycle management.

**Capabilities needed:**
- `hubspot:leads` — list and search leads
- `hubspot:deals` — read and update deals
- `hubspot:tasks` — create follow-up tasks

**OAuth:** HubSpot OAuth 2.0 via MCP server

**MCP tool mapping:**
- `hubspot://crm/objects/contacts.list` → `hubspot:leads`
- `hubspot://crm/objects/deals.list` → `hubspot:deals`
- `hubspot://crm/objects/tasks.create` → `hubspot:tasks`

---

## 4. Implementation Units

### Unit C1: Google Drive Connector

**Files:**
- `app/lib/connectors/drive/oauth.ts` — OAuth flow (reuse Gmail OAuth pattern)
- `app/lib/connectors/drive/client.ts` — Drive API client wrapper
- `app/lib/connectors/drive/tools.ts` — Tool definitions wired to MCP
- `app/app/components/connectors/DriveConnectorCard.tsx` — Settings UI for OAuth
- `app/lib/registry/connectors/drive.ts` — Capability registry entries
- `app/app/api/connectors/drive/callback/route.ts` — OAuth callback handler

**OAuth Flow:**
```
Maria clicks "Connect Google Drive"
    │
    ▼
Redirect to Google OAuth → /connectors/google/callback
    │
    ▼
Exchange code for tokens → save to db
    │
    ▼
"Connected! Agent can now read and write your Drive files."
```

**Tool implementation (partial — based on ARCHITECTURE-01 schema):**
```typescript
// app/lib/connectors/drive/tools.ts
export const driveTools = {
  'drive:read': {
    id: 'drive:read',
    description: 'Reads files from Google Drive. Supports listing, searching, and reading file content.',
    triggers: [
      'read my drive', 'open the spreadsheet', 'get the document',
      'what files do I have', 'find the sheet', 'load from drive',
    ],
    tools: ['drive://files.list', 'drive://files.get'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', semanticType: 'query' },
        mimeType: { type: 'string', description: 'Filter by MIME type' },
        maxResults: { type: 'number', default: 20 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              mimeType: { type: 'string' },
              modifiedTime: { type: 'string' },
              content: { type: 'string', description: 'File content if readable' },
            },
          },
        },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 2000,
  },

  'drive:write': {
    id: 'drive:write',
    description: 'Creates or updates files in Google Drive.',
    triggers: [
      'save to drive', 'upload to drive', 'write to google drive',
      'put this in my drive', 'create a google doc',
    ],
    tools: ['drive://files.create', 'drive://files.update'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name' },
        mimeType: { type: 'string', description: 'MIME type (defaults to text/plain)' },
        content: { type: 'string', description: 'File content' },
        parentId: { type: 'string', description: 'Folder ID to save in' },
      },
      required: ['name', 'content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string' },
        name: { type: 'string' },
        webViewLink: { type: 'string' },
      },
    },
    approvalConfig: { approverType: 'user', timeoutSeconds: 120, fallback: 'skip' },
    estimatedDurationMs: 3000,
  },
};
```

**Test scenarios:**
- Maria connects Drive → OAuth completes → token stored
- Agent reads a CSV from Drive, processes it, writes output to Drive folder
- Agent creates a Google Doc from processed results and shares the link

---

### Unit C2: Slack Connector

**Files:**
- `app/lib/connectors/slack/tools.ts` — Tool definitions
- `app/app/components/connectors/SlackConnectorCard.tsx` — Settings UI
- `app/app/api/connectors/slack/callback/route.ts` — OAuth callback
- `app/lib/registry/connectors/slack.ts` — Capability registry entries

**OAuth Flow:** Slack's OAuth 2.0 via MCP server. The MCP server handles the Slack-specific OAuth dance; AgentOS stores the connection string.

**Tool implementation (partial — from ARCHITECTURE-01):**
```typescript
// app/lib/connectors/slack/tools.ts
export const slackTools = {
  'slack:post': {
    id: 'slack:post',
    description: 'Posts a message to a Slack channel or DM. Visible to external parties — requires approval.',
    triggers: [
      'post to slack', 'send a slack message', 'message on slack',
      'ping on slack', 'notify the team', 'dm me on slack',
    ],
    tools: ['slack://chat.postMessage', 'slack://conversations.open'],
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', semanticType: 'channelRef' },
        text: { type: 'string', semanticType: 'messageBody' },
        threadTs: { type: 'string', description: 'Thread timestamp to reply in' },
      },
      required: ['channel', 'text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ts: { type: 'string', description: 'Message timestamp' },
        channel: { type: 'string' },
      },
    },
    approvalConfig: { approverType: 'user', timeoutSeconds: 300, fallback: 'abort' },
    estimatedDurationMs: 2000,
  },
};
```

**Test scenarios:**
- Escalation notification posts to Maria's Slack DM instead of email
- Agent posts a summary to #general after completing a task
- Agent DMs a team member when their task is ready for review

---

### Unit C3: HubSpot Connector

**Files:**
- `app/lib/connectors/hubspot/tools.ts` — Tool definitions
- `app/app/components/connectors/HubSpotConnectorCard.tsx` — Settings UI
- `app/app/api/connectors/hubspot/callback/route.ts` — OAuth callback
- `app/lib/registry/connectors/hubspot.ts` — Capability registry entries

**OAuth Flow:** HubSpot OAuth 2.0 via MCP server.

**Tool implementation (partial — expand ARCHITECTURE-01 partial entry):**
```typescript
// app/lib/connectors/hubspot/tools.ts
export const hubspotTools = {
  'hubspot:leads': {
    id: 'hubspot:leads',
    description: 'Retrieves contacts and leads from HubSpot CRM. Supports filtering by lifecycle stage, created date, and custom properties.',
    triggers: [
      'get my leads', 'pull hubspot leads', 'show me the crm',
      'new leads in hubspot', 'hubspot contacts', 'who are my leads',
    ],
    tools: ['hubspot://crm/objects/contacts.list'],
    inputSchema: {
      type: 'object',
      properties: {
        lifecycleStage: { type: 'string', enum: ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer'] },
        limit: { type: 'number', default: 50 },
        properties: { type: 'array', items: { type: 'string' }, description: 'Contact properties to include' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string', semanticType: 'emailAddress' },
              firstname: { type: 'string' },
              lastname: { type: 'string' },
              lifecyclestage: { type: 'string' },
              createdate: { type: 'string' },
            },
          },
        },
        total: { type: 'number' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 3000,
  },

  'hubspot:deals': {
    id: 'hubspot:deals',
    description: 'Retrieves and updates deals in HubSpot CRM.',
    triggers: [
      'get deals', 'update a deal', 'change deal stage',
      'hubspot deals', 'what deals are open',
    ],
    tools: ['hubspot://crm/objects/deals.list', 'hubspot://crm/objects/deals.update'],
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'update'] },
        dealId: { type: 'string', description: 'Required for update' },
        stage: { type: 'string', description: 'New stage name' },
        amount: { type: 'number', description: 'Deal amount' },
      },
      required: ['action'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deals: { type: 'array' },
        updated: { type: 'boolean' },
      },
    },
    approvalConfig: { approverType: 'user', timeoutSeconds: 300, fallback: 'skip' },
    estimatedDurationMs: 3000,
  },
};
```

**Test scenarios:**
- Agent pulls leads from HubSpot, filters for hot leads, drafts personalized emails
- Agent updates a deal stage when email thread is marked "responded"

---

## 5. MCP Tool Mapping Architecture

### 5.1 Tool Registration Flow

```
Capability Registry (drive:read)
    │
    │  registered at startup via connectors/drive/tools.ts
    ▼
MCP Client (mcp-client.ts)
    │
    │  manifest cached on first use
    ▼
Zapier MCP Server
    │
    │  4000+ tools available
    ▼
Connector OAuth (per-connector credentials)
```

### 5.2 MCP Manifest Caching (already built)

The `ManifestCache` class caches the MCP server's tool manifest to avoid repeated introspection. Each connector should have its own cached manifest namespace.

```typescript
// Per-connector manifest caching
const driveManifest = await manifestCache.get('drive');
const slackManifest = await manifestCache.get('slack');
const hubspotManifest = await manifestCache.get('hubspot');
```

### 5.3 OAuth Token Storage (Reference: gmail/oauth.ts)

```typescript
// app/lib/connectors/drive/oauth.ts
export async function saveDriveTokenForUser(
  userId: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: Date
): Promise<void> {
  await setConnectorToken({
    user_id: userId,
    connector: 'google_drive',
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
    expires_at: expiresAt ?? null,
  });
}

export async function getDriveTokenForUser(userId: string) {
  return getConnectorToken(userId, 'google_drive');
}
```

---

## 6. Settings/Connectors UI

### 6.1 Connectors Panel

```
┌──────────────────────────────────────────────────────────┐
│  Integrations                                           │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────┐         │
│  │ 📧 Gmail           │  │ 📁 Google Drive    │         │
│  │ ● Connected        │  │ ○ Not connected    │         │
│  │ Read & Send        │  │ [Connect →]        │         │
│  └────────────────────┘  └────────────────────┘         │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────┐         │
│  │ 💬 Slack           │  │ 🔶 HubSpot         │         │
│  │ ○ Not connected    │  │ ○ Not connected    │         │
│  │ [Connect →]        │  │ [Connect →]        │         │
│  └────────────────────┘  └────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Component Structure

```
app/app/components/connectors/
├── ConnectorsPanel.tsx       — Settings page container
├── ConnectorCard.tsx        — Reusable card (connected/not-connected)
├── GmailConnectorCard.tsx   — Gmail-specific (already exists conceptually)
├── DriveConnectorCard.tsx   — Google Drive
├── SlackConnectorCard.tsx   — Slack
└── HubSpotConnectorCard.tsx — HubSpot
```

---

## 7. Dependency Chain

```
Unit C1 (Drive)
    │
    ├── gmail/oauth.ts (reference implementation)
    ├── MCP client infrastructure (built)
    ├── ARCHITECTURE-01 capability entries (schema exists)
    └── Triggers: Phase 1B parallel with Gmail tool completion

Unit C2 (Slack)
    │
    ├── MCP client infrastructure (built)
    ├── Drive OAuth (Unit C1) as reference
    └── Triggers: Phase 2 (after Canvas + Escalation Suggestions)

Unit C3 (HubSpot)
    │
    ├── MCP client infrastructure (built)
    ├── Drive OAuth (Unit C1) as reference
    └── Triggers: Phase 2 (after Slack)

All units are independent after the MCP client base.
Each requires: OAuth flow, capability registration, tool wiring, connector card UI.
```

---

## 8. What to Build vs. What Exists

| Component | Source |
|---|---|
| Google Drive OAuth | New — follow Gmail OAuth pattern in `app/lib/gmail/oauth.ts` |
| Drive tool definitions | New — `app/lib/connectors/drive/tools.ts` |
| Drive connector UI card | New — `app/app/components/connectors/DriveConnectorCard.tsx` |
| Slack tool definitions | New — `app/lib/connectors/slack/tools.ts` |
| Slack connector UI card | New — `app/app/components/connectors/SlackConnectorCard.tsx` |
| HubSpot tool definitions | New — `app/lib/connectors/hubspot/tools.ts` |
| HubSpot connector UI card | New — `app/app/components/connectors/HubSpotConnectorCard.tsx` |
| MCP client | Existing — `app/lib/mcp/mcp-client.ts` |
| OAuth token storage | Existing — extend `app/lib/db/queries.ts` |
| Capability registry | Existing — `app/lib/registry/capability-registry.ts` |
| Tool middleware | Existing — `app/lib/middleware/execute-tool.ts` |

---

## 9. Success Criteria

1. Maria can connect Google Drive in under 2 minutes
2. Agent reads a file from Drive, processes it, writes output back to Drive
3. Agent posts a Slack message to Maria's DM on escalation (before email notification)
4. Agent pulls HubSpot leads, filters by lifecycle stage, drafts personalized email
5. All connector tool calls are logged with ULID idempotency keys
6. Disconnecting a connector revokes access immediately

---

## 10. Open Questions

1. **MCP server provider:** Zapier vs. n8n vs. built-in MCP? Zapier has 6,000+ connectors; n8n has 400+. For Phase 1 MVP, Zapier MCP covers Drive, Slack, and HubSpot. Decision needed before C1 begins.
2. **OAuth per-user vs. per-org:** For multi-user teams (Phase 2), each user connects their own OAuth. For MVP single-user (Maria), per-user is correct.
3. **Connector availability check:** Should we check if the MCP server manifest includes the tool before showing "Connect"? Or show the connector always and surface the error at runtime?
