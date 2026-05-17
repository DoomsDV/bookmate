// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

import sitemap from '@astrojs/sitemap';

// 1. Obtenemos la URL dinámica de Vercel si existe, si no, usamos la oficial o localhost.
const getSiteUrl = () => {
  const siteUrl = String(process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '').trim();
  if (siteUrl) {
    return siteUrl.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:4321';
};

// https://astro.build/config
export default defineConfig({
  // 2. Le pasamos la URL dinámica a Astro
  site: getSiteUrl(),
  output: 'server',
  
  // 3. ¡VOLVEMOS A PRENDER LA SEGURIDAD!
  security: {
    checkOrigin: false
  },
  
  adapter: vercel(),
  
  integrations: [preact(), // <-- Agregamos y configuramos la PWA aquí
  AstroPWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Hasel',
      short_name: 'Hasel',
      start_url: '/panel/dashboard',
      description: 'Aplicación de reservas con Astro, Preact y Tailwind',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        {
          src: '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    },
    workbox: {
      // This app is SSR/MPA, so we do not use SPA app-shell fallback navigation.
      navigateFallback: null,
      // Cachea los assets estáticos generados por Astro/Vite
      globPatterns: ['**/*.{js,css,html,ico,png,svg}']
    }
  }), sitemap()],

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