import test from "node:test";
import assert from "node:assert/strict";

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "test-encryption-key-aaaaaaaaaaaaaaaa";
process.env.GOOGLE_OAUTH_STATE_SECRET = "test-state-secret-bbbbbbbbbbbbbbbbbb";
const lib = await import("../api/google/_lib.js");

function fakeRes() {
  const headers = {};
  return {
    headers,
    getHeader: (k) => headers[k],
    setHeader: (k, v) => { headers[k] = v; }
  };
}
const cookiesOf = (res) => [].concat(res.headers["Set-Cookie"] || []);
const reqWith = (cookie) => ({ headers: { cookie } });

test("callback flow keeps token cookie when state cookie is cleared", () => {
  const res = fakeRes();
  lib.saveTokens(res, "uid1", { refresh_token: "r", access_token: "a", expires_in: 3600 });
  lib.clearStateCookie(res);
  const names = cookiesOf(res).map((c) => c.split("=")[0]);
  assert.ok(names.includes("clipforge_google_tokens"), "token cookie was overwritten");
  assert.ok(names.includes("clipforge_google_state"));
});

test("tokens round-trip only for the same uid", () => {
  const res = fakeRes();
  lib.saveTokens(res, "uid1", { refresh_token: "r" });
  const tokenCookie = cookiesOf(res).find((c) => c.startsWith("clipforge_google_tokens="));
  const req = reqWith(tokenCookie.split(";")[0]);
  assert.equal(lib.readTokens(req, "uid1").refresh_token, "r");
  assert.throws(() => lib.readTokens(req, "uid2"));
});

test("tampered token cookie is rejected", () => {
  const res = fakeRes();
  lib.saveTokens(res, "uid1", { refresh_token: "r" });
  const c = cookiesOf(res).find((x) => x.startsWith("clipforge_google_tokens=")).split(";")[0];
  const bad = c.slice(0, -2) + (c.endsWith("AA") ? "BB" : "AA");
  assert.throws(() => lib.readTokens(reqWith(bad), "uid1"));
});

test("OAuth state must match signed cookie and uid", () => {
  const state = lib.makeState("uid1");
  assert.equal(lib.verifyState(reqWith("clipforge_google_state=" + encodeURIComponent(state)), state).uid, "uid1");
  assert.throws(() => lib.verifyState(reqWith(""), state));
  assert.throws(() => lib.verifyState(reqWith("clipforge_google_state=x"), state));
  assert.throws(() => lib.verifyState(reqWith(""), state.slice(0, -2) + "zz"));
});

test("encryption and state keys are independent", () => {
  const res = fakeRes();
  lib.saveTokens(res, "u", { refresh_token: "r" });
  assert.notEqual(lib.keyFor("enc").toString("hex"), lib.keyFor("state").toString("hex"));
});
