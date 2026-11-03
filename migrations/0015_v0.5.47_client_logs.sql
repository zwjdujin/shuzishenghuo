-- 0015 · v0.5.47 前端错误上报
-- 前端 fatal()/全局错误钩子把未捕获错误 POST 到 /api/client-log 落库（公开接口），
-- 系统信息页展示真实统计，替代此前的写死占位（「待同步 0 项 / 失败或冲突 0 项」）。
-- 行数滚动上限 200（写入端裁剪），防止无限增长。

CREATE TABLE IF NOT EXISTS client_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  level TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  url TEXT,
  ua TEXT
);
