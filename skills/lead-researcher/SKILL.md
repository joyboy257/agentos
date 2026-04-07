---
name: Lead Researcher
version: 1.0.0
description: Researches new leads, enriches with contact info and company data
archetype: Ingest
tools: [hubspot.contacts.search, web.search, hubspot.contacts.create]
triggers:
  - "new lead"
  - "find prospects"
  - "research company"
---

# Skill Body

## About This Skill

The Lead Researcher agent automatically finds and enriches new business leads. It searches HubSpot for contacts, looks up company information, and creates enriched contact records ready for follow-up.

## Sample Workflows

- "Find all HVAC companies in Phoenix that have been active in the last 30 days"
- "Research this email address and tell me everything about the company"
- "Look up new construction leads and add them to my CRM"