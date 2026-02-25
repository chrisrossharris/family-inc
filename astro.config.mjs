import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import clerk from '@clerk/astro';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  adapter: netlify(),
  integrations: [react(), clerk()],
  output: 'server',
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
});
