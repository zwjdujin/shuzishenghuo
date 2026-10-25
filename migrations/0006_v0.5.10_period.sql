-- 0006 · v0.5.10 经期记录（日历中心 · 经期标签页）
-- 一次经期一行：start_date 唯一；end_date 为空表示进行中。
-- 周期长度 = 相邻两次 start_date 之差；预测取最近几次平均，前端渲染、不落库。
-- 业务数据：参与备份/清空（data/_tables.js 补中文名即可）。

CREATE TABLE IF NOT EXISTS period_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL UNIQUE,     -- 经期开始日 YYYY-MM-DD
  end_date   TEXT,                     -- 结束日，进行中为 NULL
  flow       INTEGER NOT NULL DEFAULT 2 CHECK(flow IN (1,2,3)),  -- 量 1少/2中/3多
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('period_visible', '1');
