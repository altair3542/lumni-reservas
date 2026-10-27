import type { RequestHandler } from 'express';
import { HttpError } from '../http/errors.js';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 30;
const MAX_CLIENTS = 4096;

export function createLoginLimiter(now: () => Date): RequestHandler {
  const clients = new Map<string, { attempts: number; resetsAt: number }>();
  return (req, res, next) => {
    const time = now().getTime();
    // Express no confía en X-Forwarded-For: la IP procede de la conexión.
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    let client = clients.get(ip);
    if (!client || client.resetsAt <= time) {
      if (!client && clients.size >= MAX_CLIENTS) {
        for (const [key, entry] of clients) if (entry.resetsAt <= time) clients.delete(key);
        if (clients.size >= MAX_CLIENTS) {
          res.setHeader('Retry-After', '60');
          throw new HttpError(429, 'LOGIN_RATE_LIMIT', 'Demasiados intentos. Espera un minuto.');
        }
      }
      client = { attempts: 0, resetsAt: time + WINDOW_MS };
      clients.set(ip, client);
    }
    if (client.attempts >= MAX_ATTEMPTS) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((client.resetsAt - time) / 1000))));
      throw new HttpError(
        429,
        'LOGIN_RATE_LIMIT',
        'Demasiados intentos. Intenta de nuevo después.',
      );
    }
    client.attempts += 1;
    next();
  };
}
