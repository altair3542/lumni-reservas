import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { CookieOptions, RequestHandler } from 'express';
import type { User } from '@lumni/shared';
import type { Database } from '../db/client.js';
import type { Config } from '../config.js';
import { sessions, users } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
export const SESSION_COOKIE = 'lumni_session';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const cookieOptions = (config: Config): CookieOptions => ({
  httpOnly: true,
  secure: config.secureCookies,
  sameSite: 'lax',
  path: '/',
});
export function createSessions(
  database: Database,
  config: Config,
  now: () => Date,
): { issue: (userId: string) => Promise<string>; required: RequestHandler } {
  const issue = async (userId: string) => {
    const token = randomBytes(32).toString('base64url');
    await database.db.insert(sessions).values({
      tokenHash: tokenHash(token),
      userId,
      expiresAt: new Date(now().getTime() + config.sessionTtlMs),
    });
    return token;
  };
  return { issue, required: requireAuth(database, now) };
}

export function requireAuth(database: Database, now: () => Date): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new HttpError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar');
    const [user] = await database.db
      .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, now())))
      .limit(1);
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'La sesión no existe o expiró');
    req.user = user;
    next();
  };
}
export const requireRole =
  (role: User['role']): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Inicia sesión');
    if (req.user.role !== role)
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    next();
  };
