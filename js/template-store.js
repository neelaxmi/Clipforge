// Local-only template storage (IndexedDB, no expiry). Data never leaves this browser.
const DB_NAME = "clipforge-templates", STORE = "templates";
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    let req;
    try { req = action(t.objectStore(STORE)); } catch (e) { db.close(); reject(e); return; }
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error || req?.error || new Error("Local storage failed")); };
  });
}
export async function saveTemplate(t) {
  if (!t?.id || !t.blob) throw new Error("Template needs an id and a video file.");
  const record = { id: t.id, name: String(t.name || "Template").slice(0, 120), blob: t.blob, duration: t.duration, slots: t.slots, captions: String(t.captions || ""), savedAt: Date.now() };
  await tx("readwrite", s => s.put(record));
  try { await navigator.storage?.persist?.(); } catch {}
  return record;
}
export const getTemplate = id => tx("readonly", s => s.get(id)).then(r => r || null);
export const deleteTemplate = id => tx("readwrite", s => s.delete(id));
export async function listTemplates() {
  const all = (await tx("readonly", s => s.getAll())) || [];
  return all.sort((a, b) => b.savedAt - a.savedAt);
}
