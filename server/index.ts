import { createApp, FORCE_DRY_RUN, HEADLESS } from './app.js';

// Local / self-hosted entrypoint. On Vercel the same app is mounted as a
// Function by api/index.ts instead, and nothing here runs.
const PORT = Number(process.env.PORT || 8787);

createApp().listen(PORT, () => {
  console.log(`[auto-apply] server on :${PORT}  forceDryRun=${FORCE_DRY_RUN}  headless=${HEADLESS}`);
});
