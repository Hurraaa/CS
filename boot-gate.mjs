// Boot-gate: open the BUILT dist/index.html in a real headless browser and assert
// the game boots (window.__ready), no uncaught error fired, and the fatal layer
// stayed hidden. Exit 0 = BOOT_OK, exit 1 = BOOT_FAIL. Used by ship.sh / CI.
//
// Playwright is intentionally NOT a package dependency (keeps installs lean). This
// resolves it from a few well-known locations; if none is found it SKIPs (exit 0)
// so a machine without a browser doesn't block, while CI installs it explicitly.

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function loadChromium() {
  const candidates = [
    'playwright', 'playwright-core',
    '/opt/node22/lib/node_modules/playwright/index.mjs',
    '/opt/node22/lib/node_modules/playwright-core/index.mjs',
  ];
  for (const c of candidates) {
    try { const m = await import(c); if (m.chromium) return m.chromium; } catch {}
  }
  return null;
}

const chromium = await loadChromium();
if (!chromium) {
  console.log('BOOT_SKIP: playwright not available (install with `npx playwright install chromium`)');
  process.exit(0);
}

const distIndex = resolve('dist/index.html');
if (!existsSync(distIndex)) { console.error('BOOT_FAIL: dist/index.html missing — run `npm run build` first'); process.exit(1); }

const execPath = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOpts = { args: ['--allow-file-access-from-files','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] };
if (existsSync(execPath)) launchOpts.executablePath = execPath;

const browser = await chromium.launch(launchOpts);
let ok = false, detail = '';
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(pathToFileURL(distIndex).href, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__ready === true, { timeout: 12000 });
  } catch { /* fall through to diagnostics */ }

  const state = await page.evaluate(() => ({
    ready: window.__ready === true,
    fatalShown: document.getElementById('fatal')?.classList.contains('show') || false,
    bootGone: document.getElementById('boot')?.classList.contains('gone') || false,
    hasCanvas: !!document.querySelector('canvas'),
    diag: window.__diag ? window.__diag() : null,
    lastStep: document.getElementById('bootStep')?.textContent || '',
    fatalMsg: document.getElementById('fatalMsg')?.textContent || '',
  }));

  ok = state.ready && !state.fatalShown && state.hasCanvas && errors.length === 0;
  detail = JSON.stringify({ ...state, errors }, null, 2);
} finally {
  await browser.close();
}

if (ok) { console.log('BOOT_OK\n' + detail); process.exit(0); }
console.error('BOOT_FAIL\n' + detail); process.exit(1);
