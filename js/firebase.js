import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};
const configured = !Object.values(firebaseConfig).some(v => String(v).startsWith("YOUR_"));
let app = null, auth = null, db = null;
if (configured) { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }
else console.warn("[Clipforge] Firebase config missing. Add values in js/firebase.js before enabling login.");
export { auth, db, configured };
