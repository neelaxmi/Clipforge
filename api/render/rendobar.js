import { requireFirebaseUser } from "../_lib/auth.js";
import { sendJson, methodNotAllowed, safeErrorMessage } from "../_lib/http.js";

const API = "https://api.rendobar.com";
const MAX_CLIPS = 12;
const MAX_DURATION = 180;
const TRANSITIONS = new Set(["crossfade","fade","slide","push","zoom","wipe","none"]);

function getKey() {
  const key = process.env.RENDOBAR_API_KEY;
  if (!key) {
    const error = new Error("Cloud rendering is not connected yet. Add RENDOBAR_API_KEY in Vercel Environment Variables.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}
function safeMediaUrl(value, hosts = ["api.getpronto.io","cdn.getpronto.io"]) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && hosts.includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
function makeTimeline(body, source) {
  const dimensions = { "9:16":[1080,1920], "16:9":[1920,1080], "1:1":[1080,1080] };
  const [width,height] = dimensions[body.aspectRatio] || dimensions["9:16"];
  const transition = TRANSITIONS.has(body.transition) ? body.transition : "crossfade";
  const transitionDuration = transition === "none" ? 0 : 0.55;
  const effectMap = {
    cinematic:[{type:"color",temperature:5200,contrast:1.18,saturation:1.12,brightness:0.025},{type:"vignette"}],
    warm:[{type:"color",temperature:4800,contrast:1.08,saturation:1.15}],
    vivid:[{type:"look",name:"boost"},{type:"glow"}],
    mono:[{type:"look",name:"greyscale"},{type:"color",contrast:1.12}],
    noir:[{type:"look",name:"oldFilm"},{type:"vignette"}],
    glitch:[{type:"glitch"},{type:"rgbShift"}],
    clean:[]
  };
  const selectedEffects = effectMap[body.effect] || effectMap.cinematic;
  const clips = [];
  const titles = [];
  let cursor = 0;
  let total = 0;
  body.clips.forEach((clip,index) => {
    const from = Number(clip.startSeconds);
    const to = Number(clip.endSeconds);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to-from > 90) return;
    const speed = Math.max(0.5,Math.min(2,Number(clip.speed || body.speed) || 1));
    const duration = (to-from)/speed;
    total += duration;
    clips.push({
      asset:{type:"video",src:source,trim:{from,to}},
      speed,
      effects:selectedEffects
    });
    const title = String(body.overlayText || clip.title || "").trim().slice(0,90);
    if (title) {
      titles.push({
        asset:{
          type:"text",text:title,
          style:{
            font:"Bebas Neue",size:Math.round(width*0.075),weight:900,color:"#FFFFFF",
            align:"center",shadow:{opacity:0.82,offsetX:3,offsetY:4},
            animate:{type:"slideUp",duration:0.65,by:"word"}
          }
        },
        start:cursor+0.2,
        length:Math.max(0.5,duration-0.2),
        transform:{position:{x:"50%",y:"73%"}}
      });
    }
    cursor += duration;
    if (index < body.clips.length-1) {
      if (transitionDuration) clips.push({type:"transition",transition,duration:transitionDuration});
      cursor -= transitionDuration;
    }
  });
  if (!clips.some(clip => clip.asset) || total > MAX_DURATION) {
    const error = new Error("Cloud render supports up to 12 clips and 3 minutes of footage per job. Use local render for longer edits.");
    error.statusCode = 400;
    throw error;
  }
  const tracks = [{name:"picture",clips},{name:"kinetic-titles",clips:titles}];
  const music = safeMediaUrl(body.musicUrl);
  if (music) tracks.push({name:"music",clips:[{
    asset:{type:"audio",src:music,volume:Math.max(0,Math.min(1,Number(body.musicVolume ?? 0.22))),fadeIn:0.8,fadeOut:1.5},
    length:"end"
  }]});
  return {
    schemaVersion:1,
    output:{format:"mp4",resolution:{width,height},fps:30,crf:20,encoderPreset:"veryfast"},
    timeline:{tracks}
  };
}

export default async function handler(req,res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    await requireFirebaseUser(req);
    const key = getKey();
    const body = req.body || {};
    const headers = {Authorization:"Bearer "+key,"Content-Type":"application/json"};
    if (body.action === "submit" || body.action === "validate") {
      const source = safeMediaUrl(body.sourceUrl);
      if (!source) return sendJson(res,400,{error:"Upload your source video to GetPronto first. Only a GetPronto HTTPS file URL is accepted."});
      if (!Array.isArray(body.clips) || !body.clips.length || body.clips.length > MAX_CLIPS) {
        return sendJson(res,400,{error:"Add between 1 and 12 valid timeline clips."});
      }
      const params = makeTimeline(body,source);
      const endpoint = body.action === "validate" ? "/compose/validate" : "/jobs";
      const payload = body.action === "validate" ? params : {type:"compose",params};
      const response = await fetch(API+endpoint,{method:"POST",headers,body:JSON.stringify(payload)});
      const result = await response.json().catch(()=>({}));
      if (!response.ok) {
        const error = new Error(result.error || result.message || "Rendobar rejected the request ("+response.status+").");
        error.statusCode = response.status === 402 ? 402 : response.status === 429 ? 429 : 502;
        throw error;
      }
      if (body.action === "validate") return sendJson(res,200,{validation:result});
      const jobId = result.id || result.job?.id;
      if (!jobId) return sendJson(res,502,{error:"Rendobar did not return a job ID."});
      return sendJson(res,200,{jobId,status:result.status || "queued",provider:"Rendobar"});
    }
    if (body.action === "status") {
      const jobId = String(body.jobId || "");
      if (!/^[a-zA-Z0-9_-]{5,128}$/.test(jobId)) return sendJson(res,400,{error:"Invalid cloud job ID."});
      const response = await fetch(API+"/jobs/"+encodeURIComponent(jobId),{headers:{Authorization:"Bearer "+key}});
      const result = await response.json().catch(()=>({}));
      if (!response.ok) {
        const error = new Error(result.error || result.message || "Could not read cloud render status.");
        error.statusCode = response.status === 404 ? 404 : 502;
        throw error;
      }
      const job = result.job || result;
      return sendJson(res,200,{
        jobId,status:job.status || "unknown",progress:job.progress ?? null,
        outputUrl:job.output?.file?.url || job.outputUrl || job.output_url || job.result?.url || job.outputs?.[0]?.url || null,
        error:job.error || null,
        retentionExpiresAt:job.retentionExpiresAt || null
      });
    }
    return sendJson(res,400,{error:"Unknown cloud render action."});
  } catch(error) {
    return sendJson(res,Number.isInteger(error.statusCode)?error.statusCode:500,{error:safeErrorMessage(error)});
  }
}
