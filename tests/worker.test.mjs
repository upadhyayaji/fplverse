import assert from "node:assert/strict";
import worker from "../worker/src/index.js";

let upstreamUrl = "";
globalThis.caches = {
  default: {
    match: async () => null,
    put: async () => undefined,
  },
};
globalThis.fetch = async (requestUrl) => {
  upstreamUrl = String(requestUrl);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const env = { ALLOWED_ORIGIN: "https://upadhyayaji.github.io" };
const entryResponse = await worker.fetch(
  new Request("https://api.example/api/entry/218806", {
    headers: { Origin: "https://upadhyayaji.github.io" },
  }),
  env
);
assert.equal(entryResponse.status, 200);
assert.equal(upstreamUrl, "https://fantasy.premierleague.com/api/entry/218806/");
assert.equal(entryResponse.headers.get("Access-Control-Allow-Origin"), "https://upadhyayaji.github.io");

await worker.fetch(new Request("https://api.example/api/entry/218806/history"), env);
assert.equal(upstreamUrl, "https://fantasy.premierleague.com/api/entry/218806/history/");

await worker.fetch(new Request("https://api.example/api/league/385739?page=2"), env);
assert.equal(
  upstreamUrl,
  "https://fantasy.premierleague.com/api/leagues-classic/385739/standings/?page_standings=2"
);

const rejected = await worker.fetch(
  new Request("https://api.example/api/anything", { method: "POST" }),
  env
);
assert.equal(rejected.status, 405);

console.log("Worker route and CORS tests passed.");
