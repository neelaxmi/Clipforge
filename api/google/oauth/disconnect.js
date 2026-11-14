import { signedIn,clearCookie,sendJson } from "../_lib.js";
export default async function handler(req,res){if(req.method!=="POST")return sendJson(res,405,{error:"Method not allowed."});try{await signedIn(req);clearCookie(res,"clipforge_google_tokens");return sendJson(res,200,{connected:false})}catch(e){return sendJson(res,e.statusCode||500,{error:e.message})}}
