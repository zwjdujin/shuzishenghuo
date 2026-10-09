-- 数字生活 · v0.2.8 数据库迁移
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.2.8.sql
-- 用途：待办优先级升级为 P0/P1/P2/P3（重要/紧急矩阵），新增两个独立维度用于筛选排序。

ALTER TABLE todos ADD COLUMN important INTEGER DEFAULT 0;
ALTER TABLE todos ADD COLUMN urgent INTEGER DEFAULT 0;

-- 历史数据回填：原来 high 视为「重要且紧急(P0)」，normal 视为「不重要不紧急(P3)」
UPDATE todos SET priority = 'P0', important = 1, urgent = 1 WHERE priority = 'high';
UPDATE todos SET priority = 'P3', important = 0, urgent = 0 WHERE priority = 'normal' OR priority IS NULL;

-- 索引：按优先级与清单筛选
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(list);