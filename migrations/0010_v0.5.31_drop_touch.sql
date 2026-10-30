-- 0010 · v0.5.31 彻底下线「保持联系」提醒功能
-- 前端控件、/api/profile/touch、首页聚合、Worker 日检推送均已删除；
-- 这里把 contacts 上的两列也一并移除，库与代码对齐。
-- SQLite ≥3.35 支持 DROP COLUMN；两列无索引/无生成列引用，可直接删。

ALTER TABLE contacts DROP COLUMN touch_cadence;
ALTER TABLE contacts DROP COLUMN last_touched;
