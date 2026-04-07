# Integration Build Plan

**Date:** 2026-04-07
**Type:** feat / build plan
**Status:** draft
**Scope:** Tier 2 integrations (HubSpot, Google Calendar, Slack)

---

## Overview

Build all Tier 2 integrations in priority order: **HubSpot → Google Calendar → Slack**. Each follows the same consistent pattern: OAuth infrastructure first, read tools, then write tools.

**Why HubSpot first:**
- CRM is the system of record for a small business — contacts, deals, pipeline, notes
- Every other integration (email, calendar, SMS) references CRM data
- Maria's business logic lives in HubSpot: lead values, pipeline stages, owner assignments
- HubSpot's free tier is generous — Maria can start without paying

**Why Calendar second:**
- Scheduling is the second biggest friction after CRM
- Agents need to know when Maria is busy before suggesting meeting times
- Calendar write tools complete the scheduling loop: block time, set reminders

**Why Slack last of the three:**
- Slack is notification + team communication, not a system of record
- It depends on the other two: alert James in Slack when a high-value HubSpot deal comes in

---

## Shared Integration Pattern

Every OAuth integration follows this structure:

```
1. Create migration: 0XX_integration_name.sql
   - encrypted_credentials row per user (provider, encrypted_token, expires_at)

2. Create lib/integrations/{provider}/index.ts
   - getCredential(userId, provider) → decrypted token
   - refreshTokenIfNeeded(userId, provider) → refreshes and re-encrypts
   - OAuth redirect + callback handlers in app/api/integrations/{provider}/

3. Register tools in capability-registry.ts
   - {provider}.read.* — safe
   - {provider}.write.* — needs_approval

4. Add to partition-tool-calls.ts
   - read tools → parallel execution
   - write tools → serial execution with checkpointing

5. Add circuit breaker + timeout config in streaming-tool-executor.ts
```

---

## Phase 1: HubSpot CRM

### 1.1 Infrastructure

**Migration:** `016_hubspot_oauth.sql`
```sql
-- encrypted_credentials already has provider + encrypted_token + expires_at
-- Just need: nothing new, the table is generic
-- Add hubspot to allowed providers in capability-registry
```

Actually the `encrypted_credentials` table already supports any provider. The migration just needs to verify the schema supports `hubspot` as a provider value.

**Files to create:**
- `app/lib/integrations/hubspot/index.ts` — credential helpers
- `app/app/api/integrations/hubspot/connect/route.ts` — initiates OAuth
- `app/app/api/integrations/hubspot/callback/route.ts` — handles OAuth callback
- `app/lib/integrations/hubspot/client.ts` — HubSpot API client with token refresh
- `app/lib/integrations/hubspot/types.ts` — TypeScript types for HubSpot objects

**HubSpot OAuth scope:**
```
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.companies.read
crm.objects.companies.write
crm.objects.deals.read
crm.objects.deals.write
crm.objects.tickets.read
crm.objects.tickets.write
crm.objects.notes.write
```

### 1.2 HubSpot Read Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `hubspot.contacts.list` | List contacts with pagination | safe |
| `hubspot.contacts.search` | Search contacts by name, email, company | safe |
| `hubspot.deals.list` | List all open deals | safe |
| `hubspot.deals.get` | Get deal by ID with all properties | safe |
| `hubspot.tickets.list` | List open support tickets | safe |
| `hubspot.company.get` | Get company by domain or ID | safe |

### 1.3 HubSpot Write Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `hubspot.contacts.create` | Create new contact | needs_approval |
| `hubspot.contacts.update` | Update contact properties | needs_approval |
| `hubspot.deals.create` | Create new deal | needs_approval |
| `hubspot.deals.update_stage` | Move deal through pipeline | needs_approval |
| `hubspot.notes.create` | Attach note to contact/company/deal | needs_approval |
| `hubspot.tickets.create` | Create support ticket | needs_approval |

### 1.4 Key Agent Workflows

```
"Show me all open deals over $5K"
  → hubspot.deals.list (filter: amount > 5000, stage != closed-won)
  → Returns formatted deal list

"Create a follow-up task for every deal that hasn't been touched in 7 days"
  → hubspot.deals.list (filter: daysSinceLastActivity > 7)
  → hubspot.tickets.create (one per deal, title = "Follow up: {deal.name}")

"Log this email as a note on the Smith job"
  → hubspot.contacts.search(query: "Smith")
  → hubspot.notes.create(content: {email body}, associatdId: contactId)
```

---

## Phase 2: Google Calendar

### 2.1 Infrastructure

**Migration:** `017_google_calendar_oauth.sql`

**Files to create:**
- `app/lib/integrations/google-calendar/index.ts` — credential helpers
- `app/app/api/integrations/google-calendar/connect/route.ts` — initiates OAuth
- `app/app/api/integrations/google-calendar/callback/route.ts` — handles OAuth callback
- `app/lib/integrations/google-calendar/client.ts` — Google Calendar API client
- `app/lib/integrations/google-calendar/types.ts` — TypeScript types

**Google Calendar OAuth scope:**
```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
```

### 2.2 Calendar Read Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `calendar.events.list` | List events in date range | safe |
| `calendar.availability.get` | Check free/busy for a set of emails | safe |
| `calendar.events.get` | Get single event by ID | safe |

### 2.3 Calendar Write Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `calendar.events.create` | Create calendar event | needs_approval |
| `calendar.events.update` | Update event time, title, description | needs_approval |
| `calendar.events.delete` | Cancel event | needs_approval |

### 2.4 Key Agent Workflows

```
"Block 2 hours Thursday afternoon for job estimates"
  → calendar.events.create(
      summary: "Job Estimates",
      start: Thursday 1pm,
      end: Thursday 3pm,
      attendees: [maria@email.com]
    )

"Find a 30-minute slot this week for a call with the Smiths"
  → calendar.availability.get(emails: [maria@, smiths@], start: Monday, end: Friday)
  → Returns first available 30-min slot
  → calendar.events.create(...) if Maria approves

"Create a reminder 1 day before each scheduled appointment"
  → calendar.events.list (filter: start > now, start < now + 7d)
  → For each event without a reminder:
      calendar.events.create(
        summary: "REMINDER: {original.title}",
        start: original.start - 1 day,
        duration: 15min
      )
```

---

## Phase 3: Slack

### 3.1 Infrastructure

**Migration:** `018_slack_oauth.sql`

**Files to create:**
- `app/lib/integrations/slack/index.ts` — credential helpers
- `app/app/api/integrations/slack/connect/route.ts` — initiates OAuth
- `app/app/api/integrations/slack/callback/route.ts` — handles OAuth callback
- `app/lib/integrations/slack/client.ts` — Slack API client (Bolt.js or raw)
- `app/lib/integrations/slack/types.ts` — TypeScript types

**Slack OAuth scope:**
```
channels:read
channels:write
chat:write
groups:read
groups:write
users:read
users:read.email
```

**Important:** Slack requires a bot token (not user token) so the agent can post even when Maria isn't logged in.

### 3.2 Slack Read Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `slack.channels.list` | List all channels the bot is in | safe |
| `slack.messages.recent` | Get last N messages from a channel | safe |

### 3.3 Slack Write Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `slack.messages.send` | Send message to channel or DM | needs_approval |

### 3.4 Notification Routing

Slack isn't just a tool — it's also the **notification transport** for the agent. When the agent needs to alert someone:

```
// Internal routing — agent wants to notify human
push-notifications.ts → route: "slack" → slack.messages.send(channel: #alerts, text: ...)

// Used by escalation flow
// Used by lead alerts
// Used by completion notifications
```

The `push-notifications.ts` already has Pushover wired. Add Slack as a second transport.

### 3.5 Key Agent Workflows

```
"Send a Slack DM to James whenever a high-value lead comes in"
  → trigger: hubspot.deals.create (amount > 5000)
  → slack.messages.send(
      channel: @james,
      text: "New lead: {deal.name}, ${deal.amount}. Contact: {contact.email}"
    )

"Post a daily summary to #field-technicians every morning at 7am"
  → proactive-queue.ts schedule: "0 7 * * *"
  → hubspot.deals.list(stage: "Active Install", limit: 10)
  → slack.messages.send(
      channel: #field-technicians,
      text: "Today's jobs: {list of deals}"
    )

"Alert #office when a job is marked complete in HubSpot"
  → trigger: hubspot.deals.update_stage (stage: "Closed Won")
  → slack.messages.send(channel: #office, text: "Job complete: {deal.name}")
```

---

## Implementation Order

```
Week 1-2: HubSpot OAuth + Read tools
  - Migration 016
  - OAuth connect/callback routes
  - hubspot client + types
  - hubspot.contacts.list, hubspot.contacts.search, hubspot.deals.list, hubspot.deals.get
  - Test: agent can read Maria's HubSpot data

Week 3: HubSpot Write tools
  - hubspot.contacts.create, hubspot.contacts.update
  - hubspot.deals.create, hubspot.deals.update_stage
  - hubspot.notes.create, hubspot.tickets.create
  - Escalation routing via Slack

Week 4: Google Calendar OAuth + Read tools
  - Migration 017
  - OAuth connect/callback routes
  - calendar client + types
  - calendar.events.list, calendar.availability.get
  - Test: agent can see Maria's calendar

Week 5: Google Calendar Write tools + Integration
  - calendar.events.create, calendar.events.update, calendar.events.delete
  - Connect calendar write to HubSpot deal workflow

Week 6: Slack OAuth + Tools
  - Migration 018
  - OAuth connect/callback routes
  - slack client + types
  - slack.channels.list, slack.messages.recent
  - slack.messages.send
  - Update push-notifications.ts to route via Slack

Week 7-8: Integration wiring + Testing
  - Wire Slack to HubSpot alert triggers
  - Wire Slack to calendar reminder workflow
  - End-to-end test: "Create a deal in HubSpot → alert James in Slack → block calendar time"
```

---

## Files to Create

### HubSpot
```
app/lib/integrations/hubspot/index.ts
app/lib/integrations/hubspot/client.ts
app/lib/integrations/hubspot/types.ts
app/lib/integrations/hubspot/tools/read.ts
app/lib/integrations/hubspot/tools/write.ts
app/app/api/integrations/hubspot/connect/route.ts
app/app/api/integrations/hubspot/callback/route.ts
app/lib/db/migrations/016_hubspot_oauth.sql
```

### Google Calendar
```
app/lib/integrations/google-calendar/index.ts
app/lib/integrations/google-calendar/client.ts
app/lib/integrations/google-calendar/types.ts
app/lib/integrations/google-calendar/tools/read.ts
app/lib/integrations/google-calendar/tools/write.ts
app/app/api/integrations/google-calendar/connect/route.ts
app/app/api/integrations/google-calendar/callback/route.ts
app/lib/db/migrations/017_google_calendar_oauth.sql
```

### Slack
```
app/lib/integrations/slack/index.ts
app/lib/integrations/slack/client.ts
app/lib/integrations/slack/types.ts
app/lib/integrations/slack/tools/read.ts
app/lib/integrations/slack/tools/write.ts
app/app/api/integrations/slack/connect/route.ts
app/app/api/integrations/slack/callback/route.ts
app/lib/db/migrations/018_slack_oauth.sql
```

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| HubSpot OAuth app rejected by review | High | Use "development" mode first; submit for review before launch |
| Google Calendar scope rejected | Medium | Use minimal scopes; calendar.readonly for reads |
| Slack bot token needs team approval | Medium | Explain use case; Slack is generally permissive for bots |
| Token refresh edge cases | Medium | Test refresh flow manually before wiring to agent |
| OAuth callback URL in dev vs prod | Low | Env var for base URL; both dev and prod callbacks registered |

---

## Dependencies

- `encrypted_credentials` table — already exists
- `capability-registry.ts` — already extensible
- `partition-tool-calls.ts` — already handles read/write classification
- `streaming-tool-executor.ts` — already has circuit breaker + timeout infra
- `push-notifications.ts` — already has Pushover; add Slack as transport

No new infrastructure needed. Everything is already wired for pluggable tools.
