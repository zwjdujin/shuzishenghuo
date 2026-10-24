-- 数字生活 shuzishenghuo · 示例数据 v0.0.1
-- 执行：`wrangler d1 execute shuzishenghuo --remote --file=./seed.sql`
-- 包含 1 条「逾期」待办，方便首屏就能看到效果。清空示例见 README。

-- 外观/品牌（个人首页会读取）
INSERT OR IGNORE INTO app_settings(key, value) VALUES
  ('brand_name',   '数字生活'),
  ('brand_avatar', '数'),
  ('brand_tagline','把日子过成自己喜欢的样子'),
  ('theme',        'zhiyin'),
  ('font',         'default'),
  ('mode',         'auto');

-- 成长打卡：默认三大分类（看书→学习，运动→锻炼，睡觉→睡眠；已删除喝水/冥想）
-- 用户可在此基础上自行新增自定义分类
INSERT INTO habits(name, icon, color, target, unit, category, type, bed_time, rise_time, nap_time) VALUES
  ('学习', 'book', 'plum',  1, '次', '学习', 'normal', NULL,    NULL,    NULL),
  ('锻炼', 'fire', 'terra', 1, '次', '锻炼', 'normal', NULL,    NULL,    NULL),
  ('睡眠', 'moon', 'sand',  3, '项', '睡眠', 'sleep', '23:00', '07:00', '12:30-14:00');

-- 今日已打卡（让首页「今日完成」有数据）
INSERT INTO habit_logs(habit_id, log_date, done) VALUES
  ((SELECT id FROM habits WHERE name='学习'), date('now'), 1),
  ((SELECT id FROM habits WHERE name='锻炼'), date('now'), 1);
INSERT INTO habit_logs(habit_id, log_date, done, done_bed, done_rise, done_nap) VALUES
  ((SELECT id FROM habits WHERE name='睡眠'), date('now'), 1, 1, 0, 0);

-- 待办提醒（注意第 1 条是逾期项）
INSERT INTO todos(title, todo_date, todo_time, list, priority, note, remind, done) VALUES
  ('预约牙科检查',     date('now','-2 days'), '10:00', '健康', 'high', '带上医保卡',      1, 0),
  ('整理本周生活清单', date('now'),           NULL,    '生活', 'normal','先处理最重要的三件事', 0, 0),
  ('周末采购',         date('now','+2 days'), NULL,    '生活', 'normal','按待买清单购买',   0, 0),
  ('提交月度报告',     date('now','+5 days'), '18:00', '工作', 'high', NULL,              1, 0);

-- 我的账本
INSERT INTO transactions(flow, amount, category, txn_date, note) VALUES
  ('expense', 38.5,  '餐饮', date('now'),          '午饭'),
  ('expense', 12,    '交通', date('now','-1 day'), '公交'),
  ('income',  8500,  '工资', date('now','-3 days'),'本月工资'),
  ('expense', 199,   '购物', date('now','-5 days'),'买衣服');

-- 家庭药箱（含 1 条已过期，用于演示临期提醒）
INSERT INTO medicines(name, spec, quantity, expiry, note) VALUES
  ('布洛芬',   '0.3g*20', '2', '2026-12-01',        '退烧止痛'),
  ('维生素C', '100片',   '1', date('now','+40 days'),'日常补充'),
  ('感冒灵',   '10包',    '3', date('now','-10 days'),'已过期，请检查');

-- 日历中心：事件
INSERT INTO events(title, start, end, all_day, note) VALUES
  ('部门周会', datetime('now','localtime','+10 hours'), NULL, 0, '每周同步进度'),
  ('妈妈生日', date('now','+6 days'), NULL, 1, '提前准备礼物');

-- 人际关系（v0.4.0 新模型：名字六字段/生日三形态/标签群组/引荐人/婚姻）
INSERT INTO contacts(name, first_name, gender, birthday_type, birthday_calendar, birth_year, birth_month, birth_day, birthday_remind, tags, peer_groups, marriage, phone, note) VALUES
  ('张伟', '张伟', '男', 'full',     'solar', 1990, 3,  12, 1, '技术', '大学同学', '已婚', '13800001111', '大学同学'),
  ('李娜', '李娜', '女', 'monthday', 'solar', NULL, 7,  25, 0, '项目', '同事',     '未婚', '13800002222', '项目组'),
  ('妈妈', '',     '女', 'monthday', 'lunar', NULL, 11, 3,  1, '家人', '',         '已婚', '13800003333', '农历生日每年提醒');

-- 家庭关系示例（称谓已由 migrate-v0.4.0 预置到词库 rel_kin）
INSERT INTO contact_relatives(person_id, kin, name) VALUES
  ((SELECT id FROM contacts WHERE name='张伟'), '同事', '李娜');

-- 词库示例：人脉标签 / 群组
INSERT OR IGNORE INTO vocab(kind, word) VALUES
  ('rel_tag', '家人'), ('rel_tag', '朋友'), ('rel_tag', '同事'),
  ('rel_group', '家人'), ('rel_group', '大学同学'), ('rel_group', '同事');
