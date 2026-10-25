-- ============================================================
-- 数字生活 v0.5.5 · 外键约束迁移
-- SQLite 不能 ALTER TABLE 加外键，需「建新表→搬数据→删旧表→改名」。
-- 执行前先清洗悬挂引用，保证搬运时外键即时校验通过；
-- PRAGMA defer_foreign_keys 让重建过程中的中间状态不触发校验（提交时统一检查）。
-- 幂等性说明：本文件由 wrangler d1 migrations 记录，只执行一次；
-- 若需手动重跑（不推荐），必须确认 d1_migrations 中已清掉本条记录。
-- ============================================================

PRAGMA defer_foreign_keys = true;

-- ===== 1. 清洗悬挂引用（孤儿行删除、失效引用置 NULL）=====
DELETE FROM habit_logs      WHERE habit_id NOT IN (SELECT id FROM habits);
DELETE FROM contact_contacts WHERE person_id NOT IN (SELECT id FROM contacts);
DELETE FROM contact_edu     WHERE person_id NOT IN (SELECT id FROM contacts);
DELETE FROM contact_work    WHERE person_id NOT IN (SELECT id FROM contacts);
DELETE FROM contact_relatives WHERE person_id NOT IN (SELECT id FROM contacts);
DELETE FROM rel_pets        WHERE person_id NOT IN (SELECT id FROM contacts);
UPDATE contacts        SET referrer_id = NULL WHERE referrer_id IS NOT NULL AND referrer_id NOT IN (SELECT id FROM contacts);
UPDATE contact_relatives SET ref_id     = NULL WHERE ref_id     IS NOT NULL AND ref_id     NOT IN (SELECT id FROM contacts);
UPDATE transactions    SET contact_id  = NULL WHERE contact_id  IS NOT NULL AND contact_id  NOT IN (SELECT id FROM contacts);
UPDATE txn_categories  SET parent_id   = NULL WHERE parent_id   IS NOT NULL AND parent_id   NOT IN (SELECT id FROM txn_categories);

-- ===== 2. habit_logs：habit_id → habits 级联删除 =====
CREATE TABLE habit_logs_fk (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date   TEXT NOT NULL,
  done       REAL DEFAULT 0,
  done_bed   INTEGER DEFAULT 0,
  done_rise  INTEGER DEFAULT 0,
  done_nap   INTEGER DEFAULT 0,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(habit_id, log_date)
);
INSERT INTO habit_logs_fk(id, habit_id, log_date, done, done_bed, done_rise, done_nap, note, created_at)
  SELECT id, habit_id, log_date, done, done_bed, done_rise, done_nap, note, created_at FROM habit_logs;
DROP TABLE habit_logs;
ALTER TABLE habit_logs_fk RENAME TO habit_logs;
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);

-- ===== 3. contacts：referrer_id 自引用 → 置 NULL =====
CREATE TABLE contacts_fk (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  first_name        TEXT,
  nickname          TEXT,
  childhood_name    TEXT,
  former_name       TEXT,
  english_name      TEXT,
  alias             TEXT,
  gender            TEXT NOT NULL DEFAULT '',
  birthday_type     TEXT NOT NULL DEFAULT '',
  birthday_calendar TEXT NOT NULL DEFAULT 'solar',
  birth_year        INTEGER,
  birth_month       INTEGER,
  birth_day         INTEGER,
  birthday_remind   INTEGER NOT NULL DEFAULT 0,
  is_deceased       INTEGER NOT NULL DEFAULT 0,
  tags              TEXT NOT NULL DEFAULT '',
  peer_groups       TEXT NOT NULL DEFAULT '',
  referrer_id       INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  marriage          TEXT NOT NULL DEFAULT '',
  phone             TEXT,
  note              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO contacts_fk SELECT * FROM contacts;
DROP TABLE contacts;
ALTER TABLE contacts_fk RENAME TO contacts;
CREATE INDEX IF NOT EXISTS idx_contacts_gender ON contacts(gender);

-- ===== 4. contact_contacts / contact_work / contact_edu / contact_relatives / rel_pets =====
CREATE TABLE contact_contacts_fk (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  value      TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO contact_contacts_fk SELECT * FROM contact_contacts;
DROP TABLE contact_contacts;
ALTER TABLE contact_contacts_fk RENAME TO contact_contacts;
CREATE INDEX IF NOT EXISTS idx_cc_person ON contact_contacts(person_id, kind);

CREATE TABLE contact_work_fk (
  person_id INTEGER PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  company   TEXT,
  position  TEXT
);
INSERT INTO contact_work_fk SELECT * FROM contact_work;
DROP TABLE contact_work;
ALTER TABLE contact_work_fk RENAME TO contact_work;

CREATE TABLE contact_edu_fk (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  school      TEXT, major TEXT, degree TEXT,
  start_year  TEXT, end_year TEXT, story TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO contact_edu_fk SELECT * FROM contact_edu;
DROP TABLE contact_edu;
ALTER TABLE contact_edu_fk RENAME TO contact_edu;
CREATE INDEX IF NOT EXISTS idx_edu_person ON contact_edu(person_id);

CREATE TABLE contact_relatives_fk (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kin        TEXT NOT NULL,
  name       TEXT NOT NULL,
  ref_id     INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO contact_relatives_fk SELECT * FROM contact_relatives;
DROP TABLE contact_relatives;
ALTER TABLE contact_relatives_fk RENAME TO contact_relatives;
CREATE INDEX IF NOT EXISTS idx_relatives_person ON contact_relatives(person_id);

CREATE TABLE rel_pets_fk (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  species       TEXT NOT NULL,
  name          TEXT NOT NULL,
  memorial_date TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO rel_pets_fk SELECT * FROM rel_pets;
DROP TABLE rel_pets;
ALTER TABLE rel_pets_fk RENAME TO rel_pets;
CREATE INDEX IF NOT EXISTS idx_pets_person ON rel_pets(person_id);

-- ===== 5. transactions：contact_id → 置 NULL =====
CREATE TABLE transactions_fk (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flow         TEXT NOT NULL CHECK(flow IN ('expense','income','transfer')),
  amount       REAL NOT NULL,
  category     TEXT,
  sub_category TEXT,
  txn_date     TEXT NOT NULL,
  txn_time     TEXT,
  account      TEXT DEFAULT '默认账户',
  to_account   TEXT,
  contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  item         TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO transactions_fk SELECT * FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_fk RENAME TO transactions;
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);

-- ===== 6. txn_categories：parent_id → 级联删除（与端点行为一致：删一级分类连二级一起删） =====
CREATE TABLE txn_categories_fk (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  flow       TEXT NOT NULL CHECK(flow IN ('expense','income')),
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES txn_categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO txn_categories_fk SELECT * FROM txn_categories;
DROP TABLE txn_categories;
ALTER TABLE txn_categories_fk RENAME TO txn_categories;
CREATE INDEX IF NOT EXISTS idx_txncat_flow ON txn_categories(flow, parent_id, sort_order);
