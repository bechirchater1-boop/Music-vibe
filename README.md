# MUSIC VIBE

Dynamic music discovery website with a Cloudflare Worker API, Cloudflare D1 database, and a protected admin backoffice.

## Features

- Homepage loads video links dynamically from `GET /api/videos`.
- Admin page at `/admin.html` adds and deletes video links.
- API endpoints: `GET /api/videos`, `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/admin/videos`, `PATCH /api/admin/videos/:id`, `DELETE /api/admin/videos/:id`.
- Admin login uses the `ADMIN_PASSWORD` Worker secret and a signed, HttpOnly session cookie.
- Video metadata is stored in Cloudflare D1.

## Cloudflare setup

1. In Cloudflare, create a D1 database named `music-vibe-db`.
2. Open the D1 database's Console and execute the contents of `schema.sql`.
3. Copy the database UUID and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml`.
4. In the Worker settings, add a D1 binding named `DB` pointing to `music-vibe-db` (the Wrangler configuration also documents this binding).
5. Add a Worker secret named `ADMIN_PASSWORD` with a strong password.
6. In the connected Git deployment settings, use `npx wrangler deploy` as the deploy command. No frontend build command is needed for this static HTML + Worker project.
7. Deploy the Worker.

After deployment:
- Public site: `/`
- Admin backoffice: `/admin.html`
- Public videos API: `/api/videos`

Only share the admin password with trusted administrators. The public video endpoint intentionally exposes video titles and URLs.
