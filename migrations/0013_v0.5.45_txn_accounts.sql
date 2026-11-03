-- 0013 · v0.5.45 账本账户设置（txn_accounts）
-- 背景：付款账户此前是「预置数组 + 流水 DISTINCT」在前端拼出来的，无法增删改。
-- 升级为可管理表：排序 / 默认账户 / 重命名联动历史流水；「人情往来」为人际归并专用账户，受保护不可删改。
-- 注意：本文件含预置数据播种，只执行一次（重复执行会因唯一索引报错）。

CREATE TABLE IF NOT EXISTS txn_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_accounts_name ON txn_accounts(name);

-- 预置账户（原 ACCOUNTS 常量）；「默认账户」缺省为默认账户
INSERT INTO txn_accounts (name, sort_order, is_default) VALUES
  ('默认账户', 0, 1), ('现金', 1, 0), ('微信', 2, 0), ('支付宝', 3, 0),
  ('银行卡', 4, 0), ('信用卡', 5, 0), ('医保卡', 6, 0), ('人情往来', 7, 0);

-- 历史流水里实际用过的账户补录（预置除外，统一排在预置之后）
INSERT INTO txn_accounts (name, sort_order)
  SELECT a, 100 FROM (
    SELECT DISTINCT account AS a FROM transactions WHERE account IS NOT NULL AND account <> ''
    UNION
    SELECT DISTINCT to_account AS a FROM transactions WHERE to_account IS NOT NULL AND to_account <> ''
  )
  WHERE a NOT IN (SELECT name FROM txn_accounts);
