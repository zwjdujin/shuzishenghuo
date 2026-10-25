-- 数字生活 · v0.2.2 数据库迁移
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.2.2.sql
-- 用途：新增登录会话表，用于「账户安全」页展示/登出各登录设备。

CREATE TABLE IF NOT EXISTS sessions (
  sid          TEXT PRIMARY KEY,
  user         TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user);