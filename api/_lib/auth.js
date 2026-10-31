import { createRemoteJWKSet, jwtVerify } from "jose";

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function requireFirebaseUser(req) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Server setup missing FIREBASE_PROJECT_ID.");
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Sign in is required. Please sign in again.");
    error.statusCode = 401;
    throw error;
  }
  try {
    const { payload } = await jwtVerify(token, firebaseKeys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId
    });
    if (!payload.sub || payload.sub.length > 128) throw new Error("Invalid Firebase user token.");
    return { uid: payload.sub, email: payload.email || null };
  } catch {
    const error = new Error("Your login session is invalid or expired. Sign in again.");
    error.statusCode = 401;
    throw error;
  }
}
