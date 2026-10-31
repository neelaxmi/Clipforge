import { requireFirebaseUser } from "../_lib/auth.js";
import { methodNotAllowed, sendJson } from "../_lib/http.js";

// Each request is limited to 3 MB by the client, below Vercel's 4.5 MB body limit.
export const config = { api: { bodyParser: false } };
const MAX_CHUNK_BYTES = 3 * 1024 * 1024;

async function readChunk(req) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > MAX_CHUNK_BYTES) throw Object.assign(new Error("Upload chunk exceeded the 3 MB limit."), { statusCode: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    await requireFirebaseUser(req);
    const origin = req.headers.origin;
    if (!origin || new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error: "Upload must come from this Clipforge website." });

    const uploadUrl = req.headers["x-clipforge-upload-url"];
    const offset = req.headers["x-clipforge-upload-offset"];
    const isFinal = req.headers["x-clipforge-upload-final"] === "true";
    if (typeof uploadUrl !== "string" || typeof offset !== "string" || !/^\d+$/.test(offset)) {
      return sendJson(res, 400, { error: "Missing or invalid resumable upload details." });
    }
    const target = new URL(uploadUrl);
    if (target.protocol !== "https:" || target.hostname !== "generativelanguage.googleapis.com" || !target.pathname.startsWith("/upload/")) {
      return sendJson(res, 400, { error: "Invalid Gemini upload session." });
    }
    const chunk = await readChunk(req);
    if (!chunk.length) return sendJson(res, 400, { error: "Empty upload chunk." });

    const googleResponse = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Offset": offset,
        "X-Goog-Upload-Command": isFinal ? "upload, finalize" : "upload"
      },
      body: chunk,
      signal: AbortSignal.timeout(120000)
    });
    const raw = await googleResponse.text();
    if (!googleResponse.ok) {
      console.error("[Clipforge] Gemini chunk rejected", { status: googleResponse.status, offset, bytes: chunk.length, detail: raw.slice(0, 700) });
      return sendJson(res, 502, { error: `Gemini rejected upload chunk (${googleResponse.status}). ${raw.slice(0, 240)}` });
    }
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    return sendJson(res, 200, data);
  } catch (error) {
    console.error("[Clipforge] upload-chunk failed", { message: error.message, status: error.statusCode || 500 });
    return sendJson(res, error.statusCode || 500, { error: error.message || "Gemini upload chunk failed." });
  }
}
