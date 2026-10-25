-- 数字生活 · v0.3.15 数据库迁移
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.3.15.sql
-- 用途：补记 contacts 的「籍贯 / 主页」两列。
--   人物档案「基础信息」模块自 v0.3.1 起就在读写 contacts.native / contacts.page，
--   但这两个列从未进入仓库的 schema/migration（线上库是当年手工加的），
--   用仓库结构新建的库执行「保存基础信息」会报 no such column: native。
-- 注意：若执行时报 duplicate column name 说明列已存在（如线上库），直接跳过即可。

ALTER TABLE contacts ADD COLUMN native TEXT;   -- 籍贯
ALTER TABLE contacts ADD COLUMN page TEXT;     -- 主页 / 名片链接
