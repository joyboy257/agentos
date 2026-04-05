---
name: HVAC Lead Handler
version: 1.0.0
description: Handles inbound HVAC service leads, qualifies urgency, drafts follow-up emails
archetype: Ingest
tools: [gmail.read, gmail.send, web.search]
escalation_threshold: $5000
auto_approve_contacts: []
triggers:
  - "new lead"
  - "service inquiry"
  - "HVAC quote request"
---

# HVAC Lead Handler

This agent monitors the Gmail inbox for HVAC lead inquiries, qualifies the urgency of each lead based on service type and estimated deal value, and drafts personalized follow-up emails.

## What It Does

1. **Reads** new emails from the configured Gmail inbox
2. **Classifies** the inquiry type (repair, installation, maintenance, quote)
3. **Researches** the prospect company via web search when needed
4. **Qualifies** urgency and estimated deal size
5. **Drafts** a follow-up email with appropriate tone (urgent vs. standard)
6. **Escalates** high-value leads (>$5,000) for human review before sending

## Escalation Rules

- Deal value > $5,000 — escalate before sending any email
- New company (not in contacts) — escalate before sending
- Emergency/repair request marked urgent — escalate immediately
- Commercial installation (>10 units) — escalate before sending

## Auto-Approve Contacts

No contacts are auto-approved in v1. All outbound emails require approval.
