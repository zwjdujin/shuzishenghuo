-- 数字生活 · v0.3.7 数据库迁移
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.3.7.sql
-- 用途：家庭药箱模块完整化（录入 / 药品一览 / 临期一览 / 过期一览 + 分类·库存·位置）

-- ===== 1. medicines 扩展 =====
-- 原表：id / name / spec / quantity / expiry / note / created_at
-- 说明：原 quantity 字段语义模糊（既像用量又像库存），保留兼容，新数据统一走 dosage(用量) + stock(库存)

ALTER TABLE medicines ADD COLUMN efficacy TEXT;          -- 功效：主治 / 作用
ALTER TABLE medicines ADD COLUMN dosage TEXT;            -- 用量：用法用量，如「每次1片，每日3次」
ALTER TABLE medicines ADD COLUMN category TEXT DEFAULT '其他';   -- 分类：感冒发热/肠胃消化/外伤急救…
ALTER TABLE medicines ADD COLUMN location TEXT DEFAULT '客厅药箱';-- 存放位置：药箱/床头/冰箱/随身包
ALTER TABLE medicines ADD COLUMN manufacturer TEXT;     -- 生产厂家
ALTER TABLE medicines ADD COLUMN form TEXT;              -- 剂型：片剂/胶囊/颗粒/口服液/软膏…
ALTER TABLE medicines ADD COLUMN stock INTEGER DEFAULT 1;       -- 库存数量（盒/瓶/支）
ALTER TABLE medicines ADD COLUMN stock_min INTEGER DEFAULT 1;   -- 库存下限，低于则提醒补货
ALTER TABLE medicines ADD COLUMN for_whom TEXT DEFAULT '通用';  -- 适用人群：通用/成人/儿童/老人/孕妇
ALTER TABLE medicines ADD COLUMN rx INTEGER DEFAULT 0;         -- 是否处方药 0/1（1 显示「处方」标记）
ALTER TABLE medicines ADD COLUMN open_date TEXT;         -- 开封日期（开封后效期会缩短）
ALTER TABLE medicines ADD COLUMN price REAL;             -- 参考单价（元），用于估算库存价值

-- 索引：有效期是本模块最高频的筛选/排序维度
CREATE INDEX IF NOT EXISTS idx_medicines_expiry ON medicines(expiry);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);

-- ===== 2. 示例数据 =====
-- 便于首次打开即可看到完整效果；不需要可在页面里逐条删除
DELETE FROM medicines;  -- 幂等：避免重复执行迁移时叠加

INSERT INTO medicines
  (name, efficacy, spec, dosage, form, expiry, category, location, manufacturer, stock, stock_min, for_whom, rx, open_date, price, quantity, note)
VALUES
  ('布洛芬缓释胶囊', '解热镇痛，用于头痛、牙痛、关节痛及退热', '0.3g×20粒', '每次1粒，每日2次，饭后温水送服', '胶囊', '2027-08-15', '感冒发热', '客厅药箱', '中美天津史克', 2, 1, '成人', 1, NULL, 18.5, NULL, '38.5℃以上或疼痛时服用'),
  ('连花清瘟胶囊', '清瘟解毒，用于流行性感冒', '0.35g×24粒', '每次4粒，每日3次', '胶囊', '2026-12-20', '感冒发热', '客厅药箱', '以岭药业', 3, 1, '通用', 0, NULL, 23.8, NULL, '流感高发期常备'),
  ('蒙脱石散', '止泻，用于急慢性腹泻', '3g×10袋', '每次1袋，每日3次，冲服', '散剂', '2027-03-02', '肠胃消化', '客厅药箱', '博福-益普生', 1, 1, '通用', 0, NULL, 26.0, NULL, '空腹服用，与其他药间隔2小时'),
  ('健胃消食片', '健胃消食，用于脾胃虚弱、消化不良', '0.8g×32片', '每次3片，每日3次', '片剂', '2026-11-28', '肠胃消化', '厨房抽屉', '江中药业', 4, 2, '通用', 0, NULL, 12.0, NULL, '饭后服用'),
  ('阿莫西林胶囊', '抗生素，用于细菌感染引起的呼吸道感染', '0.25g×24粒', '每次2粒，每日3次', '胶囊', '2026-10-28', '心脑血管', '客厅药箱', '石药集团', 1, 1, '成人', 1, NULL, 15.6, NULL, '⚠ 需遵医嘱，务必吃完整个疗程'),
  ('复方氨酚烷胺片', '缓解感冒引起的头痛、流涕、四肢酸痛', '12片', '每次1片，每日2次', '片剂', '2026-11-05', '感冒发热', '客厅药箱', '吉林敖东', 2, 1, '成人', 0, NULL, 9.9, NULL, '感冒高发季常备'),
  ('碘伏消毒液', '皮肤消毒，用于伤口、擦伤处理', '100ml', '外用，棉签蘸取擦拭伤口', '外用液体', '2027-05-10', '外伤急救', '卫生间镜柜', '利尔康', 1, 1, '通用', 0, '2026-09-20', 6.8, NULL, '开封后建议3个月内用完'),
  ('创可贴', '覆盖创口，保护伤口', '100片/盒', '外用，贴于伤口处', '贴剂', '2028-01-01', '外伤急救', '客厅药箱', '云南白药', 6, 3, '通用', 0, NULL, 14.0, NULL, '多囤两盒，消耗快'),
  ('999 感冒灵颗粒', '解热镇痛，用于感冒引起的头痛发热', '10g×9袋', '每次1袋，每日3次，开水冲服', '颗粒', '2026-10-25', '感冒发热', '客厅药箱', '华润三九', 5, 2, '通用', 0, NULL, 16.8, NULL, '注意多喝水'),
  ('开塞露', '润肠通便，用于便秘', '20ml×6支', '每次1支，开塞露通便', '外用液体', '2027-01-15', '肠胃消化', '客厅药箱', '上海运佳', 2, 1, '通用', 0, NULL, 8.5, NULL, NULL),
  ('医用外科口罩', '防护呼吸道飞沫', '50只/盒', '外出佩戴', '其他', '2027-06-30', '其他', '玄关抽屉', '稳健医疗', 2, 1, '通用', 0, NULL, 22.0, NULL, NULL),
  ('开塞露（过期）', '润肠通便（已过期，请丢弃）', '20ml×6支', '每次1支', '外用液体', '2026-06-30', '肠胃消化', '客厅药箱', '上海运佳', 1, 1, '通用', 0, NULL, 8.5, NULL, '过期示例数据，可直接删除'),
  ('板蓝根颗粒（临期）', '清热解毒，用于风热感冒', '10g×20袋', '每次1袋，每日3次', '颗粒', '2026-11-18', '感冒发热', '客厅药箱', '白云山', 3, 1, '通用', 0, NULL, 19.9, NULL, NULL),
  ('维生素C片', '补充维生素C，增强免疫力', '100片', '每次1片，每日1次', '片剂', '2027-09-30', '维生素保健', '客厅药箱', '汤臣倍健', 2, 1, '通用', 0, NULL, 29.9, NULL, '饭后服用'),
  ('风油精', '清凉止痛，用于蚊虫叮咬、头痛头晕', '3ml', '外用，涂抹患处', '外用液体', '2026-10-15', '皮肤五官', '客厅药箱', '漳州水仙药业', 1, 1, '通用', 0, NULL, 6.5, NULL, NULL),
  ('蒙脱石散（过期）', '止泻（已过期，请丢弃）', '3g×10袋', '每次1袋', '散剂', '2026-05-12', '肠胃消化', '客厅药箱', '博福-益普生', 1, 1, '通用', 0, NULL, 26.0, NULL, '过期示例数据，可直接删除');
