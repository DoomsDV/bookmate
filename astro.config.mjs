// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro'; // <-- Importamos la PWA

// 1. Obtenemos la URL dinámica de Vercel si existe, si no, usamos la oficial o localhost.
const getSiteUrl = () => {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback para tu entorno local
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
  
  integrations: [
    preact(),
    // <-- Agregamos y configuramos la PWA aquí
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bookmate',
        short_name: 'Bookmate',
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
        // Cachea los assets estáticos generados por Astro/Vite
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],

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