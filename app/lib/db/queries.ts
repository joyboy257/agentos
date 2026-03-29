import { sql } from '@vercel/postgres'

export async function getUserByEmail(email: string) {
  const result = await sql`SELECT * FROM users WHERE email = ${email}`
  return result.rows[0] ?? null
}

export async function createUser(id: string, email: string) {
  await sql`INSERT INTO users (id, email) VALUES (${id}, ${email})`
}

export async function createSession(id: string, userId: string, expiresAt: Date) {
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${id}, ${userId}, ${expiresAt.toISOString()})`
}

export async function getSession(sessionId: string) {
  const result = await sql`
    SELECT s.*, u.email
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ${sessionId} AND s.expires_at > NOW()
  `
  return result.rows[0] ?? null
}

export async function deleteSession(sessionId: string) {
  await sql`DELETE FROM sessions WHERE id = ${sessionId}`
}

export async function createMagicLinkToken(tokenHash: string, userId: string, expiresAt: Date) {
  await sql`INSERT INTO magic_links (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, ${expiresAt.toISOString()})`
}

export async function getMagicLinkToken(tokenHash: string) {
  const result = await sql`
    SELECT ml.*, u.email
    FROM magic_links ml
    JOIN users u ON ml.user_id = u.id
    WHERE ml.token_hash = ${tokenHash} AND ml.expires_at > NOW() AND ml.used_at IS NULL
  `
  return result.rows[0] ?? null
}

export async function markMagicLinkUsed(tokenHash: string) {
  await sql`UPDATE magic_links SET used_at = NOW() WHERE token_hash = ${tokenHash}`
}

export async function getTeamsByUser(userId: string) {
  const result = await sql`SELECT * FROM teams WHERE user_id = ${userId} ORDER BY updated_at DESC`
  return result.rows
}

export async function createTeam(id: string, userId: string, name: string, agents: string, connections: string) {
  await sql`INSERT INTO teams (id, user_id, name, agents, connections) VALUES (${id}, ${userId}, ${name}, ${agents}, ${connections})`
}

export async function getTeam(teamId: string) {
  const result = await sql`SELECT * FROM teams WHERE id = ${teamId}`
  return result.rows[0] ?? null
}

export async function saveCredential(id: string, userId: string, provider: string, encryptedToken: string, expiresAt: Date | null) {
  await sql`
    INSERT INTO credentials (id, user_id, provider, encrypted_token, expires_at)
    VALUES (${id}, ${userId}, ${provider}, ${encryptedToken}, ${expiresAt?.toISOString() ?? null})
    ON CONFLICT (id) DO UPDATE SET encrypted_token = ${encryptedToken}, expires_at = ${expiresAt?.toISOString() ?? null}
  `
}

export async function getCredential(userId: string, provider: string) {
  const result = await sql`SELECT * FROM credentials WHERE user_id = ${userId} AND provider = ${provider}`
  return result.rows[0] ?? null
}
