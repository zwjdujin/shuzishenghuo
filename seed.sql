-- 数字生活 shuzishenghuo · 示例数据 v0.0.1
-- 执行：`wrangler d1 execute shuzishenghuo --remote --file=./seed.sql`
-- 包含 1 条「逾期」待办，方便首屏就能看到效果。清空示例见 README。

-- 外观/品牌（个人首页会读取）
INSERT OR IGNORE INTO app_settings(key, value) VALUES
  ('brand_name',   '数字生活'),
  ('brand_avatar', '数'),
  ('brand_tagline','把日子过成自己喜欢的样子'),
  ('theme',        'plum');

-- 成长打卡：习惯
INSERT INTO habits(name, icon, color, target, unit) VALUES
  ('喝水', 'drop',   'sage',  8,   '杯'),
  ('阅读', 'book',   'plum',  1,   '章'),
  ('运动', 'fire',   'terra', 30,  '分钟'),
  ('早睡', 'moon',   'sand',  1,   '次');

-- 今日已打卡（让首页「今日完成」有数据）
INSERT INTO habit_logs(habit_id, log_date, done) VALUES
  (1, date('now'), 1),
  (2, date('now'), 1),
  (3, date('now'), 1);

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

-- 人际关系
INSERT INTO contacts(name, relation, birthday, phone, note) VALUES
  ('张伟', '朋友', '1990-03-12', NULL, '大学同学'),
  ('李娜', '同事', '1988-07-25', NULL, '项目组'),
  ('妈妈', '家人', '1965-11-03', NULL, '下月生日');
