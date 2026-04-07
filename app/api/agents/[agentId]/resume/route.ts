import { NextRequest, NextResponse } from 'next/server';
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

  // Only paused_budget agents can be resumed via this endpoint
  if (agent.status !== 'paused_budget') {
    return NextResponse.json({ error: 'Agent is not paused on budget' }, { status: 400 });
  }

  // Resume: reset agent status to idle so the next run can execute
  await updateAgentStatus(agentId, 'idle');

  return NextResponse.json({ success: true });
}
