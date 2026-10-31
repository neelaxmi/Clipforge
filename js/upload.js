import Logger from "./logger.js";
import { auth } from "./firebase.js";
import { analyzeLocalVideo, analyzeYouTubeVideo } from "./gemini-video.js";
import { createTrimPreview } from "./video-trimmer.js";

let currentFile = null;
let currentUrl = null;
let trimPreviewUrl = null;
let moments = [];

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
      <div class="notice" style="margin-top:15px">Your video is uploaded directly to Google's Gemini File API using a temporary upload session. Gemini API keys stay on the Vercel server. Only analyse videos you own or have permission to use.</div>
    </section>
  </div>

  <div class="section-head"><h3>AI detected moments</h3><span class="tiny muted" id="clip-count">0 MOMENTS</span></div>
  <section class="card">
    <div id="video-summary" class="muted small-copy">Gemini's summary and clip suggestions will appear here after analysis.</div>
    <div id="clip-list" class="clip-list" style="margin-top:14px"><p class="muted small-copy">No analysis yet.</p></div>
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
  currentFile = null; currentUrl = null; trimPreviewUrl = null; moments = [];

  const input = document.getElementById("video-file");
  const zone = document.getElementById("drop-zone");
  const choose = document.getElementById("choose-video");
  const originalBox = document.getElementById("video-preview");
  const meta = document.getElementById("video-meta");
  const analyzeButton = document.getElementById("analyze-video");
  const startInput = document.getElementById("trim-start");
  const endInput = document.getElementById("trim-end");
  const durationInput = document.getElementById("trim-duration");
  const trimButton = document.getElementById("make-trim-preview");
  const rangeButton = document.getElementById("play-source-range");
  const trimStatus = document.getElementById("trim-status");
  let sourceVideo = null;
  let playbackStopper = null;

  choose.onclick = () => input.click();
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
    originalBox.innerHTML = '<video id="source-video" controls playsinline preload="metadata"></video>';
    sourceVideo = originalBox.querySelector("video");
    sourceVideo.src = currentUrl;
    sourceVideo.onloadedmetadata = () => {
      const duration = Number.isFinite(sourceVideo.duration) ? sourceVideo.duration : 0;
      startInput.max = duration; endInput.max = duration;
      startInput.value = "0"; endInput.value = Math.min(duration, 30).toFixed(1);
      updateTrimDuration();
      analyzeButton.disabled = false; trimButton.disabled = false; rangeButton.disabled = false;
    };
    meta.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · Reading duration…`;
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
    document.getElementById("clip-list").innerHTML = '<p class="muted small-copy">Gemini is analysing your video. Longer videos may take a few minutes.</p>';
    try {
      const token = await user.getIdToken();
      const result = await analyzeLocalVideo(currentFile, document.getElementById("clip-style").value, sourceVideo.duration, token, status => {
        document.getElementById("analysis-status").textContent = status;
      });
      moments = result.moments || [];
      document.getElementById("video-summary").textContent = result.summary || "Analysis complete.";
      document.getElementById("clip-count").textContent = `${moments.length} MOMENTS`;
      renderMoments();
      document.getElementById("analysis-status").textContent = `Analysis complete · ${result.model || "Gemini"}`;
      if (!moments.length) window.Clipforge.toast("Gemini did not find suitable clip moments in this video.", "info");
      else window.Clipforge.toast(`${moments.length} clip moments found.`, "success");
      Logger.success("Gemini video analysis complete", { count: moments.length, model: result.model });
    } catch (error) {
      Logger.error("Gemini analysis failed", error);
      document.getElementById("analysis-status").textContent = error.message || "Analysis failed.";
      document.getElementById("clip-list").innerHTML = '<p class="muted small-copy">Analysis failed. Check your Firebase and Gemini server environment variables, then retry.</p>';
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
        <button class="ghost-btn" data-select-clip="${index}">Set trim →</button>
      </article>`).join("");
  }

  document.getElementById("clip-list").onclick = event => {
    const button = event.target.closest("[data-select-clip]");
    if (!button) return;
    const clip = moments[Number(button.dataset.selectClip)];
    if (!clip) return;
    startInput.value = clip.startSeconds.toFixed(1);
    endInput.value = clip.endSeconds.toFixed(1);
    document.getElementById("trim-title").textContent = clip.title;
    updateTrimDuration();
    sourceVideo.currentTime = clip.startSeconds;
    window.Clipforge.toast("Clip range loaded into the trim controls.", "success");
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
