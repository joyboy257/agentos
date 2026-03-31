import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: Request) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
  const offset = (page - 1) * limit;
  const agentId = searchParams.get('agent_id');
  const status = searchParams.get('status');
  const dateRange = searchParams.get('date_range');

  // Build query
  let query = `
    SELECT r.*, a.name as agent_name
    FROM runs r
    JOIN agents a ON r.agent_id = a.id
    WHERE r.user_id = $1
  `;
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (agentId) {
    query += ` AND r.agent_id = $${paramIndex++}`;
    params.push(agentId);
  }

  if (status) {
    query += ` AND r.status = $${paramIndex++}`;
    params.push(status);
  }

  if (dateRange && dateRange !== 'all') {
    const now = new Date();
    let startDate: Date | null = null;
    if (dateRange === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (dateRange === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateRange === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }
    if (startDate) {
      query += ` AND r.created_at >= $${paramIndex++}`;
      params.push(startDate.toISOString());
    }
  }

  query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  return NextResponse.json({ runs: result.rows });
}
