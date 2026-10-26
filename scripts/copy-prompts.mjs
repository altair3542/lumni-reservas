import { cpSync } from 'node:fs';
cpSync(
  new URL('../apps/api/src/prompts/', import.meta.url),
  new URL('../apps/api/dist/prompts/', import.meta.url),
  { recursive: true },
);
