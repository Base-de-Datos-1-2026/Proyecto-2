import { defineConfig } from 'vite';
import { ripple } from '@ripple-ts/vite-plugin';

export default defineConfig({
  plugins: [ripple()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
