import Logger from "./logger.js";
import { loadTrimEngine } from "./video-trimmer.js";
import { analyzeTemplate, renderTemplateVideo } from "./template-engine.js";
import { evenSlots, parseCaptions, OUTPUT_PRESETS, MAX_SLOTS } from "./template-plan.js";
import { saveTemplate, listTemplates, getTemplate, deleteTemplate } from "./template-store.js";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MAX_TEMPLATE_BYTES = 120 * 1024 * 1024, MAX_TEMPLATE_SECONDS = 90, MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const secs = n => `${(Math.round(n * 10) / 10).toFixed(1)}s`;
let state = null; // { id, name, file, duration, slots, media[] }
let busy = false, resultUrl = null;

export function renderTemplate() {
  return `<div class="grid studio-grid">
<section class="card"><div class="section-head"><h3>1 · Template clip</h3><span class="tiny muted">LOCAL ONLY</span></div>
<label class="field">Upload a short clip to use as the template<input id="tpl-file" class="input" type="file" accept="video/*"></label>
<div class="tool-row"><label class="field" style="flex:1">Cut sensitivity<select id="tpl-sens" class="select"><option value="0.2">High (more slots)</option><option value="0.3" selected>Normal</option><option value="0.45">Low (fewer slots)</option></select></label></div>
<div class="tool-row"><button class="btn primary" id="tpl-analyze">Find slots</button><span class="tiny muted">or</span><input id="tpl-even-n" class="input" type="number" min="1" max="${MAX_SLOTS}" value="4" style="max-width:80px"><button class="btn" id="tpl-even">Split evenly</button></div>
<p id="tpl-status" class="tiny muted" aria-live="polite"></p>
<div class="notice">Use a clip you own or have permission to use. ClipForge cannot download videos from Instagram links — upload the file. The template's music is kept in your export, so only publish where you have the rights to it.</div>
<div class="section-head" style="margin-top:18px"><h3>Saved on this device</h3></div><div id="tpl-saved" class="integration-list"></div>
<p class="tiny muted">Saved templates live only in this browser's storage (not in the cloud). Clearing browser data removes them.</p></section>
<section class="card"><div class="section-head"><h3>2 · Replace the shots</h3><span class="tiny muted" id="tpl-slot-count"></span></div>
<div id="tpl-slots"><p class="tiny muted">Analyze a template to see its slots. Leave a slot empty to keep the original shot.</p></div></section>
<section class="card"><div class="section-head"><h3>3 · Captions</h3></div>
<label class="field">Paste SRT, or one caption per line (auto-timed across the clip)<textarea id="tpl-captions" class="textarea" placeholder="1&#10;00:00:00,500 --> 00:00:02,000&#10;Your caption"></textarea></label>
<p class="tiny muted">Captions are not auto-detected from the template yet. If the template has captions burned into its pixels, they disappear when you replace a shot — paste them here to put them back.</p></section>
<section class="card"><div class="section-head"><h3>4 · Export</h3></div>
<div class="tool-row"><label class="field" style="flex:1">Quality<select id="tpl-quality" class="select"><option value="720" selected>Fast · 720p (best for phones/tablets)</option><option value="1080">HD · 1080p (slower)</option></select></label>
<label class="field" style="flex:1">Shape<select id="tpl-aspect" class="select"><option>9:16</option><option>1:1</option><option>16:9</option></select></label></div>
<label class="tiny"><input id="tpl-zoom" type="checkbox"> Slow zoom on photos</label>
<div class="tool-row" style="margin-top:12px"><button class="btn primary" id="tpl-export">Export video</button><button class="btn" id="tpl-save">Save template on this device</button></div>
<div id="tpl-result"></div></section></div>`;
}

function status(msg, type) { const el = $("tpl-status"); if (el) { el.textContent = msg || ""; el.style.color = type === "error" ? "#ff8a8a" : ""; } }
const toast = (m, t = "info") => window.Clipforge?.toast?.(m, t);

function videoMeta(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video"), url = URL.createObjectURL(file);
    v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => { const r = { duration: v.duration, width: v.videoWidth, height: v.videoHeight }; URL.revokeObjectURL(url); resolve(r); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This browser cannot read that video. Try an MP4 (H.264).")); };
    v.src = url;
  });
}

async function captureThumbs(file, times, onThumb) {
  const url = URL.createObjectURL(file), v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; });
    for (let i = 0; i < times.length; i++) {
      v.currentTime = Math.min(Math.max(0, times[i]), Math.max(0, v.duration - 0.05));
      await new Promise(res => { v.onseeked = res; });
      const c = document.createElement("canvas"), w = 144, h = Math.round(w * (v.videoHeight / v.videoWidth || 16 / 9));
      c.width = w; c.height = h; c.getContext("2d").drawImage(v, 0, 0, w, h);
      onThumb(i, c.toDataURL("image/jpeg", 0.6));
    }
  } catch (e) { Logger.warn("Thumbnails unavailable", e); }
  finally { URL.revokeObjectURL(url); }
}

function renderSlots() {
  const host = $("tpl-slots");
  if (!state) return;
  $("tpl-slot-count").textContent = `${state.slots.length} slot${state.slots.length === 1 ? "" : "s"} · ${secs(state.duration)}`;
  host.innerHTML = state.slots.map((s, i) => `<div class="tpl-slot" data-i="${i}"><img class="tpl-thumb" alt="Template shot ${i + 1}" data-thumb="${i}">
<div><b>Slot ${i + 1}</b> <small class="muted">${secs(s.start)}–${secs(s.end)} · ${secs(s.duration)}</small>
<input class="input" type="file" accept="image/*,video/*" data-slot-file="${i}">
<div class="tool-row" ${state.media[i]?.kind === "video" ? "" : "hidden"} data-video-opts="${i}"><label class="tiny">Start at (s) <input class="input" type="number" min="0" step="0.1" value="${state.media[i]?.start || 0}" data-slot-start="${i}" style="max-width:90px"></label></div>
<small class="muted" data-slot-note="${i}">${state.media[i] ? esc(state.media[i].file.name) : "Original shot kept"}</small>
${state.media[i] ? `<button class="btn" data-slot-clear="${i}">Use original</button>` : ""}</div></div>`).join("");
  captureThumbs(state.file, state.slots.map(s => s.start + Math.min(0.2, s.duration / 2)), (i, url) => { const img = host.querySelector(`[data-thumb="${i}"]`); if (img) img.src = url; });
}

function setTemplate(t) {
  state = { ...t, media: t.slots.map(() => null) };
  renderSlots();
}

async function analyze() {
  const file = $("tpl-file").files[0] || state?.file;
  if (!file) return status("Choose a template video first.", "error");
  if (busy) return;
  busy = true;
  try {
    if (file.size > MAX_TEMPLATE_BYTES) throw new Error("Template is too large for on-device processing (limit 120 MB). Use a shorter clip.");
    const meta = await videoMeta(file);
    if (meta.duration > MAX_TEMPLATE_SECONDS) throw new Error(`Template is ${Math.round(meta.duration)}s. Limit is ${MAX_TEMPLATE_SECONDS}s on mobile.`);
    const ff = await loadTrimEngine(status);
    const r = await analyzeTemplate(ff, { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), threshold: $("tpl-sens").value, onStatus: status });
    setTemplate({ id: crypto.randomUUID(), name: file.name, file, duration: r.duration, slots: r.slots });
    status(r.slots.length === 1 ? "No cuts found (single-shot clip). Use “Split evenly” to make slots." : `Found ${r.slots.length} slots.`);
  } catch (e) { Logger.error("Template analysis failed", e); status(e.message, "error"); }
  finally { busy = false; }
}

async function splitEvenly() {
  const file = $("tpl-file").files[0] || state?.file;
  if (!file) return status("Choose a template video first.", "error");
  try {
    const meta = state?.file === file ? { duration: state.duration } : await videoMeta(file);
    if (meta.duration > MAX_TEMPLATE_SECONDS) throw new Error(`Template is ${Math.round(meta.duration)}s. Limit is ${MAX_TEMPLATE_SECONDS}s on mobile.`);
    setTemplate({ id: state?.file === file ? state.id : crypto.randomUUID(), name: file.name, file, duration: meta.duration, slots: evenSlots(meta.duration, $("tpl-even-n").value) });
    status(`Split into ${state.slots.length} equal slots.`);
  } catch (e) { status(e.message, "error"); }
}

async function onSlotFile(i, file) {
  if (!file) return;
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) return toast("Choose an image or a video.", "error");
  if (file.size > MAX_MEDIA_BYTES) return toast("That file is over 100 MB. Pick a smaller one.", "error");
  let duration = 0;
  if (kind === "video") { try { duration = (await videoMeta(file)).duration; } catch (e) { return toast(e.message, "error"); } }
  state.media[i] = { kind, file, start: 0, duration };
  renderSlots();
}

function bindSlots() {
  const host = $("tpl-slots");
  host.addEventListener("change", e => {
    const f = e.target.closest("[data-slot-file]"), st = e.target.closest("[data-slot-start]");
    if (f && state) onSlotFile(Number(f.dataset.slotFile), f.files[0]);
    if (st && state?.media[Number(st.dataset.slotStart)]) state.media[Number(st.dataset.slotStart)].start = Math.max(0, Number(st.value) || 0);
  });
  host.addEventListener("click", e => {
    const c = e.target.closest("[data-slot-clear]");
    if (c && state) { state.media[Number(c.dataset.slotClear)] = null; renderSlots(); }
  });
}

function captionPngMaker(width, height) {
  return async text => {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    const size = Math.round(width * 0.065);
    ctx.font = `900 ${size}px Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(5, size * 0.14); ctx.strokeStyle = "rgba(0,0,0,.9)"; ctx.fillStyle = "#fff";
    const lines = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > width * 0.86 && line) { lines.push(line); line = word; } else line = test;
      }
      if (line) lines.push(line);
    }
    const shown = lines.slice(0, 4), lh = size * 1.18, cy = height * 0.74;
    shown.forEach((l, i) => { const y = cy + (i - (shown.length - 1) / 2) * lh; ctx.strokeText(l, width / 2, y); ctx.fillText(l, width / 2, y); });
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Could not draw captions on this device.");
    return new Uint8Array(await blob.arrayBuffer());
  };
}

async function exportVideo() {
  if (!state) return status("Analyze or split a template first.", "error");
  if (busy) return;
  busy = true; $("tpl-export").disabled = true;
  try {
    const [w, h] = OUTPUT_PRESETS[$("tpl-quality").value][$("tpl-aspect").value];
    const captions = parseCaptions($("tpl-captions").value, state.duration);
    const ff = await loadTrimEngine(status);
    const media = state.media.map((m, i) => m && ({
      kind: m.kind, name: m.file.name, start: m.start,
      loop: m.kind === "video" && (m.duration - m.start) < state.slots[i].duration - 0.05,
      read: async () => new Uint8Array(await m.file.arrayBuffer())
    }));
    const data = await renderTemplateVideo(ff, {
      templateName: state.name, templateBytes: new Uint8Array(await state.file.arrayBuffer()), duration: state.duration,
      slots: state.slots, media, captions, makeCaptionPng: captionPngMaker(w, h), size: [w, h], zoom: $("tpl-zoom").checked, onStatus: status
    });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    $("tpl-result").innerHTML = `<video class="video-box" src="${resultUrl}" controls playsinline style="width:100%;margin-top:14px"></video><a class="btn primary" download="clipforge-template-${stamp}.mp4" href="${resultUrl}" style="margin-top:10px;display:inline-block">Download MP4</a>`;
    status("Done. Check the preview, then download.");
    Logger.success("Template export ready", `${w}x${h}`);
  } catch (e) { Logger.error("Template export failed", e); status(e.message, "error"); }
  finally { busy = false; $("tpl-export").disabled = false; }
}

async function refreshSaved() {
  const host = $("tpl-saved");
  try {
    const items = await listTemplates();
    host.innerHTML = items.length ? items.map(t => `<div class="setting-row"><div><b>${esc(t.name)}</b><p class="tiny muted">${t.slots.length} slots · ${secs(t.duration)}</p></div><div><button class="btn" data-load="${esc(t.id)}">Load</button> <button class="btn" data-del="${esc(t.id)}">Delete</button></div></div>`).join("") : `<p class="tiny muted">Nothing saved yet.</p>`;
  } catch (e) { host.innerHTML = `<p class="tiny muted">Local storage is unavailable in this browser mode.</p>`; }
}

async function saveCurrent() {
  if (!state) return status("Analyze or split a template first.", "error");
  try {
    await saveTemplate({ id: state.id, name: state.name, blob: state.file, duration: state.duration, slots: state.slots, captions: $("tpl-captions").value });
    toast("Template saved on this device.");
    await refreshSaved();
  } catch (e) { status(`Could not save: ${e.message}`, "error"); }
}

export function bindTemplate() {
  state = null; busy = false;
  bindSlots();
  $("tpl-analyze").onclick = analyze;
  $("tpl-even").onclick = splitEvenly;
  $("tpl-export").onclick = exportVideo;
  $("tpl-save").onclick = saveCurrent;
  $("tpl-saved").addEventListener("click", async e => {
    const load = e.target.closest("[data-load]"), del = e.target.closest("[data-del]");
    try {
      if (load) {
        const t = await getTemplate(load.dataset.load);
        if (!t) return;
        setTemplate({ id: t.id, name: t.name, file: new File([t.blob], t.name, { type: t.blob.type || "video/mp4" }), duration: t.duration, slots: t.slots });
        $("tpl-captions").value = t.captions || "";
        status(`Loaded “${t.name}”.`);
      } else if (del) { await deleteTemplate(del.dataset.del); await refreshSaved(); }
    } catch (err) { status(err.message, "error"); }
  });
  refreshSaved();
}
