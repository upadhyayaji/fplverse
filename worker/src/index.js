const FPL_ORIGIN = "https://fantasy.premierleague.com/api";
const ENTRY_RE = /^\/api\/entry\/(\d{1,8})(\/history)?\/?$/;
const LEAGUE_RE = /^\/api\/league\/(\d{1,8})\/?$/;

function corsHeaders(origin, env) {
  const configured = String(env.ALLOWED_ORIGIN || "https://upadhyayaji.github.io");
  const allowed = origin === configured || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : configured,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(body, status, origin, env) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin, env) });
}

async function proxy(upstreamPath, origin, env) {
  const upstreamUrl = `${FPL_ORIGIN}${upstreamPath}`;
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl, { method: "GET" });
  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "FPLVerse/2.0 (+https://github.com/upadhyayaji/fplverse)",
      },
      cf: { cacheEverything: true, cacheTtl: 120 },
    });
    if (response.ok) await cache.put(cacheKey, response.clone());
  }
  if (!response.ok) {
    const message = response.status === 404 ? "FPL could not find that Entry ID or league." : "The FPL service is temporarily unavailable.";
    return json({ error: message }, response.status, origin, env);
  }
  const headers = corsHeaders(origin, env);
  headers["Cache-Control"] = "public, max-age=60, s-maxage=120";
  return new Response(response.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    if (request.method !== "GET") return json({ error: "Only GET requests are supported." }, 405, origin, env);

    const entryMatch = url.pathname.match(ENTRY_RE);
    if (entryMatch) {
      const entryId = Number(entryMatch[1]);
      return proxy(`/entry/${entryId}/${entryMatch[2] ? "history/" : ""}`, origin, env);
    }

    const leagueMatch = url.pathname.match(LEAGUE_RE);
    if (leagueMatch) {
      const leagueId = Number(leagueMatch[1]);
      const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));
      return proxy(`/leagues-classic/${leagueId}/standings/?page_standings=${page}`, origin, env);
    }

    if (url.pathname === "/health") return json({ ok: true, service: "fplverse-api" }, 200, origin, env);
    return json({ error: "Route not found." }, 404, origin, env);
  },
};
