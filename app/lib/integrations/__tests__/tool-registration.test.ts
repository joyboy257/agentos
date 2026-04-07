/**
 * Tool registration tests - verify each connector registers the correct tools
 * with the correct properties in the capability registry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock push-notifications globally to avoid VAPID validation errors
// ---------------------------------------------------------------------------
vi.mock('@/lib/push-notifications', () => ({
  sendApprovalPush: vi.fn().mockResolvedValue(undefined),
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// HubSpot connector
// ---------------------------------------------------------------------------

describe('HubSpot connector tool registration', () => {
  beforeEach(async () => {
    vi.resetModules()
    await import('@/lib/connectors/hubspot')
  })

  it('registers hubspot.contacts.list capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.contacts.list')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.contacts.list')
  })

  it('registers hubspot.contacts.search capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.contacts.search')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.contacts.search')
  })

  it('registers hubspot.deals.list capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.deals.list')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.deals.list')
  })

  it('registers hubspot.deals.get capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.deals.get')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.deals.get')
  })

  it('registers hubspot.tickets.list capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.tickets.list')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.tickets.list')
  })

  it('registers hubspot.company.get capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.company.get')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.company.get')
  })

  it('registers hubspot.contacts.create capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.contacts.create')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.contacts.create')
  })

  it('registers hubspot.deals.create capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.deals.create')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.deals.create')
  })

  it('registers hubspot.deals.update_stage capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.deals.update_stage')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.deals.update_stage')
  })

  it('registers hubspot.notes.create capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.notes.create')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.notes.create')
  })

  it('registers hubspot.tickets.create capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('hubspot.tickets.create')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('hubspot.tickets.create')
  })
})

// ---------------------------------------------------------------------------
// Google Calendar connector
// ---------------------------------------------------------------------------

describe('Google Calendar connector tool registration', () => {
  beforeEach(async () => {
    vi.resetModules()
    await import('@/lib/connectors/google-calendar')
  })

  it('registers calendar.events.list capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('calendar.events.list')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('calendar.events.list')
  })

  it('registers calendar.events.get capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('calendar.events.get')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('calendar.events.get')
  })

  it('registers calendar.availability.get capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('calendar.availability.get')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('calendar.availability.get')
  })

  it('registers calendar.events.create capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('calendar.events.create')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('calendar.events.create')
  })

  it('registers calendar.events.update capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('calendar.events.update')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('calendar.events.update')
  })

  it('registers calendar.events.delete capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('calendar.events.delete')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('calendar.events.delete')
  })
})

// ---------------------------------------------------------------------------
// Slack connector
// ---------------------------------------------------------------------------

describe('Slack connector tool registration', () => {
  beforeEach(async () => {
    vi.resetModules()
    await import('@/lib/connectors/slack')
  })

  it('registers slack.notify capability with all tools', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const cap = capabilityRegistry.getCapability('slack.notify')
    expect(cap).toBeDefined()
    expect(cap.tools).toContain('slack.channel.post')
    expect(cap.tools).toContain('slack.channels.list')
    expect(cap.tools).toContain('slack.messages.recent')
    expect(cap.tools).toContain('slack.messages.send')
    expect(cap.tools).toContain('slack.channel.update')
  })

  it('registers slack.channel.post tool definition', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('slack.channel.post')
    expect(def).toBeDefined()
    expect(def.name).toBe('slack.channel.post')
    expect(def.isConcurrencySafe).toBe(false)
    expect(def.permissionLevel).toBe('needs_approval')
  })

  it('registers slack.channels.list tool definition (read)', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('slack.channels.list')
    expect(def).toBeDefined()
    expect(def.name).toBe('slack.channels.list')
    expect(def.isConcurrencySafe).toBe(true)
    expect(def.permissionLevel).toBe('safe')
  })

  it('registers slack.messages.recent tool definition (read)', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('slack.messages.recent')
    expect(def).toBeDefined()
    expect(def.name).toBe('slack.messages.recent')
    expect(def.isConcurrencySafe).toBe(true)
  })

  it('registers slack.messages.send tool definition (write)', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('slack.messages.send')
    expect(def).toBeDefined()
    expect(def.name).toBe('slack.messages.send')
    expect(def.isConcurrencySafe).toBe(false)
    expect(def.permissionLevel).toBe('needs_approval')
  })
})

// ---------------------------------------------------------------------------
// Stripe connector
// ---------------------------------------------------------------------------

describe('Stripe connector tool registration', () => {
  beforeEach(async () => {
    vi.resetModules()
    await import('@/lib/connectors/stripe')
  })

  it('registers stripe.payments capability with all tools', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const cap = capabilityRegistry.getCapability('stripe.payments')
    expect(cap).toBeDefined()
    expect(cap.tools).toContain('stripe.payments.list')
    expect(cap.tools).toContain('stripe.payments.get')
    expect(cap.tools).toContain('stripe.payment_link.create')
    expect(cap.tools).toContain('stripe.invoices.send')
  })

  it('registers stripe.payments.list tool definition (read)', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('stripe.payments.list')
    expect(def).toBeDefined()
    expect(def.name).toBe('stripe.payments.list')
    expect(def.isConcurrencySafe).toBe(true)
    expect(def.permissionLevel).toBe('safe')
  })

  it('registers stripe.payments.get tool definition (read)', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('stripe.payments.get')
    expect(def).toBeDefined()
    expect(def.name).toBe('stripe.payments.get')
    expect(def.isConcurrencySafe).toBe(true)
  })

  it('registers stripe.payment_link.create tool definition (write)', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('stripe.payment_link.create')
    expect(def).toBeDefined()
    expect(def.name).toBe('stripe.payment_link.create')
    expect(def.isConcurrencySafe).toBe(false)
    expect(def.permissionLevel).toBe('needs_approval')
  })

  it('registers stripe.invoices.send tool definition (write)', async () => {
    const { capabilityRegistry } = await import('@/lib/capability-registry')
    const def = capabilityRegistry.getToolDef('stripe.invoices.send')
    expect(def).toBeDefined()
    expect(def.name).toBe('stripe.invoices.send')
    expect(def.isConcurrencySafe).toBe(false)
    expect(def.permissionLevel).toBe('needs_approval')
  })
})

// ---------------------------------------------------------------------------
// Twilio connector
// ---------------------------------------------------------------------------

describe('Twilio connector tool registration', () => {
  beforeEach(async () => {
    vi.resetModules()
    await import('@/lib/connectors/twilio')
  })

  it('registers twilio.sms.send capability', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('twilio.sms.send')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('twilio.sms.send')
    expect(cap.tools).toContain('twilio.sms.send')
  })
})

// ---------------------------------------------------------------------------
// QuickBooks connector
// ---------------------------------------------------------------------------

describe('QuickBooks connector tool registration', () => {
  beforeEach(async () => {
    vi.resetModules()
    await import('@/lib/connectors/quickbooks')
  })

  it('registers quickbooks.invoices.list capability (read)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('quickbooks.invoices.list')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('quickbooks.invoices.list')
  })

  it('registers quickbooks.invoices.get capability (read)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('quickbooks.invoices.get')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('quickbooks.invoices.get')
  })

  it('registers quickbooks.customers.list capability (read)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('quickbooks.customers.list')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('quickbooks.customers.list')
  })

  it('registers quickbooks.invoices.create capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('quickbooks.invoices.create')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('quickbooks.invoices.create')
  })

  it('registers quickbooks.invoices.send capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('quickbooks.invoices.send')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('quickbooks.invoices.send')
  })

  it('registers quickbooks.invoices.record_payment capability (write)', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const cap = registry.get('quickbooks.invoices.record_payment')
    expect(cap).toBeDefined()
    expect(cap.id).toBe('quickbooks.invoices.record_payment')
  })
})

// ---------------------------------------------------------------------------
// Drive connector
// ---------------------------------------------------------------------------

describe('Drive connector tool registration', () => {
  beforeEach(async () => {
    vi.resetModules()
    await import('@/lib/connectors/drive')
  })

  it('registers drive capabilities', async () => {
    const { registry } = await import('@/lib/registry/capability-registry')
    const caps = registry.getAll()
    const driveCaps = caps.filter((c: any) => c.id.startsWith('drive.'))
    expect(driveCaps.length).toBeGreaterThan(0)
  })
})
