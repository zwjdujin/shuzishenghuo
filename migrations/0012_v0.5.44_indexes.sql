-- 0012 · v0.5.44 查询优化索引
-- 背景（2026-11-01 体检）：idx_txn_date / idx_events_start / idx_todos_* 等被
-- strftime() / date() / 前导通配 LIKE 架空，账本、首页、那年今天实际全表扫描且随年限线性变慢。
-- 配套：业务查询已同步改写为可走索引的写法（txn_date 边界比较 / substr(列,6) 月日匹配）。

-- 账本按联系人查流水（人际关系 · 财务往来）与删除联系人时的 FK 校验
CREATE INDEX IF NOT EXISTS idx_txn_contact ON transactions(contact_id);

-- 「那年今天」月日匹配（substr(日期列, 6) = 'MM-DD'，表达式索引要求查询用完全相同的表达式）
CREATE INDEX IF NOT EXISTS idx_txn_md ON transactions(substr(txn_date, 6));
CREATE INDEX IF NOT EXISTS idx_habit_logs_md ON habit_logs(substr(log_date, 6));
CREATE INDEX IF NOT EXISTS idx_todos_md ON todos(substr(todo_date, 6));
CREATE INDEX IF NOT EXISTS idx_memos_md ON memos(substr(memo_date, 6));
-- 事件 start 带时刻（'YYYY-MM-DD HH:MM'），月日取前 5 位
CREATE INDEX IF NOT EXISTS idx_events_md ON events(substr(start, 6, 5));

-- 待办「未完成 + 日期」高频组合（首页/今日待办）
CREATE INDEX IF NOT EXISTS idx_todos_done_date ON todos(done, todo_date);
