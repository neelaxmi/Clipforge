import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeTemplate, renderTemplateVideo } from "../js/template-engine.js";
import { parseCaptions } from "../js/template-plan.js";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const opts = { skip: !hasFfmpeg };

// Native-ffmpeg adapter with the same surface as ffmpeg.wasm (writeFile/readFile/exec/deleteFile/on/off)
function nativeFF() {
  const dir = mkdtempSync(join(tmpdir(), "cf-tpl-"));
  const handlers = new Set();
  return {
    dir,
    on: (e, h) => e === "log" && handlers.add(h),
    off: (e, h) => handlers.delete(h),
    writeFile: async (n, b) => writeFileSync(join(dir, n), b),
    readFile: async n => new Uint8Array(readFileSync(join(dir, n))),
    deleteFile: async n => unlinkSync(join(dir, n)),
    exec: async args => {
      const r = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], { cwd: dir, encoding: "utf8" });
      for (const line of (r.stderr || "").split("\n")) handlers.forEach(h => h({ message: line }));
      return r.status;
    },
    path: n => join(dir, n)
  };
}
const ffm = (dir, args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { cwd: dir });
const probe = (file, args) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-of", "json", ...args, file]).toString());
const yavg = (file, t) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], { encoding: "utf8" });
  return Number(/YAVG=([0-9.]+(?:e[-+]?[0-9]+)?)/.exec(r.stderr)[1]);
};
const frameDiff = (file, t1, t2) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(t1), "-i", file, "-ss", String(t2), "-i", file, "-filter_complex", "[0:v][1:v]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-frames:v", "1", "-f", "null", "-"], { encoding: "utf8" });
  return Number(/YAVG=([0-9.]+(?:e[-+]?[0-9]+)?)/.exec(r.stderr)[1]);
};
const frameHash = (file, t) => execFileSync("ffmpeg", ["-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "md5", "-"]).toString().trim();

const makeTemplate = (dir, { audio = true } = {}) => {
  const src = c => ["-f", "lavfi", "-i", `color=c=${c}:s=360x640:r=30:d=2`];
  ffm(dir, [...src("red"), ...src("blue"), ...src("green"), ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440:d=6"] : []),
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", ...(audio ? ["-map", "3:a", "-c:a", "aac"] : []),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", audio ? "template.mp4" : "template-silent.mp4"]);
  return audio ? "template.mp4" : "template-silent.mp4";
};
const makePngCaption = dir => { ffm(dir, ["-f", "lavfi", "-i", "color=c=white:s=360x640,format=rgba", "-frames:v", "1", "cap.png"]); return new Uint8Array(readFileSync(join(dir, "cap.png"))); };

test("analyzeTemplate finds the 3 scenes of a real video", opts, async () => {
  const ff = nativeFF();
  const name = makeTemplate(ff.dir);
  const r = await analyzeTemplate(ff, { fileName: name, bytes: readFileSync(ff.path(name)) });
  assert.ok(Math.abs(r.duration - 6) < 0.2);
  assert.equal(r.slots.length, 3);
  assert.deepEqual(r.slots.map(s => Math.round(s.start)), [0, 2, 4]);
});

test("full export: swapped image + looped video + kept shot, template music, captions", opts, async () => {
  const ff = nativeFF();
  const name = makeTemplate(ff.dir);
  const templateBytes = readFileSync(ff.path(name));
  const { slots, duration } = await analyzeTemplate(ff, { fileName: name, bytes: templateBytes });
  ffm(ff.dir, ["-f", "lavfi", "-i", "testsrc=s=1080x1350", "-frames:v", "1", "photo.jpg"]);
  ffm(ff.dir, ["-f", "lavfi", "-i", "testsrc2=s=640x480:r=24:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "short.mp4"]);
  const pngBytes = makePngCaption(ff.dir);
  const media = [
    { kind: "image", name: "photo.jpg", bytes: readFileSync(ff.path("photo.jpg")) },
    { kind: "video", name: "short.mp4", read: async () => readFileSync(ff.path("short.mp4")), start: 0, loop: true },
    null
  ];
  const statuses = [];
  const render = captions => renderTemplateVideo(ff, { templateName: name, templateBytes, duration, slots, media, captions, makeCaptionPng: async () => pngBytes, size: [360, 640], onStatus: s => statuses.push(s) });
  const plain = await render([]);
  writeFileSync(ff.path("plain.mp4"), plain);
  const info = probe(ff.path("plain.mp4"), ["-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration"]);
  const v = info.streams.find(s => s.codec_type === "video"), a = info.streams.find(s => s.codec_type === "audio");
  assert.equal(v.codec_name, "h264");
  assert.equal(`${v.width}x${v.height}`, "360x640");
  assert.equal(v.r_frame_rate, "30/1");
  assert.ok(a && a.codec_name === "aac", "template music must be kept");
  assert.ok(Math.abs(Number(info.format.duration) - 6) < 0.25, `duration ${info.format.duration}`);

  const captioned = await render(parseCaptions("1\n00:00:00,500 --> 00:00:01,500\nHello", duration));
  writeFileSync(ff.path("cap.mp4"), captioned);
  // the test caption is an opaque white frame, so brightness proves it is shown only during its cue
  assert.ok(yavg(ff.path("cap.mp4"), 1) > 220, "caption visible during its cue");
  assert.ok(yavg(ff.path("plain.mp4"), 1) < 200, "no caption without captions");
  assert.ok(Math.abs(yavg(ff.path("cap.mp4"), 3) - yavg(ff.path("plain.mp4"), 3)) < 6, "caption hidden outside its cue");
  assert.ok(statuses.some(s => /slot 1 of 3/i.test(s)));
  const leftovers = ["tpl.mp4", "seg0.mp4", "tpl-final.mp4", "tpl-audio.m4a"].filter(n => existsSync(ff.path(n)));
  assert.deepEqual(leftovers, [], "temporary files must be cleaned up");
});

test("slow zoom moves the image; without zoom the photo stays still", opts, async () => {
  const ff = nativeFF();
  const name = makeTemplate(ff.dir);
  const templateBytes = readFileSync(ff.path(name));
  const { slots, duration } = await analyzeTemplate(ff, { fileName: name, bytes: templateBytes });
  ffm(ff.dir, ["-f", "lavfi", "-i", "testsrc=s=720x1280", "-frames:v", "1", "photo.png"]);
  const media = [{ kind: "image", name: "photo.png", bytes: readFileSync(ff.path("photo.png")) }, null, null];
  const diffs = {};
  for (const zoom of [false, true]) {
    const out = await renderTemplateVideo(ff, { templateName: name, templateBytes, duration, slots, media, makeCaptionPng: async () => new Uint8Array(), size: [360, 640], zoom });
    writeFileSync(ff.path(`z${zoom}.mp4`), out);
    diffs[zoom] = frameDiff(ff.path(`z${zoom}.mp4`), 0.1, 1.8);
  }
  assert.ok(diffs.true > diffs.false * 3 && diffs.true > 2, `zoom diff ${diffs.true} vs still ${diffs.false}`);
});

test("template without an audio track still exports (silent)", opts, async () => {
  const ff = nativeFF();
  const name = makeTemplate(ff.dir, { audio: false });
  const templateBytes = readFileSync(ff.path(name));
  const { slots, duration } = await analyzeTemplate(ff, { fileName: name, bytes: templateBytes });
  const out = await renderTemplateVideo(ff, { templateName: name, templateBytes, duration, slots, media: [null, null, null], makeCaptionPng: async () => new Uint8Array(), size: [360, 640] });
  writeFileSync(ff.path("silent-out.mp4"), out);
  const streams = probe(ff.path("silent-out.mp4"), ["-show_entries", "stream=codec_type"]).streams.map(s => s.codec_type);
  assert.deepEqual(streams, ["video"]);
});

test("a corrupt replacement file fails with a readable slot error", opts, async () => {
  const ff = nativeFF();
  const name = makeTemplate(ff.dir);
  const templateBytes = readFileSync(ff.path(name));
  const { slots, duration } = await analyzeTemplate(ff, { fileName: name, bytes: templateBytes });
  await assert.rejects(
    renderTemplateVideo(ff, { templateName: name, templateBytes, duration, slots, media: [{ kind: "image", name: "bad.jpg", bytes: new Uint8Array([1, 2, 3]) }, null, null], makeCaptionPng: async () => new Uint8Array(), size: [360, 640] }),
    /Slot 1 failed/
  );
});
