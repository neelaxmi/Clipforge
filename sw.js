const CACHE="clipforge-shell-v2";
const CORE=["./","./index.html","./css/style.css","./js/app.js","./js/logger.js","./js/firebase.js","./js/auth.js","./js/router.js","./js/dashboard.js","./js/upload.js","./js/local-library.js","./js/captions.js","./js/ai-content.js","./js/settings.js","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).catch(()=>caches.match("./index.html"))))});
