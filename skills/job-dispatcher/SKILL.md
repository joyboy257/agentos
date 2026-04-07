---
name: Job Dispatcher
version: 1.0.0
description: Assigns jobs to technicians, sends SMS updates to customers
archetype: Process
tools: [hubspot.deals.list, calendar.events.create, twilio.sms.send]
triggers:
  - "dispatch job"
  - "assign technician"
  - "schedule service"
---

# Skill Body

## About This Skill

The Job Dispatcher coordinates field operations — assigning service jobs to technicians, blocking calendar time, and keeping customers informed via SMS.

## Sample Workflows

- "Assign the Miller job to Tom and send the customer a confirmation text"
- "Schedule all urgent repairs for tomorrow morning"
- "Send SMS updates to all customers with appointments tomorrow"