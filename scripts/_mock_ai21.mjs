// 本地 mock 大模型服务（v0.5.24）：多笔 / 混合 / 名片 / 药品 / 记忆 / 充电二级 / ping
import http from 'node:http';
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => body += c);
  req.on('end', () => {
    let sys = '', q = '';
    try {
      const msgs = JSON.parse(body).messages || [];
      sys = String((msgs[0] || {}).content || '');
      const last = msgs[msgs.length - 1] || {};
      q = typeof last.content === 'string' ? last.content : JSON.stringify(last.content || '');
    } catch { /* 忽略 */ }

    let content;
    if (sys.includes('医药信息助手')) content = JSON.stringify({ efficacy: '肾上腺皮质激素类药。用于过敏性皮炎、脂溢性皮炎、瘙痒症等（AI 建议，须核验）。', dosage: '外用。涂于洗净的患处，一日1～2次（AI 建议，须核验）。' });
    else if (q === 'ping') content = 'pong';
    else if (q.includes('image_url')) content = JSON.stringify([{ module: 'transaction', flow: 'expense', amount: 12.5, category: '餐饮', date: '2026-10-26', note: '扫码账单', confidence: 0.9 }]);
    else if (q.includes('19.98')) content = JSON.stringify([
      { module: 'transaction', flow: 'expense', amount: 19.98, category: '餐饮', date: '2026-10-26', note: '自助餐', confidence: 0.9 },
      { module: 'transaction', flow: 'expense', amount: 44.61, category: '餐饮', date: '2026-10-26', note: '买菜', confidence: 0.88 },
    ]);
    else if (q.includes('充电')) content = JSON.stringify([{ module: 'transaction', flow: 'expense', amount: 30, category: '交通', sub: '充电', date: '2026-10-26', note: '汽车充电', confidence: 0.95 }]);
    else if (q.includes('名片')) content = JSON.stringify([{ module: 'relation', rname: '王小明', phone: '13999999999', wechat: 'wxm2024', company: '示例科技', position: '产品经理', confidence: 0.9 }]);
    else if (q.includes('阿莫西林')) content = JSON.stringify([{ module: 'medicine', mname: '阿莫西林胶囊', form: '胶囊剂', spec: '0.25g×24粒', dosage: '每次2粒，每日3次', confidence: 0.9 }]);
    else if (q.includes('吃饭花了20')) content = JSON.stringify([
      { module: 'todo', title: '明天下午3点开会', date: '2026-10-27', confidence: 0.9 },
      { module: 'transaction', flow: 'expense', amount: 20, category: '餐饮', date: '2026-10-26', note: '午饭', confidence: 0.9 },
    ]);
    else if (q.includes('花了35')) content = JSON.stringify([{ module: 'transaction', flow: 'expense', amount: 35, category: '交通', date: '2026-10-26', note: '打车', confidence: 0.9 }]);
    else if (q.includes('开会')) content = '```json\n' + JSON.stringify([{ module: 'todo', title: '明天下午3点开会', date: '2026-10-27', confidence: 0.9 }]) + '\n```';
    else if (q.includes('记忆测试一句话') && sys.includes('AI记忆测试标记XYZ')) content = JSON.stringify([{ module: 'transaction', flow: 'expense', amount: 9, category: '记忆测试', date: '2026-10-26', note: '记忆生效', confidence: 1 }]);
    else content = JSON.stringify({ module: 'memo', note: q.slice(0, 40) || '图片', confidence: 0.5 });

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
}).listen(8790, () => console.log('mock AI :8790'));
