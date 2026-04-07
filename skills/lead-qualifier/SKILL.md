---
name: Lead Qualifier
version: 1.0.0
description: Scores inbound leads, routes to correct pipeline stage
archetype: Process
tools: [hubspot.contacts.list, hubspot.deals.create, slack.messages.send]
triggers:
  - "qualify lead"
  - "score lead"
  - "route lead"
---

# Skill Body

## About This Skill

The Lead Qualifier automatically scores incoming leads based on budget, timeline, and fit — then routes them to the right pipeline stage and notifies the right team member.

## Sample Workflows

- "Score these new leads and tell me which ones to prioritize"
- "Route the incoming leads from the website form to the right pipeline"
- "Flag any leads that match our ideal customer profile"