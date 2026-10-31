export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}
export function methodNotAllowed(res, allowed = "POST") {
  res.setHeader("Allow", allowed);
  return sendJson(res, 405, { error: "Method not allowed." });
}
export function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const error = new Error("Server setup missing GEMINI_API_KEY. Add it in Vercel Environment Variables.");
    error.statusCode = 503;
    throw error;
  }
  return key;
}
export function safeErrorMessage(error) {
  return error?.message || "Something went wrong while processing the video.";
}
