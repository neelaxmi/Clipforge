import { auth } from "./firebase.js";
export async function createRadoxEditPlan(clips,style="cinematic trailer") {
  const user=auth?.currentUser;
  if(!user) throw new Error("Sign in again before using AI Director.");
  const response=await fetch("/api/ai/director",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+await user.getIdToken()},
    body:JSON.stringify({clips,style})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || "RadoxAI could not create an edit plan.");
  return data;
}
