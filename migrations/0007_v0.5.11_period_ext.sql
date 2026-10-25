-- 0007 · v0.5.11 经期记录扩展：经量 5 档 + 血色/血质/痛经分型/其他症状
-- 旧表带 CHECK(flow IN (1,2,3))，SQLite 改不了 CHECK，需重建。
-- period_logs 无外键、也无子表引用它（0002 铁律不适用，但重建后仍须对账行数）。
-- flow 旧 1少/2中/3多 → 新 1极少/2偏少/3正常/4偏多/5极多：旧值整体 +1（上限 4，不冒充"极多"）。

CREATE TABLE period_logs_new(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL UNIQUE,
  end_date TEXT,
  flow INTEGER NOT NULL DEFAULT 3,          -- 1极少 2偏少 3正常 4偏多 5极多
  blood_color INTEGER,                      -- 1浅淡 2正常 3深红 4深黑；未记录 NULL
  blood_texture INTEGER,                    -- 1稀薄 2正常 3粘稠；未记录 NULL
  dysmenorrhea INTEGER NOT NULL DEFAULT 0,  -- 痛经 0无 1有
  pain_types TEXT,                          -- 痛经分型 CSV：胀痛/刺痛/冷痛/绞痛/坠痛/不知道啥痛就是痛
  symptoms TEXT,                            -- 其他症状 CSV（不含"其他"本身）
  symptom_other TEXT,                       -- 症状选"其他"时的自行填写
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO period_logs_new(id, start_date, end_date, flow, note, created_at)
  SELECT id, start_date, end_date, MIN(flow + 1, 4), note, created_at FROM period_logs;
DROP TABLE period_logs;
ALTER TABLE period_logs_new RENAME TO period_logs;
