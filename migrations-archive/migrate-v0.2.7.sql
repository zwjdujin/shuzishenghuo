-- 数字生活 · v0.2.7 数据库迁移
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.2.7.sql
-- 用途：日历中心事件表补充「所属日历 / 颜色 / 地点」字段，支撑周历月历与颜色分类。

ALTER TABLE events ADD COLUMN calendar TEXT DEFAULT '生活';
ALTER TABLE events ADD COLUMN color TEXT;
ALTER TABLE events ADD COLUMN location TEXT;

-- 待办：补充排序与提醒时间（若已存在则忽略）
ALTER TABLE todos ADD COLUMN sort_order INTEGER DEFAULT 0;

-- 账本：补充账户字段，便于按账户统计
ALTER TABLE transactions ADD COLUMN account TEXT DEFAULT '默认账户';