// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

import preact from '@astrojs/preact';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://bookmate-hazel.vercel.app',
  output: 'server',
  adapter: vercel(),
  integrations: [preact()],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@fullcalendar/core',
        '@fullcalendar/core/locales/es',
        '@fullcalendar/interaction',
        '@fullcalendar/daygrid',
        '@fullcalendar/timegrid',
        '@fullcalendar/list'
      ]
    }
  }
});
