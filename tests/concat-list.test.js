import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildConcatList } from "../js/concat-list.js";

test("concat list uses real newlines", () => {
  const list = buildConcatList(["a.mp4", "b.mp4", "c.mp4"]);
  assert.equal(list, "file 'a.mp4'\nfile 'b.mp4'\nfile 'c.mp4'");
  assert.ok(!list.includes("\\n"));
});

test("concat list escapes single quotes", () => {
  assert.equal(buildConcatList(["it's.mp4"]), "file 'it'\\''s.mp4'");
});

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
test("ffmpeg really joins 2 segments from the generated list", { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "cf-"));
  const run = args => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { cwd: dir });
  run(["-f", "lavfi", "-i", "testsrc=size=160x120:rate=30:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "a.mp4"]);
  run(["-f", "lavfi", "-i", "testsrc=size=160x120:rate=30:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "b.mp4"]);
  writeFileSync(join(dir, "list.txt"), buildConcatList(["a.mp4", "b.mp4"]));
  run(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
  assert.ok(existsSync(join(dir, "out.mp4")));
});
