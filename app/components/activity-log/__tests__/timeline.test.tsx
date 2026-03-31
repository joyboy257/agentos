import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineItem } from '../timeline-item';

describe('TimelineItem', () => {
  it('renders run with completed status', () => {
    const run = {
      id: 'run-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      status: 'completed' as const,
      started_at: new Date(),
      completed_at: new Date(),
      created_at: new Date(),
      agent_name: 'Email Agent',
      actions_count: 5,
    };

    render(<TimelineItem run={run} />);

    expect(screen.getByText('Email Agent')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('5 actions')).toBeInTheDocument();
  });

  it('renders run with failed status', () => {
    const run = {
      id: 'run-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      status: 'failed' as const,
      started_at: new Date(),
      completed_at: new Date(),
      created_at: new Date(),
      agent_name: 'Research Agent',
      actions_count: 2,
    };

    render(<TimelineItem run={run} />);

    expect(screen.getByText('Research Agent')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});
