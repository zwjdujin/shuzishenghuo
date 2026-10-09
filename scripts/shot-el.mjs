// 真实视口截图（playwright-core + 本机 Edge）；支持整页或指定元素
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8899/_preview/relpreview.html';

const WIDTH = Number(process.env.W || 390);
const TAG = process.env.TAG || 'mobile';

const shots = [
  { hash: '#list', sel: '#view-relations .panel:last-of-type', out: `demo/rel-${TAG}-list-rows.png` },
  { hash: '#edit-base', sel: '.pf-hero', out: `demo/rel-${TAG}-hero.png` },
  { hash: '#edit-base', sel: '#pfModulePanel', out: `demo/rel-${TAG}-edit-base.png` },
  { hash: '#edit-rel', sel: '#pfModulePanel', out: `demo/rel-${TAG}-edit-rel.png` },
  { hash: '#list', sel: '#view-relations', out: `demo/rel-${TAG}-list-full.png` },
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: 844 },
  deviceScaleFactor: 2,
  isMobile: WIDTH < 600,
  hasTouch: WIDTH < 600,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

let lastHash = '';
for (const s of shots) {
  if (s.hash !== lastHash) {
    await page.goto(BASE + s.hash, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    if (process.env.NIGHT) await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'night'));
    lastHash = s.hash;
  }
  const el = await page.$(s.sel);
  if (!el) { console.log('MISSING ' + s.sel); continue; }
  await el.screenshot({ path: path.join(root, s.out) });
  console.log('shot ' + s.out + '  (' + s.sel + ')');
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
