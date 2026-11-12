# MUSIC VIBE

Dynamic music discovery website with a Cloudflare Worker API, Cloudflare D1 database, and a protected admin backoffice.

## Features

- Existing MUSIC VIBE homepage is served from `public/index.html`.
- Homepage loads administrator-added videos dynamically from `GET /api/videos`.
- Admin page: `/admin.html`.
- Admin API supports login, session checks, adding, editing, deleting and logout.
- Video metadata is stored in Cloudflare D1.
- Admin sessions use a signed, HttpOnly, Secure, SameSite cookie.

## Cloudflare setup

1. Create a D1 database named `music-vibe-db`.
2. Open its Console and execute the SQL in `schema.sql`.
3. Copy the D1 database UUID into `database_id` in `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
4. In Worker secrets, add `ADMIN_PASSWORD` with a strong, unique password. Optionally add `SESSION_SECRET` with a separate random secret of at least 32 characters.
5. Connect this GitHub repository to the Cloudflare Worker `music-vibe` using this Wrangler configuration. Set the deploy command to `npx wrangler deploy`; no frontend build command is required.
6. Deploy the Worker.

The `DB` D1 binding and `ASSETS` static-assets binding are declared in `wrangler.toml`. Do not create a second binding with a different name.

## Routes

- Public site: `/`
- Admin backoffice: `/admin.html`
- Public video list: `GET /api/videos`
- Admin login: `POST /api/admin/login`
- Admin session: `GET /api/admin/session`
- Add video: `POST /api/admin/videos`
- Edit video: `PATCH /api/admin/videos/:id`
- Delete video: `DELETE /api/admin/videos/:id`
- Logout: `POST /api/admin/logout`

Only share the admin password with trusted administrators. The public video endpoint intentionally exposes video titles and URLs. Only HTTPS YouTube and Vimeo links are accepted.
