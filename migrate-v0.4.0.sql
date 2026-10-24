-- 数字生活 · v0.4.0 数据库迁移
-- ⚠️⚠️ 本迁移会【删除全部现有人际关系数据】（v0.4.0 人际关系模块按新规格重建，应用户要求不保留旧数据）
-- 执行前务必备份（示例）：
--   wrangler d1 execute shuzishenghuo --remote --json --command "SELECT * FROM contacts"
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.4.0.sql

-- ===== 1. 删除不再保留的模块 =====
-- 移除：互动时间轴 / 承诺待办 / 财务人情账 / R2附件 / 关系属性 / 家庭与亲密 / 偏好 / 性格
-- （v0.4.0 档案页按新规格只保留：基本信息、联系方式、婚姻、家庭关系、公司/组织与职位、教育与成长、宠物）
DROP TABLE IF EXISTS contact_interacts;
DROP TABLE IF EXISTS contact_promises;
DROP TABLE IF EXISTS contact_money;
DROP TABLE IF EXISTS contact_files;
DROP TABLE IF EXISTS contact_rel;
DROP TABLE IF EXISTS contact_family;
DROP TABLE IF EXISTS contact_pref;
DROP TABLE IF EXISTS contact_trait;

-- 承诺模块曾向 todos 同步待办（person_id 绑定），一并清理并移除该列
DELETE FROM todos WHERE person_id IS NOT NULL;
ALTER TABLE todos DROP COLUMN person_id;

-- ===== 2. 联系人主表重建 =====
DROP TABLE IF EXISTS contacts;
CREATE TABLE contacts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,                 -- 显示名（姓名为空时取任一其他名字字段）
  first_name        TEXT,                          -- 姓名
  nickname          TEXT,                          -- 昵称
  childhood_name    TEXT,                          -- 小名
  former_name       TEXT,                          -- 曾用名
  english_name      TEXT,                          -- 英文名
  alias             TEXT,                          -- 别名
  gender            TEXT NOT NULL DEFAULT '',      -- 男/女/其他（必填）
  birthday_type     TEXT NOT NULL DEFAULT '',      -- ''=不知道年龄（跳过）| 'monthday'=只知月日 | 'full'=确切生日
  birthday_calendar TEXT NOT NULL DEFAULT 'solar', -- solar=阳历 | lunar=农历
  birth_year        INTEGER,                       -- 出生年（仅 full）
  birth_month       INTEGER,                       -- 1-12（monthday/full）
  birth_day         INTEGER,                       -- 1-31
  birthday_remind   INTEGER NOT NULL DEFAULT 0,    -- 创建年度生日提醒（进日历）
  is_deceased       INTEGER NOT NULL DEFAULT 0,    -- 标记为已逝者
  tags              TEXT NOT NULL DEFAULT '',      -- 人脉标签（CSV，词库 kind=rel_tag）
  peer_groups       TEXT NOT NULL DEFAULT '',      -- 人脉群组（CSV，词库 kind=rel_group）
  referrer_id       INTEGER,                       -- 引荐人（contacts.id）
  marriage          TEXT NOT NULL DEFAULT '',      -- ''|已婚|未婚|离婚|丧偶
  phone             TEXT,                          -- 主电话冗余（列表展示）
  note              TEXT,                          -- 备注
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_gender ON contacts(gender);

-- ===== 3. 联系方式（电话 / 电子邮件 / 联系地址，均可多个并带备注） =====
DROP TABLE IF EXISTS contact_contacts;
CREATE TABLE contact_contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  kind       TEXT NOT NULL,                 -- phones / emails / addresses
  value      TEXT NOT NULL,
  label      TEXT,                          -- 备注：个人 / 工作 / 家庭 / 公司…
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cc_person ON contact_contacts(person_id, kind);

-- ===== 4. 公司/组织与职位（值可多人共用，候选词存词库 rel_company / rel_position） =====
DROP TABLE IF EXISTS contact_work;
CREATE TABLE contact_work (
  person_id INTEGER PRIMARY KEY,
  company   TEXT,
  position  TEXT
);

-- ===== 5. 家庭关系（"对方是当前联系人的 ___"，称谓可自定义并存词库 rel_kin 复用） =====
DROP TABLE IF EXISTS contact_relatives;
CREATE TABLE contact_relatives (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  kin        TEXT NOT NULL,                 -- 称谓：母亲/父亲/爱人/儿子/女儿/同学/老师/同事/自定义
  name       TEXT NOT NULL,                 -- 对方姓名（或从联系人选择）
  ref_id     INTEGER,                       -- 对方也在联系人中时记其 id（可跳转）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_relatives_person ON contact_relatives(person_id);

-- ===== 6. 宠物（种类输入一次即入词库 pet_species 作为备选） =====
CREATE TABLE IF NOT EXISTS rel_pets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL,
  species       TEXT NOT NULL,
  name          TEXT NOT NULL,
  memorial_date TEXT,                       -- 宠物纪念日
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pets_person ON rel_pets(person_id);

-- ===== 7. 教育与成长（结构不变，随本次清空） =====
DROP TABLE IF EXISTS contact_edu;
CREATE TABLE contact_edu (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  school     TEXT, major TEXT, degree TEXT,
  start_year TEXT, end_year TEXT, story TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_edu_person ON contact_edu(person_id);

-- ===== 8. 词库种子：家庭关系称谓（可自行追加） =====
INSERT OR IGNORE INTO vocab(kind, word) VALUES
  ('rel_kin','母亲'),('rel_kin','父亲'),('rel_kin','爱人'),('rel_kin','儿子'),
  ('rel_kin','女儿'),('rel_kin','同学'),('rel_kin','老师'),('rel_kin','同事');
