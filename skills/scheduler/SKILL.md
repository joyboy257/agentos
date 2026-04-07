---
name: Scheduler
version: 1.0.0
description: Finds meeting slots, blocks calendar time, sends invites
archetype: Distill
tools: [calendar.events.list, calendar.events.create, gmail.send]
triggers:
  - "schedule meeting"
  - "find a slot"
  - "book appointment"
---

# Skill Body

## About This Skill

The Scheduler agent finds the perfect meeting time by checking everyone's calendars and sends professional calendar invitations automatically.

## Sample Workflows

- "Schedule a 1-hour meeting with the Johnson family next week"
- "Find three available slots for a site visit tomorrow afternoon"
- "Send a calendar invite for the equipment inspection on Friday at 2pm"