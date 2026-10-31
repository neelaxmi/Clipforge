import { requireFirebaseUser } from "../_lib/auth.js";
import { getGeminiKey, methodNotAllowed, sendJson, safeErrorMessage } from "../_lib/http.js";

function normalizeYouTubeUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
  else if (["youtube.com","m.youtube.com","youtube-nocookie.com"].includes(host)) {
    id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] || "";
  }
  if (!/^[\w-]{11}$/.test(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}
function parseJson(raw) {
  const value = String(raw || "").trim().replace(/^\x60\x60\x60(?:json)?/i, "").replace(/\x60\x60\x60$/i, "").trim();
  try { return JSON.parse(value); } catch {}
  const start = value.indexOf("{"), end = value.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
  throw new Error("Gemini returned an unreadable result. Retry the analysis.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    await requireFirebaseUser(req);
    const key = getGeminiKey();
    const body = req.body || {};
    const videoUrl = normalizeYouTubeUrl(String(body.url || ""));
    if (!videoUrl) return sendJson(res, 400, { error: "Enter a valid public YouTube video, Shorts or youtu.be link." });
    const style = String(body.style || "Most engaging moments").slice(0, 80);
    const prompt = `You are Clipforge AI, an expert short-form video editor and retention analyst.
Analyze this public YouTube video including speech, visual events, scene changes, emotional beats and narrative context.
Creator goal/style: ${style}.
Find up to 8 useful standalone moments for Reels / Shorts. Prefer strong hooks, surprising facts, clear explanations, emotional or funny beats, story payoffs and complete thoughts. Avoid dead air, incomplete sentences, repetition and arbitrary timestamps.
Each moment should normally be 15-60 seconds. Use accurate timestamps from the video, never invent content, and do not return moments beyond the actual video duration.
Return only JSON:
{"summary":"one concise sentence","moments":[{"start_seconds":12.5,"end_seconds":43,"title":"Short title","hook":"Opening line","reason":"Why this moment works","confidence":0.9}]}
Return an empty moments array if no useful clips exist.`;
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: [{ type: "video", uri: videoUrl }, { type: "text", text: prompt }] }),
      signal: AbortSignal.timeout(210000)
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("[Clipforge] YouTube Gemini analysis error", response.status, detail.slice(0, 1500));
      return sendJson(res, 502, { error: "Gemini could not analyse this YouTube link. Make sure the video is public and API access is enabled." });
    }
    const result = await response.json();
    const raw = result.output_text || (result.steps || []).flatMap(step => step.content || []).map(part => part.text || "").filter(Boolean).join("\n");
    if (!raw) return sendJson(res, 502, { error: "Gemini returned no analysis text for this YouTube video." });
    const parsed = parseJson(raw);
    const moments = (Array.isArray(parsed.moments) ? parsed.moments : []).map((item,index) => {
      const start = Math.max(0, Math.min(3600, Number(item.start_seconds)));
      const end = Math.max(0, Math.min(3600, Number(item.end_seconds)));
      return { id:index+1, startSeconds:Number(start.toFixed(2)), endSeconds:Number(end.toFixed(2)), title:String(item.title || `Clip moment ${index+1}`).slice(0,100), hook:String(item.hook || "").slice(0,240), reason:String(item.reason || "").slice(0,300), confidence:Math.max(0,Math.min(1,Number(item.confidence)||0)) };
    }).filter(item => Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds) && item.endSeconds > item.startSeconds + 2).sort((a,b)=>a.startSeconds-b.startSeconds).slice(0,8);
    return sendJson(res, 200, { summary:String(parsed.summary || "YouTube analysis completed.").slice(0,500), moments, model, source:"youtube" });
  } catch (error) {
    console.error("[Clipforge] YouTube analysis failed", error);
    return sendJson(res, error.statusCode || 500, { error:safeErrorMessage(error) });
  }
}
