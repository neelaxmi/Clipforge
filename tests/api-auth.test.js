import test from "node:test";
import assert from "node:assert/strict";

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "test-encryption-key-aaaaaaaaaaaaaaaa";
process.env.GOOGLE_OAUTH_STATE_SECRET = "test-state-secret-bbbbbbbbbbbbbbbbbb";
process.env.GOOGLE_CLIENT_ID = "x";
process.env.GOOGLE_CLIENT_SECRET = "y";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://example.test/api/google/oauth/callback";

function call(handler, { method, headers = {}, body, url = "/" }) {
  return new Promise((resolve, reject) => {
    const h = {};
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { h[k] = v; },
      getHeader: (k) => h[k],
      end: (data) => resolve({ status: res.statusCode, headers: h, body: data }),
    };
    Promise.resolve(handler({ method, headers: { host: "example.test", ...headers }, body, url, query: {} }, res)).catch(reject);
  });
}

// route, the method it serves, and the status expected when called WITHOUT a login token
const protectedRoutes = [
  ["../api/google/drive.js", "GET"],
  ["../api/google/drive.js", "POST"],
  ["../api/google/youtube.js", "GET"],
  ["../api/google/youtube.js", "POST"],
  ["../api/google/oauth/start.js", "GET"],
  ["../api/google/oauth/disconnect.js", "POST"],
  ["../api/gemini/analyze.js", "POST"],
  ["../api/gemini/analyze-youtube.js", "POST"],
  ["../api/gemini/upload-session.js", "POST"],
  ["../api/render/rendobar.js", "POST"],
  ["../api/storage/getpronto.js", "POST"],
];

for (const [path, method] of protectedRoutes) {
  test(`${path.replace("../", "")} ${method} requires sign-in (401)`, async () => {
    const mod = await import(path);
    const r = await call(mod.default, { method, body: {} });
    assert.equal(r.status, 401, `expected 401 got ${r.status}: ${r.body}`);
  });
  test(`${path.replace("../", "")} rejects a fake bearer token (401)`, async () => {
    const mod = await import(path);
    const r = await call(mod.default, { method, headers: { authorization: "Bearer not.a.jwt" }, body: {} });
    assert.equal(r.status, 401);
  });
}

test("OAuth callback without a valid state is rejected and sets no token cookie", async () => {
  const mod = await import("../api/google/oauth/callback.js");
  const r = await call(mod.default, { method: "GET", url: "/api/google/oauth/callback?code=abc&state=bad" });
  assert.ok([302, 400].includes(r.status), `got ${r.status}`);
  const cookies = [].concat(r.headers["Set-Cookie"] || []).join(";");
  assert.ok(!cookies.includes("clipforge_google_tokens=") || cookies.includes("Max-Age=0"));
});

test("responses are never cached", async () => {
  const mod = await import("../api/google/drive.js");
  const r = await call(mod.default, { method: "GET" });
  assert.equal(r.headers["Cache-Control"], "no-store");
});

test("oauth/status without sign-in reveals nothing (connected:false)", async () => {
  const mod = await import("../api/google/oauth/status.js");
  for (const headers of [{}, { authorization: "Bearer not.a.jwt" }]) {
    const r = await call(mod.default, { method: "GET", headers });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { connected: false });
  }
});

test("wrong HTTP methods are rejected with 405", async () => {
  for (const [path, method] of [["../api/google/oauth/start.js", "POST"], ["../api/google/oauth/disconnect.js", "GET"], ["../api/google/oauth/status.js", "POST"]]) {
    const mod = await import(path);
    const r = await call(mod.default, { method });
    assert.equal(r.status, 405, path);
  }
});
