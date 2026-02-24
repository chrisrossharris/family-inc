import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/functions';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  adapter: netlify(),
  integrations: [react()],
  output: 'server',
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
});
