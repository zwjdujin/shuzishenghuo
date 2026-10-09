import { json } from '../../_lib.js';

// ===== 附件（文件实际存R2：contacts/{person_id}/{日期}_{随机}_{文件名}） =====

// POST /api/profile/files  {person_id, name, size, dataBase64}
// 用 base64 接收小文件写入 R2；大文件建议改用预签名直传
export async function onRequestPost(context) {
  const { env, request } = context;
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const personId = Number(b.person_id);
  const name = String(b.name || '').trim();
  if (!personId || !name) return json({ error: '参数错误' }, 400);

  const safe = name.replace(/[^\w.\-一-龥]/g, '_');
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `contacts/${personId}/${stamp}_${rand}_${safe}`;

  if (b.dataBase64 && env.BUCKET) {
    // base64 → ArrayBuffer → 写入 R2
    const raw = atob(String(b.dataBase64));
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    await env.BUCKET.put(key, buf, {
      httpMetadata: { contentType: b.mime || 'application/octet-stream' },
    });
  }

  const res = await env.DB.prepare(
    'INSERT INTO contact_files(person_id,name,size,r2_path) VALUES (?,?,?,?)'
  ).bind(personId, name, b.size || (b.dataBase64 ? Math.round(String(b.dataBase64).length * 0.75) + ' B' : ''), key).run();

  return json({ ok: true, id: res.meta && res.meta.last_row_id, path: key, stored: !!(b.dataBase64 && env.BUCKET) }, 201);
}

// GET /api/profile/files?person_id=4&id=3 —— 下载
export async function onRequestGet(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const personId = Number(u.searchParams.get('person_id'));
  const id = Number(u.searchParams.get('id'));
  if (!personId || !id) return json({ error: '参数错误' }, 400);
  if (!env.BUCKET) return json({ error: '未绑定 R2存储桶' }, 501);

  const row = await env.DB.prepare('SELECT * FROM contact_files WHERE id=? AND person_id=?').bind(id, personId).first();
  if (!row) return json({ error: '文件不存在' }, 404);

  const obj = await env.BUCKET.get(row.r2_path);
  if (!obj) return json({ error: 'R2 中未找到该文件' }, 404);

  const buf = await obj.arrayBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': obj.httpMetadata && obj.httpMetadata.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    },
  });
}

// DELETE /api/profile/files?id=3
export async function onRequestDelete(context) {
  const { env, request } = context;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get('id'));
  if (!id) return json({ error: '缺少 id' }, 400);
  const row = await env.DB.prepare('SELECT r2_path FROM contact_files WHERE id=?').bind(id).first();
  if (row && env.BUCKET) {
    try { await env.BUCKET.delete(row.r2_path); } catch (_) { /* 忽略删除失败 */ }
  }
  await env.DB.prepare('DELETE FROM contact_files WHERE id=?').bind(id).run();
  return json({ ok: true, id });
}