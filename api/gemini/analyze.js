import { requireFirebaseUser } from "../_lib/auth.js";
import { getGeminiKey, methodNotAllowed, sendJson, safeErrorMessage } from "../_lib/http.js";

const allowedTypes = new Set(["video/mp4","video/quicktime","video/webm","video/x-matroska","video/3gpp","video/mpeg","video/x-msvideo"]);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseModelJson(raw) {
  const cleaned = String(raw || "").trim().replace(/^\x60\x60\x60(?:json)?/i, "").replace(/\x60\x60\x60$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf("{"), last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
  throw new Error("Gemini returned an unreadable analysis. Please retry.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  let fileName = "";
  try {
    await requireFirebaseUser(req);
    const key = getGeminiKey();
    const body = req.body || {};
    fileName = typeof body.fileName === "string" ? body.fileName : "";
    const mimeType = body.mimeType;
    const durationSeconds = Number(body.durationSeconds);
    const style = String(body.style || "Most engaging moments").slice(0, 80);
    if (!/^files\/[a-zA-Z0-9-]{1,80}$/.test(fileName)) return sendJson(res, 400, { error: "Invalid Gemini video file reference." });
    if (!allowedTypes.has(mimeType)) return sendJson(res, 415, { error: "Unsupported video format." });
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) return sendJson(res, 400, { error: "Video duration must be between 1 second and 60 minutes." });

    const fileUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}`;
    let file = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const statusResponse = await fetch(fileUrl, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(20000) });
      if (!statusResponse.ok) {
        const detail = await statusResponse.text();
        console.error("[Clipforge] Gemini file status error", statusResponse.status, detail.slice(0, 1000));
        return sendJson(res, 502, { error: "Gemini could not read the uploaded video. Please upload it again." });
      }
      file = await statusResponse.json();
      if (file.state === "ACTIVE") break;
      if (file.state === "FAILED") return sendJson(res, 422, { error: file.error?.message || "Gemini could not process this video." });
      await wait(4000);
    }
    if (!file || file.state !== "ACTIVE") return sendJson(res, 504, { error: "Video processing is taking too long. Please retry in a minute." });

    const prompt = `You are Clipforge AI, an expert short-form video editor and retention analyst.
Analyze the WHOLE video, including spoken audio, visual action, scene changes, demonstrations, emotional beats and narrative context.
Creator goal/style: ${style}.
Video duration: ${durationSeconds.toFixed(2)} seconds.
Find up to 8 genuinely useful standalone clip moments for Instagram Reels / YouTube Shorts.
Prefer strong hooks, surprising facts, clear explanations, emotional or funny beats, story payoffs and complete thoughts. Avoid dead air, incomplete sentences, repeated moments and arbitrary timestamps.
Each moment should normally be 15-60 seconds. If the source is short, return shorter valid moments. Keep every timestamp within the source duration and do not invent content.
Return only valid JSON with this structure:
{
 "summary":"one concise sentence about the video",
 "moments":[
  {"start_seconds":12.5,"end_seconds":43.0,"title":"Short descriptive title","hook":"A compelling opening line or first spoken words","reason":"Why this section works as a short clip","confidence":0.91}
 ]
}
Use precise timestamps. Return an empty moments array if no useful clip exists.`;

    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const generationResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ file_data: { mime_type: mimeType, file_uri: file.uri } }, { text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      }),
      signal: AbortSignal.timeout(180000)
    });
    if (!generationResponse.ok) {
      const detail = await generationResponse.text();
      console.error("[Clipforge] Gemini generateContent error", generationResponse.status, detail.slice(0, 1600));
      return sendJson(res, 502, { error: "Gemini analysis failed. Check your API access, model availability and quota." });
    }
    const generated = await generationResponse.json();
    const raw = generated.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n");
    if (!raw) return sendJson(res, 502, { error: "Gemini returned no analysis text. Try another video." });
    const parsed = parseModelJson(raw);
    const moments = (Array.isArray(parsed.moments) ? parsed.moments : []).map((item, index) => {
      const start = Math.max(0, Math.min(durationSeconds, Number(item.start_seconds)));
      const end = Math.max(0, Math.min(durationSeconds, Number(item.end_seconds)));
      return {
        id: index + 1,
        startSeconds: Number(start.toFixed(2)),
        endSeconds: Number(end.toFixed(2)),
        title: String(item.title || `Clip moment ${index + 1}`).slice(0, 100),
        hook: String(item.hook || "").slice(0, 240),
        reason: String(item.reason || "").slice(0, 300),
        confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0))
      };
    }).filter(item => Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds) && item.endSeconds > item.startSeconds + 2)
      .sort((a,b) => a.startSeconds - b.startSeconds).slice(0,8);

    // Gemini File API uploads are temporary. Delete after successful analysis.
    fetch(fileUrl, { method: "DELETE", headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10000) }).catch(() => {});
    return sendJson(res, 200, { summary: String(parsed.summary || "Video analysis completed.").slice(0, 500), moments, model, usage: generated.usageMetadata || null });
  } catch (error) {
    console.error("[Clipforge] video analysis failed", error);
    return sendJson(res, error.statusCode || 500, { error: safeErrorMessage(error) });
  }
}
