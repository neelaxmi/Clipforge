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

export async function createRemixExport(file, clips, aspectRatio = "9:16", onStatus = () => {}) {
  if (file.size > 250 * 1024 * 1024) throw new Error("For Android memory safety, remix export currently supports source videos up to 250 MB.");
  if (!Array.isArray(clips) || clips.length < 1) throw new Error("Add at least one clip to your remix timeline.");
  const dimensions = { "9:16":[1080,1920], "16:9":[1920,1080], "1:1":[1080,1080] };
  const [width,height] = dimensions[aspectRatio] || dimensions["9:16"];
  const ffmpeg = await loadTrimEngine(onStatus);
  const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"") || "mp4";
  const inputName = `remix-source.${ext}`;
  const listName = "remix-list.txt";
  const outputName = "clipforge-remix.mp4";
  const segmentNames = [];
  try {
    onStatus("Preparing source video for remix…");
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    for (let i=0; i<clips.length; i++) {
      const clip = clips[i];
      if (!(clip.endSeconds > clip.startSeconds)) continue;
      const name = `remix-part-${i}.mp4`;
      segmentNames.push(name);
      onStatus(`Rendering clip ${i+1} of ${clips.length}…`);
      await ffmpeg.exec([
        "-ss", String(clip.startSeconds), "-i", inputName, "-t", String(clip.endSeconds-clip.startSeconds),
        "-map","0:v:0","-map","0:a?","-vf",`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`,
        "-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p",
        "-c:a","aac","-b:a","192k","-movflags","+faststart",name
      ]);
    }
    if (!segmentNames.length) throw new Error("No valid clips found in the remix timeline.");
    const list = segmentNames.map(name => `file '${name}'`).join("\n");
    await ffmpeg.writeFile(listName, new TextEncoder().encode(list));
    onStatus("Joining clips into the final MP4…");
    await ffmpeg.exec(["-f","concat","-safe","0","-i",listName,"-c","copy","-movflags","+faststart",outputName]);
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type:"video/mp4" });
    if (!blob.size) throw new Error("The remix export is empty. Please try again.");
    onStatus("Your remix MP4 is ready.");
    return blob;
  } finally {
    for (const name of [inputName,listName,outputName,...segmentNames]) {
      try { await ffmpeg.deleteFile(name); } catch {}
    }
  }
}
