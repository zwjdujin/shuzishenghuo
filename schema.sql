-- 数字生活 shuzishenghuo · D1 数据库结构 v0.0.1
-- 在 Cloudflare 上执行：`wrangler d1 execute shuzishenghuo --remote --file=./schema.sql`

PRAGMA foreign_keys = ON;

-- 应用设置（品牌名、头像字、副标题、主题色等，单行键值）
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 成长打卡：习惯定义
-- category：所属分类（学习/锻炼/睡眠/自定义名）
-- type：普通习惯 'normal' | 睡眠习惯 'sleep'
-- method（仅 normal 使用）：'count' 按次打卡 / 'duration' 按时间（累计时长）打卡
-- target / unit：目标值与单位（如 3 次、60 分钟）
-- bed_time / rise_time：睡眠类型——几点前睡/起算早睡早起
-- nap_time：睡眠类型——午睡有效区间（如 12:30-14:00）
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
-- normal(count)：done = 已打卡次数
-- normal(duration)：done = 已累计分钟数
-- sleep：done_bed / done_rise / done_nap 各 0/1
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

-- 待办提醒
-- priority：P0 重要且紧急 / P1 重要不紧急 / P2 紧急不重要 / P3 不重要不紧急
-- important / urgent：优先级背后的两个独立维度（1/0），用于筛选与排序
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 我的账本（v0.5.0：转账 + 两级分类 + 时间/联系人/物品）
CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flow         TEXT NOT NULL CHECK(flow IN ('expense','income','transfer')),
  amount       REAL NOT NULL,
  category     TEXT,
  sub_category TEXT,                            -- 二级分类（挂在 category 之下）
  txn_date     TEXT NOT NULL,
  txn_time     TEXT,                            -- 'HH:MM'；NULL 表示未记录时分
  account      TEXT DEFAULT '默认账户',          -- 支出/收入：付款账户；转账：转出账户
  to_account   TEXT,                            -- 转账：转入账户
  contact_id   INTEGER,                         -- 关联「人际关系」联系人
  item         TEXT,                            -- 物品（预留）
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 账本自定义分类（v0.5.0：支出/收入两级分类 + 拖动排序）
CREATE TABLE IF NOT EXISTS txn_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  flow       TEXT NOT NULL CHECK(flow IN ('expense','income')),
  name       TEXT NOT NULL,
  parent_id  INTEGER,                          -- NULL = 一级分类；否则为父分类 id
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 家庭药箱
CREATE TABLE IF NOT EXISTS medicines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  spec       TEXT,
  quantity   TEXT,
  expiry     TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 日历中心：事件
-- calendar：所属日历（工作/生活/家庭/健康），用于颜色区分
-- color：自定义颜色（可选，优先取 calendar 对应色）
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

-- 人际关系（v0.4.0 重建）
-- 名字六字段任选其一必填，name 为显示名；生日三形态（未知/只知月日/确切）+ 阳历或农历
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
CREATE INDEX IF NOT EXISTS idx_contacts_gender ON contacts(gender);

-- 联系方式：电话 / 电子邮件 / 联系地址（可多个，带备注标签）
CREATE TABLE IF NOT EXISTS contact_contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  kind       TEXT NOT NULL,               -- phones / emails / addresses
  value      TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cc_person ON contact_contacts(person_id, kind);

-- 公司/组织与职位（值可多人共用，候选词在词库 rel_company / rel_position）
CREATE TABLE IF NOT EXISTS contact_work (
  person_id INTEGER PRIMARY KEY,
  company   TEXT,
  position  TEXT
);

-- 家庭关系："对方是当前联系人的 ___"（称谓词库 rel_kin 可扩展）
CREATE TABLE IF NOT EXISTS contact_relatives (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  kin        TEXT NOT NULL,
  name       TEXT NOT NULL,
  ref_id     INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_relatives_person ON contact_relatives(person_id);

-- 宠物（种类候选词在词库 pet_species）
CREATE TABLE IF NOT EXISTS rel_pets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL,
  species       TEXT NOT NULL,
  name          TEXT NOT NULL,
  memorial_date TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pets_person ON rel_pets(person_id);

-- 心情一句话（占位，避免 schema 与迁移不一致）
-- 登录会话（账户安全：展示/登出各登录设备）
CREATE TABLE IF NOT EXISTS sessions (
  sid          TEXT PRIMARY KEY,
  user         TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

-- 索引（加速按日期/完成状态查询）
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_todos_date      ON todos(todo_date);
CREATE INDEX IF NOT EXISTS idx_todos_done      ON todos(done);
CREATE INDEX IF NOT EXISTS idx_txn_date        ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_txncat_flow     ON txn_categories(flow, parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_events_start     ON events(start);
