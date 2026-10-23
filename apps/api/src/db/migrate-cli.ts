import { createDatabase } from './client.js';
import { migrateDatabase } from './migrate.js';
import { readConfig } from '../config.js';
const database = createDatabase(readConfig().databaseUrl);
try { await migrateDatabase(database); console.log('Migraciones aplicadas'); }
finally { await database.pool.end(); }
