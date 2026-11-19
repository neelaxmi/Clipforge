import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><body><div id="page-content"></div></body>`, { url: "https://example.test/" });
for (const k of ["window", "document", "HTMLElement", "File", "Blob", "Event"]) {
  if (k === "window") globalThis.window = dom.window; else if (k === "document") globalThis.document = dom.window.document; else globalThis[k] = globalThis[k] ?? dom.window[k];
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
let toasts = [];
dom.window.Clipforge = { toast: (m, t) => toasts.push([m, t]) };

const { renderTemplate, bindTemplate } = await import("../js/template-mode.js");
const { saveTemplate } = await import("../js/template-store.js");
const $ = id => document.getElementById(id);
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

test("page renders every control and binds without errors", async () => {
  document.getElementById("page-content").innerHTML = renderTemplate();
  bindTemplate();
  await tick();
  for (const id of ["tpl-file", "tpl-sens", "tpl-analyze", "tpl-even", "tpl-even-n", "tpl-slots", "tpl-captions", "tpl-quality", "tpl-aspect", "tpl-zoom", "tpl-export", "tpl-save", "tpl-saved", "tpl-status"]) assert.ok($(id), id);
  assert.match(document.body.textContent, /cannot download videos from Instagram/i);
  assert.match($("tpl-saved").textContent, /Nothing saved yet/);
});

test("actions without a template explain what to do instead of crashing", async () => {
  $("tpl-export").click(); await tick();
  assert.match($("tpl-status").textContent, /Analyze or split a template first/);
  $("tpl-analyze").click(); await tick();
  assert.match($("tpl-status").textContent, /Choose a template video first/);
  $("tpl-even").click(); await tick();
  assert.match($("tpl-status").textContent, /Choose a template video first/);
  $("tpl-save").click(); await tick();
  assert.match($("tpl-status").textContent, /Analyze or split a template first/);
});

test("a saved template is listed, loads its slots and captions, and can be deleted", async () => {
  const blob = new Blob([new Uint8Array(8)], { type: "video/mp4" });
  await saveTemplate({ id: "t1", name: "My <reel>.mp4", blob, duration: 6, slots: [{ index: 0, start: 0, end: 2, duration: 2 }, { index: 1, start: 2, end: 6, duration: 4 }], captions: "hello there" });
  document.getElementById("page-content").innerHTML = renderTemplate();
  bindTemplate();
  await tick(60);
  assert.match($("tpl-saved").textContent, /My <reel>\.mp4/);       // shown as text, not parsed as HTML
  assert.equal($("tpl-saved").querySelector("reel"), null);
  $("tpl-saved").querySelector("[data-load]").click();
  await tick(60);
  assert.equal($("tpl-slots").querySelectorAll(".tpl-slot").length, 2);
  assert.match($("tpl-slots").textContent, /Original shot kept/);
  assert.equal($("tpl-captions").value, "hello there");
  assert.match($("tpl-slot-count").textContent, /2 slots/);
  $("tpl-saved").querySelector("[data-del]").click();
  await tick(60);
  assert.match($("tpl-saved").textContent, /Nothing saved yet/);
});

test("invalid caption text is reported on export, not thrown", async () => {
  const blob = new Blob([new Uint8Array(8)], { type: "video/mp4" });
  await saveTemplate({ id: "t2", name: "x.mp4", blob, duration: 5, slots: [{ index: 0, start: 0, end: 5, duration: 5 }], captions: "" });
  document.getElementById("page-content").innerHTML = renderTemplate();
  bindTemplate(); await tick(60);
  $("tpl-saved").querySelector("[data-load]").click(); await tick(60);
  $("tpl-captions").value = Array.from({ length: 60 }, (_, i) => "line " + i).join("\n");
  $("tpl-export").click(); await tick(60);
  assert.match($("tpl-status").textContent, /Too many caption lines/);
  assert.equal($("tpl-export").disabled, false, "export button must be re-enabled after an error");
});
