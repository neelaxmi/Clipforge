# Clipforge AI

Mobile-first PWA prototype for a short-form video clipping studio.

## Current prototype
- Firebase Email/Password sign-up and sign-in (requires your Firebase Web App config).
- Firestore user profile document on registration.
- Responsive creator dashboard and modular navigation.
- Local video file selection, drag/drop and browser preview.
- Sample clip-candidate workflow (timestamps are demo data).
- Caption text editor with local draft saving.
- Local template generator for hooks, titles, descriptions and hashtags.
- PWA manifest, service worker and centralized console logger.

## Not implemented yet
Clip suggestions are sample timestamps, not Gemini analysis. This prototype does not yet trim/render/export video, transcribe audio, upload media to cloud storage, or publish to Instagram. These require further integrations and real-device testing.

## Firebase setup
1. Create a Firebase project and add a Web App.
2. Enable Email/Password in Authentication > Sign-in method.
3. Create a Firestore database.
4. Copy the Web App config into `js/firebase.js`, replacing all `YOUR_...` values.
5. Review and publish `firestore.rules`.
6. Add your deployed HTTPS domain to Firebase Authentication authorized domains.
7. Deploy this folder to Netlify, Cloudflare Pages, or Firebase Hosting. Do not open it with `file://`.

Firebase Web App config is not an Admin credential, but database security depends on correct Firestore Rules. Never commit service-account JSON, private API keys, or Meta access tokens.

## Architecture
- `js/app.js`: app boot, UI events and routing glue
- `js/auth.js`: Firebase Authentication and user profile creation
- `js/firebase.js`: Firebase client initialization
- `js/logger.js`: consistent console logging
- `js/router.js`: page navigation
- `js/dashboard.js`: overview UI
- `js/upload.js`: local video selection and demo clip discovery
- `js/captions.js`: caption draft UI
- `js/ai-content.js`: local content draft template
- `js/settings.js`: account and integration status
- `css/style.css`: responsive design system

## Roadmap
1. Gemini video analysis through a secure backend.
2. FFmpeg.wasm clip trimming, aspect-ratio conversion, timeline and export.
3. Speech-to-text and word-level caption timing.
4. Temporary media storage and official Meta Graph API publishing.
5. Per-user project persistence and scheduled publishing.

## Copyright and permissions
Only upload, analyze, edit, and publish videos you own or are authorized to use. A YouTube URL alone does not provide permission or a downloadable source file.
