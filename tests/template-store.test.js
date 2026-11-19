import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { saveTemplate, getTemplate, listTemplates, deleteTemplate } from "../js/template-store.js";

test("templates persist locally, list newest first, and delete", async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" });
  await saveTemplate({ id: "a", name: "First", blob, duration: 6, slots: [{ index: 0, start: 0, end: 6, duration: 6 }], captions: "hello" });
  await new Promise(r => setTimeout(r, 5));
  await saveTemplate({ id: "b", name: "Second", blob, duration: 3, slots: [], captions: "" });
  const list = await listTemplates();
  assert.deepEqual(list.map(t => t.id), ["b", "a"]);
  const a = await getTemplate("a");
  assert.equal(a.captions, "hello");
  assert.equal(a.blob.size, 4);
  assert.equal(a.slots[0].duration, 6);
  await deleteTemplate("a");
  assert.equal(await getTemplate("a"), null);
  assert.equal((await listTemplates()).length, 1);
});

test("rejects a template without a video", async () => {
  await assert.rejects(saveTemplate({ id: "x" }), /needs an id/);
});
