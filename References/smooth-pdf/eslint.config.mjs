import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**', 'public/**', 'eslint.config.mjs'],
    },
    js.configs.recommended,
    eslintConfigPrettier,
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': 'warn',
        },
    },
    {
        files: ['renderer.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        files: ['main.js', 'preload.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
];
