import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    // Por defecto `true` para probar los stubs; las pruebas de producción lo ponen en `false`.
    __LUNAR_DEMO__: true,
  },
  test: {
    environment: 'jsdom',
  },
});
