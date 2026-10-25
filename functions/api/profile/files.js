import { json } from '../../_lib.js';

// ===== v0.6.0 联系人附件：文件体存 R2（binding=BUCKET），元数据存 D1 =====
// 目录规则：rjgx/姓名+手机号/文件（无手机号时 rjgx/姓名/文件）
// GET    /api/profile/files?id=1           → {files:[{id,name,mime,size,date}]}
// GET    /api/profile/files?id=1&fid=5     → 流式返回文件（&dl=1 强制下载）
// POST   /api/profile/files（multipart: id + file[]，可多文件）
// DELETE /api/profile/files?id=1&fid=5     → 删 DB 行 + R2 对象

const MAX_FILE = 50 * 1024 * 1024; // 单文件 50MB 上限
// R2 键只允许安全字符：目录穿越 / 斜杠 / 控制字符一律去掉
const safeSeg = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 60);
const safeName = (s) => String(s || '文件').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().slice(0, 100) || '文件';

/** 联系人在 R2 的专属目录名：姓名+手机号（无手机号退化为姓名） */
export async function folderOf(env, personId) {
  const c = await env.DB.prepare('SELECT name, phone FROM contacts WHERE id=?').bind(personId).first();
  if (!c) return null;
  const name = safeSeg(c.name) || '未命名';
  const phone = safeSeg(c.phone);
  return { folder: phone ? `${name}+${phone}` : name, contact: c };
}

async function listFiles(env, id) {
  return (await env.DB.prepare(
    'SELECT id, file_key, file_name, mime, size, created_at FROM contact_files WHERE contact_id=? ORDER BY id DESC'
  ).bind(id).all()).results || [];
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  const fid = Number(url.searchParams.get('fid'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);

  // 单文件下载 / 预览
  if (fid) {
    const row = await env.DB.prepare('SELECT * FROM contact_files WHERE id=? AND contact_id=?').bind(fid, id).first();
    if (!row) return json({ error: '附件不存在' }, 404);
    const obj = await env.BUCKET.get(row.file_key);
    if (!obj) return json({ error: '文件已丢失（R2 无此对象）' }, 404);
    const headers = {
      'Content-Type': row.mime || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${url.searchParams.get('dl') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
    };
    return new Response(obj.body, { headers });
  }

  const rows = await listFiles(env, id);
  const info = await folderOf(env, id);
  if (!info) return json({ error: '联系人不存在' }, 404);
  return json({
    folder: info.folder,
    files: rows.map((r) => ({ id: r.id, name: r.file_name, mime: r.mime || '', size: r.size, date: r.created_at })),
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let form;
  try { form = await request.formData(); } catch (_) { return json({ error: '请用表单上传' }, 400); }
  const id = Number(form.get('id'));
  if (!id) return json({ error: '缺少联系人 id' }, 400);
  const files = form.getAll('file').filter((f) => f && typeof f === 'object' && f.size > 0);
  if (!files.length) return json({ error: '没有收到文件' }, 400);

  const info = await folderOf(env, id);
  if (!info) return json({ error: '联系人不存在' }, 404);

  const saved = [];
  const tooBig = [];
  for (const f of files) {
    if (f.size > MAX_FILE) { tooBig.push(f.name); continue; }
    const name = safeName(f.name);
    // 键内加时间戳避免同名覆盖；展示名保留原名
    const key = `rjgx/${info.folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${name}`;
    await env.BUCKET.put(key, f.stream(), {
      httpMetadata: { contentType: f.type || 'application/octet-stream' },
    });
    const res = await env.DB.prepare(
      'INSERT INTO contact_files(contact_id, file_key, file_name, mime, size) VALUES (?,?,?,?,?)'
    ).bind(id, key, name, String(f.type || '').slice(0, 100), f.size).run();
    saved.push(name);
  }
  if (!saved.length) return json({ error: `文件超过 ${Math.round(MAX_FILE / 1024 / 1024)}MB 上限：${tooBig.join('、')}` }, 400);
  return json({ ok: true, saved, skipped: tooBig }, 201);
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  const fid = Number(url.searchParams.get('fid'));
  if (!id || !fid) return json({ error: '参数错误' }, 400);
  const row = await env.DB.prepare('SELECT * FROM contact_files WHERE id=? AND contact_id=?').bind(fid, id).first();
  if (!row) return json({ error: '附件不存在' }, 404);
  await env.DB.prepare('DELETE FROM contact_files WHERE id=?').bind(fid).run();
  try { await env.BUCKET.delete(row.file_key); } catch (_) { /* R2 删除失败不阻断，残留对象无 DB 引用 */ }
  return json({ ok: true, id: fid });
}
