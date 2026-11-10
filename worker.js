const COOKIE = "mv_admin";
const encoder = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function isAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  if (!token || !env.ADMIN_PASSWORD) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return (await sign(expires, env.ADMIN_PASSWORD)) === signature;
}
function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {status, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
}
function cleanText(value, max=120) { return typeof value==="string" ? value.trim().slice(0,max) : ""; }

export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
   if (!env.DB) return json({error:"Database is not configured. Add the D1 binding named DB."},503);
   if (request.method==="GET" && url.pathname==="/api/videos") {
    const {results=[]}=await env.DB.prepare("SELECT id,title,url,category,created_at FROM videos ORDER BY created_at DESC").all();
    return json({videos:results});
   }
   if (request.method==="POST" && url.pathname==="/api/admin/login") {
    const body=await request.json().catch(()=>({}));
    if (!env.ADMIN_PASSWORD || body.password!==env.ADMIN_PASSWORD) return json({error:"Mot de passe incorrect."},401);
    const expires=String(Date.now()+12*60*60*1000);
    const token=expires+"."+await sign(expires,env.ADMIN_PASSWORD);
    return json({ok:true},200,{"Set-Cookie":COOKIE+"="+token+"; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200"});
   }
   if (url.pathname==="/api/admin/session" && request.method==="GET") {\n    return (await isAdmin(request,env)) ? json({ok:true}) : json({error:"Not authenticated"},401);\n   }\n   if (url.pathname==="/api/admin/logout" && request.method==="POST") {
    return json({ok:true},200,{"Set-Cookie":COOKIE+"=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"});
   }
   if (!url.pathname.startsWith("/api/admin/")) return json({error:"Not found"},404);
   if (!(await isAdmin(request,env))) return json({error:"Connexion administrateur requise."},401);
   if (url.pathname==="/api/admin/videos" && request.method==="POST") {
    const body=await request.json().catch(()=>({}));
    const title=cleanText(body.title,120), videoUrl=cleanText(body.url,500), category=cleanText(body.category,60)||"Music";
    let parsed;
    try { parsed=new URL(videoUrl); } catch { return json({error:"Lien invalide."},400); }
    if (!title || !["https:","http:"].includes(parsed.protocol)) return json({error:"Ajoute un titre et un lien HTTP/HTTPS valide."},400);
    const id=crypto.randomUUID(), created_at=new Date().toISOString();
    await env.DB.prepare("INSERT INTO videos (id,title,url,category,created_at) VALUES (?,?,?,?,?)").bind(id,title,parsed.href,category,created_at).run();
    return json({ok:true,video:{id,title,url:parsed.href,category,created_at}},201);
   }
   const match=url.pathname.match(/^\/api\/admin\/videos\/([a-f0-9-]+)$/i);
   if (match && request.method==="DELETE") {
    await env.DB.prepare("DELETE FROM videos WHERE id=?").bind(match[1]).run();
    return json({ok:true});
   }
   if (match && request.method==="PATCH") {
    const body=await request.json().catch(()=>({}));
    const title=cleanText(body.title,120), category=cleanText(body.category,60)||"Music";
    if (!title) return json({error:"Titre obligatoire."},400);
    await env.DB.prepare("UPDATE videos SET title=?,category=? WHERE id=?").bind(title,category,match[1]).run();
    return json({ok:true});
   }
   return json({error:"Not found"},404);
  }
  return env.ASSETS.fetch(request);
 }
};
