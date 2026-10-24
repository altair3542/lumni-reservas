import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.pnpm-store/**', 'work/**', '**/drizzle/meta/**'] },
  js.configs.recommended, ...tseslint.configs.recommended,
  { files: ['scripts/**/*.mjs', 'infra/**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly' } } },
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
