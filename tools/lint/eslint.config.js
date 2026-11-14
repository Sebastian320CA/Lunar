// Configuración ESLint del repositorio (flat config). Vive en tools/lint para usar
// typescript-eslint con TypeScript 5.9.x (TS 7 no es compatible). Se invoca desde la
// raíz con `eslint -c tools/lint/eslint.config.js .`.
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

const securityRecommendedAsError = Object.fromEntries(
  Object.entries(security.configs.recommended.rules ?? {}).map(([name, setting]) => [
    name,
    Array.isArray(setting) ? ['error', ...setting.slice(1)] : 'error',
  ]),
);

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-demo/**',
      '**/coverage/**',
      'data/**',
      '**/public/assets/decoders/**',
      '.kiro/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { security },
    rules: {
      ...securityRecommendedAsError,
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-script-url': 'error',
      'security/detect-object-injection': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/][right.type!='Literal']:not([right.type='TemplateLiteral'][right.expressions.length=0])",
          message: 'innerHTML/outerHTML solo con literal constante',
        },
        {
          selector:
            "CallExpression[callee.property.name='insertAdjacentHTML'][arguments.1.type!='Literal']",
          message: 'insertAdjacentHTML solo con literal constante',
        },
        {
          selector:
            'MemberExpression[property.name=/^(skip|todo|only|skipIf|runIf)$/][object.name=/^(it|test|describe)$/]',
          message: 'Pruebas omitidas no permitidas (Requirement 9.8, 16.6)',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/stubs/**'],
              message: 'Los stubs solo se cargan con import() dinámico en modo demo',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/security/**/*.ts', 'apps/web/src/security/**/*.ts'],
    rules: { 'security/detect-object-injection': 'error' },
  },
  {
    // Excepción acotada (design.md D1): CLIs de build que leen archivos del repositorio
    // con rutas calculadas desde la raíz. No aplica a src ni a apps/web/src.
    files: ['packages/*/scripts/**', 'tools/**'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    files: ['apps/web/src/stubs/**', 'apps/web/test/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
