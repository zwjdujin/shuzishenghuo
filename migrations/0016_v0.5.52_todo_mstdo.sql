-- 0016 · v0.5.52 待办微软 To Do 式改版（第一批：正式清单 / 星标 / 我的一天 / 已完成记录 / 步骤表）
-- 只加表加列，不动既有行；todos 旧行新列走默认值，零数据迁移风险。
-- repeat_rule 本批只落列与校验，重复生成功能第二批上线。

-- ===== 正式清单（微软 To Do 式：可新建/重命名/图标/颜色，替代硬编码 LISTS） =====
CREATE TABLE IF NOT EXISTS todo_lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '',   -- emoji 图标，空=默认图标
  color      TEXT NOT NULL DEFAULT '',   -- 预设色名（空=主题色）
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 播种：默认五清单 + 收编现有 todos.list 的去重值（幂等：同名已存在则跳过）
INSERT INTO todo_lists(name, sort_order) SELECT '生活', 0 WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE name='生活');
INSERT INTO todo_lists(name, sort_order) SELECT '工作', 1 WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE name='工作');
INSERT INTO todo_lists(name, sort_order) SELECT '健康', 2 WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE name='健康');
INSERT INTO todo_lists(name, sort_order) SELECT '学习', 3 WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE name='学习');
INSERT INTO todo_lists(name, sort_order) SELECT '家庭', 4 WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE name='家庭');
INSERT INTO todo_lists(name, sort_order)
SELECT DISTINCT list, 100 FROM todos
WHERE list IS NOT NULL AND list != ''
  AND NOT EXISTS (SELECT 1 FROM todo_lists WHERE name = todos.list);

-- ===== 步骤（微软 To Do「步骤」：任务内一级子项勾选，不嵌套） =====
CREATE TABLE IF NOT EXISTS todo_steps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_todo_steps_todo ON todo_steps(todo_id, sort_order, id);

-- ===== todos 加列（ALTER 先例 0003；迁移框架保证单次执行） =====
ALTER TABLE todos ADD COLUMN star INTEGER NOT NULL DEFAULT 0;        -- 星标「重要」（与 P0-P3 四象限独立并存）
ALTER TABLE todos ADD COLUMN completed_at TEXT;                      -- 完成时间（已完成视图排序）
ALTER TABLE todos ADD COLUMN my_day_date TEXT NOT NULL DEFAULT '';   -- 加入「我的一天」当天日期，过夜自然失效
ALTER TABLE todos ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT '';   -- 重复规则（第二批启用）：daily|weekdays|weekly:1,3|monthly:15|yearly:0214|every:14:d
