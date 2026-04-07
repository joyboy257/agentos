# AgentOS Integrations

**Date:** 2026-04-07
**Status:** Phase 1 (in progress)
**Last updated:** 2026-04-07

---

## Philosophy

AgentOS integrations serve one goal: **eliminate the friction between an AI agent and the tools a small service business owner actually uses every day.**

We don't build integrations for the Fortune 500. We build them for Maria — a 44-year-old HVAC contractor who runs her business from Gmail, QuickBooks, and her phone. Every integration should make the agent feel like a real employee who can do the work without being told where to look.

**Principles:**
- Integration depth beats breadth — a fully-wired Gmail integration is worth more than five half-baked ones
- Read first, write second — agents need to see context before acting on it
- OAuth all the things — Maria shouldn't hand over API keys; she clicks "Connect" and we're authorized
- Checkpoint everything — if an integration call fails, the agent retries from a checkpoint, not from scratch

---

## Integration Tiers

### Tier 1 — Core (ship in Phase 1 MVP)
Must be complete before launch. These are table stakes for a believable AI employee.

| # | Integration | Type | Priority | Status |
|---|-----------|------|----------|--------|
| 1 | **Gmail** | Email | 🔴 Critical | ✅ Done (OAuth read + compose + send) |
| 2 | **Brave Search** | Web | 🔴 Critical | ✅ Done (real-time search) |
| 3 | **Push Notifications** | Push | 🔴 Critical | ✅ Done (Pushover) |

### Tier 2 — MVP Complete (Phase 1.1)
These complete the core loop. Without them the agent can't do full employee tasks.

| # | Integration | Type | Priority | Status |
|---|-----------|------|----------|--------|
| 4 | **HubSpot CRM** | CRM | 🟠 High | ✅ Done (OAuth + read/write tools) |
| 5 | **Google Calendar** | Calendar | 🟠 High | ✅ Done (OAuth + read/write tools) |
| 6 | **Slack** | Communication | 🟠 High | ✅ Done (OAuth + read/write + notification transport) |

### Tier 3 — Small Business Pack (Phase 2)
These address the back office and the tools that run a $500K–$2M HVAC business.

| # | Integration | Type | Priority | Status |
|---|-----------|------|----------|--------|
| 7 | **QuickBooks Online** | Accounting | 🟡 Medium | ✅ Done (OAuth + read/write tools) |
| 8 | **Twilio SMS** | SMS | 🟡 Medium | ✅ Done (API key + sms.send tool) |
| 9 | **Stripe** | Payments | 🟡 Medium | ✅ Done (payment links + invoice workflow wiring) |
| 10 | **Instagram Business** | Social | 🟡 Medium | 🔴 Not started |
| 11 | **Square** | Payments | 🟡 Medium | 🔴 Not started |
| 12 | **Calendly** | Scheduling | 🟡 Medium | 🔴 Not started |

### Tier 4 — Nice to Have (Phase 3+)
Enterprise features that unlock bigger clients but aren't the core market.

| # | Integration | Type | Priority | Status |
|---|-----------|------|----------|--------|
| 13 | **Salesforce** | CRM | 🟢 Low | 🔴 Not started |
| 14 | **Microsoft Teams** | Communication | 🟢 Low | 🔴 Not started |
| 15 | **Xero** | Accounting | 🟢 Low | 🔴 Not started |
| 16 | **Facebook Page** | Social | 🟢 Low | 🔴 Not started |
| 17 | **Jira** | Project | 🟢 Low | 🔴 Not started |
| 18 | **GitHub** | Dev | 🟢 Low | 🔴 Not started |
| 19 | **Notion** | Docs | 🟢 Low | 🔴 Not started |

---

## Integration Architecture

### Credential Storage
All OAuth tokens are stored encrypted at rest in the `encrypted_credentials` table. Tokens are decrypted in memory only when making API calls. No plaintext tokens ever touch the database.

```
Maria clicks "Connect HubSpot"
  → OAuth redirect to HubSpot
  → Callback receives auth code
  → Exchange for access + refresh tokens
  → Encrypt and store in encrypted_credentials table
  → Agent accesses via getCredential(userId, 'hubspot')
```

### Capability Registry
All tools are registered in the capability registry with:
- `permissionLevel`: `safe` | `needs_approval` | `admin_only`
- `read | write` classification (drives parallel vs serial execution)
- Rate limits and circuit breaker config per tool

### Idempotency
Every integration call uses an idempotency key (ULID) so duplicate calls are deduplicated at the database level.

### Checkpoint/Resume
Integration calls are checkpointed before firing. If the server restarts mid-call, the agent resumes from the last checkpoint with the same idempotency key — no duplicate executions.

---

## Tool Definitions

### Tier 1 — Done

#### Gmail (`gmail.read`, `gmail.compose`, `gmail.send`)
- **Permission level:** `safe`
- **Read/Write:** read (read, compose) / write (send)
- **Auth:** OAuth 2.0 (Google)
- **Status:** ✅ Live

#### Brave Search (`web.search`)
- **Permission level:** `safe`
- **Read/Write:** read
- **Auth:** API key ( Brave Search API)
- **Status:** ✅ Live

#### Pushover (`pushover.send`)
- **Permission level:** `safe`
- **Read/Write:** write
- **Auth:** API key
- **Status:** ✅ Live

---

### Tier 2 — Planned

#### HubSpot CRM (`hubspot.read`, `hubspot.write`)
- **Permission level:** `needs_approval` (write), `safe` (read)
- **Read/Write:** both
- **Auth:** OAuth 2.0 (HubSpot)
- **Read tools:** contacts, companies, deals, tickets, notes
- **Write tools:** create/update contacts, create deals, add notes, update pipeline stage
- **Priority:** First — CRM is where the business lives
- **Key actions for Maria:**
  - "Pull all open deals over $5K"
  - "Create a follow-up task for every deal that hasn't been touched in 7 days"
  - "Log this email thread as a note on the Smith job"

#### Google Calendar (`calendar.read`, `calendar.write`)
- **Permission level:** `needs_approval` (write), `safe` (read)
- **Read/Write:** both
- **Auth:** OAuth 2.0 (Google)
- **Read tools:** list events, get availability
- **Write tools:** create event, update event, delete event
- **Priority:** Second — scheduling closes the loop on appointment-based workflows
- **Key actions for Maria:**
  - "Block 2 hours Thursday afternoon for job estimates"
  - "Find a 30-minute slot this week to call the Smiths about their AC replacement"
  - "Create a reminder task 1 day before each scheduled appointment"

#### Slack (`slack.notify`, `slack.read_channel`)
- **Permission level:** `needs_approval` (write), `safe` (read)
- **Read/Write:** both
- **Auth:** OAuth 2.0 (Slack)
- **Read tools:** list channels, read recent messages
- **Write tools:** send message to channel, send DM
- **Priority:** Third — keeps the team in their existing communication loop
- **Key actions for Maria:**
  - "Send a Slack DM to James whenever a high-value lead comes in"
  - "Post a daily summary to #field-technicians every morning at 7am"
  - "Alert #office when a job is marked complete in HubSpot"

---

### Tier 3 — Small Business Pack (in progress)

#### QuickBooks Online
- **Permission level:** `needs_approval` (write), `safe` (read)
- **Auth:** OAuth 2.0 (Intuit)
- **Status:** ✅ Done
- **Read tools:** `quickbooks.invoices.list`, `quickbooks.invoices.get`, `quickbooks.customers.list`
- **Write tools:** `quickbooks.invoices.create`, `quickbooks.invoices.send`, `quickbooks.invoices.record_payment`
- **Key actions for Maria:**
  - "Create and send an invoice for the Rodriguez job — $850, due net 30"
  - "Mark invoice #1043 as paid when payment comes through"
  - "Pull all outstanding invoices over 60 days"

#### Twilio SMS
- **Permission level:** `needs_approval`
- **Auth:** API key + secret (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
- **Status:** ✅ Done
- **Write tools:** `twilio.sms.send`
- **Key actions for Maria:**
  - "Send an SMS to the Rodriguez cell: 'Technician arriving between 2-4pm today.'"
  - "SMS James: 'Lead alert — $12K commercial job in Scottsdale, call by 5pm.'"
- **Cross-wired from:** HubSpot deal alerts, Stripe invoice notifications

#### Stripe
- **Permission level:** `needs_approval`
- **Auth:** API key (`STRIPE_SECRET_KEY`)
- **Status:** ✅ Done
- **Read tools:** `stripe.payments.list`, `stripe.payments.get`
- **Write tools:** `stripe.payment_link.create`, `stripe.invoices.send`
- **Key actions for Maria:**
  - "Generate a Stripe payment link for the Martinez deposit — $400"
  - "Check if invoice #1042 has been paid"
- **Cross-wired from:** QuickBooks invoice creation
- **Cross-wires out:** payment received → HubSpot Closed Won + Maria SMS via Twilio; invoice sent → customer SMS via Twilio

#### Instagram Business
- **Permission level:** `needs_approval`
- **Auth:** OAuth 2.0 (Meta)
- **Status:** 🔴 Not started
- **Read tools:** get recent posts, get insights
- **Write tools:** create post, upload image
- **Key actions for Maria:**
  - "Post a photo of today's install to Instagram with a thank-you caption"
  - "Draft a before/after post for the Martinez job and save it as a draft for my review"

#### Square
- **Permission level:** `needs_approval`
- **Auth:** OAuth 2.0 (Square)
- **Read tools:** list transactions, get customer
- **Write tools:** create invoice, charge card on file
- **Key actions for Maria:**
  - "Run a card on file for the Martinez $850 balance"
  - "Pull today's in-person card transactions"

---

## Build Order

```
Phase 1.1 (✅ complete):
  1. HubSpot OAuth — credential infrastructure + read tools
  2. HubSpot write tools — create/update CRM records
  3. Google Calendar OAuth — credential infrastructure + read tools
  4. Google Calendar write tools — create/update/delete events
  5. Slack OAuth + read tools
  6. Slack write tools + notification routing

Phase 1.2 (✅ complete):
  7. QuickBooks Online OAuth + read
  8. QuickBooks Online write
  9. Twilio SMS — API key-based
  10. Stripe — payment link generation + invoice workflow

Phase 2 (next):
  11. Instagram Business OAuth + read
  12. Instagram write (post drafts)
  13. Square OAuth + read/write
  14. Calendly OAuth + availability check

Phase 3:
  15–20. Remaining integrations (Salesforce, Teams, Xero, Jira, GitHub, Notion)
```

---

## Notes

- **HubSpot vs Salesforce:** HubSpot wins for SMB. It's what small HVAC shops can afford and set up without a consultant. Salesforce is Phase 3 or enterprise only.
- **Calendly vs Google Calendar:** Google Calendar is the foundation. If we do Calendly later, it layers on top — same availability data, different booking UX.
- **Twilio vs native SMS:** Native SMS from a carrier account is expensive and requires a dedicated number. Twilio gives Maria a proper SMS gateway without managing carrier relationships.
- **No Zapier/Make/n8n:** We are the automation layer. We don't integrate with automation tools — we replace them for the core use cases Maria needs.
