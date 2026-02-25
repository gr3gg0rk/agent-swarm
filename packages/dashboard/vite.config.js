import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Read port from shared config per 17-CONTEXT.md
const configPath = './config/dashboard.json';
let port = 5173; // Vite default
try {
  const configContent = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent);
  port = config.port || 5173;
} catch {
  // Use default if config not found
  console.warn('config/dashboard.json not found, using default port 5173');
}

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'terser',
    sourcemap: false
  },
  server: {
    port,
    hmr: {
      overlay: true // Error overlay in browser
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
