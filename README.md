# Clipforge AI

Mobile-first creator workspace for planning, analysing, editing and preparing short-form videos.

## Current workspace

- Firebase Email/Password sign-in.
- AI Video Factory with a daily five-short queue:
  1. Motivational
  2. Dharmik
  3. Krishna / Shiva
  4. Original song 1
  5. Original song 2
- Queue status and topic notes saved in the current browser; daily completion resets at local midnight.
- Flow prompt templates and official Flow launch link. Generated assets are downloaded from Flow and imported into Clip Studio manually.
- Manual Flow credit estimate only. ClipForge cannot read or spend Google Flow subscription credits through a supported public API.
- Clip Studio: local video upload, existing Gemini moment analysis, trim preview, multi-clip timeline, local FFmpeg export, visual grades, titles, subtitles and audio mix.
- Existing optional GetPronto storage and Rendobar cloud-render adapters remain separate and may have provider limits or costs.
<<<<<<< HEAD
- Template Mode: upload a short clip you own, auto-split it into shots, swap in your own photos/videos, keep its music, and add captions (pasted SRT or one line per caption). Everything runs and is stored on this device only.
- Captions and content draft workspace.
- Android-first responsive PWA with visible Clip Studio diagnostics console.

## Template Mode

Upload a template clip (max 90 s / 120 MB), tap **Find slots** (scene-cut detection) or **Split evenly**, pick an image or video for each slot (empty slot = original shot kept), paste captions, and export an MP4 with the template's music.

- Runs in the browser with ffmpeg.wasm; nothing is uploaded. Templates you save are stored in this browser's IndexedDB (no expiry, no cloud) and are lost if you clear site data.
- Captions are not auto-detected from the template yet. Burned-in captions disappear when a shot is replaced; paste them as SRT or plain lines.
- It cannot download videos from Instagram or other links. Use clips and music you own or have permission to use.
- Planned, not implemented: automatic caption transcription.

=======
- Captions and content draft workspace.
- Android-first responsive PWA with visible Clip Studio diagnostics console.

>>>>>>> abb849acb7a1c17074a8051fd788953abf968401
## Google Flow

Use the official Flow website from the AI Video Factory. Flow subscription credits are account-managed inside Flow; this project intentionally does not automate the Flow website, scrape account data or claim that it can spend those credits. The recommended production pattern is to generate only a few hero shots in Flow, then use your own footage, music and Clip Studio editing for the rest of each Short.

## Existing Gemini analysis

The existing Gemini video-analysis backend is preserved. It requires a valid server-side `GEMINI_API_KEY` and appropriate Google AI Studio API quota/billing. A Google AI Pro subscription and Flow credits are separate from Gemini API usage. No new paid Gemini API dependency was added. If you do not want to use Gemini API, use Flow manually for visuals and the local editing workflow without AI moment analysis.

Required Vercel environment variables for the existing feature:
- `GEMINI_API_KEY` — server-side secret.
- `FIREBASE_PROJECT_ID` — optional override; current default is `dsfss-67702`.
- `GEMINI_MODEL` — optional model override.

Never commit API keys or provider secrets to GitHub or frontend files.

## Optional providers

### GetPronto
- `GETPRONTO_API_KEY` — server-side secret.
- Browser uploads use presigned URLs.
- Treat returned share URLs as accessible to anyone who has the link. Upload only media you are comfortable sharing by link.

### Rendobar
- `RENDOBAR_API_KEY` — server-side secret.
- Cloud render jobs run on the provider's infrastructure and may consume limited trial credits or become paid. Keep this optional; local FFmpeg remains the default free path.

<<<<<<< HEAD
## Google Drive and YouTube integration

Implemented (needs your own Google Cloud OAuth client, see Setup below). Not tested against live Google credentials in the audit.

- Google OAuth with signed, cookie-bound `state`; tokens are stored AES-256-GCM encrypted in an HttpOnly, Secure, SameSite=Lax cookie bound to your Firebase UID. Disconnect also revokes the token at Google.
- Drive: resumable uploads (browser uploads directly to Google). Scope is `drive.file`, so ClipForge only sees files it uploaded.
- YouTube: channel lookup, resumable upload, private/unlisted/public, scheduled publishing via `publishAt` (video must be private; at least 5 minutes in the future). Apps whose Google API project is not audited may have uploads locked to private by YouTube.

Required Vercel environment variables:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` — e.g. `https://YOUR-APP.vercel.app/api/google/oauth/callback`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` — random 32+ chars (secret, never reuse)
- `GOOGLE_OAUTH_STATE_SECRET` — a different random 32+ chars

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
=======
## Google Drive and YouTube OAuth status

Drive and YouTube account connections are not active yet. They require a Google Cloud project, enabled Drive API / YouTube Data API, configured OAuth consent screen, OAuth client ID, redirect URI and secure server-side token storage. The Settings page labels these as setup-required; it does not ask users to paste API keys or passwords. No fake “connected” state is shown.

YouTube publishing should be implemented only through the official YouTube Data API, with private-by-default uploads and a user approval step before publishing or scheduling.
>>>>>>> abb849acb7a1c17074a8051fd788953abf968401

## Deploy

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- API routes are Vercel Node.js Functions under `api/`.

<<<<<<< HEAD
## Tests

```bash
npm test
```

=======
>>>>>>> abb849acb7a1c17074a8051fd788953abf968401
## Local development

```bash
npm install
npm run dev
npm run build
```

## Privacy and rights

Only analyse, edit or publish videos and music that you own or have permission to use. Local queue metadata stays in browser storage. The local media library uses IndexedDB and applies a 24-hour retention window. Cloud provider uploads are optional and subject to their own terms and retention policies.
