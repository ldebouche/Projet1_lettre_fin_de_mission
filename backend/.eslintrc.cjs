module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint','import'],
  extends: ['eslint:recommended','plugin:@typescript-eslint/recommended','prettier'],
  env: { node: true, es2022: true },
  parserOptions: { sourceType: 'module' },
  rules: {
    'import/order': ['warn', { 'newlines-between': 'always', 'alphabetize': { order: 'asc' } }]
  }
};
