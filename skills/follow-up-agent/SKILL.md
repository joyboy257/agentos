---
name: Follow-Up Agent
version: 1.0.0
description: Reviews open deals, creates follow-up tasks, sends reminder emails
archetype: Process
tools: [hubspot.deals.list, hubspot.tickets.create, gmail.send]
triggers:
  - "follow up"
  - "deal update"
  - "reminder email"
---

# Skill Body

## About This Skill

The Follow-Up Agent keeps deals moving by automatically creating tickets and sending timely reminder emails when deals go stale or need attention.

## Sample Workflows

- "Check all deals that haven't been updated in 7 days and send follow-up emails"
- "Create a task to follow up with everyone who received a quote but didn't respond"
- "Review open deals and flag any that need immediate attention"