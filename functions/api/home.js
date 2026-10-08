import { json, todayStr, weekdayCN } from '../_lib.js';

function fmtWhen(date, time, today) {
  if (date < today) return '已逾期';
  if (date === today) return '今天' + (time ? ' ' + time : '');
  const [, m, d] = date.split('-');
  return `${Number(m)}月${Number(d)}日`;
}
function fmtTime(start) {
  const m = /(\d{2}:\d{2})/.exec(start || '');
  return m ? m[1] : '';
}
function birthdayWithin30(birthday, today) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return false;
  const [, m, d] = birthday.split('-');
  const t = new Date(today + 'T00:00:00');
  let y = t.getFullYear();
  let b = new Date(`${y}-${m}-${d}T00:00:00`);
  if (b < t) b = new Date(`${y + 1}-${m}-${d}T00:00:00`);
  const diff = Math.round((b - t) / 86400000);
  return diff >= 0 && diff <= 30;
}

export async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB;
  const today = todayStr();
  const month = today.slice(0, 7);

  // 品牌 / 外观设置
  const settingRows = await db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  (settingRows.results || []).forEach((r) => (settings[r.key] = r.value));
  const brand = {
    name: settings.brand_name || '数字生活',
    avatar: settings.brand_avatar || '数',
    tagline: settings.brand_tagline || '把日子过成自己喜欢的样子',
    theme: settings.theme || 'plum',
  };

  const cnt = async (sql, ...params) => {
    const r = await db.prepare(sql).bind(...params).first();
    return r ? Number(r.c || 0) : 0;
  };

  const stats = {
    todos: {
      overdue: await cnt("SELECT COUNT(*) c FROM todos WHERE done=0 AND todo_date < ?", today),
      today: await cnt("SELECT COUNT(*) c FROM todos WHERE done=0 AND todo_date = ?", today),
      week: await cnt(
        "SELECT COUNT(*) c FROM todos WHERE done=0 AND todo_date BETWEEN ? AND date(?, '+7 days')",
        today, today
      ),
    },
    habits: {
      done: await cnt("SELECT COUNT(*) c FROM habit_logs WHERE log_date = ?", today),
      total: await cnt('SELECT COUNT(*) c FROM habits'),
    },
    ledger: {},
    medicines: {
      total: await cnt('SELECT COUNT(*) c FROM medicines'),
      expiring: await cnt(
        "SELECT COUNT(*) c FROM medicines WHERE expiry IS NOT NULL AND expiry BETWEEN ? AND date(?, '+30 days')",
        today, today
      ),
    },
    events: { today: await cnt('SELECT COUNT(*) c FROM events WHERE date(start) = ?', today) },
    relations: { upcoming: 0 },
  };

  const ledgerRow = await db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN flow='income' THEN amount ELSE 0 END),0) inc, " +
        "COALESCE(SUM(CASE WHEN flow='expense' THEN amount ELSE 0 END),0) exp " +
        "FROM transactions WHERE strftime('%Y-%m', txn_date)=?"
    )
    .bind(month)
    .first();
  stats.ledger.income = ledgerRow ? Number(ledgerRow.inc) : 0;
  stats.ledger.expense = ledgerRow ? Number(ledgerRow.exp) : 0;
  stats.ledger.balance = stats.ledger.income - stats.ledger.expense;

  const contacts = await db.prepare('SELECT name, relation, birthday FROM contacts').all();
  stats.relations.upcoming = (contacts.results || []).filter((c) =>
    birthdayWithin30(c.birthday, today)
  ).length;

  // 「今天要处理」：待办（逾期/今日）+ 今日事件
  const todoRows = await db
    .prepare(
      'SELECT id,title,todo_date,todo_time,list,priority FROM todos WHERE done=0 AND todo_date <= ? ORDER BY todo_date ASC, todo_time ASC'
    )
    .bind(today)
    .all();
  const eventRows = await db
    .prepare('SELECT id,title,start,all_day FROM events WHERE date(start)=? ORDER BY start ASC')
    .bind(today)
    .all();
  const habitRows = await db
    .prepare(
      'SELECT h.id, h.name, h.icon, h.color FROM habits h WHERE NOT EXISTS (SELECT 1 FROM habit_logs l WHERE l.habit_id=h.id AND l.log_date=?)'
    )
    .bind(today)
    .all();

  const todayTasks = [];
  (todoRows.results || []).forEach((t) => {
    todayTasks.push({
      type: 'todo',
      id: t.id,
      title: t.title,
      when: fmtWhen(t.todo_date, t.todo_time, today),
      overdue: t.todo_date < today,
      list: t.list,
      priority: t.priority,
      actionable: true,
    });
  });
  (eventRows.results || []).forEach((e) => {
    todayTasks.push({
      type: 'event',
      id: e.id,
      title: e.title,
      when: e.all_day ? '全天' : fmtTime(e.start),
      overdue: false,
      list: '日历',
      actionable: false,
    });
  });
  const pendingHabits = (habitRows.results || []).map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    color: h.color,
  }));

  const now = new Date();
  return json({
    version: '0.0.5',
    brand,
    today,
    todayLabel: `${now.getMonth() + 1}月${now.getDate()}日 星期${weekdayCN(now)}`,
    weekday: weekdayCN(now),
    stats,
    todayTasks,
    pendingHabits,
  });
}
