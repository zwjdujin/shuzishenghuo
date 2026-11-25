-- 0017 · v0.5.56 审计修复配套（两项，均为「只加不改」）
-- 代码对两项都做了「迁移未执行也能跑」的兼容：先部署代码、后跑本迁移不会出错
-- （周期账单退回不记锚定日的旧写法；限流退回进程内存计数）。

-- 1) 周期账单「锚定日」：月度账单按它推进下一期，月末钳制到当月最后一天，
--    不再出现 1 月 31 日 → 3 月 3 日的漂移与整月漏记（见 functions/api/recurring.js）。
--    回填：已有行用当前 next_date 的「日」作为锚点（已经漂到 3 日的旧行无法还原原始日，之后按 3 日稳定推进）。
ALTER TABLE recurring ADD COLUMN anchor_day INTEGER;
UPDATE recurring SET anchor_day = CAST(strftime('%d', next_date) AS INTEGER) WHERE anchor_day IS NULL;

-- 2) 限流计数（登录失败 / 前端错误上报）：固定窗口计数，跨 isolate 生效（见 functions/api/_ratelimit.js）。
--    k = 用途:维度:窗口序号；exp = 窗口结束的 Unix 秒（过期行由业务代码顺手清理）。
CREATE TABLE IF NOT EXISTS rate_limits (
  k   TEXT PRIMARY KEY,
  cnt INTEGER NOT NULL DEFAULT 0,
  exp INTEGER NOT NULL
);
