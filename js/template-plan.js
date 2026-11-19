// Pure helpers for Template Mode (no DOM, no ffmpeg instance) so they can be unit-tested in Node.
export const MAX_SLOTS = 12;
export const MIN_SLOT_SECONDS = 0.6;
export const MAX_CUES = 40;
export const OUTPUT_PRESETS = {
  "720": { "9:16": [720, 1280], "1:1": [720, 720], "16:9": [1280, 720] },
  "1080": { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] }
};
const round3 = n => Math.round(n * 1000) / 1000;
const fmt = n => String(round3(n));

export function parseSceneTimes(log) {
  const out = [];
  const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let m;
  while ((m = re.exec(String(log)))) out.push(Number(m[1]));
  return [...new Set(out)].sort((a, b) => a - b);
}

export function parseDuration(log) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(log));
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export function buildSlots(cuts, duration, { minSlot = MIN_SLOT_SECONDS, maxSlots = MAX_SLOTS } = {}) {
  if (!(duration > 0)) throw new Error("Template duration is unknown.");
  const bounds = [0];
  for (const t of [...cuts].filter(Number.isFinite).sort((a, b) => a - b)) {
    if (t - bounds[bounds.length - 1] >= minSlot && duration - t >= minSlot) bounds.push(t);
  }
  bounds.push(duration);
  while (bounds.length - 1 > maxSlots) {
    let best = 1, bestLen = Infinity;
    for (let i = 1; i < bounds.length - 1; i++) {
      const len = bounds[i + 1] - bounds[i - 1];
      if (len < bestLen) { bestLen = len; best = i; }
    }
    bounds.splice(best, 1);
  }
  return bounds.slice(0, -1).map((start, index) => ({
    index, start: round3(start), end: round3(bounds[index + 1]), duration: round3(bounds[index + 1] - start)
  }));
}

export function evenSlots(duration, count) {
  if (!(duration > 0)) throw new Error("Template duration is unknown.");
  const n = Math.max(1, Math.min(MAX_SLOTS, Math.floor(Number(count) || 1)));
  const step = duration / n;
  return Array.from({ length: n }, (_, index) => {
    const start = round3(index * step), end = round3(index === n - 1 ? duration : (index + 1) * step);
    return { index, start, end, duration: round3(end - start) };
  });
}

const toSeconds = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(String(ms).padEnd(3, "0")) / 1000;

export function parseSrt(text) {
  const cues = [];
  for (const block of String(text).replace(/\r/g, "").trim().split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const i = lines.findIndex(l => l.includes("-->"));
    if (i < 0) continue;
    const m = lines[i].match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) continue;
    const start = toSeconds(m[1], m[2], m[3], m[4]), end = toSeconds(m[5], m[6], m[7], m[8]);
    const body = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (body && end > start) cues.push({ start: round3(start), end: round3(end), text: body });
  }
  return cues;
}

export function plainCaptions(text, duration) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length || !(duration > 0)) return [];
  const step = duration / lines.length;
  return lines.map((line, i) => ({ start: round3(i * step), end: round3((i + 1) * step), text: line }));
}

export function parseCaptions(text, duration) {
  if (!String(text || "").trim()) return [];
  const isSrt = String(text).includes("-->");
  const raw = isSrt ? parseSrt(text) : plainCaptions(text, duration);
  if (raw.length > MAX_CUES) throw new Error(`Too many caption lines (${raw.length}). Limit is ${MAX_CUES} on mobile.`);
  if (!isSrt && raw.length && duration / raw.length < 0.3) throw new Error(`Too many caption lines for a ${Math.round(duration)}s clip. Use fewer lines.`);
  const cues = raw
    .map(c => ({ ...c, end: Math.min(c.end, duration) }))
    .filter(c => c.start < duration && c.end - c.start >= 0.1);
  return cues;
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
function srtTime(t) {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}
export function cuesToSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`).join("\n\n") + "\n";
}

// ---- ffmpeg argument builders (same args run in ffmpeg.wasm and native ffmpeg) ----
export function slotArgs({ slot, media, width, height, fps = 30, zoom = false, crf = "20", outputName }) {
  const d = slot.duration;
  if (!(d > 0)) throw new Error("Slot has no duration.");
  const cover = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", outputName];
  if (media.kind === "image") {
    const frames = Math.max(1, Math.round(d * fps));
    const vf = zoom
      ? `${cover},zoompan=z='1+0.1*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps},setsar=1`
      : cover;
    return ["-loop", "1", "-framerate", String(fps), "-t", fmt(d), "-i", media.inputName, "-an", "-vf", vf, ...encode];
  }
  if (media.kind === "video") {
    const input = media.loop
      ? ["-stream_loop", "-1", "-t", fmt(d), "-i", media.inputName]
      : ["-ss", fmt(media.start || 0), "-t", fmt(d), "-i", media.inputName];
    return [...input, "-map", "0:v:0", "-an", "-vf", `${cover},fps=${fps}`, ...encode];
  }
  throw new Error("Slot media must be an image or a video.");
}

export const joinArgs = (listName, outputName) => ["-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", outputName];
export const audioExtractArgs = (input, output, duration) => ["-i", input, "-vn", "-c:a", "aac", "-b:a", "192k", "-t", fmt(duration), output];

export function finalArgs({ videoName, audioName = null, duration, overlays = [], crf = "20", outputName }) {
  const args = ["-i", videoName];
  if (audioName) args.push("-i", audioName);
  overlays.forEach(o => args.push("-i", o.name));
  const first = audioName ? 2 : 1;
  if (overlays.length) {
    let prev = "0:v";
    const parts = overlays.map((o, i) => {
      const out = i === overlays.length - 1 ? "vout" : `v${i + 1}`;
      const part = `[${prev}][${first + i}:v]overlay=0:0:enable='between(t,${fmt(o.start)},${fmt(o.end)})'[${out}]`;
      prev = out;
      return part;
    });
    args.push("-filter_complex", parts.join(";"), "-map", "[vout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p");
  } else {
    args.push("-map", "0:v:0", "-c:v", "copy");
  }
  if (audioName) args.push("-map", "1:a:0", "-c:a", "copy");
  args.push("-t", fmt(duration), "-movflags", "+faststart", outputName);
  return args;
}
