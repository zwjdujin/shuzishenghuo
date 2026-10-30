-- 0011 · v0.5.33 人际关系档案卷宗：自定义段落（19 段 JSON 资料）
-- 每位联系人每段一行；data 为渲染载荷（r/list/tb/tags/bars/tl），空段落不展示。
-- 结构化数据（contacts/contact_*/body_records）保持原表直读，不在本表内。

CREATE TABLE IF NOT EXISTS contact_sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sec_key    TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(contact_id, sec_key)
);
CREATE INDEX IF NOT EXISTS idx_contact_sections_person ON contact_sections(contact_id);
