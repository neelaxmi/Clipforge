import Logger from "./logger.js";
import { auth } from "./firebase.js";
import { analyzeLocalVideo, analyzeYouTubeVideo } from "./gemini-video.js";
import { createTrimPreview, createRemixExport } from "./video-trimmer.js";
import { saveLocalItem, getLocalItem } from "./local-library.js";
import { uploadVideoToGetPronto } from "./getpronto-storage.js";

let currentFile = null;
let currentUrl = null;
let trimPreviewUrl = null;
let moments = [];
let remixClips = [];
let remixMusicFile = null;

export function renderUpload() {
  return `
  <div class="grid studio-grid">
    <section class="card">
      <div class="section-head"><h3>Source video</h3><span class="tiny muted">LOCAL FILE</span></div>
      <div id="drop-zone" class="upload-zone">
        <div class="upload-symbol">⇧</div><h3>Drop your video here</h3>
        <p>or choose a video from your device</p>
        <input id="video-file" type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*" hidden>
        <button class="btn primary" id="choose-video">Choose video</button>
        <p class="tiny">MP4, MOV or WebM · up to 1.5 GB for AI analysis</p>
      </div>
      <div class="video-box" id="video-preview"><span>Original video preview appears here</span></div>
      <div id="video-meta" class="tiny muted" style="margin-top:10px">No video selected</div>
      <button class="btn" id="cloud-source-upload" disabled style="margin-top:12px;background:#1d2940;width:100%">☁ Store source in GetPronto</button>
      <div id="cloud-source-status" class="analysis-status" aria-live="polite">Optional cloud copy · Free plan: up to 100 MB per video.</div>
      <p class="tiny muted">Privacy notice: GetPronto's returned file URL is publicly accessible to anyone who has the link. Upload only videos you are comfortable sharing by link.</p>
    </section>
    <section class="card">
      <div class="section-head"><h3>AI moment detection</h3><span class="tiny muted">GEMINI VIDEO AI</span></div>
      <label class="field">Public YouTube link (optional)<input class="input" id="youtube-url" type="url" placeholder="https://youtu.be/..."></label>
      <button class="btn" id="analyze-youtube" style="background:#252d40;width:100%;margin-bottom:14px">Analyse public YouTube link ↗</button>
      <label class="field">What kind of moments should Gemini find?
        <select class="select" id="clip-style">
          <option>Most engaging moments</option><option>Educational highlights</option>
          <option>Funny / surprising moments</option><option>Strong opinions / hooks</option>
          <option>Storytelling moments</option><option>Emotional moments</option>
        </select>
      </label>
      <button class="btn primary full" id="analyze-video" disabled>✧ Analyse video <span>→</span></button>
      <div class="analysis-status" id="analysis-status" aria-live="polite">Choose a video to begin.</div>
      <section id="clipforge-console" aria-label="Live console" style="margin-top:14px;border:1px solid #34445d;border-radius:12px;overflow:hidden;background:#080d16;color:#d7e4f5">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px 12px;background:#111b2b;border-bottom:1px solid #26364d">
          <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#42d392;box-shadow:0 0 9px #42d392"></span><b style="font:600 12px/1.4 monospace;letter-spacing:.08em">LIVE CONSOLE</b><span id="console-count" style="font:11px monospace;color:#91a5bf">0 logs</span></div>
          <div style="display:flex;gap:7px"><button type="button" id="console-copy" class="ghost-btn" style="font-size:11px">Copy logs</button><button type="button" id="console-clear" class="ghost-btn" style="font-size:11px">Clear</button></div>
        </div>
        <div id="console-output" role="log" aria-live="polite" style="height:210px;overflow:auto;padding:10px 12px;font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere"></div>
        <div style="padding:7px 12px;border-top:1px solid #26364d;color:#91a5bf;font:10px/1.4 monospace">LIVE · SUCCESS / INFO / WARN / ERROR · Copy logs to share diagnostics</div>
      </section>
      <div class="notice" style="margin-top:15px">Your video is uploaded directly to Google's Gemini File API using a temporary upload session. Gemini API keys stay on the Vercel server. Only analyse videos you own or have permission to use.</div>
    </section>
  </div>

  <div class="section-head"><h3>AI detected moments</h3><span class="tiny muted" id="clip-count">0 MOMENTS</span></div>
  <section class="card">
    <div id="video-summary" class="muted small-copy">Gemini's summary and clip suggestions will appear here after analysis.</div>
    <div id="clip-list" class="clip-list" style="margin-top:14px"><p class="muted small-copy">No analysis yet.</p></div>
  </section>

  <div class="section-head"><h3>Phase 2 · Remix studio</h3><span class="tiny muted">MULTI-CLIP EDITOR</span></div>
  <section class="card">
    <div class="trim-top"><div><h3>Build a short-form video</h3><p class="muted small-copy">Add detected moments to your timeline, choose a format and export one joined MP4.</p></div><span class="status-pill">Local cinematic export</span></div>
    <div class="trim-fields">
      <label class="field">Output aspect ratio<select id="remix-ratio" class="select"><option value="9:16">9:16 · Reels / Shorts</option><option value="16:9">16:9 · YouTube</option><option value="1:1">1:1 · Square</option></select></label>
      <label class="field">Timeline clips<input id="remix-count" class="input" value="0 clips" readonly></label>
    </div>
    <div class="section-head"><h3>Creative controls</h3><span class="tiny muted">LOCAL EFFECTS ENGINE</span></div>
    <div class="trim-fields remix-controls">
      <label class="field">Visual grade<select id="remix-effect" class="select"><option value="cinematic">Cinematic · contrast + vignette</option><option value="clean">Clean original</option><option value="warm">Warm film</option><option value="vivid">Vivid pop</option><option value="mono">Black & white</option><option value="noir">Noir drama</option></select></label>
      <label class="field">Playback speed<select id="remix-speed" class="select"><option value="1">Normal · 1x</option><option value="0.75">Slow · 0.75x</option><option value="0.5">Slow motion · 0.5x</option><option value="1.25">Fast · 1.25x</option><option value="1.5">Fast · 1.5x</option><option value="2">2x</option></select></label>
      <label class="field">Export quality<select id="remix-quality" class="select"><option value="18">Very high · CRF 18</option><option value="20" selected>High · CRF 20</option><option value="23">Smaller file · CRF 23</option></select></label>
    </div>
    <label class="field">Cinematic title / overlay<input id="remix-overlay-text" class="input" maxlength="100" placeholder="e.g. THIS CHANGES EVERYTHING"></label>
    <div class="trim-fields">
      <label class="field">Background music<input id="remix-music" class="input" type="file" accept="audio/*"></label>
      <label class="field">Music volume<input id="remix-music-volume" class="input" type="range" min="0" max="1" step="0.05" value="0.22"></label>
      <label class="field">Original audio<input id="remix-original-volume" class="input" type="range" min="0" max="1.5" step="0.05" value="0.8"></label>
    </div>
    <div id="remix-music-status" class="tiny muted">Optional music track · MP3, WAV, M4A and other browser-supported audio.</div>
    <div id="remix-timeline" class="clip-list"><p class="muted small-copy">No clips added yet. Use “Add to remix” on detected moments above.</p></div>
    <div class="tool-row"><button class="btn primary" id="export-remix" disabled>✦ Export joined MP4</button><button class="btn" id="clear-remix" style="background:#252d40">Clear timeline</button></div>
    <div class="tool-row"><button class="btn" id="cloud-render-remix" disabled style="background:linear-gradient(110deg,#225c79,#5140a1)">☁ Render in cloud (background)</button><button class="btn" id="check-cloud-render" style="background:#252d40">Check cloud job</button></div>
    <div class="analysis-status" id="cloud-render-status" aria-live="polite">Cloud rendering needs GetPronto + Rendobar API keys. Local rendering works without keys.</div><div id="cloud-render-download" style="margin-top:12px"></div>
    <div class="analysis-status" id="remix-status" aria-live="polite">Phase 2 editor ready. Your timeline is saved locally for 24 hours.</div>
    <div id="remix-download" style="margin-top:12px"></div>
    <p class="tiny muted">Local export supports cinematic colour grades, fade transitions, title overlays, speed changes and optional music mix. Cloud rendering will be optional once its API key is added.</p>
  </section>

  <div class="section-head"><h3>Clip trim & preview</h3><span class="tiny muted">PHASE 1 · LOCAL PROCESSING</span></div>
  <section class="card trim-card">
    <div class="trim-top"><div><h3 id="trim-title">Select a detected moment</h3><p class="muted small-copy">Adjust the in/out points, then generate a real trimmed MP4 preview on this device.</p></div><span class="status-pill">On-device FFmpeg</span></div>
    <div class="trim-fields">
      <label class="field">Start time (seconds)<input id="trim-start" class="input" type="number" min="0" step="0.1" value="0"></label>
      <label class="field">End time (seconds)<input id="trim-end" class="input" type="number" min="0" step="0.1" value="30"></label>
      <label class="field">Clip duration<input id="trim-duration" class="input" value="—" readonly></label>
    </div>
    <div class="tool-row"><button class="btn primary" id="make-trim-preview" disabled>✂ Generate trimmed preview</button><button class="btn" id="play-source-range" style="background:#252d40" disabled>▶ Preview selected range</button></div>
    <div class="analysis-status" id="trim-status" aria-live="polite">Trim preview engine loads only when you use it (about 31 MB on first use).</div>
    <div class="video-box trim-output" id="trim-preview-box"><span>Trimmed clip preview will appear here</span></div>
    <p class="tiny muted">Android note: FFmpeg runs in browser memory. For stability, the trim preview currently accepts source videos up to 250 MB. Final multi-clip remix and export tools are Phase 2.</p>
  </section>`;
}

export function bindUpload() {
  // Release any previous page's temporary preview URLs.
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  if (trimPreviewUrl) URL.revokeObjectURL(trimPreviewUrl);
  currentFile = null; currentUrl = null; trimPreviewUrl = null; moments = []; remixClips = []; remixMusicFile = null;

  const input = document.getElementById("video-file");
  const zone = document.getElementById("drop-zone");
  const choose = document.getElementById("choose-video");
  const originalBox = document.getElementById("video-preview");
  const meta = document.getElementById("video-meta");
  const cloudUploadButton = document.getElementById("cloud-source-upload");
  const cloudStatus = document.getElementById("cloud-source-status");
  const analyzeButton = document.getElementById("analyze-video");
  const startInput = document.getElementById("trim-start");
  const endInput = document.getElementById("trim-end");
  const durationInput = document.getElementById("trim-duration");
  const trimButton = document.getElementById("make-trim-preview");
  const rangeButton = document.getElementById("play-source-range");
  const remixStatus = document.getElementById("remix-status");
  const remixTimeline = document.getElementById("remix-timeline");
  const exportRemixButton = document.getElementById("export-remix");
  const cloudRenderButton = document.getElementById("cloud-render-remix");
  const cloudStatus = document.getElementById("cloud-render-status");
  const cloudDownload = document.getElementById("cloud-render-download");
  const trimStatus = document.getElementById("trim-status");
  let sourceVideo = null;
  let playbackStopper = null;

  // Route browser console output and runtime errors into this visible panel.
  const consoleOutput = document.getElementById("console-output");
  const consoleCount = document.getElementById("console-count");
  const consoleLines = [];
  const maxConsoleLines = 250;
  const formatLog = value => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, (key, item) => {
      if (typeof item === "bigint") return String(item);
      if (item instanceof Error) return { name:item.name, message:item.message, stack:item.stack };
      return item;
    }); } catch { return String(value); }
  };
  const addConsoleLine = (level, args) => {
    const time = new Date().toLocaleTimeString();
    const message = args.map(formatLog).join(" ");
    consoleLines.push({ time, level, message });
    if (consoleLines.length > maxConsoleLines) consoleLines.shift();
    const colors = { LOG:"#cbd5e1", INFO:"#93c5fd", SUCCESS:"#6ee7b7", WARN:"#fbbf24", ERROR:"#fca5a5" };
    const row = document.createElement("div");
    row.style.color = colors[level] || colors.LOG;
    row.textContent = "[" + time + "] [" + level + "] " + message;
    consoleOutput.appendChild(row);
    while (consoleOutput.children.length > maxConsoleLines) consoleOutput.removeChild(consoleOutput.firstChild);
    consoleCount.textContent = consoleLines.length + " logs";
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };
  if (!window.__clipforgeConsoleCapture) {
    window.__clipforgeConsoleCapture = true;
    ["log","info","warn","error"].forEach(method => {
      const original = console[method].bind(console);
      console[method] = (...args) => {
        original(...args);
        window.dispatchEvent(new CustomEvent("clipforge:console", { detail:{ level:method.toUpperCase(), args } }));
      };
    });
    window.addEventListener("error", event => window.dispatchEvent(new CustomEvent("clipforge:console", { detail:{ level:"ERROR", args:[event.message, event.filename, "line " + event.lineno] } })));
    window.addEventListener("unhandledrejection", event => window.dispatchEvent(new CustomEvent("clipforge:console", { detail:{ level:"ERROR", args:["Unhandled promise rejection:", event.reason] } })));
  }
  if (window.__clipforgeConsoleListener) window.removeEventListener("clipforge:console", window.__clipforgeConsoleListener);
  const consoleListener = event => addConsoleLine(event.detail.level, event.detail.args);
  window.__clipforgeConsoleListener = consoleListener;
  window.addEventListener("clipforge:console", consoleListener);
  addConsoleLine("SUCCESS", ["Live console connected."]);
  addConsoleLine("INFO", ["Upload, Gemini, browser and app logs will appear here."]);
  document.getElementById("console-clear").onclick = () => {
    consoleLines.length = 0; consoleOutput.innerHTML = ""; consoleCount.textContent = "0 logs";
    addConsoleLine("INFO", ["Console cleared."]);
  };
  document.getElementById("console-copy").onclick = async () => {
    const text = consoleLines.map(line => "[" + line.time + "] [" + line.level + "] " + line.message).join("\\n");
    try {
      await navigator.clipboard.writeText(text);
      addConsoleLine("SUCCESS", ["Logs copied. Paste them into this chat."]);
    } catch {
      const area = document.createElement("textarea");
      area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      const copied = document.execCommand("copy"); area.remove();
      addConsoleLine(copied ? "SUCCESS" : "ERROR", [copied ? "Logs copied. Paste them into this chat." : "Copy failed; manually select the console text."]);
    }
  };

  choose.onclick = () => input.click();

  cloudUploadButton.onclick = async () => {
    if (!currentFile) return window.Clipforge.toast("Choose a source video first.", "error");
    cloudUploadButton.disabled = true;
    try {
      const stored = await uploadVideoToGetPronto(currentFile, status => {
        cloudStatus.textContent = status;
        addConsoleLine("INFO", ["GetPronto:", status]);
      });
      await saveLocalItem("getpronto-source-video", {
        kind:"getpronto-source-video", fileId:stored.id, name:stored.name,
        url:stored.url, rawUrl:stored.rawUrl, size:stored.size, type:stored.type
      });
      cloudStatus.replaceChildren();
      const label = document.createElement("span");
      label.textContent = "Stored successfully · ";
      const link = document.createElement("a");
      link.href = stored.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = "Open cloud video";
      cloudStatus.append(label, link);
      addConsoleLine("SUCCESS", ["Source video stored in GetPronto.", { id:stored.id, size:stored.size }]);
      Logger.success("GetPronto source upload complete", { id:stored.id, size:stored.size });
      window.Clipforge.toast("Source video stored in GetPronto.", "success");
    } catch (error) {
      cloudStatus.textContent = error.message || "GetPronto upload failed.";
      addConsoleLine("ERROR", ["GetPronto upload failed:", error.message]);
      Logger.error("GetPronto source upload failed", error);
      window.Clipforge.toast(error.message || "GetPronto upload failed.", "error");
    } finally {
      cloudUploadButton.disabled = !currentFile || currentFile.size > 100 * 1024 * 1024;
    }
  };
  input.onchange = () => loadFile(input.files?.[0]);
  zone.ondragover = event => { event.preventDefault(); zone.classList.add("drag"); };
  zone.ondragleave = () => zone.classList.remove("drag");
  zone.ondrop = event => { event.preventDefault(); zone.classList.remove("drag"); loadFile(event.dataTransfer.files?.[0]); };

  function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith("video/")) { window.Clipforge.toast("Please select a video file.", "error"); return; }
    if (file.size > 1500 * 1024 * 1024) { window.Clipforge.toast("This video is larger than the 1.5 GB upload limit.", "error"); return; }
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    if (trimPreviewUrl) URL.revokeObjectURL(trimPreviewUrl);
    currentFile = file; currentUrl = URL.createObjectURL(file); trimPreviewUrl = null; moments = [];
    saveLocalItem("source-video", { kind:"source-video", blob:file, name:file.name, type:file.type, size:file.size }).then(() => addConsoleLine("SUCCESS", ["Original video saved in this browser for 24 hours."])).catch(error => { addConsoleLine("WARN", ["Could not save source video locally:", error.message]); Logger.warn("Local source save failed", error); });
    originalBox.innerHTML = '<video id="source-video" controls playsinline preload="metadata"></video>';
    sourceVideo = originalBox.querySelector("video");
    sourceVideo.src = currentUrl;
    sourceVideo.onloadedmetadata = () => {
      const duration = Number.isFinite(sourceVideo.duration) ? sourceVideo.duration : 0;
      startInput.max = duration; endInput.max = duration;
      startInput.value = "0"; endInput.value = Math.min(duration, 30).toFixed(1);
      updateTrimDuration();
      analyzeButton.disabled = false; trimButton.disabled = false; rangeButton.disabled = false;
      if (typeof renderRemixTimeline === "function") renderRemixTimeline();
    };
    meta.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · Reading duration…`;
    cloudUploadButton.disabled = file.size > 100 * 1024 * 1024;
    cloudUploadButton.textContent = file.size > 100 * 1024 * 1024
      ? "GetPronto limit: 100 MB per video"
      : "☁ Store source in GetPronto";
    cloudStatus.textContent = file.size > 100 * 1024 * 1024
      ? "This source is too large for GetPronto Free. Local editing and Gemini analysis remain available."
      : "Optional cloud copy · Free plan: up to 100 MB per video.";
    document.getElementById("clip-list").innerHTML = '<p class="muted small-copy">Run Gemini analysis to find clip moments.</p>';
    document.getElementById("clip-count").textContent = "0 MOMENTS";
    document.getElementById("video-summary").textContent = "Ready for Gemini analysis.";
    document.getElementById("trim-title").textContent = "Manual trim";
    document.getElementById("trim-preview-box").innerHTML = "<span>Trimmed clip preview will appear here</span>";
    document.getElementById("analysis-status").textContent = "Video ready. Tap Analyse video.";
    trimStatus.textContent = "Trim preview engine loads only when you use it (about 31 MB on first use).";
    Logger.success("Video selected", { name: file.name, size: file.size, type: file.type });
  }

  function updateTrimDuration() {
    const start = Number(startInput.value) || 0;
    const end = Number(endInput.value) || 0;
    durationInput.value = end > start ? `${(end - start).toFixed(1)} sec` : "Invalid range";
  }
  startInput.oninput = updateTrimDuration;
  endInput.oninput = updateTrimDuration;

  document.getElementById("analyze-youtube").onclick = async () => {
    const url = document.getElementById("youtube-url").value.trim();
    if (!url) return window.Clipforge.toast("Paste a public YouTube link first.", "error");
    const user = auth?.currentUser;
    if (!user) return window.Clipforge.toast("Your login session expired. Sign in again.", "error");
    const button = document.getElementById("analyze-youtube");
    button.disabled = true;
    document.getElementById("analysis-status").textContent = "Gemini is analysing the public YouTube video…";
    try {
      const result = await analyzeYouTubeVideo(url, document.getElementById("clip-style").value, await user.getIdToken());
      moments = result.moments || [];
      saveLocalItem("clipforge-session", { kind:"session", moments, summary:result.summary || "", sourceName:currentFile?.name || null }).catch(error => Logger.warn("Could not save clip session", error));
      document.getElementById("video-summary").textContent = result.summary || "YouTube analysis complete.";
      document.getElementById("clip-count").textContent = `${moments.length} MOMENTS`;
      renderMoments();
      document.getElementById("analysis-status").textContent = `YouTube analysis complete · ${result.model || "Gemini"}`;
      if (!currentFile) trimStatus.textContent = "Upload the original video file to trim and preview these YouTube timestamps.";
      window.Clipforge.toast(`${moments.length} YouTube moments found.`, "success");
      Logger.success("YouTube analysis complete", { count: moments.length, model: result.model });
    } catch (error) {
      Logger.error("YouTube analysis failed", error);
      document.getElementById("analysis-status").textContent = error.message || "YouTube analysis failed.";
      window.Clipforge.toast(error.message || "YouTube analysis failed.", "error");
    } finally { button.disabled = false; }
  };

  analyzeButton.onclick = async () => {
    if (!currentFile || !sourceVideo) return window.Clipforge.toast("Choose a video first.", "error");
    const user = auth?.currentUser;
    if (!user) return window.Clipforge.toast("Your login session expired. Sign in again.", "error");
    analyzeButton.disabled = true;
    document.getElementById("analysis-status").textContent = "Starting secure upload…";
    addConsoleLine("INFO", ["Starting video analysis: " + currentFile.name + " (" + (currentFile.size / 1024 / 1024).toFixed(1) + " MB)"]);
    document.getElementById("clip-list").innerHTML = '<p class="muted small-copy">Gemini is analysing your video. Longer videos may take a few minutes.</p>';
    try {
      const token = await user.getIdToken();
      const result = await analyzeLocalVideo(currentFile, document.getElementById("clip-style").value, sourceVideo.duration, token, status => {
        document.getElementById("analysis-status").textContent = status;
        addConsoleLine("INFO", [status]);
      });
      moments = result.moments || [];
      saveLocalItem("clipforge-session", { kind:"session", moments, summary:result.summary || "", sourceName:currentFile?.name || null }).catch(error => Logger.warn("Could not save clip session", error));
      addConsoleLine("SUCCESS", ["Gemini analysis completed.", { count:moments.length, model:result.model || "Gemini" }]);
      document.getElementById("video-summary").textContent = result.summary || "Analysis complete.";
      document.getElementById("clip-count").textContent = `${moments.length} MOMENTS`;
      renderMoments();
      document.getElementById("analysis-status").textContent = `Analysis complete · ${result.model || "Gemini"}`;
      if (!moments.length) window.Clipforge.toast("Gemini did not find suitable clip moments in this video.", "info");
      else window.Clipforge.toast(`${moments.length} clip moments found.`, "success");
      Logger.success("Gemini video analysis complete", { count: moments.length, model: result.model });
    } catch (error) {
      const diagnostic = error.diagnostic || {
        stage: "browser_or_network",
        name: error.name || "Error",
        message: error.message || "Unknown error",
        status: error.status || null
      };
      console.error("[Clipforge] FULL VIDEO ANALYSIS FAILURE", {
        message: error.message,
        status: error.status || null,
        diagnostic,
        timestamp: new Date().toISOString()
      });
      Logger.error("Gemini analysis failed", { message: error.message, status: error.status, diagnostic });
      document.getElementById("analysis-status").textContent = "Analysis failed — diagnostic details are shown below.";
      addConsoleLine("ERROR", ["Gemini analysis failed.", { message:error.message || "Unknown error", status:error.status || diagnostic.httpStatus || null, diagnostic, timestamp:new Date().toISOString() }]);
      document.getElementById("clip-list").innerHTML = '<p class="muted small-copy">Analysis failed. Exact diagnostics are available in the Live Console above.</p>';
      window.Clipforge.toast(error.message || "Video analysis failed.", "error");
    } finally {
      analyzeButton.disabled = false;
    }
  };

  function renderMoments() {
    const host = document.getElementById("clip-list");
    if (!moments.length) { host.innerHTML = '<p class="muted small-copy">No suitable moments were detected. Try a different moment style.</p>'; return; }
    host.innerHTML = moments.map((clip, index) => `
      <article class="clip-row ai-clip">
        <div class="clip-thumb">▶</div>
        <div class="clip-details"><b>${escapeHtml(clip.title)}</b><small>${formatTime(clip.startSeconds)} — ${formatTime(clip.endSeconds)} · ${(clip.endSeconds-clip.startSeconds).toFixed(1)} sec</small>
        <p>${escapeHtml(clip.reason || clip.hook || "AI-selected highlight")}</p></div>
        <span class="score">${Math.round((clip.confidence || 0)*100)}%</span>
        <button class="ghost-btn" data-select-clip="${index}">Set trim →</button><button class="ghost-btn" data-add-remix="${index}">＋ Add to remix</button>
      </article>`).join("");
  }

  document.getElementById("clip-list").onclick = event => {
    const addButton = event.target.closest("[data-add-remix]");
    if (addButton) {
      const clip = moments[Number(addButton.dataset.addRemix)];
      if (!clip) return;
      remixClips.push({ title:clip.title, startSeconds:Number(clip.startSeconds), endSeconds:Number(clip.endSeconds) });
      saveLocalItem("remix-timeline", { kind:"remix-timeline", clips:remixClips }).catch(error => Logger.warn("Remix timeline save failed", error));
      renderRemixTimeline();
      remixStatus.textContent = "Clip added. Timeline is saved locally for 24 hours.";
      return;
    }
    const button = event.target.closest("[data-select-clip]");
    if (!button) return;
    const clip = moments[Number(button.dataset.selectClip)];
    if (!clip) return;
    startInput.value = clip.startSeconds.toFixed(1);
    endInput.value = clip.endSeconds.toFixed(1);
    document.getElementById("trim-title").textContent = clip.title;
    updateTrimDuration();
    if (sourceVideo) sourceVideo.currentTime = Math.min(clip.startSeconds, Math.max(0, sourceVideo.duration - 0.1));
    else window.Clipforge.toast("Upload the original video file to preview or trim this YouTube moment.", "info");
    window.Clipforge.toast("Clip range loaded into the trim controls.", "success");
  };

  function renderRemixTimeline() {
    document.getElementById("remix-count").value = `${remixClips.length} clips`;
    exportRemixButton.disabled = !currentFile || remixClips.length === 0;
    cloudRenderButton.disabled = !currentFile || remixClips.length === 0;
    remixTimeline.innerHTML = remixClips.length ? remixClips.map((clip,index) => `
      <article class="clip-row"><div class="clip-thumb">${index+1}</div><div class="clip-details"><b>${escapeHtml(clip.title)}</b><small>${formatTime(clip.startSeconds)} — ${formatTime(clip.endSeconds)}</small></div><button class="ghost-btn" data-move-up="${index}" ${index===0?"disabled":""} aria-label="Move clip up">↑</button><button class="ghost-btn" data-move-down="${index}" ${index===remixClips.length-1?"disabled":""} aria-label="Move clip down">↓</button><button class="ghost-btn" data-remove-remix="${index}">Remove</button></article>`).join("") : '<p class="muted small-copy">No clips added yet. Use “Add to remix” on detected moments above.</p>';
  }
  remixTimeline.onclick = event => {
    const up = event.target.closest("[data-move-up]");
    const down = event.target.closest("[data-move-down]");
    const remove = event.target.closest("[data-remove-remix]");
    if (up || down) {
      const index = Number((up || down).dataset[up ? "moveUp" : "moveDown"]);
      const next = up ? index - 1 : index + 1;
      if (next >= 0 && next < remixClips.length) {
        [remixClips[index],remixClips[next]] = [remixClips[next],remixClips[index]];
        saveLocalItem("remix-timeline", { kind:"remix-timeline", clips:remixClips }).catch(()=>{});
        renderRemixTimeline();
      }
      return;
    }
    if (!remove) return;
    remixClips.splice(Number(remove.dataset.removeRemix),1);
    saveLocalItem("remix-timeline", { kind:"remix-timeline", clips:remixClips }).catch(()=>{});
    renderRemixTimeline();
  };
  async function monitorCloudJob(jobId) {
    cloudStatus.textContent = "Checking cloud job " + jobId + "…";
    try {
      const job = await waitForRendobarJob(jobId, state => {
        cloudStatus.textContent = "Cloud render " + state.status + (state.progress != null ? " · " + Math.round(Number(state.progress)*100) + "%" : "") + ". It continues on the provider server if you close this page.";
      });
      await saveLocalItem("rendobar-job",{kind:"rendobar-job",jobId,status:job.status,outputUrl:job.outputUrl || null});
      cloudStatus.textContent = "Cloud render complete. Rendobar Free output retention is 7 days.";
      cloudDownload.replaceChildren();
      if (job.outputUrl) {
        const link=document.createElement("a");
        link.className="btn primary"; link.href=job.outputUrl; link.target="_blank";
        link.rel="noopener noreferrer"; link.download="clipforge-cloud-remix.mp4";
        link.textContent="↓ Open / download cloud MP4"; cloudDownload.append(link);
      }
      addConsoleLine("SUCCESS",["Rendobar cloud render completed.",job]);
    } catch(error) {
      cloudStatus.textContent = error.message || "Cloud render status check failed.";
      addConsoleLine("WARN",["Cloud job status:",error.message]);
    }
  }
  cloudRenderButton.onclick = async () => {
    if (!currentFile || !remixClips.length) return;
    cloudRenderButton.disabled = true;
    try {
      cloudStatus.textContent = "Checking Rendobar API configuration…";
      await checkRendobar();
      let storedSource = await getLocalItem("getpronto-source-video");
      if (!storedSource?.url || storedSource.name !== currentFile.name || storedSource.size !== currentFile.size) {
        cloudStatus.textContent = "Uploading source to GetPronto for background rendering…";
        const file = await uploadVideoToGetPronto(currentFile,status=>{cloudStatus.textContent=status;});
        storedSource = {url:file.url,name:currentFile.name,size:currentFile.size,id:file.id};
        await saveLocalItem("getpronto-source-video",{kind:"getpronto-source-video",...storedSource});
      }
      let musicUrl = null;
      if (remixMusicFile) {
        let storedMusic = await getLocalItem("getpronto-remix-music");
        if (!storedMusic?.url || storedMusic.name !== remixMusicFile.name || storedMusic.size !== remixMusicFile.size) {
          cloudStatus.textContent = "Uploading background music to GetPronto…";
          const music = await uploadMediaToGetPronto(remixMusicFile,status=>{cloudStatus.textContent=status;});
          storedMusic = {url:music.url,name:remixMusicFile.name,size:remixMusicFile.size,id:music.id};
          await saveLocalItem("getpronto-remix-music",{kind:"getpronto-remix-music",...storedMusic});
        }
        musicUrl = storedMusic.url;
      }
      const timeline = {
        sourceUrl:storedSource.url, clips:remixClips,
        aspectRatio:document.getElementById("remix-ratio").value,
        effect:document.getElementById("remix-effect").value,
        transition:document.getElementById("remix-transition")?.value || "crossfade",
        overlayText:document.getElementById("remix-overlay-text").value,
        musicUrl, musicVolume:Number(document.getElementById("remix-music-volume").value),
        speed:Number(document.getElementById("remix-speed").value)
      };
      cloudStatus.textContent = "Validating edit (validation is free)…";
      const validation = await validateRendobar(timeline);
      addConsoleLine("INFO",["Rendobar validation result:",validation.validation]);
      cloudStatus.textContent = "Submitting cloud render using your free credits…";
      const submitted = await submitRendobar(timeline);
      await saveLocalItem("rendobar-job",{kind:"rendobar-job",jobId:submitted.jobId,status:"queued"});
      addConsoleLine("SUCCESS",["Cloud render queued.",submitted]);
      await monitorCloudJob(submitted.jobId);
    } catch(error) {
      cloudStatus.textContent = error.message || "Cloud render could not start. Local rendering remains available.";
      addConsoleLine("ERROR",["Cloud render setup failed:",error.message]);
      Logger.error("Rendobar cloud render failed",error);
      window.Clipforge.toast(error.message || "Cloud render failed.", "error");
    } finally {
      cloudRenderButton.disabled = !currentFile || remixClips.length === 0;
    }
  };
  document.getElementById("check-cloud-render").onclick = async () => {
    const saved = await getLocalItem("rendobar-job");
    if (!saved?.jobId) { cloudStatus.textContent = "No saved cloud job found yet."; return; }
    await monitorCloudJob(saved.jobId);
  };
  document.getElementById("remix-music").onchange = async event => {
    remixMusicFile = event.target.files?.[0] || null;
    const label = document.getElementById("remix-music-status");
    if (remixMusicFile) {
      label.textContent = "Music selected: " + remixMusicFile.name;
      try { await saveLocalItem("remix-music", { kind:"remix-music", blob:remixMusicFile, name:remixMusicFile.name, type:remixMusicFile.type }); }
      catch(error) { addConsoleLine("WARN",["Music file could not be saved for refresh restore:",error.message]); }
    } else label.textContent = "No background music selected."; 
  };
  document.getElementById("clear-remix").onclick = () => {
    remixClips = [];
    saveLocalItem("remix-timeline", { kind:"remix-timeline", clips:[] }).catch(()=>{});
    renderRemixTimeline();
    remixStatus.textContent = "Timeline cleared.";
  };
  exportRemixButton.onclick = async () => {
    if (!currentFile || !remixClips.length) return;
    exportRemixButton.disabled = true;
    remixStatus.textContent = "Starting Phase 2 export…";
    try {
      const blob = await createRemixExport(currentFile, remixClips, document.getElementById("remix-ratio").value, status => { remixStatus.textContent = status; addConsoleLine("INFO",[status]); }, {
        effect:document.getElementById("remix-effect").value,
        speed:Number(document.getElementById("remix-speed").value),
        quality:document.getElementById("remix-quality").value,
        overlayText:document.getElementById("remix-overlay-text").value,
        musicFile:remixMusicFile,
        musicVolume:Number(document.getElementById("remix-music-volume").value),
        originalVolume:Number(document.getElementById("remix-original-volume").value)
      });
      await saveLocalItem("remix-export", { kind:"remix-export", blob, name:"clipforge-remix.mp4", type:"video/mp4" });
      const url = URL.createObjectURL(blob);
      document.getElementById("remix-download").innerHTML = '<a class="btn primary" id="download-remix" download="clipforge-remix.mp4" href="' + url + '">↓ Download final MP4</a>';
      remixStatus.textContent = `Remix ready · ${(blob.size/1024/1024).toFixed(1)} MB · saved locally for 24 hours.`;
      Logger.success("Phase 2 remix export complete", { bytes:blob.size, clips:remixClips.length });
    } catch(error) {
      remixStatus.textContent = error.message || "Remix export failed.";
      Logger.error("Phase 2 remix export failed", error);
      window.Clipforge.toast(error.message || "Remix export failed.", "error");
    } finally { renderRemixTimeline(); }
  };

  rangeButton.onclick = async () => {
    if (!sourceVideo) return;
    const start = Number(startInput.value), end = Number(endInput.value);
    if (!(end > start) || end > sourceVideo.duration) return window.Clipforge.toast("Enter a valid trim range.", "error");
    if (playbackStopper) clearInterval(playbackStopper);
    sourceVideo.currentTime = start;
    try { await sourceVideo.play(); } catch {}
    playbackStopper = setInterval(() => {
      if (sourceVideo && sourceVideo.currentTime >= end) {
        sourceVideo.pause(); clearInterval(playbackStopper); playbackStopper = null;
      }
    }, 100);
  };

  trimButton.onclick = async () => {
    if (!currentFile) return window.Clipforge.toast("Choose a video first.", "error");
    const start = Number(startInput.value), end = Number(endInput.value);
    if (!(end > start) || start < 0 || end > (sourceVideo?.duration || 0)) return window.Clipforge.toast("Enter valid start and end times.", "error");
    trimButton.disabled = true; rangeButton.disabled = true;
    try {
      const blob = await createTrimPreview(currentFile, start, end, status => { trimStatus.textContent = status; });
      if (trimPreviewUrl) URL.revokeObjectURL(trimPreviewUrl);
      trimPreviewUrl = URL.createObjectURL(blob);
      await saveLocalItem("trimmed-clip", { kind:"trimmed-clip", blob, name:`clipforge-${Math.round(start)}-${Math.round(end)}.mp4`, type:"video/mp4", start, end });
      addConsoleLine("SUCCESS", ["Trimmed clip saved in this browser for 24 hours."]);
      document.getElementById("trim-preview-box").innerHTML = '<video id="trimmed-video" controls playsinline></video>';
      const preview = document.getElementById("trimmed-video");
      preview.src = trimPreviewUrl;
      trimStatus.textContent = `Trim preview ready · ${(blob.size/1024/1024).toFixed(1)} MB · ${(end-start).toFixed(1)} seconds`;
      Logger.success("Trim preview generated", { bytes: blob.size, start, end });
      window.Clipforge.toast("Trimmed clip preview is ready.", "success");
    } catch (error) {
      Logger.error("Trim preview failed", error);
      trimStatus.textContent = error.message || "Could not create trim preview.";
      window.Clipforge.toast(error.message || "Trim preview failed.", "error");
    } finally {
      trimButton.disabled = false; rangeButton.disabled = false;
    }
  };

  // Restore the last local editing session after refresh or page navigation.
  (async () => {
    try {
      const savedSource = await getLocalItem("source-video");
      if (savedSource?.blob) {
        const restoredFile = savedSource.blob instanceof File
          ? savedSource.blob
          : new File([savedSource.blob], savedSource.name || "restored-video.mp4", { type:savedSource.type || "video/mp4" });
        loadFile(restoredFile);
        addConsoleLine("SUCCESS", ["Restored source video from local browser storage."]);
      }
      const savedJob = await getLocalItem("rendobar-job");
      if (savedJob?.jobId) cloudStatus.textContent = "Saved cloud job: " + savedJob.jobId + " · Tap Check cloud job to resume tracking.";
      if (savedJob?.outputUrl) {
        const link=document.createElement("a"); link.className="btn primary"; link.href=savedJob.outputUrl;
        link.target="_blank"; link.rel="noopener noreferrer"; link.textContent="↓ Open saved cloud MP4";
        cloudDownload.append(link);
      }
      const savedMusic = await getLocalItem("remix-music");
      if (savedMusic?.blob) {
        remixMusicFile = savedMusic.blob instanceof File ? savedMusic.blob : new File([savedMusic.blob],savedMusic.name || "background-audio.mp3",{type:savedMusic.type || "audio/mpeg"});
        document.getElementById("remix-music-status").textContent = "Restored music: " + remixMusicFile.name;
      }
      const savedTimeline = await getLocalItem("remix-timeline");
      if (savedTimeline?.clips) { remixClips = savedTimeline.clips; renderRemixTimeline(); }
      const savedExport = await getLocalItem("remix-export");
      if (savedExport?.blob) {
        const exportUrl = URL.createObjectURL(savedExport.blob);
        document.getElementById("remix-download").innerHTML = '<a class="btn primary" download="clipforge-remix.mp4" href="' + exportUrl + '">↓ Download saved final MP4</a>';
        remixStatus.textContent = "Restored previous remix export from local browser storage.";
      }
      const savedSession = await getLocalItem("clipforge-session");
      if (savedSession?.moments) {
        moments = savedSession.moments;
        document.getElementById("video-summary").textContent = savedSession.summary || "Restored previous analysis.";
        document.getElementById("clip-count").textContent = `${moments.length} MOMENTS`;
        renderMoments();
        addConsoleLine("SUCCESS", [`Restored ${moments.length} detected moments.`]);
      }
      const savedClip = await getLocalItem("trimmed-clip");
      if (savedClip?.blob) {
        if (trimPreviewUrl) URL.revokeObjectURL(trimPreviewUrl);
        trimPreviewUrl = URL.createObjectURL(savedClip.blob);
        document.getElementById("trim-preview-box").innerHTML = '<video id="trimmed-video" controls playsinline></video>';
        document.getElementById("trimmed-video").src = trimPreviewUrl;
        trimStatus.textContent = `Restored trimmed clip · ${(savedClip.blob.size/1024/1024).toFixed(1)} MB · kept locally for up to 24 hours`;
        addConsoleLine("SUCCESS", ["Restored previous trimmed MP4."]);
      }
    } catch (error) {
      addConsoleLine("WARN", ["Local restore failed:", error.message]);
      Logger.warn("Local session restore failed", error);
    }
  })();
}

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const secs = (value % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${secs}`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
