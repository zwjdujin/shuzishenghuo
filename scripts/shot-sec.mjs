// 账户安全页 / 修改密码弹窗 截图 + 体检报告
// 用法：W=390 H=844 TAG=m node scripts/shot-sec.mjs
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import path from 'path';

const root = process.cwd();
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8899/_preview/secpreview.html';

const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const TAG = process.env.TAG || 'm';
const STATES = (process.env.STATES || 'security,security-modal').split(',');

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: W < 600 ? 2 : 1,
  isMobile: W < 600,
  hasTouch: W < 600,
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

for (const s of STATES) {
  const hash = '#' + s + (process.env.NIGHT ? '-night' : '');
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2200);

  const report = await page.$eval('#report2', (el) => el.textContent).catch(() => 'NO REPORT');
  console.log('---------- ' + s + ' @' + W + 'x' + H + ' ----------');
  console.log(report);

  const outName = `demo/sec-${TAG}-${s}.png`;
  await page.screenshot({ path: path.join(root, outName) });
  console.log('shot ' + outName);
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
