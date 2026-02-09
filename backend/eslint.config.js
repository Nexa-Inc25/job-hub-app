import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // General rules
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'no-console': 'off', // Console is expected in backend
      'no-debugger': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
      
      // Allow certain patterns common in the codebase
      'no-prototype-builtins': 'off',
      
      // Node.js specific
      'no-process-exit': 'off',
    },
  },
  {
    // Test files - more relaxed rules
    files: ['**/*.test.js', '**/__tests__/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'uploads/**',
      'temp/**',
    ],
  },
];

