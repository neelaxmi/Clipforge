import { requireFirebaseUser } from "../_lib/auth.js";
import { sendJson, methodNotAllowed, safeErrorMessage } from "../_lib/http.js";

export default async function handler(req,res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    await requireFirebaseUser(req);
    const key = process.env.RADOXAI_API_KEY;
    const model = process.env.RADOXAI_MODEL;
    if (!key || !model) {
      const error = new Error("RadoxAI is not connected yet. Add RADOXAI_API_KEY and RADOXAI_MODEL in Vercel Environment Variables.");
      error.statusCode = 503;
      throw error;
    }
    const body = req.body || {};
    const clips = Array.isArray(body.clips) ? body.clips.slice(0,12) : [];
    if (!clips.length) return sendJson(res,400,{error:"Add at least one clip before asking AI Director."});
    const prompt = [
      "You are ClipForge's short-form video creative director.",
      "Create an engaging Instagram Reels edit plan using only the supplied clip metadata. Do not invent visual events.",
      "Return ONLY valid JSON with keys: recommendedOrder (array of original zero-based indexes), effect (one of cinematic,warm,vivid,mono,noir,glitch,clean), transition (one of crossfade,fade,slide,push,zoom,wipe,none), overlayText (max 70 characters), clipTitles (array of short titles in original clip order), rationale (one concise sentence).",
      "Prefer a strong hook first, then context, escalation and payoff. Preserve all clips exactly once. Avoid clickbait unrelated to supplied metadata.",
      "Platform: Instagram Reels. Style preference: "+String(body.style || "cinematic trailer").slice(0,80),
      "Clips: "+JSON.stringify(clips.map((clip,index)=>({index,title:String(clip.title||"").slice(0,100),reason:String(clip.reason||clip.hook||"").slice(0,220),startSeconds:Number(clip.startSeconds),endSeconds:Number(clip.endSeconds)})))
    ].join("\n");
    const response = await fetch("https://radoxai.com/v1/chat/completions",{
      method:"POST",
      headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,
        messages:[
          {role:"system",content:"Return a single JSON object only. No markdown fences."},
          {role:"user",content:prompt}
        ],
        temperature:0.7,
        max_tokens:1200
      })
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) {
      const error = new Error(data.error?.message || data.message || "RadoxAI request failed ("+response.status+").");
      error.statusCode = response.status === 402 ? 402 : response.status === 429 ? 429 : 502;
      throw error;
    }
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = String(content).replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();
    let plan;
    try { plan = JSON.parse(cleaned); }
    catch { throw new Error("RadoxAI returned an invalid edit plan. Try again or use manual controls."); }
    const allowedEffects = new Set(["cinematic","warm","vivid","mono","noir","glitch","clean"]);
    const allowedTransitions = new Set(["crossfade","fade","slide","push","zoom","wipe","none"]);
    const order = Array.isArray(plan.recommendedOrder) ? plan.recommendedOrder.map(Number).filter(index=>Number.isInteger(index)&&index>=0&&index<clips.length) : [];
    return sendJson(res,200,{
      plan:{
        recommendedOrder:[...new Set(order)].length===clips.length ? [...new Set(order)] : clips.map((_,i)=>i),
        effect:allowedEffects.has(plan.effect)?plan.effect:"cinematic",
        transition:allowedTransitions.has(plan.transition)?plan.transition:"crossfade",
        overlayText:String(plan.overlayText||"").slice(0,70),
        clipTitles:Array.isArray(plan.clipTitles)?plan.clipTitles.slice(0,clips.length).map(value=>String(value).slice(0,80)):[],
        rationale:String(plan.rationale||"AI edit plan ready.").slice(0,300)
      },
      model:data.model || model,
      usage:data.usage || null
    });
  } catch(error) {
    return sendJson(res,Number.isInteger(error.statusCode)?error.statusCode:500,{error:safeErrorMessage(error)});
  }
}
