-- v0.3.1：Web Push 订阅表（支撑「后台到点推送」B 档）
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
