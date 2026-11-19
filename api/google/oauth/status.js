import { signedIn,readTokens,sendJson } from "../_lib.js";
<<<<<<< HEAD
export default async function handler(req,res){if(req.method!=="GET")return sendJson(res,405,{error:"Method not allowed."});try{const user=await signedIn(req);const tokens=readTokens(req,user.uid);return sendJson(res,200,{connected:true,scopes:tokens.scope||"",hasRefreshToken:Boolean(tokens.refresh_token),accessTokenExpiresAt:tokens.expiry_date||null})}catch(e){if(e.statusCode===401)return sendJson(res,200,{connected:false});return sendJson(res,e.statusCode||500,{error:e.message})}}
=======
export default async function handler(req,res){if(req.method!=="GET")return sendJson(res,405,{error:"Method not allowed."});try{const user=await signedIn(req);const tokens=readTokens(req,user.uid);return sendJson(res,200,{connected:true,scopes:tokens.scope||"",connectedAt:tokens.expiry_date||null})}catch(e){if(e.statusCode===401)return sendJson(res,200,{connected:false});return sendJson(res,e.statusCode||500,{error:e.message})}}
>>>>>>> abb849acb7a1c17074a8051fd788953abf968401
