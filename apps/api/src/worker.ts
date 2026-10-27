import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from './db/client.js';
import { readWorkerConfig } from './emails/config.js';
import { createCaptureSink } from './emails/sink.js';
import { EmailWorker } from './emails/service.js';
import { consumeEmails } from './emails/loop.js';
import { errorDetails } from './http/error-details.js';

async function main() {
  const config = readWorkerConfig();
  const database = createDatabase(config.databaseUrl);
  const signal = new AbortController();
  const stop = () => signal.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const marker = config.healthFile ?? join(tmpdir(), 'lumni-email-worker-heartbeat');
  let started = false;
  try {
    await consumeEmails(new EmailWorker(database, createCaptureSink(config.failureMode)), {
      signal: signal.signal,
      batchSize: config.batchSize,
      pollIntervalMs: config.pollIntervalMs,
      onResult: (result) =>
        console.log('EMAIL_WORKER', result.status, result.eventId, result.attempts),
      onError: (error) => console.error('EMAIL_WORKER_ERROR', errorDetails(error)),
      onCycle: async () => {
        await writeFile(marker, String(Date.now()));
        if (!started) {
          console.log('Worker de correo iniciado: captura local en PostgreSQL.');
          started = true;
        }
      },
    });
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await database.pool.end();
    await unlink(marker).catch(() => undefined);
  }
}
void main().catch((error: unknown) => {
  console.error(
    'No se pudo iniciar el worker de correo. Revisa DATABASE_URL y EMAIL_*.',
    errorDetails(error),
  );
  process.exitCode = 1;
});
