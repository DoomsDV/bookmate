// @ts-check
import { defineConfig } from 'astro/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

import sitemap from '@astrojs/sitemap';

const enableBundleVisualizer = process.env.PERF_BUNDLE === '1';

// @ts-expect-error optional dev-only plugin
let visualizerPlugin = null;
if (enableBundleVisualizer) {
	const { visualizer } = await import('rollup-plugin-visualizer');
	visualizerPlugin = visualizer({
		filename: 'perf/reports/bundle-stats.html',
		gzipSize: true,
		brotliSize: true,
		open: false,
	});
}

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

/** Solo en `astro dev`: alias al shim jsx-dev-runtime (no en build prod). */
const reactJsxDevRuntimeAlias = () => ({
  name: 'hasel-react-jsx-dev-runtime-alias',
  apply: 'serve',
  config() {
    return {
      resolve: {
        alias: {
          'react/jsx-dev-runtime': path.resolve(
            projectRoot,
            'vite-shims/react-jsx-dev-runtime.js',
          ),
        },
      },
    };
  },
});

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
      // SSR/MPA: sin app-shell. No precachear `/_astro/*` (hashes por deploy):
      // un solo 404 en install aborta el SW entero (bad-precaching-response)
      // y el dashboard queda sin hidratar.
      navigateFallback: null,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
      directoryIndex: null,
      globPatterns: ['**/*.{ico,png,svg,woff2}', 'manifest.webmanifest'],
      globIgnores: ['**/_astro/**', '**/sw.js', '**/workbox-*.js', '**/registerSW.js'],
      runtimeCaching: [
        {
          urlPattern: ({ url }) =>
            url.pathname.startsWith('/_astro/') && /\.(js|css)$/.test(url.pathname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'hasel-astro-assets',
            cacheableResponse: { statuses: [200] },
            expiration: {
              maxEntries: 80,
              maxAgeSeconds: 60 * 60 * 24 * 30,
            },
          },
        },
      ],
    }
  }), sitemap()],

  vite: {
    plugins: [
      reactJsxDevRuntimeAlias(),
      tailwindcss(),
      ...(visualizerPlugin ? [visualizerPlugin] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, 'src'),
      },
      dedupe: ['react', 'react-dom'],
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
        // Prebundles the aliased shim in `astro dev`, not React's CJS stub.
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
        'three',
        'three/addons/loaders/GLTFLoader.js',
        'three/addons/controls/OrbitControls.js',
        'three/addons/environments/RoomEnvironment.js',
      ]
    }
  }
});