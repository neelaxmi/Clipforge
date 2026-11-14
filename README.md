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
- Captions and content draft workspace.
- Android-first responsive PWA with visible Clip Studio diagnostics console.

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

## Google Drive and YouTube OAuth status

Drive and YouTube account connections are not active yet. They require a Google Cloud project, enabled Drive API / YouTube Data API, configured OAuth consent screen, OAuth client ID, redirect URI and secure server-side token storage. The Settings page labels these as setup-required; it does not ask users to paste API keys or passwords. No fake “connected” state is shown.

YouTube publishing should be implemented only through the official YouTube Data API, with private-by-default uploads and a user approval step before publishing or scheduling.

## Deploy

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- API routes are Vercel Node.js Functions under `api/`.

## Local development

```bash
npm install
npm run dev
npm run build
```

## Privacy and rights

Only analyse, edit or publish videos and music that you own or have permission to use. Local queue metadata stays in browser storage. The local media library uses IndexedDB and applies a 24-hour retention window. Cloud provider uploads are optional and subject to their own terms and retention policies.
