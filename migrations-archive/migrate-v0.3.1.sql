-- 数字生活 · v0.3.1 数据库迁移
-- 执行：wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.3.1.sql
-- 用途：人际关系人物档案完整化（12 模块 + 三端联动 + R2 附件）

-- 1. contacts 扩展：核心字段 + 身份证 + 农历生日 + 筛选维度
ALTER TABLE contacts ADD COLUMN alias TEXT;                -- 别名/昵称
ALTER TABLE contacts ADD COLUMN gender TEXT;                -- 性别
ALTER TABLE contacts ADD COLUMN province TEXT;              -- 省份（筛选用）
ALTER TABLE contacts ADD COLUMN city TEXT;                  -- 城市（筛选用）
ALTER TABLE contacts ADD COLUMN idcard TEXT;                -- 身份证号
ALTER TABLE contacts ADD COLUMN idcard_birthday TEXT;       -- 从身份证解析出的生日（生日为空时回填）
ALTER TABLE contacts ADD COLUMN show_lunar INTEGER DEFAULT 0; -- 是否显示农历生日
ALTER TABLE contacts ADD COLUMN level TEXT DEFAULT '普通';   -- 亲疏层级：核心/重要/普通/弱连接
ALTER TABLE contacts ADD COLUMN job TEXT;                    -- 职业
ALTER TABLE contacts ADD COLUMN company TEXT;                -- 公司
ALTER TABLE contacts ADD COLUMN status TEXT DEFAULT '活跃';  -- 关系状态

-- 2. 基础身份：多联系方式（value + deprecated 弃用标记）
CREATE TABLE IF NOT EXISTS contact_contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   INTEGER NOT NULL,
  kind        TEXT NOT NULL,               -- phones/emails/wechats
  value       TEXT NOT NULL,
  deprecated  INTEGER DEFAULT 0,           -- 1=已弃用但保留
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cc_person ON contact_contacts(person_id, kind);

-- 3. 教育与成长（可多段）
CREATE TABLE IF NOT EXISTS contact_edu (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  school     TEXT, major TEXT, degree TEXT,
  start_year TEXT, end_year TEXT, story TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_edu_person ON contact_edu(person_id);

-- 4. 关系属性
CREATE TABLE IF NOT EXISTS contact_rel (
  person_id INTEGER PRIMARY KEY,
  via       TEXT,            -- 认识渠道
  intro     TEXT,            -- 介绍人
  since     TEXT,            -- 相识时间
  scene     TEXT,            -- 相识场景
  score     TEXT             -- 相处舒适度 1-5
);

-- 5. 职业与资源
CREATE TABLE IF NOT EXISTS contact_work (
  person_id  INTEGER PRIMARY KEY,
  dept       TEXT, title TEXT, rank TEXT, city TEXT,
  field      TEXT,           -- 擅长领域
  give       TEXT,           -- 可提供的资源
  infl       TEXT,           -- 行业影响力
  bound      TEXT            -- 合作边界
);

-- 6. 家庭与亲密
CREATE TABLE IF NOT EXISTS contact_family (
  person_id INTEGER PRIMARY KEY,
  father TEXT, mother TEXT, spouse TEXT, child TEXT, sibling TEXT,
  live   TEXT,              -- 家庭居住地
  events TEXT,              -- 家庭重要事件
  pet    TEXT               -- 宠物
);

-- 7. 偏好与习惯（数组以逗号分隔）
CREATE TABLE IF NOT EXISTS contact_pref (
  person_id  INTEGER PRIMARY KEY,
  foods   TEXT,             -- 饮食偏好
  drinks  TEXT,             -- 饮品偏好
  size    TEXT,             -- 穿衣尺码
  shoes   TEXT,             -- 鞋码
  hobbies TEXT,             -- 兴趣爱好
  life    TEXT,             -- 作息与健康
  social  TEXT              -- 社交偏好
);

-- 8. 性格与沟通（tags 逗号分隔）
CREATE TABLE IF NOT EXISTS contact_trait (
  person_id INTEGER PRIMARY KEY,
  tags   TEXT,
  style  TEXT,              -- 沟通风格
  reply  TEXT,              -- 回复习惯
  taboo  TEXT,              -- 敏感话题/禁忌
  value  TEXT,              -- 价值观
  comfort TEXT              -- 舒适度 1-5
);

-- 9. 互动时间轴
CREATE TABLE IF NOT EXISTS contact_interacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  date       TEXT NOT NULL,
  kind       TEXT,          -- 见面/电话/微信…
  place      TEXT, who TEXT, topic TEXT, quality TEXT,
  summary    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interacts_person ON contact_interacts(person_id, date DESC);

-- 10. 人物关联（可跳转 ref_id）
CREATE TABLE IF NOT EXISTS contact_relatives (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,  -- 属于谁
  name       TEXT NOT NULL,
  kin        TEXT,               -- 父亲/母亲/配偶/子女…
  note       TEXT,
  ref_id     INTEGER,            -- 若该人也在联系人中，记其 id（可点击跳转）
  dead       INTEGER DEFAULT 0,  -- 1=已失效但保留
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_relatives_person ON contact_relatives(person_id);

-- 11. 承诺与待办（同步 todos 表：person_id 绑定，list='人际关系'）
CREATE TABLE IF NOT EXISTS contact_promises (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  side       TEXT DEFAULT '对方',  -- 对方/我
  what       TEXT NOT NULL,
  due        TEXT,
  status     TEXT DEFAULT '未开始',
  note       TEXT,
  todo_id    INTEGER,             -- 已同步到 todos 的 id
  done       INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_promises_person ON contact_promises(person_id);

-- 12. 附件元数据（文件实际存 R2：contacts/{person_id}/{日期}_{随机}_{文件名}）
CREATE TABLE IF NOT EXISTS contact_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  name       TEXT NOT NULL,
  size       TEXT,
  r2_path    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_person ON contact_files(person_id);

-- 13. 人情账（同步 transactions：category='人情'，note 含 @人名）
CREATE TABLE IF NOT EXISTS contact_money (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL,
  type       TEXT NOT NULL,   -- gift_out/gift_in/lend/repay/aa
  amount     REAL NOT NULL,
  date       TEXT NOT NULL,
  note       TEXT,
  txn_id     INTEGER,         -- 已同步到 transactions 的 id
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_money_person ON contact_money(person_id, date DESC);

-- 14. todos 表绑定人物
ALTER TABLE todos ADD COLUMN person_id INTEGER;

-- 15. 词库缓存（常用词，添加一次永久备选）
CREATE TABLE IF NOT EXISTS vocab (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,   -- trait/hobby/lang/food/drink/size...
  word       TEXT NOT NULL,
  hits       INTEGER DEFAULT 1,-- 被使用次数
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_unique ON vocab(kind, word);

-- 索引：列表筛选（必须放在 ALTER TABLE 之后，确保列已存在）
CREATE INDEX IF NOT EXISTS idx_contacts_filter ON contacts(gender, province, city, level);