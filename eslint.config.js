import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'site/dist', 'coverage', 'node_modules', '**/*.html'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-control-regex': 'off',
    },
  },
  {
    files: ['test/**'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
  {
    files: ['site/**/*.{js,ts}', 'design/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  prettier,
);
