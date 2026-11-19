import { auth, db, configured } from "./firebase.js";
import Logger from "./logger.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
export function watchAuth(callback) {
  if (!configured) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback, e => Logger.error("Auth state listener failed", e));
}
export async function authenticate(mode, name, email, password) {
  if (!configured) throw new Error("Firebase is not configured yet. Add your Firebase web config in js/firebase.js.");
  if (mode === "signup") {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(credential.user, { displayName: name });
    await setDoc(doc(db, "users", credential.user.uid), { uid: credential.user.uid, name: name || "", email, createdAt: serverTimestamp(), plan: "free" }, { merge: true });
    Logger.success("Account created", credential.user.uid);
    return credential.user;
  }
  const credential = await signInWithEmailAndPassword(auth, email, password);
  Logger.success("Signed in", credential.user.uid);
  return credential.user;
}
export async function logout() {
  if (!configured) return;
  await signOut(auth); Logger.info("User signed out");
}
