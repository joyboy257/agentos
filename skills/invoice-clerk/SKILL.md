---
name: Invoice Clerk
version: 1.0.0
description: Creates and sends invoices, records payments, chases overdue accounts
archetype: Process
tools: [quickbooks.invoices.create, quickbooks.invoices.list, twilio.sms.send]
triggers:
  - "send invoice"
  - "payment received"
  - "chase overdue"
---

# Skill Body

## About This Skill

The Invoice Clerk handles the tedious work of billing — generating invoices, recording payments, and politely chasing overdue accounts via SMS.

## Sample Workflows

- "Invoice all completed jobs from this week"
- "Send payment reminder to everyone 30+ days overdue"
- "Record the payment I just received from Acme Corp"