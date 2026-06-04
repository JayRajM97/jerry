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

## Deploy to Render (free tier)

One web service. UI + API run on the same Node process; Playwright/Chromium ship inside the Docker image.

1. Push the repo to GitHub.
2. In Render → **New → Blueprint**, point at the repo. `render.yaml` is auto-detected.
3. On the new service, set the secret env var:
   - `GEMINI_API_KEY` = your Gemini key
4. Hit Deploy. First boot takes ~3 min (downloads Playwright base image + builds Vite).

Free tier spins down after 15 min of inactivity. First request after sleep takes ~30–60s (container wake + Vite rebuild). Subsequent requests are normal speed.

### Env vars

| Var | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Gemini API key. |
| `HEADLESS` | `true` | Set `false` locally to see the browser work. |
| `RECORD_VIDEO` | unset | `1`/`true` to record `.webm` per apply run. |
| `APPLY_DRY_RUN` | `false` | `true` = kill-switch, never actually submits. |
| `NODE_ENV` | — | Set to `production` on Render (handled in Dockerfile). |
| `PORT` | `8787` (dev) / `10000` (prod) | Render injects this. |

## Security note

`GEMINI_API_KEY` is currently inlined into the client bundle by Vite via [services/geminiService.ts:5](services/geminiService.ts#L5). On a public deploy, anyone can extract it from the JS. Fine for solo / private use; rotate the key if the URL is ever shared, or move all Gemini calls behind the server (`server/gemini.ts` already proxies application-answer generation).
