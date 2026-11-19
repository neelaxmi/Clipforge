import { auth } from "./firebase.js";

async function request(body) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in again before cloud rendering.");
  const token = await user.getIdToken();
  const response = await fetch("/api/render/rendobar",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify(body)
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Cloud render request failed.");
  return data;
}
export async function checkRendobar() {
  return request({action:"check"});
}
export async function validateRendobar(timeline) {
  return request({action:"validate",...timeline});
}
export async function submitRendobar(timeline) {
  return request({action:"submit",...timeline});
}
export async function getRendobarJob(jobId) {
  return request({action:"status",jobId});
}
export async function waitForRendobarJob(jobId,onUpdate=()=>{},interval=4000) {
  const started=Date.now();
  while(Date.now()-started<40*60*1000) {
    const job=await getRendobarJob(jobId);
    onUpdate(job);
    if (["completed","succeeded","success"].includes(String(job.status).toLowerCase())) return job;
    if (["failed","error","canceled","cancelled"].includes(String(job.status).toLowerCase())) {
      throw new Error(job.error || "Cloud render job "+job.status+".");
    }
    await new Promise(resolve=>setTimeout(resolve,interval));
  }
  throw new Error("Cloud render is still running. Your job continues in the background; use Check cloud render later.");
}
