<<<<<<< HEAD
import { signedIn,clearCookie,revokeGoogleToken,sendJson } from "../_lib.js";
export default async function handler(req,res){if(req.method!=="POST")return sendJson(res,405,{error:"Method not allowed."});try{const user=await signedIn(req);const revoked=await revokeGoogleToken(req,user.uid);clearCookie(res,"clipforge_google_tokens");return sendJson(res,200,{connected:false,revokedAtGoogle:revoked})}catch(e){return sendJson(res,e.statusCode||500,{error:e.message})}}
=======
import { signedIn,clearCookie,sendJson } from "../_lib.js";
export default async function handler(req,res){if(req.method!=="POST")return sendJson(res,405,{error:"Method not allowed."});try{await signedIn(req);clearCookie(res,"clipforge_google_tokens");return sendJson(res,200,{connected:false})}catch(e){return sendJson(res,e.statusCode||500,{error:e.message})}}
>>>>>>> abb849acb7a1c17074a8051fd788953abf968401
