import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  const result = await sql`
    SELECT * FROM reasoning_traces
    WHERE run_id = ${runId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return NextResponse.json({ trace: null });
  }

  return NextResponse.json({ trace: result.rows[0] });
}
