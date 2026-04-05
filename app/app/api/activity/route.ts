import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getUserId } from '@/lib/auth/middleware-helpers';

export async function GET(request: Request) {
  let userId: string;
  try {
    userId = await getUserId(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);

  // Build query joining runs with agents to get agent_name
  // Filter to runs within the last 90 days by default
  let query = `
    SELECT r.id, r.agent_id, r.status, r.started_at, r.completed_at, r.result,
           a.name as agent_name
    FROM runs r
    JOIN agents a ON r.agent_id = a.id
    WHERE r.user_id = $1
      AND r.started_at >= NOW() - INTERVAL '90 days'
  `;
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (teamId) {
    query += ` AND r.team_id = $${paramIndex++}`;
    params.push(teamId);
  }

  if (search) {
    query += ` AND a.name ILIKE $${paramIndex++}`;
    params.push(`%${search}%`);
  }

  if (status) {
    query += ` AND r.status = $${paramIndex++}`;
    params.push(status);
  }

  query += ` ORDER BY r.started_at DESC LIMIT $${paramIndex++}`;
  params.push(limit);

  const result = await sql.query(query, params);

  return NextResponse.json({ runs: result.rows });
}
