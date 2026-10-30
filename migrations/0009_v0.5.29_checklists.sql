-- 0009 · v0.5.29 待办清单（自定义清单 + 物品/事项勾选）
-- 只新增表，不动既有表，无重建/级联风险。

-- 清单（如「徒步出行装备清单」「过年回家物品清单」）
CREATE TABLE IF NOT EXISTS checklist_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 清单条目（未完成的排前面由查询排序保证；done=1 勾选完成）
CREATE TABLE IF NOT EXISTS checklist_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES checklist_groups(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_group ON checklist_items(group_id, done, id);
