-- ============================================================
-- 数字生活 v0.6.0 · P3 功能整合迁移
-- 新增：分类预算 / 周期账单 / 一句话 memo / 服药计划与记录
-- 扩展：习惯频率目标（freq_type/freq_value）、联系人触达节奏
-- 幂等说明：本文件由 wrangler d1 migrations 记录只执行一次；
-- 全部为建新表与加列，不动旧数据。
-- ============================================================

-- ===== 分类月度预算（信封简化版）=====
CREATE TABLE IF NOT EXISTS budgets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT NOT NULL,
  month      TEXT NOT NULL,                 -- 'YYYY-MM'
  amount     REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category, month)
);

-- ===== 周期账单（房租/工资/会员，账本打开时懒生成）=====
CREATE TABLE IF NOT EXISTS recurring (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flow         TEXT NOT NULL CHECK(flow IN ('expense','income')),
  amount       REAL NOT NULL,
  category     TEXT,
  sub_category TEXT,
  account      TEXT DEFAULT '默认账户',
  note         TEXT,
  freq         TEXT NOT NULL DEFAULT 'monthly',   -- monthly | weekly | daily
  next_date    TEXT NOT NULL,                     -- 下次应记账日期
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring(active, next_date);

-- ===== 一句话 memo 流 =====
CREATE TABLE IF NOT EXISTS memos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '',       -- 逗号分隔，'#标签' 提取
  memo_date  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memos_date ON memos(memo_date);

-- ===== 服药计划 + 服药记录（提醒-确认-扣库存闭环）=====
CREATE TABLE IF NOT EXISTS med_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  dose        TEXT,                                -- '1 片' 等描述
  time_of_day TEXT NOT NULL,                       -- 'HH:MM'
  days        TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7', -- 周几，1=周一…7=周日
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_med_plans_med ON med_plans(medicine_id, active);

CREATE TABLE IF NOT EXISTS med_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id    INTEGER NOT NULL REFERENCES med_plans(id) ON DELETE CASCADE,
  log_date   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'taken',        -- taken | skipped
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plan_id, log_date)
);

-- ===== 习惯频率目标：每天 / 每周 N 次 / 每 N 天一次 =====
ALTER TABLE habits ADD COLUMN freq_type TEXT NOT NULL DEFAULT 'daily';   -- daily | weekly | interval
ALTER TABLE habits ADD COLUMN freq_value INTEGER NOT NULL DEFAULT 1;

-- ===== 联系人触达节奏（keep-in-touch）=====
ALTER TABLE contacts ADD COLUMN touch_cadence INTEGER NOT NULL DEFAULT 0; -- 0=关，否则天数
ALTER TABLE contacts ADD COLUMN last_touched TEXT;
