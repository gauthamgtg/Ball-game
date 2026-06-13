import { defineConfig } from 'vite';

// Vite builds the game into `dist/`, which Capacitor wraps as the native
// web asset directory for both iOS and Android.
export default defineConfig({
  base: '', // relative asset paths so it works inside a native WebView
  server: {
    host: true, // expose on LAN for testing on real phones during `npm run dev`
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2018',
    sourcemap: false,
  },
});
