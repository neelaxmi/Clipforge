import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyD-ChcGDOYoUfhzyk-qQAwfQUiIC2PYLv0",
  authDomain: "dsfss-67702.firebaseapp.com",
  databaseURL: "https://dsfss-67702-default-rtdb.firebaseio.com",
  projectId: "dsfss-67702",
  storageBucket: "dsfss-67702.firebasestorage.app",
  messagingSenderId: "50112594074",
  appId: "1:50112594074:web:35333793f635e299d85f23"
};
const configured = !Object.values(firebaseConfig).some(v => String(v).startsWith("YOUR_"));
let app = null, auth = null, db = null;
if (configured) { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }
else console.warn("[Clipforge] Firebase config missing. Add values in js/firebase.js before enabling login.");
export { auth, db, configured };
