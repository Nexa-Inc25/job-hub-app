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
      reporter: ['text', 'json', 'html'],
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
        statements: 60,
        branches: 60,
        functions: 50,
        lines: 60
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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React - needed immediately
          if (id.includes('node_modules/react-dom') || 
              id.includes('node_modules/react/') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          // React Router - needed for routing
          if (id.includes('node_modules/react-router') ||
              id.includes('node_modules/@remix-run')) {
            return 'vendor-router';
          }
          // MUI core components - theming essentials
          if (id.includes('node_modules/@mui/material') ||
              id.includes('node_modules/@mui/system') ||
              id.includes('node_modules/@mui/base') ||
              id.includes('node_modules/@mui/utils')) {
            return 'vendor-mui-core';
          }
          // MUI icons - large, split separately for lazy loading
          if (id.includes('node_modules/@mui/icons-material')) {
            return 'vendor-mui-icons';
          }
          // Emotion (MUI styling) - needed with MUI
          if (id.includes('node_modules/@emotion')) {
            return 'vendor-emotion';
          }
          // Charts - only needed on dashboard/reports
          if (id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          // PDF libraries - only needed for PDF viewer/editor
          if (id.includes('node_modules/react-pdf') ||
              id.includes('node_modules/pdf-lib') ||
              id.includes('node_modules/pdfjs-dist')) {
            return 'vendor-pdf';
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
