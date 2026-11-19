import test from "node:test";
import assert from "node:assert/strict";
import { parseSceneTimes, parseDuration, buildSlots, evenSlots, parseSrt, plainCaptions, parseCaptions, cuesToSrt, slotArgs, finalArgs, MAX_SLOTS } from "../js/template-plan.js";

test("parses scene cuts and duration from ffmpeg log", () => {
  const log = "  Duration: 00:00:15.20, start: 0.000000\n[Parsed_showinfo_2 @ 0x1] n:   0 pts:  60 pts_time:2.0 pos: 1\n[Parsed_showinfo_2 @ 0x1] n:   1 pts: 120 pts_time:4.5 pos: 2";
  assert.deepEqual(parseSceneTimes(log), [2, 4.5]);
  assert.equal(parseDuration(log), 15.2);
  assert.equal(parseDuration("nothing"), null);
});

test("buildSlots makes contiguous slots and ignores cuts too close to the edges", () => {
  const slots = buildSlots([0.2, 2, 2.1, 4, 5.9], 6);
  assert.deepEqual(slots.map(s => [s.start, s.end]), [[0, 2], [2, 4], [4, 6]]);
  assert.equal(slots.reduce((a, s) => a + s.duration, 0), 6);
});

test("buildSlots caps the slot count by merging the shortest neighbours", () => {
  const cuts = Array.from({ length: 30 }, (_, i) => (i + 1) * 1);
  const slots = buildSlots(cuts, 31);
  assert.equal(slots.length, MAX_SLOTS);
  assert.equal(slots[0].start, 0);
  assert.equal(slots.at(-1).end, 31);
  slots.forEach((s, i) => i && assert.equal(s.start, slots[i - 1].end));
});

test("no cuts gives one slot; evenSlots splits evenly", () => {
  assert.equal(buildSlots([], 10).length, 1);
  assert.deepEqual(evenSlots(9, 3).map(s => s.duration), [3, 3, 3]);
  assert.equal(evenSlots(9, 99).length, MAX_SLOTS);
  assert.throws(() => buildSlots([], 0));
});

test("SRT parsing, plain-text captions and round trip", () => {
  const srt = "1\n00:00:00,500 --> 00:00:01,500\nHello <b>world</b>\n\n2\n00:00:02,000 --> 00:00:03,250\nSecond\nline";
  const cues = parseSrt(srt);
  assert.deepEqual(cues, [{ start: 0.5, end: 1.5, text: "Hello world" }, { start: 2, end: 3.25, text: "Second\nline" }]);
  assert.deepEqual(parseSrt(cuesToSrt(cues)), cues);
  assert.deepEqual(plainCaptions("a\n\nb", 4), [{ start: 0, end: 2, text: "a" }, { start: 2, end: 4, text: "b" }]);
});

test("parseCaptions clamps to duration, skips empty input, limits cue count", () => {
  assert.deepEqual(parseCaptions("   ", 5), []);
  const c = parseCaptions("1\n00:00:01,000 --> 00:00:09,000\nlong\n\n2\n00:00:20,000 --> 00:00:21,000\nout", 5);
  assert.deepEqual(c, [{ start: 1, end: 5, text: "long" }]);
  assert.throws(() => parseCaptions(Array.from({ length: 50 }, (_, i) => "line" + i).join("\n"), 100), /Too many/);
  assert.throws(() => parseCaptions(Array.from({ length: 30 }, (_, i) => "line" + i).join("\n"), 5), /Too many caption lines for a 5s clip/);
  assert.equal(parseCaptions("a\nb\nc", 6).length, 3);
});

test("slotArgs: image loops, video trims or loops, no audio from replacement media", () => {
  const slot = { start: 0, end: 2, duration: 2 };
  const img = slotArgs({ slot, media: { kind: "image", inputName: "a.jpg" }, width: 720, height: 1280, outputName: "o.mp4" });
  assert.ok(img.includes("-loop") && img.includes("-an") && !img.join(" ").includes("zoompan"));
  assert.ok(slotArgs({ slot, media: { kind: "image", inputName: "a.jpg" }, width: 720, height: 1280, zoom: true, outputName: "o.mp4" }).join(" ").includes("zoompan"));
  const vid = slotArgs({ slot, media: { kind: "video", inputName: "v.mp4", start: 1.5 }, width: 720, height: 1280, outputName: "o.mp4" });
  assert.equal(vid[vid.indexOf("-ss") + 1], "1.5");
  const loop = slotArgs({ slot, media: { kind: "video", inputName: "v.mp4", start: 1.5, loop: true }, width: 720, height: 1280, outputName: "o.mp4" });
  assert.ok(loop.includes("-stream_loop") && !loop.includes("-ss"));
  assert.throws(() => slotArgs({ slot, media: { kind: "gif" }, width: 1, height: 1, outputName: "o" }));
});

test("finalArgs copies video when there are no captions and re-encodes when there are", () => {
  const plain = finalArgs({ videoName: "j.mp4", audioName: "a.m4a", duration: 6, outputName: "o.mp4" });
  assert.ok(plain.join(" ").includes("-c:v copy"));
  const capped = finalArgs({ videoName: "j.mp4", audioName: "a.m4a", duration: 6, overlays: [{ name: "c0.png", start: 0, end: 1 }, { name: "c1.png", start: 1, end: 2 }], outputName: "o.mp4" });
  const fc = capped[capped.indexOf("-filter_complex") + 1];
  assert.match(fc, /\[0:v\]\[2:v\]overlay/);
  assert.match(fc, /\[v1\]\[3:v\]overlay=0:0:enable='between\(t,1,2\)'\[vout\]/);
  assert.ok(finalArgs({ videoName: "j.mp4", duration: 6, outputName: "o.mp4" }).indexOf("-map") >= 0);
});
