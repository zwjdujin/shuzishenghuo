-- 数字生活 · 数据库结构文档（仅供参考展示用）
-- ⚠️ 新环境/迁移一律使用 migrations/ 目录：wrangler d1 migrations apply shuzishenghuo --remote
-- 本文件与 migrations/0001_baseline_v0.5.4.sql 内容保持同步（勿在此另行修改结构）。
-- 历史迁移已归档至 migrations-archive/。
-- 新环境统一使用：wrangler d1 migrations apply shuzishenghuo --remote/--local
-- ============================================================

-- 应用设置（品牌、外观、管理员自定义密码哈希等，键值表）
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 成长打卡：习惯定义（type: normal | sleep；method: count | duration）
CREATE TABLE IF NOT EXISTS habits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT 'sprout',
  color      TEXT DEFAULT 'sage',
  target     REAL DEFAULT 1,
  unit       TEXT DEFAULT '次',
  category   TEXT DEFAULT '自定义',
  type       TEXT DEFAULT 'normal',
  method     TEXT DEFAULT 'count',
  bed_time   TEXT,
  rise_time  TEXT,
  nap_time   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 成长打卡：每日打卡记录（每习惯每天一条）
CREATE TABLE IF NOT EXISTS habit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id   INTEGER NOT NULL,
  log_date   TEXT NOT NULL,
  done       REAL DEFAULT 0,
  done_bed   INTEGER DEFAULT 0,
  done_rise  INTEGER DEFAULT 0,
  done_nap   INTEGER DEFAULT 0,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(habit_id, log_date)
);

-- 待办提醒（P0-P3 四象限优先级；sort_order 为列表内排序预留）
CREATE TABLE IF NOT EXISTS todos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  todo_date  TEXT,
  todo_time  TEXT,
  list       TEXT DEFAULT '生活',
  priority   TEXT DEFAULT 'P3',
  important  INTEGER DEFAULT 0,
  urgent     INTEGER DEFAULT 0,
  note       TEXT,
  remind     INTEGER DEFAULT 0,
  done       INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 我的账本（v0.5.0：转账 + 两级分类 + 时间/联系人/物品）
CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flow         TEXT NOT NULL CHECK(flow IN ('expense','income','transfer')),
  amount       REAL NOT NULL,
  category     TEXT,
  sub_category TEXT,
  txn_date     TEXT NOT NULL,
  txn_time     TEXT,
  account      TEXT DEFAULT '默认账户',
  to_account   TEXT,
  contact_id   INTEGER,
  item         TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 账本自定义分类（v0.5.0：支出/收入两级分类 + 拖动排序 + 前端显示开关）
CREATE TABLE IF NOT EXISTS txn_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  flow       TEXT NOT NULL CHECK(flow IN ('expense','income')),
  name       TEXT NOT NULL,
  parent_id  INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 家庭药箱（v0.3.7 起扩充：功效/剂型/库存/价位/处方等）
CREATE TABLE IF NOT EXISTS medicines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  spec         TEXT,
  quantity     TEXT,
  expiry       TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  efficacy     TEXT,
  dosage       TEXT,
  category     TEXT DEFAULT '其他',
  location     TEXT DEFAULT '客厅药箱',
  manufacturer TEXT,
  form         TEXT,
  stock        INTEGER DEFAULT 1,
  stock_min    INTEGER DEFAULT 1,
  for_whom     TEXT DEFAULT '通用',
  rx           INTEGER DEFAULT 0,
  open_date    TEXT,
  price        REAL
);

-- 日历中心：事件
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  start      TEXT NOT NULL,
  end        TEXT,
  all_day    INTEGER DEFAULT 0,
  calendar   TEXT DEFAULT '生活',
  color      TEXT,
  location   TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 人际关系（v0.4.0 重建）：联系人主表
CREATE TABLE IF NOT EXISTS contacts (
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
  referrer_id       INTEGER,
  marriage          TEXT NOT NULL DEFAULT '',
  phone             TEXT,
  note              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 联系方式（电话/邮箱/地址，可多条）
CREATE TABLE IF NOT EXISTS contact_contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  value      TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 公司/组织与职位
CREATE TABLE IF NOT EXISTS contact_work (
  person_id INTEGER PRIMARY KEY,
  company   TEXT,
  position  TEXT
);

-- 教育经历
CREATE TABLE IF NOT EXISTS contact_edu (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   INTEGER NOT NULL,
  school      TEXT, major TEXT, degree TEXT,
  start_year  TEXT, end_year TEXT, story TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 家庭关系（kin 称谓；ref_id 可指向另一联系人）
CREATE TABLE IF NOT EXISTS contact_relatives (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  kin        TEXT NOT NULL,
  name       TEXT NOT NULL,
  ref_id     INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 宠物
CREATE TABLE IF NOT EXISTS rel_pets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL,
  species       TEXT NOT NULL,
  name          TEXT NOT NULL,
  memorial_date TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 词库（称谓/标签/群组/公司/职位/宠物种类等候选词；v0.5.1 加 sort_order）
CREATE TABLE IF NOT EXISTS vocab (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  word       TEXT NOT NULL,
  hits       INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sort_order INTEGER
);

-- 登录会话（账户安全：展示/登出各登录设备）
CREATE TABLE IF NOT EXISTS sessions (
  sid          TEXT PRIMARY KEY,
  user         TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

-- Web Push 订阅（每设备浏览器一条）
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== 索引（与线上实际索引一致） =====
CREATE INDEX IF NOT EXISTS idx_contacts_gender   ON contacts(gender);
CREATE INDEX IF NOT EXISTS idx_cc_person         ON contact_contacts(person_id, kind);
CREATE INDEX IF NOT EXISTS idx_edu_person        ON contact_edu(person_id);
CREATE INDEX IF NOT EXISTS idx_relatives_person  ON contact_relatives(person_id);
CREATE INDEX IF NOT EXISTS idx_pets_person       ON rel_pets(person_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date   ON habit_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_todos_date        ON todos(todo_date);
CREATE INDEX IF NOT EXISTS idx_todos_done        ON todos(done);
CREATE INDEX IF NOT EXISTS idx_txn_date          ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_txncat_flow       ON txn_categories(flow, parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_events_start      ON events(start);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);
CREATE INDEX IF NOT EXISTS idx_medicines_expiry  ON medicines(expiry);
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions(user);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_unique ON vocab(kind, word);

-- ===== 预置数据（词库候选词 + 账本默认分类）=====
-- vocab 有 (kind,word) 唯一索引，INSERT OR IGNORE 天然幂等
INSERT OR IGNORE INTO vocab(kind, word) VALUES
  ('rel_kin','母亲'),('rel_kin','父亲'),('rel_kin','爱人'),('rel_kin','儿子'),
  ('rel_kin','女儿'),('rel_kin','同学'),('rel_kin','老师'),('rel_kin','同事');
INSERT OR IGNORE INTO vocab(kind, word) VALUES
  ('rel_tag','徒步'),('rel_tag','医生'),('rel_tag','喝茶'),('rel_tag','书画'),('rel_tag','一技之长'),
  ('rel_group','家人'),('rel_group','亲戚'),('rel_group','同学'),('rel_group','同事'),('rel_group','客户');

-- 账本默认分类：逐行判重（与 v0.5.0 迁移同款写法，幂等且不覆盖用户自定义）
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','餐饮',NULL,0 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='餐饮' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','零食',NULL,1 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='零食' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','美妆',NULL,2 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='美妆' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','烟酒',NULL,3 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='烟酒' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','日常',NULL,4 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='日常' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','购物',NULL,5 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='购物' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','交通',NULL,6 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='交通' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','娱乐',NULL,7 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='娱乐' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','社交',NULL,8 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='社交' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','装修',NULL,9 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='装修' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','旅游',NULL,10 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='旅游' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','医疗',NULL,11 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='医疗' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','学习',NULL,12 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='学习' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'expense','其他',NULL,13 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='expense' AND name='其他' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','礼金',NULL,0 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='礼金' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','理财',NULL,1 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='理财' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','报销',NULL,2 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='报销' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','工资',NULL,3 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='工资' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','奖金',NULL,4 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='奖金' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','生活费',NULL,5 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='生活费' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','外快兼职',NULL,6 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='外快兼职' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','退款',NULL,7 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='退款' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','投资收益',NULL,8 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='投资收益' AND parent_id IS NULL);
INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT 'income','其他',NULL,9 WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow='income' AND name='其他' AND parent_id IS NULL);
