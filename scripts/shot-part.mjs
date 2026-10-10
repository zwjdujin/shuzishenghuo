// 通用「局部元素」截图：把 _preview/ 下任一体验页的某个元素单独拍下来放大看
// 用法：PAGE=ledgerpreview.html HASH=#ledger SEL="#ledgerChart" OUT=demo/_zoom.png node scripts/shot-part.mjs
import { chromium } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import path from 'path';

const root = process.cwd();
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PAGE = process.env.PAGE || 'ledgerpreview.html';
const HASH = process.env.HASH || '';
const SEL = process.env.SEL;
const OUT = process.env.OUT || 'demo/_part.png';
const W = Number(process.env.W || 430);
const H = Number(process.env.H || 1000);
const PAD = Number(process.env.PAD || 12);
const SCALE = Number(process.env.SCALE || 2);

if (!SEL) { console.error('缺少 SEL'); process.exit(1); }

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:8899/_preview/' + PAGE + HASH, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);

const el = await page.$(SEL);
if (!el) { console.error('找不到元素 ' + SEL); await browser.close(); process.exit(1); }
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
const box = await el.boundingBox();
await page.screenshot({
  path: path.join(root, OUT),
  clip: {
    x: Math.max(0, box.x - PAD),
    y: Math.max(0, box.y - PAD),
    width: Math.min(box.width + PAD * 2, W),
    height: Math.min(box.height + PAD * 2, H),
  },
});
console.log('shot ' + OUT + '  ' + Math.round(box.width) + 'x' + Math.round(box.height));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
