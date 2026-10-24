-- 数字生活 · v0.5.0 数据库迁移（账本增强：自定义分类 + 转账 + 时间/联系人/物品）
-- 执行（远程）：
--   wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.5.0.sql
-- 执行（本地）：
--   wrangler d1 execute shuzishenghuo --local  --file=./migrate-v0.5.0.sql
--
-- 变更内容：
--   1. 新建 txn_categories 自定义分类表（支出/收入两级分类 + 排序），并写入默认分类
--   2. 重建 transactions 表：flow 增加 'transfer'（转账），新增
--      sub_category 二级分类 / txn_time 时分 / to_account 转入账户 /
--      contact_id 关联联系人 / item 物品 五列（旧数据完整保留）
--   3. 词库预置人脉标签（徒步/医生/喝茶/书画/一技之长）与人脉群组（家人/亲戚/同学/同事/客户）
--
-- ⚠️ 第 3 段的 transactions 重建只执行一次；分类种子（第 2 段）可重复执行不会重复插入。

-- ===== 1. 自定义分类表 =====
CREATE TABLE IF NOT EXISTS txn_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  flow       TEXT NOT NULL CHECK(flow IN ('expense','income')),
  name       TEXT NOT NULL,
  parent_id  INTEGER,                          -- NULL = 一级分类；否则为父分类 id
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,       -- 1 = 不在「记一笔」前端显示
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_txncat_flow ON txn_categories(flow, parent_id, sort_order);

-- ===== 2. 默认分类（逐条按名称判重，可重复执行） =====
INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '餐饮', NULL, 0
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '餐饮');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '零食', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '零食');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '美妆', NULL, 2
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '美妆');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '烟酒', NULL, 3
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '烟酒');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '日常', NULL, 4
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '日常');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '购物', NULL, 5
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '购物');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '交通', NULL, 6
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '交通');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '娱乐', NULL, 7
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '娱乐');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '社交', NULL, 8
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '社交');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '装修', NULL, 9
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '装修');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '旅游', NULL, 10
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '旅游');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '医疗', NULL, 11
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '医疗');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '学习', NULL, 12
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '学习');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'expense', '其他', NULL, 13
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'expense' AND name = '其他');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '礼金', NULL, 0
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '礼金');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '理财', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '理财');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '报销', NULL, 2
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '报销');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '工资', NULL, 3
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '工资');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '奖金', NULL, 4
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '奖金');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '生活费', NULL, 5
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '生活费');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '外快兼职', NULL, 6
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '外快兼职');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '退款', NULL, 7
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '退款');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '投资收益', NULL, 8
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '投资收益');

INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT 'income', '其他', NULL, 9
WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow = 'income' AND name = '其他');

-- ===== 3. 重建 transactions（旧 CHECK(flow IN expense,income) 无法直接改，需整表重建；只执行一次） =====
CREATE TABLE transactions_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flow         TEXT NOT NULL CHECK(flow IN ('expense','income','transfer')),
  amount       REAL NOT NULL,
  category     TEXT,
  sub_category TEXT,                            -- 二级分类（挂在 category 之下）
  txn_date     TEXT NOT NULL,
  txn_time     TEXT,                            -- 'HH:MM'；NULL 表示未记录时分
  account      TEXT DEFAULT '默认账户',          -- 支出/收入：付款账户；转账：转出账户
  to_account   TEXT,                            -- 转账：转入账户
  contact_id   INTEGER,                         -- 关联「人际关系」联系人
  item         TEXT,                            -- 物品（预留）
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO transactions_new (id, flow, amount, category, txn_date, note, account)
  SELECT id, flow, amount, category, txn_date, note, COALESCE(account, '默认账户') FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);

-- ===== 4. 人脉词库预置（v0.5.1：常用标签 / 群组，逐条判重可重复执行） =====
INSERT INTO vocab (kind, word)
SELECT 'rel_tag', '徒步'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_tag' AND word = '徒步');

INSERT INTO vocab (kind, word)
SELECT 'rel_tag', '医生'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_tag' AND word = '医生');

INSERT INTO vocab (kind, word)
SELECT 'rel_tag', '喝茶'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_tag' AND word = '喝茶');

INSERT INTO vocab (kind, word)
SELECT 'rel_tag', '书画'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_tag' AND word = '书画');

INSERT INTO vocab (kind, word)
SELECT 'rel_tag', '一技之长'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_tag' AND word = '一技之长');

INSERT INTO vocab (kind, word)
SELECT 'rel_group', '家人'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_group' AND word = '家人');

INSERT INTO vocab (kind, word)
SELECT 'rel_group', '亲戚'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_group' AND word = '亲戚');

INSERT INTO vocab (kind, word)
SELECT 'rel_group', '同学'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_group' AND word = '同学');

INSERT INTO vocab (kind, word)
SELECT 'rel_group', '同事'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_group' AND word = '同事');

INSERT INTO vocab (kind, word)
SELECT 'rel_group', '客户'
WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind = 'rel_group' AND word = '客户');

-- ===== 5. 词库排序字段（v0.5.2：人脉标签/群组设置页拖动排序；只执行一次） =====
ALTER TABLE vocab ADD COLUMN sort_order INTEGER;
