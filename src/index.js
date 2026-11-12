const SESSION_COOKIE = "__Host-music_vibe_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function validSession(request, env) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + "="));
  if (!match) return false;
  const token = match.slice(SESSION_COOKIE.length + 1);
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = await sign(payload, secret);
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch !== 0) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return data.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

async function makeSession(env) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  const signature = await sign(payload, env.SESSION_SECRET || env.ADMIN_PASSWORD);
  return payload + "." + signature;
}

function cookieHeader(value, maxAge) {
  return SESSION_COOKIE + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}

function validVideoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["youtube.com","www.youtube.com","youtu.be","m.youtube.com","vimeo.com","www.vimeo.com"].includes(url.hostname);
  } catch { return false; }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/videos") {
    const { results } = await env.DB.prepare("SELECT id, title, url, created_at FROM videos ORDER BY id DESC").all();
    return json({ videos: results || [] }, 200, { "cache-control": "public, max-age=30" });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    if (!env.ADMIN_PASSWORD) return json({ error: "Admin password is not configured." }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    if (typeof body.password !== "string" || body.password !== env.ADMIN_PASSWORD) {
      return json({ error: "Incorrect password." }, 401);
    }
    const token = await makeSession(env);
    return json({ ok: true }, 200, { "set-cookie": cookieHeader(token, SESSION_SECONDS) });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/session") {
    const authenticated = await validSession(request, env);
    return json({ authenticated }, authenticated ? 200 : 401);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });
  }

  if (url.pathname.startsWith("/api/admin/videos")) {
    if (!(await validSession(request, env))) return json({ error: "Unauthorized." }, 401);
    if (request.method === "POST" && url.pathname === "/api/admin/videos") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const videoUrl = typeof body.url === "string" ? body.url.trim() : "";
      if (!title || title.length > 160 || !validVideoUrl(videoUrl)) return json({ error: "Enter a title and a valid YouTube or Vimeo HTTPS link." }, 400);
      const result = await env.DB.prepare("INSERT INTO videos (title, url) VALUES (?, ?)").bind(title, videoUrl).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    }

    const match = url.pathname.match(/^\/api\/admin\/videos\/(\d+)$/);
    if (!match) return json({ error: "Not found." }, 404);
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Invalid video ID." }, 400);

    if (request.method === "PATCH") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      const current = await env.DB.prepare("SELECT id, title, url FROM videos WHERE id = ?").bind(id).first();
      if (!current) return json({ error: "Video not found." }, 404);
      const title = body.title === undefined ? current.title : (typeof body.title === "string" ? body.title.trim() : "");
      const videoUrl = body.url === undefined ? current.url : (typeof body.url === "string" ? body.url.trim() : "");
      if (!title || title.length > 160 || !validVideoUrl(videoUrl)) return json({ error: "Enter a title and a valid YouTube or Vimeo HTTPS link." }, 400);
      await env.DB.prepare("UPDATE videos SET title = ?, url = ? WHERE id = ?").bind(title, videoUrl, id).run();
      return json({ ok: true });
    }

    if (request.method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return json({ error: "Video not found." }, 404);
      return json({ ok: true });
    }
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env); }
      catch (error) {
        return json({ error: "Server error. Check the D1 binding and database schema." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
