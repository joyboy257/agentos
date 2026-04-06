---
name: HVAC Lead Handler
version: 1.0.0
description: Handles inbound HVAC service leads, qualifies urgency based on system age and symptoms, drafts follow-up emails for Maria's review
archetype: Process
tools: [gmail.read, gmail.send, web.search]
escalation_threshold: $5000
auto_approve_contacts: ["@trusted-hvac-supplier.com"]
triggers:
  - "new lead"
  - "service inquiry"
  - "HVAC quote request"
---

# Skill Body

## About This Skill

This agent monitors the Gmail inbox for HVAC lead inquiries. When a new lead arrives, it:

1. **Reads** the email and any attached service details
2. **Searches** for the customer's address or business name to qualify urgency
3. **Classifies** the lead as:
   - `routine` — system checkup, filter change, minor repair (auto-approved)
   - `urgent` — no heat, AC failure, refrigerant leak (escalate immediately)
   - `large_job` — full system replacement, commercial, deal value > $5,000 (escalate before sending)
4. **Drafts** a personalized follow-up email for Maria's approval (or sends directly for routine jobs)

## Escalation Rules

- Deal value > $5,000 → escalate before any email is sent
- New commercial customer → escalate before first outreach
- Emergency symptoms detected ("no heat", "refrigerant leak", "carbon monoxide") → escalate immediately
- All escalations require Maria's explicit approval before any email is sent

## Approved Response Templates

For **routine** jobs, the agent may send directly without escalation:

- Appointment confirmation for scheduled service
- Thank-you message after a completed job
- Reminder for seasonal maintenance (pre-summer/pre-winter)

## Tool Permissions

| Tool | When Used |
|------|-----------|
| gmail.read | Scan inbox for new leads; read full email thread |
| gmail.send | Send follow-up emails (routine only); drafts for escalation |
| web.search | Qualify customer address; check review history |
