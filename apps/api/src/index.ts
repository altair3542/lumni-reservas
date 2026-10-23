import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './db/client.js';
const config = readConfig();
const database = createDatabase(config.databaseUrl);
const server = createApp({ database, config }).listen(config.port, '127.0.0.1', () => console.log(`API en http://localhost:${config.port}`));
const stop = () => { server.close(() => { void database.pool.end(); }); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
