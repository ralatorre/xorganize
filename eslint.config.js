import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['.output/', '.wxt/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    rules: {
      // Captured post content is untrusted. It is only ever rendered as text.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Do not use innerHTML or outerHTML. Render text nodes instead.',
        },
        {
          selector: 'CallExpression[callee.property.name="insertAdjacentHTML"]',
          message: 'Do not use insertAdjacentHTML. Render text nodes instead.',
        },
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'Do not use dangerouslySetInnerHTML. Render text nodes instead.',
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'tests/**'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
