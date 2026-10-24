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

-- ===== 1. 自定义分类表 =====
CREATE TABLE IF NOT EXISTS txn_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  flow       TEXT NOT NULL CHECK(flow IN ('expense','income')),
  name       TEXT NOT NULL,
  parent_id  INTEGER,                          -- NULL = 一级分类；否则为父分类 id
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_txncat_flow ON txn_categories(flow, parent_id, sort_order);

-- 默认分类（仅当表为空时整批写入，不覆盖已有自定义分类）
INSERT INTO txn_categories (flow, name, parent_id, sort_order)
SELECT f, n, p, s FROM (
  SELECT 'expense' f, '餐饮' n, NULL p, 0 s UNION ALL
  SELECT 'expense', '零食',   NULL, 1 UNION ALL
  SELECT 'expense', '美妆',   NULL, 2 UNION ALL
  SELECT 'expense', '烟酒',   NULL, 3 UNION ALL
  SELECT 'expense', '日常',   NULL, 4 UNION ALL
  SELECT 'expense', '购物',   NULL, 5 UNION ALL
  SELECT 'expense', '交通',   NULL, 6 UNION ALL
  SELECT 'expense', '娱乐',   NULL, 7 UNION ALL
  SELECT 'expense', '社交',   NULL, 8 UNION ALL
  SELECT 'expense', '装修',   NULL, 9 UNION ALL
  SELECT 'expense', '旅游',   NULL, 10 UNION ALL
  SELECT 'expense', '医疗',   NULL, 11 UNION ALL
  SELECT 'expense', '学习',   NULL, 12 UNION ALL
  SELECT 'expense', '其他',   NULL, 13 UNION ALL
  SELECT 'income',  '礼金',   NULL, 0 UNION ALL
  SELECT 'income',  '理财',   NULL, 1 UNION ALL
  SELECT 'income',  '报销',   NULL, 2 UNION ALL
  SELECT 'income',  '工资',   NULL, 3 UNION ALL
  SELECT 'income',  '奖金',   NULL, 4 UNION ALL
  SELECT 'income',  '生活费', NULL, 5 UNION ALL
  SELECT 'income',  '外快兼职', NULL, 6 UNION ALL
  SELECT 'income',  '退款',   NULL, 7 UNION ALL
  SELECT 'income',  '投资收益', NULL, 8 UNION ALL
  SELECT 'income',  '其他',   NULL, 9
) WHERE NOT EXISTS (SELECT 1 FROM txn_categories);

-- ===== 2. 重建 transactions（旧 CHECK(flow IN expense,income) 无法直接改，需整表重建） =====
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
