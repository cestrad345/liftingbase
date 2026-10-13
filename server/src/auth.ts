import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import { HttpError } from './http.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const passwordHash = (password: string, salt: string) => scryptSync(password, salt, 64).toString('hex');
const credentials = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(128) });
const tokenLife = 1000 * 60 * 60 * 24 * 14;
const router = Router();

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  void (async () => {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(req.header('authorization') ?? '')?.[1];
    if (!token) throw new HttpError(401, 'Please log in');
    const found = await db.execute({ sql: `SELECT u.id, u.email FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.expires_at > ?`, args: [sha(token), new Date().toISOString()] });
    if (!found.rows.length) throw new HttpError(401, 'Session expired. Please log in');
    resUser.set(req, { id: Number(found.rows[0].id), email: String(found.rows[0].email) });
    next();
  })().catch(next);
}
const resUser = new WeakMap<Request, { id: number; email: string }>();
export function currentUser(req: Request) {
  const user = resUser.get(req);
  if (!user) throw new HttpError(401, 'Please log in');
  return user;
}
async function issueToken(userId: number) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + tokenLife).toISOString();
  await db.execute({ sql: 'INSERT INTO auth_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', args: [userId, sha(token), expires] });
  return token;
}
router.post('/register', async (req, res) => {
  const input = credentials.parse(req.body);
  const salt = randomBytes(16).toString('hex');
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [input.email] });
  if (existing.rows.length) throw new HttpError(409, 'Email is already registered');
  let result;
  try {
    result = await db.execute({ sql: 'INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)', args: [input.email, passwordHash(input.password, salt), salt] });
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Email is already registered');
    throw err;
  }
  const id = Number(result.lastInsertRowid);
  res.status(201).json({ token: await issueToken(id), user: { id, email: input.email } });
});
router.post('/login', async (req, res) => {
  const input = credentials.parse(req.body);
  const result = await db.execute({ sql: 'SELECT id, password_hash, password_salt FROM users WHERE email = ?', args: [input.email] });
  const row = result.rows[0];
  if (!row) throw new HttpError(401, 'Invalid email or password');
  const actual = Buffer.from(String(row.password_hash), 'hex');
  const expected = Buffer.from(passwordHash(input.password, String(row.password_salt)), 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(401, 'Invalid email or password');
  const id = Number(row.id);
  res.json({ token: await issueToken(id), user: { id, email: input.email } });
});
router.get('/me', requireUser, (req, res) => res.json(currentUser(req)));
router.post('/logout', requireUser, async (req, res) => {
  const token = req.header('authorization')!.slice(7);
  await db.execute({ sql: 'DELETE FROM auth_tokens WHERE token_hash = ?', args: [sha(token)] });
  res.status(204).end();
});
export default router;
