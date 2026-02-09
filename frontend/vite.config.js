/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/components/billing/**',
        'src/hooks/**',
        'src/utils/offlineStorage.js'
      ],
      exclude: [
        'node_modules',
        'src/**/*.test.{js,jsx}',
        'src/**/__tests__/**'
      ],
      thresholds: {
        statements: 28,
        branches: 20,
        functions: 20,
        lines: 29
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    // Increase limit since large chunks (PDF, charts) are lazy-loaded
    // and don't affect initial page load performance
    chunkSizeWarningLimit: 800,
    // Use esbuild for minification (faster than terser)
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Don't include hash in entry file for better caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          // Core React - needed immediately (critical path)
          if (id.includes('node_modules/react-dom') || 
              id.includes('node_modules/react/') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          // React Router - needed for routing (critical path)
          if (id.includes('node_modules/react-router') ||
              id.includes('node_modules/@remix-run')) {
            return 'vendor-router';
          }
          // MUI core - needed for UI (critical path)
          if (id.includes('node_modules/@mui/material') ||
              id.includes('node_modules/@mui/system') ||
              id.includes('node_modules/@mui/base') ||
              id.includes('node_modules/@mui/utils')) {
            return 'vendor-mui-core';
          }
          // MUI X Data Grid - only for billing grids (lazy loaded)
          if (id.includes('node_modules/@mui/x-data-grid')) {
            return 'vendor-mui-grid';
          }
          // MUI icons - can be deferred
          if (id.includes('node_modules/@mui/icons-material')) {
            return 'vendor-mui-icons';
          }
          // Emotion (MUI styling) - needed with MUI
          if (id.includes('node_modules/@emotion')) {
            return 'vendor-emotion';
          }
          // Charts - DEFERRED, only loaded on admin/analytics pages
          if (id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          // PDF.js worker - separate chunk for web worker
          if (id.includes('pdfjs-dist/build/pdf.worker')) {
            return 'vendor-pdf-worker';
          }
          // PDF libraries - DEFERRED, only loaded for PDF editing
          if (id.includes('node_modules/react-pdf') ||
              id.includes('node_modules/pdf-lib') ||
              id.includes('node_modules/pdfjs-dist')) {
            return 'vendor-pdf';
          }
          // Date handling
          if (id.includes('node_modules/date-fns') ||
              id.includes('node_modules/dayjs')) {
            return 'vendor-date';
          }
          // HTTP client
          if (id.includes('node_modules/axios')) {
            return 'vendor-http';
          }
        }
      }
    }
  },
  // Handle .js files as JSX (for gradual migration)
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled']
  }
});
