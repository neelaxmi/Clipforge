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
    onStatus("Trimming and encoding a preview on this device…");
    await ffmpeg.exec([
      "-ss", String(startSeconds), "-i", inputName, "-t", String(endSeconds - startSeconds),
      "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "ultrafast",
      "-crf", "29", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outputName
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
