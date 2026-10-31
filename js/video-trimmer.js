import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import Logger from "./logger.js";

let engine = null;
let loading = null;
export async function loadTrimEngine(onStatus = () => {}) {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    onStatus("Loading local video engine (~31 MB, first use only)…");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => Logger.info("FFmpeg", message));
    ffmpeg.on("progress", ({ progress }) => onStatus(`Creating clip preview… ${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`));
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
    });
    engine = ffmpeg;
    Logger.success("Local FFmpeg engine ready");
    return engine;
  })();
  try { return await loading; } finally { loading = null; }
}
export async function createTrimPreview(file, startSeconds, endSeconds, onStatus = () => {}) {
  if (file.size > 250 * 1024 * 1024) throw new Error("For Android memory safety, trim preview currently supports source videos up to 250 MB.");
  if (!(endSeconds > startSeconds) || startSeconds < 0) throw new Error("Choose a valid start and end time.");
  const ffmpeg = await loadTrimEngine(onStatus);
  const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"") || "mp4";
  const inputName = `source.${extension}`;
  const outputName = "clipforge-preview.mp4";
  try {
    onStatus("Preparing source video in browser memory…");
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    onStatus("Creating a high-quality trimmed MP4 on this device…");
    await ffmpeg.exec([
      "-ss", String(startSeconds), "-i", inputName, "-t", String(endSeconds - startSeconds),
      "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputName
    ]);
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    if (!blob.size) throw new Error("FFmpeg created an empty preview. Try a different clip range.");
    onStatus("Trim preview ready.");
    return blob;
  } finally {
    try { await ffmpeg.deleteFile(inputName); } catch {}
    try { await ffmpeg.deleteFile(outputName); } catch {}
  }
}

export async function createRemixExport(file, clips, aspectRatio = "9:16", onStatus = () => {}, options = {}) {
  if (file.size > 250 * 1024 * 1024) throw new Error("For Android memory safety, local remix export currently supports source videos up to 250 MB. Try cloud rendering for larger files.");
  if (!Array.isArray(clips) || clips.length < 1) throw new Error("Add at least one clip to your remix timeline.");
  const dimensions = { "9:16":[1080,1920], "16:9":[1920,1080], "1:1":[1080,1080] };
  const [width,height] = dimensions[aspectRatio] || dimensions["9:16"];
  const ffmpeg = await loadTrimEngine(onStatus);
  const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"") || "mp4";
  const inputName = `remix-source.${ext}`;
  const listName = "remix-list.txt";
  const outputName = "clipforge-remix.mp4";
  const segmentNames = [];
  const overlayNames = [];
  const speed = Math.max(0.5, Math.min(2, Number(options.speed) || 1));
  const useFade = String(options.transition || "fade") !== "none";
  const quality = ["18","20","23"].includes(String(options.quality)) ? String(options.quality) : "20";
  const effects = {
    clean: "",
    cinematic: ",eq=contrast=1.12:saturation=1.12:brightness=-0.015,vignette=PI/5",
    warm: ",colorbalance=rs=0.08:gs=0.02:bs=-0.06,eq=saturation=1.18:contrast=1.04",
    mono: ",hue=s=0,eq=contrast=1.12:brightness=0.01",
    vivid: ",eq=contrast=1.16:saturation=1.35:gamma=1.02",
    noir: ",hue=s=0,eq=contrast=1.35:brightness=-0.04,vignette=PI/4",
    glitch: ",noise=alls=10:allf=t+u,eq=contrast=1.22:saturation=1.3"
  };
  const effect = effects[options.effect] ?? effects.cinematic;
  const safeText = String(options.overlayText || "").trim().slice(0, 100);
  async function makeOverlay(name, text) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,width,height);
    const fontSize = Math.round(width * 0.075);
    ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(5, fontSize * 0.12);
    ctx.strokeStyle = "rgba(0,0,0,.88)";
    ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = fontSize * 0.28;
    const words = text.split(/\\s+/);
    const lines = []; let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > width * 0.84 && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    const lineHeight = fontSize * 1.12;
    const centerY = height * 0.72;
    lines.slice(0,3).forEach((value,index) => {
      const y = centerY + (index - (Math.min(lines.length,3)-1)/2) * lineHeight;
      ctx.strokeText(value,width/2,y);
      const gradient = ctx.createLinearGradient(0,y-fontSize/2,0,y+fontSize/2);
      gradient.addColorStop(0,"#ffffff"); gradient.addColorStop(1,"#bcecff");
      ctx.fillStyle = gradient; ctx.fillText(value,width/2,y);
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/png"));
    if (!blob) throw new Error("Could not create title overlay.");
    await ffmpeg.writeFile(name, await fetchFile(blob));
  }
  try {
    onStatus("Preparing source video for the Remix Studio…");
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    for (let i=0; i<clips.length; i++) {
      const clip = clips[i];
      if (!(Number(clip.endSeconds) > Number(clip.startSeconds))) continue;
      const name = `remix-part-${i}.mp4`;
      segmentNames.push(name);
      const sourceDuration = Number(clip.endSeconds)-Number(clip.startSeconds);
      const duration = sourceDuration/speed;
      onStatus(`Rendering clip ${i+1} of ${clips.length} · ${Math.round((i/clips.length)*100)}%…`);
      const videoFilters = [
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`, "setsar=1",
        effect.replace(/^,/,""),
        `setpts=PTS/${speed}`,
        ...(useFade ? ["fade=t=in:st=0:d=0.22", `fade=t=out:st=${Math.max(0,duration-0.24)}:d=0.24`] : [])
      ].filter(Boolean).join(",");
      const overlayText = safeText || String(clip.title || "").trim().slice(0,100);
      if (overlayText) {
        const overlay = `remix-title-${i}.png`;
        overlayNames.push(overlay);
        await makeOverlay(overlay, overlayText);
        await ffmpeg.exec([
          "-ss",String(clip.startSeconds),"-i",inputName,"-loop","1","-i",overlay,
          "-t",String(sourceDuration),"-filter_complex",
          `[0:v]${videoFilters}[base];[1:v]format=rgba,fade=t=in:st=0:d=0.45:alpha=1[title];[base][title]overlay=0:0:shortest=1[v]`,
          "-map","[v]","-map","0:a?","-c:v","libx264","-preset","veryfast","-crf",quality,
          "-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart",name
        ]);
      } else {
        await ffmpeg.exec([
          "-ss",String(clip.startSeconds),"-i",inputName,"-t",String(sourceDuration),
          "-map","0:v:0","-map","0:a?","-vf",videoFilters,
          "-c:v","libx264","-preset","veryfast","-crf",quality,"-pix_fmt","yuv420p",
          "-c:a","aac","-b:a","192k","-movflags","+faststart",name
        ]);
      }
    }
    if (!segmentNames.length) throw new Error("No valid clips found in the remix timeline.");
    const list = segmentNames.map(name => `file '${name}'`).join("\\n");
    await ffmpeg.writeFile(listName, new TextEncoder().encode(list));
    onStatus("Joining clips and preparing final MP4…");
    await ffmpeg.exec(["-f","concat","-safe","0","-i",listName,"-c","copy","-movflags","+faststart",outputName]);
    let data = await ffmpeg.readFile(outputName);
    let blob = new Blob([data.buffer], { type:"video/mp4" });

    if (options.musicFile instanceof File) {
      onStatus("Mixing your background music…");
      const musicExt = options.musicFile.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"") || "mp3";
      const musicName = `remix-music.${musicExt}`;
      const mixedName = "clipforge-remix-mixed.mp4";
      try {
        await ffmpeg.writeFile(musicName, await fetchFile(options.musicFile));
        const originalVolume = Math.max(0,Math.min(2,Number(options.originalVolume ?? 0.8)));
        const musicVolume = Math.max(0,Math.min(1,Number(options.musicVolume ?? 0.22)));
        await ffmpeg.exec([
          "-i",outputName,"-stream_loop","-1","-i",musicName,
          "-filter_complex",`[0:a]volume=${originalVolume}[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[a]`,
          "-map","0:v:0","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart",mixedName
        ]);
        data = await ffmpeg.readFile(mixedName);
        blob = new Blob([data.buffer],{type:"video/mp4"});
      } catch (audioError) {
        Logger.warn("Music mix failed; keeping original export",audioError);
        onStatus("Music mix unavailable for this source. Keeping the clean export…");
      } finally {
        try { await ffmpeg.deleteFile(musicName); } catch {}
        try { await ffmpeg.deleteFile(mixedName); } catch {}
      }
    }
    if (!blob.size) throw new Error("The remix export is empty. Please try again.");
    onStatus("Your cinematic remix is ready.");
    return blob;
  } finally {
    for (const name of [inputName,listName,outputName,...segmentNames,...overlayNames]) {
      try { await ffmpeg.deleteFile(name); } catch {}
    }
  }
}
