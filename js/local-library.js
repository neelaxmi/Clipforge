const DB_NAME = "clipforge-local-library";
const DB_VERSION = 1;
const STORE = "items";
const TTL_MS = 24 * 60 * 60 * 1000;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let request;
    try { request = action(store); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error || request?.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Local storage transaction aborted")); };
  });
}
export async function saveLocalItem(id, data) {
  const now = Date.now();
  return transact("readwrite", store => store.put({ ...data, id, savedAt: now, expiresAt: now + TTL_MS }));
}
export async function getLocalItem(id) {
  const item = await transact("readonly", store => store.get(id));
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    await deleteLocalItem(id);
    return null;
  }
  return item;
}
export async function deleteLocalItem(id) {
  return transact("readwrite", store => store.delete(id));
}
export async function listLocalItems() {
  const items = await transact("readonly", store => store.getAll()) || [];
  const now = Date.now();
  const valid = [];
  for (const item of items) {
    if (item.expiresAt <= now) await deleteLocalItem(item.id);
    else valid.push(item);
  }
  return valid.sort((a, b) => b.savedAt - a.savedAt);
}
export async function clearLocalLibrary() {
  return transact("readwrite", store => store.clear());
}
