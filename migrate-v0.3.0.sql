-- 数字生活 · v0.3.0 数据库迁移
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.3.0.sql
-- 用途：联系人新增「生日是否在日历中显示」开关。

ALTER TABLE contacts ADD COLUMN show_in_calendar INTEGER DEFAULT 0;