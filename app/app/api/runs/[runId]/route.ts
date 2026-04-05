import { NextRequest, NextResponse } from 'next/server';
import { getRun, getCheckpointsForRun } from '@/lib/db/queries';
import { getUserId } from '@/lib/auth/middleware-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const userId = await getUserId(request);

  const run = await getRun(runId);

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const checkpoints = await getCheckpointsForRun(runId);

  return NextResponse.json({
    run,
    checkpoints,
  });
}
