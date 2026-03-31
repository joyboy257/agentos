import { NextRequest, NextResponse } from 'next/server';
import { deleteAgent, updateAgentStatus } from '@/lib/db/queries';
import { cancelSchedule } from '@/lib/scheduler';
import { getAgent } from '@/lib/db/queries';

export async function DELETE(
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

  // Cancel scheduled heartbeats
  await cancelSchedule(agentId);

  // Delete the agent
  await deleteAgent(agentId);

  return NextResponse.json({ success: true });
}
