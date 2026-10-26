// v0.5.27 补丁（修正版）：基于 cat -A 确认的实际文本做替换
import fs from 'node:fs';
const FILE = 'public/js/app.js';
let t = fs.readFileSync(FILE, 'utf8').split('\r\n').join('\n');   // 归一化行尾（Windows 检出为 CRLF）
let n = 0;

// ---- 1) 移除简易多行预览四函数 ----
const startMark = '/** v0.5.20 AI 多笔解析预览：每笔一行（类型/收支/金额/分类/日期可改，可删行），确认后批量入库 */';
const endMark = 'async function refreshP3Memos() {';
const si = t.indexOf(startMark);
const ei = t.indexOf(endMark);
if (si < 0 || ei < 0 || ei <= si) { console.error('预览函数标记缺失'); process.exit(1); }
const helpers = `/** v0.5.23：AI 识别的待办直接录入（仅事情+时间时） */
async function saveTodoFromAi(d) {
  const title = String(d.title || '').trim();
  if (!title) return false;
  const res = await api('/api/todos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      date: /^\\d{4}-\\d{2}-\\d{2}$/.test(d.date || '') ? d.date : todayStrLocal(),
      time: /^\\d{2}:\\d{2}$/.test(d.time || '') ? d.time : '',
      list: '生活',
    }),
  });
  return res.ok;
}

/** v0.5.27：AI 识别的联系人 → 打开「添加联系人」弹窗预填（电话/微信暂存备注由人工归档） */
function openContactFromAi(d) {
  if (window.pfOpenEditModal) window.pfOpenEditModal();
  const f = document.getElementById('contactEditForm');
  if (!f) return;
  if (d.rname) f.firstName.value = String(d.rname).slice(0, 20);
  const bits = [d.phone && '电话 ' + d.phone, d.wechat && '微信 ' + d.wechat, d.qq && 'QQ ' + d.qq,
    d.company && ('公司 ' + d.company + (d.position ? ' · ' + d.position : ''))].filter(Boolean);
  if (bits.length && f.note) f.note.value = bits.join('；').slice(0, 60);
  toast('已按识别预填，请核验后保存');
}

`;
t = t.slice(0, si) + helpers + t.slice(ei);
n++;

// ---- 2) drain 重写（精确匹配当前文本）----
const oldDrain = [
  'function drainAiQueue() {',
  '  if (!aiQueue.length) return;',
  '  const next = aiQueue[0];',
  "  if (next.module === 'transaction') {",
  '    aiQueue = aiQueue.slice(1);',
  '    openTxnFromAi(next);',
  '    if (aiQueue.length) toast(`AI 共识别 ${aiQueue.length + 1} 笔，保存本笔后继续确认下一笔`);',
  '    return;',
  '  }',
  '  const rest = aiQueue;',
  '  aiQueue = [];',
  "  openAiPreview(next.note || 'AI 识别内容', rest);",
  '}',
].join('\n');
const newDrain = [
  'async function drainAiQueue() {',
  '  if (window.__aiDraining) return;',
  '  window.__aiDraining = true;',
  '  try {',
  '    while (aiQueue.length) {',
  '      const next = aiQueue.shift();',
  "      if (next.module === 'transaction') { aiSaveHook = () => drainAiQueue(); openTxnFromAi(next); return; }          // 记一笔：保存后继续",
  "      if (next.module === 'medicine') { aiSaveHook = () => drainAiQueue(); if (window.medAiFill) window.medAiFill(next); return; }  // 录入药品：保存后继续",
  "      if (next.module === 'todo') {",
  '        if (next.detail) { aiSaveHook = () => drainAiQueue(); openTodoFromAi(next); return; }                        // 详细描述 → 新增待办弹窗',
  '        const okSave = await saveTodoFromAi(next);                                                                    // 简单 → 直接录入',
  "        if (okSave) { toast('待办已添加'); continue; }",
  '        aiSaveHook = () => drainAiQueue(); openTodoFromAi(next); return;                                             // 失败回退弹窗',
  '      }',
  "      if (next.module === 'relation') { aiSaveHook = () => drainAiQueue(); openContactFromAi(next); return; }        // 联系人：保存后继续",
  '      // memo：直接保存',
  "      const res = await api('/api/memos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: String(next.note || '').slice(0, 500) }) });",
  "      if (res.ok) { toast('备忘已保存'); await refreshP3Memos(); }",
  '    }',
  '  } finally { window.__aiDraining = false; }',
  '}',
  'window.drainAiQueue = drainAiQueue;',
  'window.aiQueueCancel = () => { aiQueue = []; aiSaveHook = null; };',
  'window.aiSaveHookRun = () => { const h = aiSaveHook; aiSaveHook = null; if (h) h(); };',
  '/** v0.5.27：AI 识别的详细待办 → 新增待办弹窗预填 */',
  'function openTodoFromAi(d) {',
  "  const f = $('#todoForm');",
  '  if (!f) return;',
  '  f.reset();',
  "  f.title.value = String(d.title || '').slice(0, 30);",
  "  f.date.value = /^\\d{4}-\\d{2}-\\d{2}$/.test(d.date || '') ? d.date : todayStrLocal();",
  "  f.time.value = /^\\d{2}:\\d{2}$/.test(d.time || '') ? d.time : '';",
  '  window.syncDtBtns(f);',
  "  $('#todoFormError').hidden = true;",
  "  $('#todoModal').hidden = false;",
  '}',
].join('\n');
if (!t.includes(oldDrain)) { console.error('旧 drain 未匹配'); process.exit(1); }
t = t.replace(oldDrain, newDrain);
n++;

// ---- 3) 队列声明 + closeTxnModal + submitTxn ----
const qDeclOld = 'let aiQueue = [];\nlet aiChaining = false;';
const qDeclNew = 'let aiQueue = [];\nlet aiSaveHook = null;   // 当前 AI 弹窗保存后的续发钩子';
if (!t.includes(qDeclOld)) { console.error('队列声明未匹配'); process.exit(1); }
t = t.replace(qDeclOld, qDeclNew); n++;

const closeOld = '  if (!aiChaining) aiQueue = [];  // 非链式保存的手动关闭：丢弃剩余 AI 队列\n';
if (!t.includes(closeOld)) { console.error('closeTxnModal 段未匹配'); process.exit(1); }
t = t.replace(closeOld, ''); n++;

const chainOld = "      aiChaining = aiQueue.length > 0;   // 链式保存：closeTxnModal 不清队列\n      closeTxnModal();\n      toast(id ? '已保存修改' : '已记账');\n      markSynced();\n      await renderLedger();\n      drainAiQueue();   // v0.5.23：随手记 AI 多笔时，保存一笔后续笔继续确认\n      aiChaining = false;";
const chainNew = "      closeTxnModal();\n      toast(id ? '已保存修改' : '已记账');\n      markSynced();\n      await renderLedger();\n      window.aiSaveHookRun();   // v0.5.27：随手记 AI 多笔时，保存一笔后续笔继续确认";
if (!t.includes(chainOld)) { console.error('submitTxn 链式段未匹配'); process.exit(1); }
t = t.replace(chainOld, chainNew); n++;

// ---- 4) aiPreview 旧绑定移除 ----
t = t.replace("bind('#aiPreviewClose', 'click', () => closeModal($('#aiPreviewModal')));\n", ''); n++;
t = t.replace("bind('#aiPreviewModal', 'click', (e) => { if (e.target === $('#aiPreviewModal')) closeModal($('#aiPreviewModal')); });\n", ''); n++;
t = t.replace("bind('#aiCancelBtn', 'click', () => closeModal($('#aiPreviewModal')));\n", ''); n++;
t = t.replace("bind('#aiOkBtn', 'click', aiPreviewConfirm);\n", ''); n++;

fs.writeFileSync(FILE, t);
console.log('补丁完成，共', n, '处');
