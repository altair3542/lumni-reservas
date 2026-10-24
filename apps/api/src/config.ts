import { z } from 'zod';
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url().refine(v => v.startsWith('postgres://') || v.startsWith('postgresql://')),
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  WEB_DIST_DIR: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new Error('Configuración inválida: revisa DATABASE_URL, PORT, WEB_ORIGIN y SESSION_TTL_HOURS');
  const v = parsed.data;
  return { host: v.HOST, webDistDir: v.WEB_DIST_DIR, databaseUrl: v.DATABASE_URL, port: v.PORT, webOrigin: new URL(v.WEB_ORIGIN).origin, secureCookies: v.NODE_ENV === 'production', sessionTtlMs: v.SESSION_TTL_HOURS * 3600000 };
}
export type Config = ReturnType<typeof readConfig>;
