import { defineConfig, type Plugin } from 'vite';

/**
 * CSP estricta; sin 'unsafe-inline' ni 'unsafe-eval'.
 * 'wasm-unsafe-eval' permite compilar WebAssembly (decodificadores Draco/KTX2/meshopt de three.js).
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Solo en build: en dev Vite inyecta CSS como <style> y usa HMR por websocket.
// Nota: frame-ancestors se ignora en <meta>; debe enviarse como cabecera HTTP al desplegar.
function cspPlugin(): Plugin {
  return {
    name: 'lunar-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// Modos: `production` (por defecto en `vite build`) y `demo` (incluye stubs).
export default defineConfig(({ mode }) => ({
  publicDir: '../../public',
  plugins: [cspPlugin()],
  define: {
    __LUNAR_DEMO__: JSON.stringify(mode === 'demo'),
  },
  build: {
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // En `demo` cada stub queda en un chunk aparte nombrado `<nombre>.stub-<hash>.js`.
        chunkFileNames: '[name]-[hash].js',
        manualChunks(id) {
          if (id.includes('node_modules') && /[\\/]three[\\/]/.test(id)) return 'three';
          return undefined;
        },
      },
    },
  },
}));
