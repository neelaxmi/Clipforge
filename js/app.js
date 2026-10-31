import Logger from "./logger.js";
import { authenticate, logout, watchAuth } from "./auth.js";
import { navigate } from "./router.js";
import { renderDashboard } from "./dashboard.js";
import { renderUpload, bindUpload } from "./upload.js";
import { renderCaptions, bindCaptions } from "./captions.js";
import { renderIdeas, bindIdeas } from "./ai-content.js";
import { renderSettings } from "./settings.js";
const $=s=>document.querySelector(s);
let user=null, authMode="login";
const titles={home:"Overview",studio:"Clip studio",captions:"Captions",ideas:"AI content",settings:"Settings"};
window.Clipforge={navigate,toast};
function toast(message,type="info"){const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;$("#toast-root").append(el);setTimeout(()=>el.remove(),3400)}
function showWorkspace(){ $("#auth-screen").classList.add("hidden");$("#workspace").classList.remove("hidden");$("#user-name").textContent=user?.displayName||"Creator";$("#user-email").textContent=user?.email||"";$("#user-avatar").textContent=(user?.displayName||user?.email||"C").charAt(0).toUpperCase();navigate("home");}
function showAuth(){ $("#workspace").classList.add("hidden");$("#auth-screen").classList.remove("hidden");}
function renderPage(page){$("#page-title").textContent=titles[page]||"Overview";const host=$("#page-content");if(page==="home")host.innerHTML=renderDashboard(user);else if(page==="studio"){host.innerHTML=renderUpload();bindUpload()}else if(page==="captions"){host.innerHTML=renderCaptions();bindCaptions()}else if(page==="ideas"){host.innerHTML=renderIdeas();bindIdeas()}else if(page==="settings")host.innerHTML=renderSettings(user);host.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>navigate(b.dataset.go));}
document.addEventListener("clipforge:navigate",e=>renderPage(e.detail.page));
$("#main-nav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b){navigate(b.dataset.page);$(".sidebar").classList.remove("open")}});
$("#mobile-menu").onclick=()=>$(".sidebar").classList.toggle("open");
document.querySelectorAll("[data-auth-mode]").forEach(b=>b.onclick=()=>{authMode=b.dataset.authMode;document.querySelectorAll("[data-auth-mode]").forEach(x=>x.classList.toggle("active",x===b));$("#name-wrap").classList.toggle("hidden",authMode!=="signup");$("#auth-submit").innerHTML=authMode==="signup"?'Create account <span>→</span>':'Sign in <span>→</span>';$("#auth-password").autocomplete=authMode==="signup"?"new-password":"current-password";$("#auth-message").textContent=""});
$("#auth-form").onsubmit=async e=>{e.preventDefault();const btn=$("#auth-submit"),msg=$("#auth-message");btn.disabled=true;btn.textContent="Please wait…";msg.textContent="";try{user=await authenticate(authMode,$("#auth-name").value.trim(),$("#auth-email").value.trim(),$("#auth-password").value);showWorkspace()}catch(err){Logger.error("Authentication failed",err);msg.textContent=err.message||"Authentication failed";}finally{btn.disabled=false;btn.innerHTML=authMode==="signup"?'Create account <span>→</span>':'Sign in <span>→</span>'}};
$("#signout-btn").onclick=async()=>{try{await logout();user=null;showAuth()}catch(e){Logger.error("Sign out failed",e);toast(e.message,"error")}};
watchAuth(u=>{if(u){user=u;showWorkspace()}else{user=null;showAuth()}});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").then(()=>Logger.success("Service worker registered")).catch(e=>Logger.warn("Service worker registration failed",e)));
Logger.info("Clipforge app booted");
