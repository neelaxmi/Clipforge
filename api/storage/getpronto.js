import { requireFirebaseUser } from "../_lib/auth.js";
import { sendJson, methodNotAllowed, safeErrorMessage } from "../_lib/http.js";

const API_BASE = "https://api.getpronto.io/v1";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES = new Set([
  "video/mp4", "video/webm", "video/quicktime", "video/ogg",
  "video/x-matroska", "video/x-msvideo", "video/3gpp", "video/mpeg"
]);

function getProntoKey() {
  const key = process.env.GETPRONTO_API_KEY;
  if (!key) {
    const error = new Error("GetPronto is not connected yet. Add GETPRONTO_API_KEY in Vercel Environment Variables.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}

async function prontoRequest(path, key, body) {
  const response = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      Authorization: "ApiKey " + key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || "GetPronto request failed (" + response.status + ").");
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }
  return payload;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requireFirebaseUser(req);
    const key = getProntoKey();
    const body = req.body || {};
    const action = body.action;

    if (action === "presign") {
      const filename = String(body.filename || "clipforge-video.mp4").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120);
      const mimetype = String(body.mimetype || "").toLowerCase();
      const size = Number(body.size);
      if (!VIDEO_TYPES.has(mimetype)) return sendJson(res, 400, { error: "Unsupported video format." });
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) {
        return sendJson(res, 413, { error: "GetPronto Free supports videos up to 100 MB per file." });
      }
      const result = await prontoRequest("/upload/presign", key, {
        filename,
        mimetype,
        size,
        customFilename: "cf-" + user.uid.slice(0, 12) + "-" + Date.now() + "-" + filename,
        folderName: "clipforge"
      });
      if (!result.uploadUrl || !result.pendingUploadId) {
        return sendJson(res, 502, { error: "GetPronto returned an incomplete upload session." });
      }
      return sendJson(res, 200, {
        uploadUrl: result.uploadUrl,
        pendingUploadId: result.pendingUploadId,
        expiresIn: result.expiresIn || 3600
      });
    }

    if (action === "confirm") {
      const pendingUploadId = String(body.pendingUploadId || "");
      if (!/^[a-zA-Z0-9-]{8,128}$/.test(pendingUploadId)) {
        return sendJson(res, 400, { error: "Invalid upload session." });
      }
      const result = await prontoRequest("/upload/confirm", key, { pendingUploadId });
      const file = result.file;
      if (!file?.id || !file?.secureUrl) return sendJson(res, 502, { error: "GetPronto did not return the uploaded file details." });
      return sendJson(res, 200, {
        file: {
          id: file.id,
          name: file.name,
          url: file.secureUrl,
          rawUrl: file.rawUrl || null,
          size: file.rawSize || null,
          type: file.rawType || null
        }
      });
    }

    return sendJson(res, 400, { error: "Unknown GetPronto action." });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return sendJson(res, status, { error: safeErrorMessage(error) });
  }
}
