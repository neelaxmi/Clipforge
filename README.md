# Clipforge AI

Mobile-first creator PWA for analysing long videos and preparing short-form clips.

## Phase 1 — AI video analysis + trim preview
- Firebase Email/Password authentication.
- Firebase ID-token verification on protected Vercel API routes.
- Secure Gemini resumable File API upload session; video bytes upload directly from the browser to Google (not through Vercel's 4.5 MB function body limit).
- Gemini video understanding finds timestamped hooks, highlights, educational moments, funny beats and story payoffs from uploaded videos or public YouTube links.
- Public YouTube links can be analysed without downloading the source; upload the original file separately if you want local trim preview.
- AI result includes a short video summary, clip title, hook, reason and confidence score.
- Browser video player, clip start/end controls, selected-range playback.
- FFmpeg.wasm creates a real trimmed MP4 preview locally on the user's device.
- Responsive Android-first UI.

## Phase 1 setup

### 1. Firebase
The frontend Firebase Web App configuration is in js/firebase.js. Keep it configured with your Firebase project. The backend verifies Firebase ID tokens against the project ID.

The backend defaults to the repository's current Firebase project ID, dsfss-67702. If you change Firebase projects later, set FIREBASE_PROJECT_ID in Vercel to the new project ID.

### 2. Gemini API key
A Gemini Pro/Google AI subscription does not automatically include Gemini API usage. Create an API key in Google AI Studio and add it to Vercel:
- GEMINI_API_KEY — required, secret, server-side only.
- GEMINI_MODEL — optional; defaults to gemini-3.8-flash.
- FIREBASE_PROJECT_ID — optional override; currently defaults to dsfss-67702.

Add variables to Vercel for Preview and Production, then redeploy. Never place GEMINI_API_KEY in frontend JavaScript, HTML, or GitHub.

### 3. GetPronto cloud asset storage (optional)

The Clip Studio includes an opt-in source-video upload to GetPronto:
- Add GETPRONTO_API_KEY as a server-only Vercel Environment Variable. Use a GetPronto secret key (pronto_sk_...), never a public key in the browser.
- The browser requests a short-lived presigned upload URL from POST /api/storage/getpronto, uploads directly to storage, then confirms the upload. Video bytes do not pass through a Vercel Function.
- GetPronto Free currently allows up to 100 MB per video, 5 GB total storage and 10 GB monthly bandwidth. No card is required to start.
- GetPronto's returned secureUrl is publicly accessible to anyone who has the link. The UI warns users and requires an explicit upload-button action. Do not upload private or sensitive footage.
- Cloud storage is not a rendering worker. Background FFmpeg rendering is a separate roadmap item and is not enabled by this integration.

### 3. Vercel deployment
This project now uses Vite for browser bundling and FFmpeg.wasm:
- Build command: npm run build
- Output directory: dist
- Install command: npm install

The api/ folder contains Vercel Node.js Functions. The endpoints require a valid Firebase ID token.

### 5. Video analysis flow
1. User selects an MP4, MOV or WebM file, or submits a public YouTube video link for analysis only.
2. The browser asks POST /api/gemini/upload-session for a temporary resumable upload URL.
3. The browser sends the video directly to Gemini File API.
4. Browser calls POST /api/gemini/analyze with the returned file reference and Firebase ID token.
5. Vercel waits for Gemini processing and asks Gemini to return structured clip timestamps.
6. The app displays moments and lets the user set trim in/out points.

Gemini File API currently supports up to 2 GB per video on the free tier and 20 GB on paid API usage; this app intentionally caps uploads at 1.5 GB. API quotas and billing depend on the Google AI Studio project and model.

### 6. Trim preview
FFmpeg.wasm is lazy-loaded only when the user requests a trimmed preview (about 31 MB of core assets on first use). The preview is encoded in browser memory. For Android stability, the current trim preview limit is 250 MB source size. Close other tabs and use shorter/lower-resolution source videos if the phone runs out of memory.

The current trim output is a preview only. Saving/download, multiple-clip remix, timeline editing, subtitles rendering and final export are Phase 2.

## API routes
- POST /api/gemini/upload-session — validates Firebase user, starts Gemini resumable upload.
- POST /api/gemini/analyze — waits for Gemini File API processing, analyses the video and returns clip moments.
- POST /api/storage/getpronto — authenticated GetPronto presign/confirm actions; requires GETPRONTO_API_KEY.
- api/_lib/auth.js — Firebase ID token verification using Google's public signing keys.
- api/_lib/http.js — API response and secret helpers.

## Roadmap
- **Phase 1:** AI video analysis, timestamped moment detection, local trim and preview.
- **Phase 2:** Remix, multi-clip timeline, captions/subtitles, aspect ratio controls, final MP4 export.
- **Phase 3:** Instagram account connection, Reel publishing, scheduling and publish history.

## Privacy and rights
Only analyse and edit videos you own or have permission to use. Gemini File API uploads are temporary and the API file is deleted after successful analysis. YouTube URL analysis is limited to public videos. It does not download the source video; to trim a YouTube moment, upload the original video file that you own or are authorised to edit.