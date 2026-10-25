-- 数字生活 · v0.2.1 数据库迁移
-- 在 Cloudflare 上执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.2.1.sql
-- 用途：扩展打卡数据模型（按次/按时长、睡眠三件套），并将旧「早睡早起」分类更名为「睡眠」。

-- 1) habits 增加 method（按次/按时长）与 nap_time（午睡区间）
ALTER TABLE habits ADD COLUMN method TEXT DEFAULT 'count';
ALTER TABLE habits ADD COLUMN nap_time TEXT;

-- 2) habit_logs 增加 done_nap（午睡打卡项）
ALTER TABLE habit_logs ADD COLUMN done_nap INTEGER DEFAULT 0;

-- 3) 将旧「早睡早起」分类更名为「睡眠」，补充午睡时间段默认值
UPDATE habits SET category='睡眠', nap_time='12:30-14:00' WHERE category='早睡早起';
