# Pruebas de rendimiento — Hasel (solo local / DEV)

Auditoría de Core Web Vitals, hidratación Astro, bundles y carga contra **localhost:4321** + **ORDS DEV**. No afecta producción.

## Requisitos

- Node ≥ 22, pnpm ≥ 10
- [k6](https://k6.io/docs/get-started/installation/) instalado (`winget install k6`)
- `.env.development` apuntando a ORDS DEV

## Inicio rápido

```powershell
cd bookmate
pnpm install
pnpm run build
pnpm run dev -- --host 127.0.0.1 --port 4321 --force   # terminal 1
# Nota: @astrojs/vercel no soporta `astro preview`; usar dev para auditoría local.

pnpm run perf:hydration   # terminal 2
pnpm run perf:lhci
pnpm run perf:k6:smoke
pnpm run perf:k6:compare  # BFF vs ORDS directo
```

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `perf:hydration` | Puppeteer — React vs HTML puro por ruta |
| `perf:lhci` | Lighthouse CI (puede fallar en Windows por EPERM) |
| `perf:lighthouse` | Lighthouse via Puppeteer (recomendado en Windows) |
| `perf:bundle` | Build + visualizer → `perf/reports/bundle-stats.html` |
| `perf:k6:smoke` | 5 VUs, 30s sanity check |
| `perf:k6:read` | Lecturas públicas BFF |
| `perf:k6:booking` | Flujo reserva (POST con Idempotency-Key) |
| `perf:k6:ords` | Mismo flujo contra ORDS DEV directo |
| `perf:k6:panel` | Panel autenticado (requiere `PERF_JWT`) |
| `perf:k6:compare` | BFF vs ORDS directo (10 VUs max local) |
| `perf:k6:staging` | Ramp 10→25→50 VUs (`BFF_BASE_URL=https://staging.hasel.app`) |
| `perf:all` | hydration + lhci (preview debe estar corriendo) |

## Configuración k6

Defaults en [`k6/config.js`](k6/config.js). Overrides vía env:

```powershell
$env:USER_SLUG='dann-villasanti'
$env:ORG_SLUG='consultorio-dann'
$env:PRO_SLUG='dann-villasanti'
$env:PERF_JWT='<token>'   # opcional, panel-read
k6 run perf/k6/smoke.js
```

Plantilla: [`k6/config.local.example.js`](k6/config.local.example.js) → `config.local.js` (gitignored).

## web-vitals (solo dev)

Con `pnpm dev` o `pnpm preview`, abrí la consola del navegador. En build de producción el reporter **no se incluye** (`import.meta.env.DEV`).

## Presupuestos

Ver [`budgets.json`](budgets.json): LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1, TBT ≤ 200ms.

## Informes

Salida en `perf/reports/` (gitignored). Informe consolidado: `perf/AUDIT.md` (local).

## Límites

- Máx. ~200 VUs contra ORDS DEV (instancia compartida).
- No ejecutar k6 contra `hasel.app` / staging sin acuerdo.
- Rutas `/ai/*` excluidas (costo Azure OpenAI).
