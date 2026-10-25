import { openTestDatabase } from '../helpers.js';
import { EmailWorker } from '../../src/emails/service.js';
import { LocalCaptureSink, type CaptureSink } from '../../src/emails/sink.js';

if (process.env.NODE_ENV !== 'test' || !process.send) throw new Error('Solo fixture de prueba IPC');
const database = openTestDatabase();
const local = new LocalCaptureSink();
const mode = process.argv[2];
if (mode !== 'before' && mode !== 'after') throw new Error('Modo de prueba inválido');
const sink: CaptureSink = {
  async capture(db, event, now) {
    await local.capture(db, event, now);
    process.send!({ phase: 'captured' });
    await new Promise<void>(() => {});
  },
};
process.on('message', () => {});
await new EmailWorker(database, mode === 'before' ? sink : local).processOne();
process.send({ phase: 'committed' });
