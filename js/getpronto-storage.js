import { auth } from "./firebase.js";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

async function apiRequest(body) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in again before using cloud storage.");
  const token = await user.getIdToken();
  const response = await fetch("/api/storage/getpronto", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "GetPronto request failed.");
  return data;
}

export async function uploadVideoToGetPronto(file, onProgress = () => {}) {
  if (!(file instanceof File) || !file.type.startsWith("video/")) {
    throw new Error("Choose a valid video file.");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("GetPronto Free accepts videos up to 100 MB per file.");
  }

  onProgress("Requesting secure upload session…");
  const session = await apiRequest({
    action: "presign",
    filename: file.name,
    mimetype: file.type || "video/mp4",
    size: file.size
  });

  onProgress("Uploading video directly to GetPronto…");
  const upload = await fetch(session.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file
  });
  if (!upload.ok) {
    throw new Error("Direct upload failed (" + upload.status + "). Check GetPronto storage quota and try again.");
  }

  onProgress("Confirming uploaded video…");
  const confirmed = await apiRequest({
    action: "confirm",
    pendingUploadId: session.pendingUploadId
  });
  onProgress("Video stored in GetPronto.");
  return confirmed.file;
}
