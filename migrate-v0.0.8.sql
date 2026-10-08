-- 数字生活 shuzishenghuo · 迁移至 v0.1.1（成长打卡分类重构）
-- 前提：已先执行 ALTER 增加 habits(category/type/bed_time/rise_time) 与 habit_logs(done_bed/done_rise)
-- 本文件只做数据映射，可重复执行（打卡用 ON CONFLICT DO NOTHING 防重复）

-- 1) 把旧示例习惯映射到新分类
--    看书 → 学习；运动 → 锻炼；睡觉 → 早睡早起（sleep 类型，默认 23:00 睡 / 07:00 起）
UPDATE habits SET category='学习',   name='学习',   icon='book', color='plum',  type='normal', bed_time=NULL,    rise_time=NULL  WHERE name='阅读';
UPDATE habits SET category='锻炼',   name='锻炼',   icon='fire', color='terra', type='normal', bed_time=NULL,    rise_time=NULL  WHERE name='运动';
UPDATE habits SET category='早睡早起', name='早睡早起', icon='moon', color='sand', type='sleep', bed_time='23:00', rise_time='07:00' WHERE name='早睡';

-- 2) 删除已废弃的「喝水」（冥想原本就未建）
DELETE FROM habits WHERE name='喝水';

-- 3) 清理已无对应习惯的打卡记录
DELETE FROM habit_logs WHERE habit_id NOT IN (SELECT id FROM habits);

-- 4) 补今天的打卡示例（按名称引用，幂等）
INSERT INTO habit_logs(habit_id, log_date, done)
  SELECT id, date('now'), 1 FROM habits WHERE name='学习'
  ON CONFLICT(habit_id, log_date) DO NOTHING;
INSERT INTO habit_logs(habit_id, log_date, done)
  SELECT id, date('now'), 1 FROM habits WHERE name='锻炼'
  ON CONFLICT(habit_id, log_date) DO NOTHING;
INSERT INTO habit_logs(habit_id, log_date, done, done_bed, done_rise)
  SELECT id, date('now'), 1, 1, 0 FROM habits WHERE name='早睡早起'
  ON CONFLICT(habit_id, log_date) DO NOTHING;
