import { NextRequest, NextResponse } from 'next/server';
import { getRun, getCheckpointsForRun } from '@/lib/db/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const run = await getRun(params.runId);

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const checkpoints = await getCheckpointsForRun(params.runId);

  return NextResponse.json({
    run,
    checkpoints,
  });
}
