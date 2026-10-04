# Jerry Maguire

AI agent that takes a Greenhouse job link, tailors your resume to the JD, drafts answers to every screening question in your voice, and submits the application end-to-end via headless Chromium.

## Run locally

**Prerequisites:** Node.js 20+, a Gemini API key.

```bash
npm install
npx playwright install chromium
echo "GEMINI_API_KEY=your_key_here" > .env.local
npm run dev
```

App: http://localhost:3000  ·  API: http://localhost:8787

### Local video recording

Auto-apply runs record `.webm` video to `./recordings/<board>_<jobId>_<ts>/` when:
- `RECORD_VIDEO=1` is set, **or**
- the server runs non-headless (`HEADLESS=false`) in dev.

To watch the browser live + record video:
```bash
HEADLESS=false RECORD_VIDEO=1 npm run dev:server
```

## Deploy to Vercel

The repo is Vercel-ready: `vercel.json` builds the SPA and mounts the Express API as a
single Function.

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new) (or `vercel link`).
2. Add the one required env var:
   ```bash
   vercel env add GEMINI_API_KEY production
   ```
3. Deploy: `vercel --prod` (or just push to `main`).

Notes on the Vercel setup:

- `maxDuration` is 300s and `memory` 3009MB for `api/index.ts` — Chromium needs the
  headroom, and a full apply run can take a couple of minutes.
- `includeFiles` ships `voice/style.md`, the `server/fonts/` Open Sans files and the `@sparticuz/chromium` binaries, which are
  loaded by path rather than `import` and so would otherwise be tree-shaken out of the
  bundle. `GET /api/health` reports `voiceStyleLoaded` so you can confirm it shipped.
- Video recording is force-disabled in serverless (read-only filesystem).
- `playwright` and `playwright-core` are pinned to **1.49.1** to match the Chromium 131
  build in `@sparticuz/chromium`. Upgrade them together or the CDP versions drift apart.

## Deploy to Render (container alternative)

Prefer this if you want a long-lived process with a writable disk (e.g. to keep apply
videos) or runs longer than 300s. One web service; UI + API share a Node process and
Chromium ships inside the Docker image.

1. Push the repo to GitHub.
2. In Render → **New → Blueprint**, point at the repo. `render.yaml` is auto-detected.
3. On the new service, set `GEMINI_API_KEY`.
4. Hit Deploy. First boot takes ~3 min.

Free tier spins down after 15 min of inactivity; the first request after sleep takes ~30–60s.

### Env vars

| Var | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Gemini API key. |
| `HEADLESS` | `true` | Set `false` locally to see the browser work. |
| `RECORD_VIDEO` | unset | `1`/`true` to record `.webm` per apply run. |
| `APPLY_DRY_RUN` | `false` | `true` = kill-switch, never actually submits. |
| `NODE_ENV` | — | Set to `production` on Render (handled in Dockerfile). |
| `PORT` | `8787` (dev) / `10000` (prod) | Render injects this. |

## Resume format, one page, and the PDF

The resume is one HTML document styled by **one stylesheet**, `shared/resumeTheme.ts`,
which the editor, the on-screen preview, the client-side page-fit meter, the PDF export
and the auto-apply upload all use. What you see on the page is laid out with the same
rules as the file.

- **Import** (`utils/importResume.ts`): `.pdf` is read with pdf.js including the link
  annotations, so hyperlinks survive; fonts are resolved to real names (Calibri-Bold,
  Calibri-Italic…) so bold/italic runs are kept; headings, role lines and bullets are
  recovered from size, weight and layout, and wrapped lines are re-joined. `.docx` goes
  through mammoth with Word's Title/Heading styles mapped onto the resume hierarchy.
- **Suggestions never rewrite your document** (`utils/applySuggestions.ts`). Each accepted
  change replaces one matched element in place; everything else stays byte-identical.
  A suggestion whose original text cannot be located is flagged, not guessed.
- **One page** is enforced by scaling: every size in the stylesheet derives from
  `--resume-scale`, and both the preview (`utils/pageFit.ts`) and the server search for
  the largest scale (down to 80%) at which the content fits A4. The badge in Analyze and
  Preview shows the result live; if it does not fit even at 80%, it says how many lines
  to cut rather than clipping.
- **PDF export** is `POST /api/export/pdf` (`server/resumePdf.ts`): a real vector PDF from
  Chromium with selectable text, working links and Open Sans embedded. Response headers
  `X-Resume-Pages`, `X-Resume-Scale`, `X-Resume-Fits` report how it fitted; the page count
  is read back from the produced file.
- **DOCX export** (`utils/htmlToDocx.ts`) writes real Word paragraphs with Word's own
  Title/Heading styles, bullet numbering and hyperlinks. The previous html-docx-js output
  embedded the HTML as an altChunk, which Word displays but ATS parsers read as empty.
- **File name** is `First-Last-com-Company-YYYY-MM-DD.pdf` (`shared/resumeFilename.ts`),
  the same for the DOCX download and for the resume the auto-apply agent uploads. The
  company fills from the job URL fetch or the JD parse and can be edited above the
  Download button.

### Tests

```bash
npm test             # suggestion application (jsdom), PDF import of the bundled resume, DOCX round trip
npm run test:export  # end-to-end PDF export against a deployment (BASE=https://… to override)
```

`npm run test:export` hits the real serverless Chromium: it checks page count, A4 size,
margins, text layer, hyperlinks, the fit headers and the file name. For a protected preview
deployment set `VIA_VERCEL_CURL=<team-slug>` and it routes requests through `vercel curl`.

## Architecture

| Piece | Where it runs |
|---|---|
| React SPA (Vite) | Static build in `dist`, served by the Vercel CDN |
| `/api/*` | One Express app (`server/app.ts`) mounted as a Vercel Function via `api/index.ts` |
| Gemini calls | Server-side only (`server/aiCore.ts`, `server/gemini.ts`) |
| Playwright apply runs | Same Function; Chromium comes from `@sparticuz/chromium` in serverless, local Playwright in dev |
| PDF export | Same Chromium, `server/resumePdf.ts`; fonts in `server/fonts/` (Open Sans, OFL; DejaVu Sans as glyph fallback for →, ₹, ✓) |

`server/browser.ts` picks the right Chromium. Both of its imports are dynamic, so the
~64MB Chromium pack is only loaded by the routes that actually drive a browser.

## Security note

`GEMINI_API_KEY` is **server-side only**. All Gemini calls go through `/api/ai/*`
(`services/geminiService.ts` is a thin fetch client), and `GEMINI_` has been removed
from Vite's `envPrefix` so the key cannot be inlined into the browser bundle again.

Two things still worth knowing:

- **There is no real auth.** `services/authService.ts` is a mock that stores a session in
  LocalStorage, so anyone who opens the deployed URL can use the app and spend your Gemini
  quota. Put Vercel Deployment Protection on the project, or add real auth, before sharing
  the URL.
- **`VITE_*` vars are public.** The optional Turso cloud-sync vars are client-side and
  readable by anyone who loads the page. Leave them unset (LocalStorage mode) unless you
  are fine exposing that token.
