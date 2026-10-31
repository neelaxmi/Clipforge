async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

const CHUNK_SIZE = 3 * 1024 * 1024; // Stay below Vercel's 4.5 MB function request limit.
async function uploadThroughServer(uploadUrl, file, idToken, onProgress, onLog) {
  let offset = 0;
  let finalFile = null;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);
    const final = end === file.size;
    onLog(`Sending chunk ${Math.floor(offset / CHUNK_SIZE) + 1} · ${Math.round(chunk.size / 1024 / 1024 * 10) / 10} MB`);
    let response;
    try {
      response = await fetch("/api/gemini/upload-chunk", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/octet-stream",
          "X-Clipforge-Upload-Url": uploadUrl,
          "X-Clipforge-Upload-Offset": String(offset),
          "X-Clipforge-Upload-Final": String(final)
        },
        body: chunk
      });
    } catch (error) {
      throw new Error(`Chunk upload request failed at ${Math.round(offset / file.size * 100)}%. ${error?.message || "Network request blocked"}`);
    }
    const result = await parseResponse(response);
    if (final) finalFile = result.file || result;
    offset = end;
    onProgress(Math.round(offset / file.size * 100));
    onLog(`Chunk accepted · ${Math.round(offset / file.size * 100)}% uploaded`);
  }
  return finalFile;
}

export async function analyzeLocalVideo(file, style, durationSeconds, idToken, onStatus = () => {}, onLog = () => {}) {
  onLog("Requesting secure Gemini upload session");
  onStatus("Preparing secure Gemini upload…");
  const session = await parseResponse(await fetch("/api/gemini/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size })
  }));
  if (!session.uploadUrl) throw new Error("Server did not return a Gemini upload session URL.");
  onLog("Secure upload session created");
  onStatus("Uploading video to Gemini… 0%");
  const fileInfo = await uploadThroughServer(session.uploadUrl, file, idToken,
    percent => onStatus(`Uploading video to Gemini… ${percent}%`), onLog);
  if (!fileInfo?.name) throw new Error("Gemini upload completed but did not return a file reference.");
  onLog("Gemini accepted the video. Starting AI analysis.");
  onStatus("Gemini is processing the video…");
  const result = await parseResponse(await fetch("/api/gemini/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileName: fileInfo.name, mimeType: file.type, durationSeconds, style })
  }));
  onLog(`Analysis response received · ${(result.moments || []).length} moments detected`);
  return result;
}

export async function analyzeYouTubeVideo(url, style, idToken) {
  const response = await fetch("/api/gemini/analyze-youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ url, style })
  });
  return parseResponse(response);
}
