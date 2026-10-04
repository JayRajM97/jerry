import type { Browser, LaunchOptions } from 'playwright-core';

/**
 * Chromium launcher that works both locally and on Vercel.
 *
 * Locally we use the full `playwright` package and the Chromium it downloads into
 * ~/.cache/ms-playwright. That cache does not exist inside a Vercel Function, so in
 * serverless we drive `playwright-core` against @sparticuz/chromium — a Chromium build
 * compiled for Amazon Linux with its shared libraries shipped alongside it.
 *
 * Both imports are dynamic so the ~64MB Chromium pack is only ever loaded (and
 * extracted into /tmp) by the routes that actually drive a browser. The AI routes in
 * the same function pay nothing for it.
 */

// VERCEL is set in every Vercel build and runtime environment.
export const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// @sparticuz args are tuned for puppeteer-on-Lambda. These two break Playwright:
// --single-process crashes the browser process Playwright expects to outlive the page,
// and a baked-in --headless fights Playwright's own headless handling.
const INCOMPATIBLE_ARGS = ['--single-process', '--headless'];

/**
 * @sparticuz/chromium only extracts its bundled shared libraries (al2023.tar.br) and
 * sets LD_LIBRARY_PATH / FONTCONFIG_PATH when it detects an AWS Lambda runtime, which
 * it does by sniffing AWS_EXECUTION_ENV. Vercel Functions run on the same Amazon Linux
 * 2023 image but do not expose that variable, so without this the binary extracts and
 * then dies with "libnss3.so: cannot open shared object file".
 *
 * Declaring the runtime makes the package do its own (correct) setup. This must happen
 * before the package is imported, because it wires the loader paths at import time.
 */
function declareLambdaRuntime(): void {
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  // Chromium writes its profile/font cache under HOME.
  process.env.HOME ??= '/tmp';
}

export async function launchBrowser(opts: LaunchOptions = {}): Promise<Browser> {
  if (!isServerless) {
    // Full playwright: it knows where its own Chromium lives.
    const { chromium } = await import('playwright');
    return chromium.launch(opts);
  }

  declareLambdaRuntime();

  const [{ chromium }, chromiumPack] = await Promise.all([
    import('playwright-core'),
    import('@sparticuz/chromium').then(m => (m as any).default ?? m),
  ]);

  // Graphics stay enabled: the args below include --use-angle=swiftshader, so the
  // swiftshader payload has to be extracted to match them.
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
    // Pass the env explicitly so the LD_LIBRARY_PATH that @sparticuz just set up
    // reaches the browser process.
    env: process.env as Record<string, string>,
  });
}

export type { Browser };
