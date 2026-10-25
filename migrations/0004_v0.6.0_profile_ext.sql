-- 0004 · v0.6.0 人际档案扩展：个人信息（尺码/身高/体重）+ 附件库
-- 依赖 0001 基线（contacts 表已存在）。本迁移只新增列与新表，不重建任何表，
-- 新表的 FK 指向 contacts——contacts 不在本迁移中 DROP，无 0002 那种隐式级联风险。

-- ==== 个人信息 · 尺码（单值随档，存 contacts 行内）====
ALTER TABLE contacts ADD COLUMN size_clothing TEXT;   -- 衣裤尺码 如 XL / 175/96A
ALTER TABLE contacts ADD COLUMN size_shoe TEXT;       -- 鞋码 如 42
ALTER TABLE contacts ADD COLUMN size_ring TEXT;       -- 戒指尺码 如 17 号
ALTER TABLE contacts ADD COLUMN size_bracelet TEXT;   -- 手镯尺码 如 58mm

-- ==== 身高 / 体重记录（时间序列；同一天同一指标重录覆盖）====
CREATE TABLE IF NOT EXISTS body_records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('height','weight')),
  value REAL NOT NULL CHECK(value > 0),
  record_date TEXT NOT NULL,                          -- YYYY-MM-DD（支持补录历史日期）
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(contact_id, kind, record_date)
);

-- ==== 联系人附件（文件体存 R2 桶 rjgx/姓名+手机号/ 目录，这里只存元数据）====
CREATE TABLE IF NOT EXISTS contact_files(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE,                      -- R2 对象键（含 rjgx/ 前缀）
  file_name TEXT NOT NULL,                            -- 展示用原始文件名
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_body_records_person ON body_records(contact_id, kind, record_date);
CREATE INDEX IF NOT EXISTS idx_contact_files_person ON contact_files(contact_id);
