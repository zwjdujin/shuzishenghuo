-- 0008 · v0.5.13 药箱字典化：剂型/分类/存放位置迁移到词库（可管理）+ 外用药标记
-- 词库 vocab 已有完整 CRUD（/api/vocab 按 kind），药箱设置页直接复用。

-- 1) 外用药标记
ALTER TABLE medicines ADD COLUMN external INTEGER NOT NULL DEFAULT 0;

-- 2) 分类全部改为「无」（新 12 类与旧分类无重合，表示尚未分类）
UPDATE medicines SET category = '无';

-- 3) 剂型旧值就近映射到新 16 剂型（无对应的一律归「其他」）
UPDATE medicines SET form = '胶囊剂' WHERE form = '胶囊';
UPDATE medicines SET form = '软膏剂' WHERE form = '软膏';
UPDATE medicines SET form = '喷雾剂' WHERE form = '喷雾';
UPDATE medicines SET form = '注射剂' WHERE form = '注射液';
UPDATE medicines SET form = '其他'   WHERE form IN ('贴剂', '外用液体');

-- 4) 词库种子：剂型 16 种（用户给定顺序 = 基准排序 sort_order）
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','片剂',1,0  WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='片剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','胶囊剂',1,1 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='胶囊剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','颗粒剂',1,2 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='颗粒剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','散剂',1,3  WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='散剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','口服液',1,4 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='口服液');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','煎膏剂',1,5 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='煎膏剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','丸剂',1,6  WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='丸剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','喷雾剂',1,7 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='喷雾剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','酊剂',1,8  WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='酊剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','锭剂',1,9  WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='锭剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','丹剂',1,10 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='丹剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','糖浆剂',1,11 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='糖浆剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','栓剂',1,12 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='栓剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','软膏剂',1,13 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='软膏剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','注射剂',1,14 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='注射剂');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_form','其他',1,15 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_form' AND word='其他');

-- 分类 12 种（「无」是内置值，不进词库）
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','外感呼吸病',1,0 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='外感呼吸病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','脾胃消化病',1,1 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='脾胃消化病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','头面五官病',1,2 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='头面五官病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','筋骨疼痛病',1,3 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='筋骨疼痛病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','妇科经带病',1,4 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='妇科经带病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','泌尿男科病',1,5 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='泌尿男科病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','皮肤瘙痒病',1,6 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='皮肤瘙痒病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','睡眠情志病',1,7 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='睡眠情志病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','心脑血管病',1,8 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='心脑血管病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','气血阴阳虚',1,9 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='气血阴阳虚');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','儿科常见病',1,10 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='儿科常见病');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_category','外科肛肠病',1,11 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_category' AND word='外科肛肠病');

-- 存放位置沿用原有 7 处
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_location','客厅药箱',1,0 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_location' AND word='客厅药箱');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_location','卧室床头',1,1 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_location' AND word='卧室床头');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_location','厨房抽屉',1,2 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_location' AND word='厨房抽屉');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_location','冰箱冷藏',1,3 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_location' AND word='冰箱冷藏');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_location','卫生间镜柜',1,4 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_location' AND word='卫生间镜柜');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_location','玄关抽屉',1,5 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_location' AND word='玄关抽屉');
INSERT INTO vocab(kind, word, hits, sort_order) SELECT 'med_location','随身包',1,6 WHERE NOT EXISTS(SELECT 1 FROM vocab WHERE kind='med_location' AND word='随身包');
