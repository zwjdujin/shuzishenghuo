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
CREATE TABLE IF NOT EXISTS todos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  todo_date  TEXT,
  todo_time  TEXT,
  list       TEXT DEFAULT '生活',
  priority   TEXT DEFAULT 'normal',
  note       TEXT,
  remind     INTEGER DEFAULT 0,
  done       INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 我的账本
CREATE TABLE IF NOT EXISTS transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  flow       TEXT NOT NULL CHECK(flow IN ('expense','income')),
  amount     REAL NOT NULL,
  category   TEXT,
  txn_date   TEXT NOT NULL,
  note       TEXT,
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

-- 人际关系
CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  relation   TEXT,
  birthday   TEXT,
  phone      TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
CREATE INDEX IF NOT EXISTS idx_events_start     ON events(start);
