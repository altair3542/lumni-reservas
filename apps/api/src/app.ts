import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { loginSchema } from '@lumni/shared';
import {
  createSessions,
  cookieOptions,
  SESSION_COOKIE,
  tokenHash,
  requireRole,
} from './auth/session.js';
import { verifyPassword } from './auth/password.js';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { rooms, services, sessions, users } from './db/schema.js';
import { HttpError } from './http/errors.js';
import { isAllowedOrigin } from './http/origin.js';
import { createQuoteRouter } from './quotes/routes.js';
import { QuoteService } from './quotes/service.js';
import { createBookingRouter } from './bookings/routes.js';
import { BookingService } from './bookings/service.js';
export type AppOptions = {
  database: Database;
  config: Config;
  now?: () => Date;
  logError?: (requestId: string) => void;
};
export function createApp({
  database,
  config,
  now = () => new Date(),
  logError = (id) => console.error('API_ERROR', id),
}: AppOptions): Express {
  const app = express();
  const auth = createSessions(database, config, now);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use((req, _res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !isAllowedOrigin(req.get('origin'), config)
    )
      throw new HttpError(403, 'ORIGIN_FORBIDDEN', 'Origen de solicitud no permitido');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.get('/api/health', async (_req, res) => {
    try {
      await database.db.execute(sql`SELECT 1`);
    } catch {
      throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Base de datos no disponible');
    }
    res.json({ status: 'ok', database: 'up' });
  });
  app.post('/api/auth/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const [row] = await database.db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (!(await verifyPassword(input.password, row?.passwordHash)) || !row)
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
    // Reemplaza una sesión previa de este navegador al volver a iniciar sesión.
    const previous: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof previous === 'string')
      await database.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(previous)));
    const token = await auth.issue(row.id);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: config.sessionTtlMs });
    res.json({ user: { id: row.id, email: row.email, fullName: row.fullName, role: row.role } });
  });
  app.get('/api/me', auth.required, (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/logout', auth.required, async (req, res) => {
    const token: string = req.cookies[SESSION_COOKIE];
    await database.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
    res.clearCookie(SESSION_COOKIE, cookieOptions(config));
    res.status(204).end();
  });
  app.get('/api/rooms', auth.required, async (_req, res) =>
    res.json({ items: await database.db.select().from(rooms).orderBy(rooms.capacity) }),
  );
  app.get('/api/services', auth.required, async (_req, res) =>
    res.json({ items: await database.db.select().from(services).orderBy(services.code) }),
  );
  app.use(
    '/api/quotes',
    auth.required,
    requireRole('client'),
    createQuoteRouter(new QuoteService(database, now)),
  );
  app.use(
    '/api/bookings',
    auth.required,
    requireRole('client'),
    createBookingRouter(new BookingService(database, now)),
  );
  if (config.webDistDir) app.use(express.static(config.webDistDir));
  app.use((_req, _res) => {
    throw new HttpError(404, 'NOT_FOUND', 'Ruta no encontrada');
  });
  const errors: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Revisa los datos enviados',
          fieldErrors: z.flattenError(err).fieldErrors,
          requestId: req.requestId,
        },
      });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          requestId: req.requestId,
          ...(err.suggestedSlot !== undefined ? { suggestedSlot: err.suggestedSlot } : {}),
        },
      });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'JSON inválido', requestId: req.requestId },
      });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json({
        error: {
          code: 'BODY_TOO_LARGE',
          message: 'Solicitud demasiado grande',
          requestId: req.requestId,
        },
      });
      return;
    }
    logError(req.requestId);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'No pudimos completar la solicitud',
        requestId: req.requestId,
      },
    });
  };
  app.use(errors);
  return app;
}
