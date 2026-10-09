// 「数据处理」共享表清单（下划线前缀不会被当作路由）
// 备份 / 清空都作用在这些业务表上。

// 漂亮的表名，用于展示
export const TABLE_LABELS = {
  habits: '成长打卡 · 习惯',
  habit_logs: '成长打卡 · 打卡记录',
  todos: '待办提醒',
  transactions: '我的账本',
  medicines: '家庭药箱',
  events: '日历事件',
  contacts: '人际关系 · 联系人',
  contact_relatives: '人际关系 · 亲属',
  contact_promises: '人际关系 · 承诺',
  contact_files: '人际关系 · 档案',
  contact_money: '人际关系 · 人情往来',
  contact_contacts: '人际关系 · 往来',
  contact_edu: '人际关系 · 教育',
  contact_rel: '人际关系 · 关系',
  contact_work: '人际关系 · 工作',
  contact_family: '人际关系 · 家庭',
  contact_pref: '人际关系 · 偏好',
  contact_trait: '人际关系 · 特征',
  contact_interacts: '人际关系 · 互动',
  vocab: '词库',
  push_subscriptions: '推送订阅',
};

// 不参与备份 / 清空的表：
//   sessions       —— 登录态，清空会把本人踢下线
//   app_settings   —— 品牌与外观偏好（管理员配置）
const EXCLUDE = new Set(['sessions', 'app_settings', 'd1_migrations', '_cf_KV']);

/** 动态读取数据库中实际存在的业务表（避免迁移未跑时 DELETE 报错） */
export async function listDataTables(env) {
  // 注意：SQLite 的 LIKE 里 `_` 是单字符通配符，别用它过滤表名；这里只取全表再在 JS 侧白名单化
  const rows = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results || [];
  return rows
    .map((r) => r.name)
    .filter((n) => n && !n.startsWith('sqlite_') && !n.startsWith('_cf_') && !EXCLUDE.has(n));
}

export function labelOf(name) {
  return TABLE_LABELS[name] || name;
}
