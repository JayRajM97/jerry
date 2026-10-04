import type { Browser, LaunchOptions } from 'playwright-core';

/**
 * Chromium launcher that works both locally and on Vercel.
 *
 * Locally we use the full `playwright` package and the Chromium it downloads into
 * ~/.cache/ms-playwright. That cache does not exist inside a Vercel Function, so in
 * serverless we drive `playwright-core` against @sparticuz/chromium — a Chromium build
 * compiled for Amazon Linux with its shared libraries bundled in.
 *
 * Both imports are dynamic so the ~130MB Chromium pack is only ever loaded (and
 * extracted into /tmp) by the routes that actually drive a browser. The AI routes in
 * the same function pay nothing for it.
 */

// VERCEL is set in every Vercel build and runtime environment.
export const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// @sparticuz args are tuned for puppeteer-on-Lambda. These two break Playwright:
// --single-process crashes the browser process Playwright expects to outlive the page,
// and a baked-in --headless fights Playwright's own headless handling.
const INCOMPATIBLE_ARGS = ['--single-process', '--headless'];

export async function launchBrowser(opts: LaunchOptions = {}): Promise<Browser> {
  if (!isServerless) {
    // Full playwright: it knows where its own Chromium lives.
    const { chromium } = await import('playwright');
    return chromium.launch(opts);
  }

  const [{ chromium }, chromiumPack] = await Promise.all([
    import('playwright-core'),
    import('@sparticuz/chromium').then(m => m.default ?? m),
  ]);

  // Skip the WebGL/graphics stack — nothing here renders 3D and it costs cold-start time.
  (chromiumPack as any).setGraphicsMode = false;

  const packArgs: string[] = ((chromiumPack as any).args || []).filter(
    (a: string) => !INCOMPATIBLE_ARGS.some(bad => a === bad || a.startsWith(`${bad}=`)),
  );

  const executablePath = await (chromiumPack as any).executablePath();

  return chromium.launch({
    ...opts,
    // /dev/shm is tiny in serverless; without this Chromium dies on bigger pages.
    args: [...packArgs, '--disable-dev-shm-usage'],
    executablePath,
    // Serverless has no display — never honour a HEADLESS=false override here.
    headless: true,
    slowMo: 0,
  });
}

export type { Browser };
