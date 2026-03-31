import { NextRequest, NextResponse } from 'next/server';
import { scheduleAgent } from '@/lib/scheduler';
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
  const { cronExpression } = await request.json();

  if (!cronExpression) {
    return NextResponse.json({ error: 'cronExpression required' }, { status: 400 });
  }

  // Verify agent belongs to user
  const agent = await getAgent(agentId);
  if (!agent || agent.user_id !== userId) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Schedule the agent
  await scheduleAgent(agentId, cronExpression);

  // Update agent status to idle
  await updateAgentStatus(agentId, 'idle');

  return NextResponse.json({ success: true, schedule: cronExpression });
}
