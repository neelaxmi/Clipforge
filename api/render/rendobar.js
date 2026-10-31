import { requireFirebaseUser } from "../_lib/auth.js";
import { sendJson, methodNotAllowed, safeErrorMessage } from "../_lib/http.js";

const API = "https://api.rendobar.com";
const MAX_CLIPS = 12;
const MAX_DURATION = 180;

function getKey() {
  const key = process.env.RENDOBAR_API_KEY;
  if (!key) {
    const error = new Error("Cloud rendering is not connected yet. Add RENDOBAR_API_KEY in Vercel Environment Variables.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}
function safeSource(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !["api.getpronto.io","cdn.getpronto.io"].includes(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}
function makeCommand(clips, ratio) {
  const dimensions = { "9:16":[1080,1920], "16:9":[1920,1080], "1:1":[1080,1080] };
  const [width,height] = dimensions[ratio] || dimensions["9:16"];
  const graph = [];
  const parts = [];
  let total = 0;
  clips.forEach((clip,index) => {
    const start = Number(clip.startSeconds);
    const end = Number(clip.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end-start > 90) return;
    total += end-start;
    graph.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fade=t=in:st=0:d=0.2[v${index}]`);
    graph.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
    parts.push(`[v${index}][a${index}]`);
  });
  if (!parts.length || total > MAX_DURATION) {
    const error = new Error("Cloud render supports up to 12 clips and 3 minutes of combined footage per job. Use local render for longer edits.");
    error.statusCode = 400;
    throw error;
  }
  graph.push(`${parts.join("")}concat=n=${parts.length}:v=1:a=1[v][a]`);
  return `ffmpeg -i source -filter_complex "${graph.join(";")}" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart out.mp4`;
}

export default async function handler(req,res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    await requireFirebaseUser(req);
    const key = getKey();
    const body = req.body || {};
    if (body.action === "submit") {
      const source = safeSource(body.sourceUrl);
      if (!source) return sendJson(res,400,{error:"Upload the source video to GetPronto first. Only a valid GetPronto HTTPS file URL is accepted."});
      if (!Array.isArray(body.clips) || !body.clips.length || body.clips.length > MAX_CLIPS) {
        return sendJson(res,400,{error:"Add between 1 and 12 valid timeline clips."});
      }
      const ratio = ["9:16","16:9","1:1"].includes(body.aspectRatio) ? body.aspectRatio : "9:16";
      const command = makeCommand(body.clips,ratio);
      const response = await fetch(API + "/jobs",{
        method:"POST",
        headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
        body:JSON.stringify({
          type:"ffmpeg",
          inputs:{source},
          params:{command}
        })
      });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) {
        const error = new Error(result.error || result.message || "Rendobar rejected the render job ("+response.status+").");
        error.statusCode = response.status === 402 ? 402 : response.status === 429 ? 429 : 502;
        throw error;
      }
      const jobId = result.id || result.job?.id;
      if (!jobId) return sendJson(res,502,{error:"Rendobar did not return a job ID."});
      return sendJson(res,200,{jobId,status:result.status || "queued",provider:"Rendobar"});
    }
    if (body.action === "status") {
      const jobId = String(body.jobId || "");
      if (!/^[a-zA-Z0-9_-]{5,128}$/.test(jobId)) return sendJson(res,400,{error:"Invalid cloud job ID."});
      const response = await fetch(API+"/jobs/"+encodeURIComponent(jobId),{
        headers:{Authorization:"Bearer "+key}
      });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) {
        const error = new Error(result.error || result.message || "Could not read cloud render status.");
        error.statusCode = response.status === 404 ? 404 : 502;
        throw error;
      }
      const job = result.job || result;
      return sendJson(res,200,{
        jobId,
        status:job.status || "unknown",
        progress:job.progress ?? null,
        outputUrl:job.outputUrl || job.output_url || job.result?.url || job.outputs?.[0]?.url || null,
        error:job.error || null
      });
    }
    return sendJson(res,400,{error:"Unknown cloud render action."});
  } catch(error) {
    return sendJson(res,Number.isInteger(error.statusCode)?error.statusCode:500,{error:safeErrorMessage(error)});
  }
}
