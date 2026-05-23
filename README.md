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
- `PUBLIC_G_MAPS_API_KEY` (required for branch map in locations)

Optional endpoint-specific overrides are documented in `.env.example`.
