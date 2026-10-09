// 逐屏滚动截图（避免 fixed 底栏在长元素截图里产生拼接错位）
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import path from 'path';
const root = process.cwd();
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8899/_preview/relpreview.html';
const W = Number(process.env.W || 390);
const TAG = process.env.TAG || 'mobile';
const hash = process.env.HASH || '#edit-base';

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: W < 600, hasTouch: W < 600 });
const page = await ctx.newPage();
await page.goto(BASE + hash, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(500);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const screens = Math.min(12, Math.ceil(total / 844));
for (let i = 0; i < screens; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * 844);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(root, `demo/rel-${TAG}-scr-${String(i).padStart(2, '0')}.png`) });
  console.log('shot scr ' + i);
}
console.log('total height=' + total + ' screens=' + screens);
await browser.close();
