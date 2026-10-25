import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url().refine((url) => /^postgres(?:ql)?:/.test(url)),
  EMAIL_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  EMAIL_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  EMAIL_FAILURE_MODE: z.enum(['none', 'always', 'first-two']).default('none'),
  EMAIL_HEALTH_FILE: z.string().min(1).optional(),
});
export function readWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (
    !parsed.success ||
    (parsed.data.NODE_ENV === 'production' && parsed.data.EMAIL_FAILURE_MODE !== 'none')
  )
    throw new Error(
      'Configuración de correo inválida. Revisa DATABASE_URL y EMAIL_*; fallos simulados solo en desarrollo/test.',
    );
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    pollIntervalMs: parsed.data.EMAIL_POLL_INTERVAL_MS,
    batchSize: parsed.data.EMAIL_BATCH_SIZE,
    failureMode: parsed.data.EMAIL_FAILURE_MODE,
    healthFile: parsed.data.EMAIL_HEALTH_FILE,
  };
}
