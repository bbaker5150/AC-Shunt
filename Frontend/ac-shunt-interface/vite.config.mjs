import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite config for the AC Shunt React frontend.
// - base: './' so the built index.html loads assets via relative URLs
//   when Electron opens it through file://.
// - outDir: 'build' to preserve the path electron-builder + serve:build expect.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks: {
          chart: ['chart.js', 'react-chartjs-2', 'chartjs-plugin-zoom'],
          katex: ['katex', 'react-katex'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          gsap: ['gsap'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: true,
  },
});
