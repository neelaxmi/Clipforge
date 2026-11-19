// Template Mode engine. Works with any ffmpeg-like object (ffmpeg.wasm in the browser, a native adapter in tests).
import { parseSceneTimes, parseDuration, buildSlots, slotArgs, joinArgs, audioExtractArgs, finalArgs } from "./template-plan.js";
import { buildConcatList } from "./concat-list.js";

const extOf = name => String(name || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
async function run(ff, args, label) {
  const code = await ff.exec(args);
  if (code !== 0) throw new Error(`${label} failed (ffmpeg code ${code}). Try a smaller or different file.`);
}
const quiet = async fn => { try { await fn(); } catch {} };

export async function analyzeTemplate(ff, { fileName, bytes, threshold = 0.3, onStatus = () => {} }) {
  const thr = Math.max(0.1, Math.min(0.6, Number(threshold) || 0.3));
  const input = `tpl-analyze.${extOf(fileName)}`;
  let log = "";
  const onLog = ({ message }) => { log += message + "\n"; };
  ff.on("log", onLog);
  try {
    await ff.writeFile(input, bytes);
    onStatus("Looking for scene cuts in the template…");
    await run(ff, ["-i", input, "-vf", `scale=320:-2,select='gt(scene,${thr})',showinfo`, "-an", "-f", "null", "-"], "Template analysis");
    const duration = parseDuration(log);
    if (!duration) throw new Error("Could not read the template length. Try an MP4 file.");
    const cuts = parseSceneTimes(log);
    return { duration, cuts, slots: buildSlots(cuts, duration) };
  } finally {
    ff.off("log", onLog);
    await quiet(() => ff.deleteFile(input));
  }
}

// media[i]: null (keep the template's own shot) or { kind: "image"|"video", name, bytes | read(), start, loop }
export async function renderTemplateVideo(ff, { templateName, templateBytes, duration, slots, media, captions = [], makeCaptionPng, size, zoom = false, crf = "20", onStatus = () => {} }) {
  if (!slots?.length) throw new Error("Analyze a template first.");
  const [width, height] = size;
  const created = [];
  const track = name => { created.push(name); return name; };
  const tplName = track(`tpl.${extOf(templateName)}`);
  try {
    await ff.writeFile(tplName, templateBytes);
    const segments = [];
    for (let i = 0; i < slots.length; i++) {
      onStatus(`Rendering slot ${i + 1} of ${slots.length}…`);
      const m = media[i];
      let item;
      if (m) {
        const name = track(`m${i}.${extOf(m.name)}`);
        await ff.writeFile(name, m.bytes ?? await m.read());
        item = { kind: m.kind, inputName: name, start: m.start || 0, loop: Boolean(m.loop) };
      } else {
        item = { kind: "video", inputName: tplName, start: slots[i].start, loop: false };
      }
      const out = track(`seg${i}.mp4`);
      segments.push(out);
      await run(ff, slotArgs({ slot: slots[i], media: item, width, height, zoom, crf, outputName: out }), `Slot ${i + 1}`);
      if (m) await quiet(() => ff.deleteFile(item.inputName));
    }
    const listName = track("tpl-list.txt");
    await ff.writeFile(listName, new TextEncoder().encode(buildConcatList(segments)));
    const joined = track("tpl-joined.mp4");
    onStatus("Joining slots…");
    await run(ff, joinArgs(listName, joined), "Joining slots");

    const audioName = track("tpl-audio.m4a");
    onStatus("Keeping the template's music…");
    const audioCode = await ff.exec(audioExtractArgs(tplName, audioName, duration));
    const hasAudio = audioCode === 0;
    if (!hasAudio) onStatus("Template has no audio track. Exporting without music.");

    const overlays = [];
    for (let j = 0; j < captions.length; j++) {
      onStatus(`Preparing caption ${j + 1} of ${captions.length}…`);
      const name = track(`cap${j}.png`);
      await ff.writeFile(name, await makeCaptionPng(captions[j].text));
      overlays.push({ name, start: captions[j].start, end: captions[j].end });
    }
    const outName = track("tpl-final.mp4");
    onStatus(overlays.length ? "Adding captions and music…" : "Adding music…");
    await run(ff, finalArgs({ videoName: joined, audioName: hasAudio ? audioName : null, duration, overlays, crf, outputName: outName }), "Final export");
    const data = await ff.readFile(outName);
    if (!data?.length) throw new Error("Export produced an empty file.");
    return data;
  } finally {
    for (const name of created) await quiet(() => ff.deleteFile(name));
  }
}
