import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const ownedTypeScriptFiles = [
  'src/main.tsx',
  'src/App.tsx',
  'src/product/**/*.{ts,tsx}',
  'src/shadcn-lab/**/*.{ts,tsx}',
  'scripts/fixtures/**/*.tsx',
]

const reactHookRules = Object.fromEntries(
  Object.entries(reactHooks.configs.flat['recommended-latest'].rules).map(
    ([ruleName, ruleConfig]) => [
      ruleName,
      Array.isArray(ruleConfig) ? ['error', ...ruleConfig.slice(1)] : 'error',
    ],
  ),
)

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/components/**',
      'src/hooks/**',
      'vendor/**',
    ],
  },
  {
    name: 'owned-typescript',
    files: ownedTypeScriptFiles,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHookRules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    name: 'owned-visual-gate',
    files: ['scripts/product-visual-gate.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
)
