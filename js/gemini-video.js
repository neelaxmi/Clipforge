async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
export async function analyzeLocalVideo(file, style, durationSeconds, idToken, onStatus = () => {}) {
  onStatus("Preparing secure Gemini upload…");
  const session = await parseResponse(await fetch("/api/gemini/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size })
  }));
  onStatus("Uploading video directly to Google Gemini…");
  let uploadResponse;
  try {
    uploadResponse = await fetch(session.uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type, "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
      body: file
    });
  } catch (error) {
    throw new Error("Browser could not reach Gemini's upload endpoint. Check your connection and try again. " + (error.message || ""));
  }
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(`Gemini video upload failed (${uploadResponse.status}). ${detail.slice(0,220)}`);
  }
  const uploaded = await uploadResponse.json();
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
