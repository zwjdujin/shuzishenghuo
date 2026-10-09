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

  // 习惯今日完成情况（按目标值判定是否完成）
  const allHabits = await db.prepare('SELECT * FROM habits').all();
  const habitList = allHabits.results || [];
  const habitIds = habitList.map((h) => h.id);
  let habitLogs = [];
  if (habitIds.length) {
    const ph = habitIds.map(() => '?').join(',');
    habitLogs =
      (await db.prepare(`SELECT * FROM habit_logs WHERE habit_id IN (${ph}) AND log_date = ?`).bind(...habitIds, today).all()).results || [];
  }
  const hlMap = {};
  habitLogs.forEach((l) => (hlMap[l.habit_id] = l));
  function habitTodayDone(h) {
    const l = hlMap[h.id];
    if (h.type === 'sleep') {
      return (l ? (l.done_bed || 0) : 0) + (l ? (l.done_rise || 0) : 0) + (l ? (l.done_nap || 0) : 0) >= 3;
    }
    const done = l ? Number(l.done || 0) : 0;
    return done >= (Number(h.target) || 1);
  }
  const habitDoneCount = habitList.filter(habitTodayDone).length;

  // 关系：60 天内的生日数量
  let upcomingBirthdays = 0;
  try {
    const bRows = (
      await db.prepare("SELECT birthday FROM contacts WHERE birthday IS NOT NULL AND birthday <> ''").all()
    ).results || [];
    const now = new Date();
    const todayM = now.getMonth();
    const todayD = now.getDate();
    bRows.forEach((r) => {
      const b = String(r.birthday);
      let mm, dd;
      if (/^\d{4}-\d{2}-\d{2}$/.test(b)) { mm = Number(b.slice(5, 7)); dd = Number(b.slice(8, 10)); }
      else if (/^\d{2}-\d{2}$/.test(b)) { mm = Number(b.slice(0, 2)); dd = Number(b.slice(3, 5)); }
      else return;
      if (!mm || !dd) return;
      // 计算今年下一次生日距今天数
      let next = new Date(now.getFullYear(), mm - 1, dd);
      if (next < new Date(now.getFullYear(), todayM, todayD)) next = new Date(now.getFullYear() + 1, mm - 1, dd);
      const days = Math.round((next - new Date(now.getFullYear(), todayM, todayD)) / 86400000);
      if (days <= 60) upcomingBirthdays++;
    });
  } catch (_) { /* 忽略 */ }

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
      done: habitDoneCount,
      total: habitList.length,
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
    relations: { upcoming: upcomingBirthdays },
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
  const habitRows = null; // 已由 habitList / habitTodayDone 计算，保留变量名避免误用

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
  const pendingHabits = habitList
    .filter((h) => !habitTodayDone(h))
    .map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      category: h.category,
    }));

  const now = new Date();
  return json({
    version: '0.3.2',
    brand,
    today,
    todayLabel: `${now.getMonth() + 1}月${now.getDate()}日 星期${weekdayCN(now)}`,
    weekday: weekdayCN(now),
    stats,
    todayTasks,
    pendingHabits,
  });
}
