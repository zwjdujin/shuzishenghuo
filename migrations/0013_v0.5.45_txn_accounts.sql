-- 0013 · v0.5.45 账本账户设置（txn_accounts）
-- 背景：付款账户此前是「预置数组 + 流水 DISTINCT」在前端拼出来的，无法增删改。
-- 升级为可管理表：排序 / 默认账户 / 重命名联动历史流水；「人情往来」为人际归并专用账户，受保护不可删改。
-- v0.5.45a 幂等化：D1 多语句迁移非原子，远程曾出现「预置已插入但迁移未登记」的半执行状态，
-- 重跑会撞 idx_txn_accounts_name 唯一约束导致迁移管线永久卡死；播种一律 OR IGNORE，可安全重复执行。

CREATE TABLE IF NOT EXISTS txn_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_accounts_name ON txn_accounts(name);

-- 预置账户（原 ACCOUNTS 常量）；「默认账户」缺省为默认账户（已存在则跳过，不动用户改过的排序/默认）
INSERT OR IGNORE INTO txn_accounts (name, sort_order, is_default) VALUES
  ('默认账户', 0, 1), ('现金', 1, 0), ('微信', 2, 0), ('支付宝', 3, 0),
  ('银行卡', 4, 0), ('信用卡', 5, 0), ('医保卡', 6, 0), ('人情往来', 7, 0);

-- 半执行兜底：表里已有账户但没有任何默认账户时，把「默认账户」补为默认
-- （仅在缺失默认时生效，不覆盖用户在账户设置里已选的默认）
UPDATE txn_accounts SET is_default = 1
WHERE name = '默认账户'
  AND NOT EXISTS (SELECT 1 FROM txn_accounts WHERE is_default = 1);

-- 历史流水里实际用过的账户补录（预置除外，统一排在预置之后；OR IGNORE 幂等）
INSERT OR IGNORE INTO txn_accounts (name, sort_order)
  SELECT a, 100 FROM (
    SELECT DISTINCT account AS a FROM transactions WHERE account IS NOT NULL AND account <> ''
    UNION
    SELECT DISTINCT to_account AS a FROM transactions WHERE to_account IS NOT NULL AND to_account <> ''
  )
  WHERE a NOT IN (SELECT name FROM txn_accounts);
