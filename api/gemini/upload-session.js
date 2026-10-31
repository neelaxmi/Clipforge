import { requireFirebaseUser } from "../_lib/auth.js";
import { getGeminiKey, methodNotAllowed, sendJson, safeErrorMessage } from "../_lib/http.js";

const allowedTypes = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
  "video/3gpp", "video/mpeg", "video/x-msvideo"
]);
const MAX_BYTES = 1500 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    await requireFirebaseUser(req);
    const key = getGeminiKey();
    const { fileName, mimeType, size } = req.body || {};
    if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 180) {
      return sendJson(res, 400, { error: "A valid video filename is required." });
    }
    if (!allowedTypes.has(mimeType)) return sendJson(res, 415, { error: "This video format is not supported. Try MP4, MOV or WebM." });
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) {
      return sendJson(res, 413, { error: "Video must be smaller than 1.5 GB for this upload workflow." });
    }

    const response = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ file: { display_name: fileName.trim().slice(0, 120) } }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("[Clipforge] Gemini upload-session error", response.status, detail.slice(0, 1200));
      return sendJson(res, 502, { error: "Gemini could not start the video upload. Check the API key, quota and supported format." });
    }
    const uploadUrl = response.headers.get("x-goog-upload-url");
    if (!uploadUrl) return sendJson(res, 502, { error: "Gemini did not return a resumable upload URL." });
    return sendJson(res, 200, { uploadUrl });
  } catch (error) {
    console.error("[Clipforge] upload-session failed", error);
    return sendJson(res, error.statusCode || 500, { error: safeErrorMessage(error) });
  }
}
