import { NextRequest, NextResponse } from 'next/server';
import { cancelSchedule } from '@/lib/scheduler';
import { getAgent, updateAgentStatus } from '@/lib/db/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId } = params;

  // Verify agent belongs to user
  const agent = await getAgent(agentId);
  if (!agent || agent.user_id !== userId) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Cancel scheduled heartbeats — does NOT cancel in-progress runs
  await cancelSchedule(agentId);

  // Update agent status to paused
  await updateAgentStatus(agentId, 'paused');

  return NextResponse.json({ success: true });
}
