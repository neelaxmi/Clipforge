async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function uploadWithProgress(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
    xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(`Gemini video upload failed (${xhr.status}). ${String(data.error?.message || xhr.responseText || "").slice(0,220)}`));
    };
    xhr.onerror = () => reject(new Error("Browser could not reach Gemini's upload endpoint. Check your connection, then retry."));
    xhr.onabort = () => reject(new Error("Video upload was cancelled."));
    xhr.send(file);
  });
}
export async function analyzeLocalVideo(file, style, durationSeconds, idToken, onStatus = () => {}) {
  onStatus("Preparing secure Gemini upload…");
  const session = await parseResponse(await fetch("/api/gemini/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size })
  }));
  onStatus("Uploading video to Gemini… 0%");
  const uploaded = await uploadWithProgress(session.uploadUrl, file, percent => onStatus(`Uploading video to Gemini… ${percent}%`));
  const fileInfo = uploaded.file || uploaded;
  if (!fileInfo.name) throw new Error("Gemini upload completed but did not return a file reference.");
  onStatus("Gemini is processing the video…");
  const result = await parseResponse(await fetch("/api/gemini/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileName: fileInfo.name, mimeType: file.type, durationSeconds, style })
  }));
  return result;
}
