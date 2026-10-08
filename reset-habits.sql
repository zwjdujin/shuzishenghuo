-- 清掉重复的示例习惯，重置为 3 个标准分类（与 seed.sql 一致）
DELETE FROM habit_logs;
DELETE FROM habits;
INSERT INTO habits(name, icon, color, target, unit, category, type, bed_time, rise_time) VALUES
  ('学习',   'book', 'plum',  1, '次', '学习',     'normal', NULL,     NULL),
  ('锻炼',   'fire', 'terra', 1, '次', '锻炼',     'normal', NULL,     NULL),
  ('早睡早起', 'moon', 'sand', 1, '次', '早睡早起', 'sleep', '23:00', '07:00');
INSERT INTO habit_logs(habit_id, log_date, done) VALUES
  ((SELECT id FROM habits WHERE name='学习'),   date('now'), 1),
  ((SELECT id FROM habits WHERE name='锻炼'),   date('now'), 1);
INSERT INTO habit_logs(habit_id, log_date, done, done_bed, done_rise) VALUES
  ((SELECT id FROM habits WHERE name='早睡早起'), date('now'), 1, 1, 0);
