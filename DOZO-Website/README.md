# DOZO public website

The independently buildable and deployable public marketing site for DOZO. It uses
Astro with TypeScript and static output, supports Polish and English, and is deployed
as a separate static-file artifact from the dashboard and backend.

The website presents the product and links to the merchant and operator experiences. It
does not own authentication, merchant data, terminal configuration, reporting, or
subscription/payment behavior.

## Requirements

- Node.js 22 LTS (`>=22.22.0`)
- npm; `package-lock.json` is committed, so install with `npm ci`

## Commands

Run these from `DOZO-Website/`:

```bash
npm ci           # install the locked dependencies
npm run dev      # local development server
npm run check    # Astro and TypeScript checks
npm run build    # write the static site to dist/
npm run preview  # serve the built dist/ locally
```

`npm run build` produces `DOZO-Website/dist/` with static files only. Do not commit
`dist/` or `node_modules/`.

## VPS static-file deployment

The site targets the DOZO VPS as an independent static-file artifact. It has no Node
runtime, server process, or database on the host; the existing reverse proxy serves the
files.

1. On a build machine, run `npm ci && npm run build`.
2. Copy the contents of `dist/` to the static root the reverse proxy already serves
   (for example with `rsync -a --delete dist/ user@dozo-vps:/srv/dozo-website/`).
3. Keep the existing reverse proxy in front of that directory. Do not start a second
   proxy or application process for the website.
4. Reload the proxy only if its configuration changed.

This repository documents the procedure only. It does not claim a live deployment, and
the public origin is tracked separately.

See `AGENTS.md` for Website task boundaries and `../.opencode/docs/delivery-workflow.md`
for issue, worktree, and verification rules.
