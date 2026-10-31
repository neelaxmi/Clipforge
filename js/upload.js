import Logger from "./logger.js";
let currentUrl = null, currentFile = null;
export function renderUpload() {
 return `<div class="grid studio-grid"><section class="card"><div class="section-head"><h3>Source video</h3><span class="tiny muted">LOCAL FILE</span></div><div id="drop-zone" class="upload-zone"><div class="upload-symbol">⇧</div><h3>Drop your video here</h3><p>or choose a video from your device</p><input id="video-file" type="file" accept="video/*" hidden><button class="btn primary" id="choose-video">Choose video</button><p class="tiny">Video stays in this browser during this prototype session.</p></div><div class="video-box" id="video-preview"><span>Video preview appears here</span></div><div id="video-meta" class="tiny muted" style="margin-top:10px">No video selected</div></section>
 <section class="card"><div class="section-head"><h3>Clip discovery</h3><span class="tiny muted">AI WORKFLOW</span></div><label class="field">Video source URL (reference only)<input class="input" id="source-url" placeholder="Paste a public video URL (analysis integration pending)"></label><label class="field">What should we look for?<select class="select" id="clip-style"><option>Most engaging moments</option><option>Educational highlights</option><option>Funny / surprising moments</option><option>Strong opinions / hooks</option><option>Storytelling moments</option></select></label><button class="btn primary full" id="analyze-video">✧ Find clip moments <span>→</span></button><div class="notice" style="margin-top:16px">Prototype mode: suggested timestamps below are sample data. Gemini video analysis will be connected in a later integration step. A URL alone does not grant access to download or edit the source video.</div></section></div>
 <div class="section-head"><h3>Suggested moments</h3><span class="tiny muted" id="clip-count">0 MOMENTS</span></div><div class="card"><div id="clip-list" class="clip-list"><p class="muted" style="font-size:12px">Upload a video, then run discovery to see candidate clips.</p></div></div>`;
}
export function bindUpload() {
 const input=document.getElementById("video-file"), zone=document.getElementById("drop-zone");
 const choose=document.getElementById("choose-video");
 choose.onclick=()=>input.click(); input.onchange=()=>loadFile(input.files?.[0]);
 zone.ondragover=e=>{e.preventDefault();zone.classList.add("drag")};
 zone.ondragleave=()=>zone.classList.remove("drag");
 zone.ondrop=e=>{e.preventDefault();zone.classList.remove("drag");loadFile(e.dataTransfer.files?.[0])};
 document.getElementById("analyze-video").onclick=()=>{
   if(!currentFile){window.Clipforge.toast("Choose a video file first.","error");return;}
   const clips=[{start:12,end:38,title:"The opening hook",score:"94%"},{start:74,end:108,title:"Key insight / payoff",score:"89%"},{start:151,end:179,title:"Strong closing moment",score:"86%"}];
   document.getElementById("clip-count").textContent=`${clips.length} MOMENTS`;
   document.getElementById("clip-list").innerHTML=clips.map((c,i)=>`<div class="clip-row"><div class="clip-thumb">▶</div><div><b>${c.title}</b><small>${fmt(c.start)} — ${fmt(c.end)} · ${c.end-c.start}s</small></div><span class="score">${c.score}</span><button class="ghost-btn" data-use-clip="${i}">Use clip →</button></div>`).join("");
   window.Clipforge.toast("Sample clip candidates generated. AI analysis is not connected yet.","success");
   Logger.info("Sample clip candidates displayed");
 };
 document.getElementById("clip-list").onclick=e=>{const b=e.target.closest("[data-use-clip]");if(b){const i=Number(b.dataset.useClip);sessionStorage.setItem("clipforge-selected-clip",JSON.stringify([{start:[12,74,151][i],end:[38,108,179][i],title:["The opening hook","Key insight / payoff","Strong closing moment"][i]}]));window.Clipforge.navigate("captions");}};
 function loadFile(file){if(!file)return;if(!file.type.startsWith("video/")){window.Clipforge.toast("Please select a video file.","error");return;}if(currentUrl)URL.revokeObjectURL(currentUrl);currentFile=file;currentUrl=URL.createObjectURL(file);document.getElementById("video-preview").innerHTML=`<video controls playsinline src="${currentUrl}"></video>`;document.getElementById("video-meta").textContent=`${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`;Logger.success("Video loaded locally",file.name);}
}
function fmt(s){return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}
