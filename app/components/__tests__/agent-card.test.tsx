'use client'

import { render, screen } from '@testing-library/react'
import { AgentCard } from '../agent-card'

// Mock CSS modules or use inline styles - AgentCard uses inline styles only

describe('AgentCard', () => {
  const baseAgent = {
    id: 'agent-1',
    name: 'Alex the Researcher',
    role: 'researcher',
    tools: ['gmail.read'],
    description: 'Reads and processes emails',
  }

  describe('role display', () => {
    it('renders correct role label from agent name', () => {
      render(<AgentCard agent={baseAgent} status="ready" />)
      expect(screen.getByText('Alex the Researcher')).toBeInTheDocument()
    })

    it('renders role as fallback when name is empty', () => {
      const agentWithoutName = { ...baseAgent, name: '' }
      render(<AgentCard agent={agentWithoutName} status="ready" />)
      expect(screen.getByText('researcher')).toBeInTheDocument()
    })

    it('renders role with underscores replaced by spaces', () => {
      const agentWithUnderscoreRole = { ...baseAgent, name: '', role: 'email_reader' }
      render(<AgentCard agent={agentWithUnderscoreRole} status="ready" />)
      expect(screen.getByText('email reader')).toBeInTheDocument()
    })
  })

  describe('status dot colors', () => {
    it('shows gray color for ready status', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="ready" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      expect(dot).toHaveStyle({ backgroundColor: '#6b6b7b' })
    })

    it('shows green with pulse animation for running status', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="running" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      expect(dot).toHaveStyle({ backgroundColor: 'var(--success)' })
      // Note: animation is applied via style prop, checking the string
      const dotStyle = dot?.getAttribute('style') || ''
      expect(dotStyle).toContain('pulse')
    })

    it('shows yellow/amber color for waiting status', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="waiting" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      expect(dot).toHaveStyle({ backgroundColor: 'var(--agent-drafter)' })
    })

    it('shows green color for completed status', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="completed" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      expect(dot).toHaveStyle({ backgroundColor: 'var(--success)' })
    })

    it('shows red color for error status', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="error" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      expect(dot).toHaveStyle({ backgroundColor: '#ef4444' })
    })

    it('shows orange with pulse for pending_approval status', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="pending_approval" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      expect(dot).toHaveStyle({ backgroundColor: '#f97316' })
      const dotStyle = dot?.getAttribute('style') || ''
      expect(dotStyle).toContain('pulse')
    })

    it('shows gray for skipped status', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="skipped" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      expect(dot).toHaveStyle({ backgroundColor: '#6b6b7b' })
    })
  })

  describe('tool badges', () => {
    it('renders tool badges for email_reader with gmail.read', () => {
      const emailReaderAgent = {
        ...baseAgent,
        role: 'email_reader',
        tools: ['gmail.read'],
      }
      render(<AgentCard agent={emailReaderAgent} status="ready" />)
      expect(screen.getByText('gmail.read')).toBeInTheDocument()
    })

    it('renders multiple tool badges', () => {
      const multiToolAgent = {
        ...baseAgent,
        tools: ['gmail.read', 'gmail.send', 'web.search'],
      }
      render(<AgentCard agent={multiToolAgent} status="ready" />)
      expect(screen.getByText('gmail.read')).toBeInTheDocument()
      expect(screen.getByText('gmail.send')).toBeInTheDocument()
      expect(screen.getByText('web.search')).toBeInTheDocument()
    })

    it('shows maximum of 3 tool badges', () => {
      const manyToolsAgent = {
        ...baseAgent,
        tools: ['tool1', 'tool2', 'tool3', 'tool4', 'tool5'],
      }
      render(<AgentCard agent={manyToolsAgent} status="ready" />)
      const badges = screen.getAllByText(/^tool[123]$/)
      expect(badges).toHaveLength(3)
    })

    it('does not render tool badges when agent has no tools', () => {
      const noToolAgent = { ...baseAgent, tools: [] }
      const { container } = render(<AgentCard agent={noToolAgent} status="ready" />)
      const badges = container.querySelectorAll('span')
      const toolBadges = Array.from(badges).filter(b =>
        !b.textContent?.includes('reader') && !b.textContent?.includes('researcher')
      )
      expect(toolBadges).toHaveLength(0)
    })
  })

  describe('milestone label', () => {
    it('displays milestone text when provided', () => {
      render(<AgentCard agent={baseAgent} status="running" milestone="Reading emails..." />)
      expect(screen.getByText('Reading emails...')).toBeInTheDocument()
    })

    it('displays milestone with result data when completed', () => {
      render(<AgentCard agent={baseAgent} status="completed" milestone="Found 12 unread" />)
      expect(screen.getByText('Found 12 unread')).toBeInTheDocument()
    })

    it('displays error milestone when error occurs', () => {
      render(<AgentCard agent={baseAgent} status="error" milestone="Failed: timeout" />)
      expect(screen.getByText('Failed: timeout')).toBeInTheDocument()
    })
  })

  describe('running pulse animation', () => {
    it('running status triggers CSS pulse animation on status dot', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="running" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      const style = dot?.getAttribute('style') || ''
      expect(style).toContain('animation')
      expect(style).toContain('pulse')
    })

    it('ready status does not have animation', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="ready" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      const style = dot?.getAttribute('style') || ''
      expect(style).not.toContain('animation')
    })

    it('completed status does not have animation', () => {
      const { container } = render(<AgentCard agent={baseAgent} status="completed" />)
      const dot = container.querySelector('div[style*="border-radius: 50%"]')
      const style = dot?.getAttribute('style') || ''
      expect(style).not.toContain('animation')
    })
  })

  describe('agent description', () => {
    it('renders description when provided', () => {
      render(<AgentCard agent={baseAgent} status="ready" />)
      expect(screen.getByText('Reads and processes emails')).toBeInTheDocument()
    })

    it('does not render description when omitted', () => {
      const agentWithoutDesc = { ...baseAgent, description: undefined }
      const { container } = render(<AgentCard agent={agentWithoutDesc} status="ready" />)
      expect(container.textContent).not.toContain('Reads and processes emails')
    })
  })

  describe('role-based border colors', () => {
    it('uses reader color (blue) for email_reader role', () => {
      const { container } = render(<AgentCard agent={{ ...baseAgent, role: 'email_reader' }} status="ready" />)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveStyle({ border: expect.stringContaining('var(--agent-reader)') })
    })

    it('uses drafter color (amber) for response_drafter role', () => {
      const { container } = render(<AgentCard agent={{ ...baseAgent, role: 'response_drafter' }} status="ready" />)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveStyle({ border: expect.stringContaining('var(--agent-drafter)') })
    })

    it('uses accent color for llm role', () => {
      const { container } = render(<AgentCard agent={{ ...baseAgent, role: 'llm' }} status="ready" />)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveStyle({ border: expect.stringContaining('var(--accent)') })
    })

    it('falls back to border color for unknown role', () => {
      const { container } = render(<AgentCard agent={{ ...baseAgent, role: 'unknown_role' }} status="ready" />)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveStyle({ border: expect.stringContaining('var(--border)') })
    })
  })
})
