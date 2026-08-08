// @ts-check
import { defineConfig } from 'astro/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
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

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  // 2. Le pasamos la URL dinámica a Astro
  site: getSiteUrl(),
  output: 'server',
  // Astro 7 default is 'jsx' (strips inter-element spaces); keep HTML-aware spacing.
  compressHTML: true,
  devToolbar: {
    enabled: false,
  },
  
  // CSRF: reject cross-origin mutating requests when Origin mismatches.
  // On Vercel the request URL origin is often https://localhost; allowedDomains
  // lets Astro trust X-Forwarded-Host for staging/prod custom domains.
  security: {
    checkOrigin: true,
    allowedDomains: [
      { hostname: 'staging.hasel.app', protocol: 'https' },
      { hostname: 'hasel.app', protocol: 'https' },
      { hostname: 'www.hasel.app', protocol: 'https' },
    ],
  },
  
  adapter: vercel(),
  
  integrations: [react(),
  AstroPWA({
    // prompt: evita location.reload() automático al activar un SW nuevo
    // (con autoUpdate el login/auth se recargaba solo al entrar).
    registerType: 'prompt',
    manifest: {
      name: 'Hasel',
      short_name: 'Hasel',
      start_url: '/panel/dashboard',
      description: 'Aplicación de reservas con Astro, React y Tailwind',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512x512.png',
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
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, 'src'),
      },
    },
    // MapLibre v6 is ESM-only; keep it out of the dep optimizer so the worker
    // sibling is not rewritten to a broken `/node_modules/.vite/deps/*.mjs`
    // stub with empty MIME. The app sets the worker via `?url`.
    ssr: {
      noExternal: ['maplibre-gl'],
    },
    optimizeDeps: {
      exclude: ['maplibre-gl'],
      include: [
        // Root vite.optimizeDeps.include can shadow @astrojs/react's
        // per-environment includes (Vite Environment API). Without these,
        // react-dom/client is served as raw CJS and hydration fails with
        // "does not provide an export named 'createRoot'".
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/client',
        '@fullcalendar/core',
        '@fullcalendar/core/locales/es',
        '@fullcalendar/interaction',
        '@fullcalendar/daygrid',
        '@fullcalendar/timegrid',
        '@fullcalendar/list',
        // Client scripts loaded on panel routes; prebundle to avoid stale
        // optimize-dep 504 / empty MIME in the browser after cache churn.
        'driver.js',
        'croppie',
        'marked',
        'firebase/app',
        'firebase/messaging',
      ]
    }
  }
});