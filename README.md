# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Environment Variables

Astro/Vite loads env files **by mode**, not a generic `.env`:

| Command | Mode | File loaded |
| :------ | :--- | :---------- |
| `npm run dev` | `development` | `.env.development` |
| `npm run build` | `production` | `.env.production` |

Create the file you need from `.env.example`:

```sh
# Local development (localhost, dev API)
cp .env.example .env.development

# Local production build (optional; Vercel uses dashboard env vars)
cp .env.example .env.production
```

Do **not** use a root `.env` file — it is loaded in every mode and can override the wrong values.

Minimum required values:

- `ORDS_API_BASE_URL`
- `ORDS_PUBLIC_API_BASE_URL`
- `PUBLIC_BOOKMATE_PUBLIC_DOMAIN`
- `PUBLIC_STADIA_MAPS_KEY` (required for MapLibre + Stadia Maps tiles: branch map picker and public location modals)
- `PUBLIC_G_MAPS_API_KEY` (legacy Google Maps key; kept for backwards compatibility, no longer used by the app)

Optional endpoint-specific overrides are documented in `.env.example`.

## Asistente operativo local

La mascota Auri consume el asistente operativo por el endpoint interno de Bookmate;
el navegador no se conecta directamente al servicio Go. Para habilitarla localmente:

1. Activá el complemento `AI_ASSISTANT` y la capability `assistant.use` para la organización de prueba.
2. Ejecutá `bookmate-agent` en `127.0.0.1:8080`.
3. Configurá `BOOKMATE_AGENT_BASE_URL=http://127.0.0.1:8080` en `.env.development`.
4. Iniciá Bookmate con `pnpm dev`.

Si la variable no está configurada, la mascota queda oculta. En un ambiente desplegado,
configurá la misma variable privada en el proveedor de Bookmate; no se requiere CORS.
