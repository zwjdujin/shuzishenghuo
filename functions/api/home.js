import { json, todayStr, weekdayCN, cnNow } from '../_lib.js';
import { birthdayWithin30Of } from './_profile.js';

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
    theme: settings.theme || 'zhiyin',
  };
  // 外观（主题 / 字体 / 明暗）以云端为准，保证电脑端设置后手机端一致
  const appearance = {
    theme: settings.theme || '',
    font: settings.font || '',
    mode: settings.mode || '',
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
  // v0.6.0：频率目标（每周 N 次 / 每 N 天）判定用的本周与近 30 天日志
  let weekLogs = [];
  if (habitIds.length) {
    const ph2 = habitIds.map(() => '?').join(',');
    const dow = ((new Date(today + 'T00:00:00+08:00').getUTCDay() + 6) % 7) + 1;
    const monday = new Date(Date.parse(today + 'T00:00:00Z') - (dow - 1) * 86400000).toISOString().slice(0, 10);
    weekLogs = (await db.prepare(
      `SELECT habit_id, log_date, done FROM habit_logs WHERE habit_id IN (${ph2}) AND log_date >= ?`
    ).bind(...habitIds, monday).all().results) || [];
  }
  const wlMap = {};
  weekLogs.forEach((l) => { if (!wlMap[l.habit_id]) wlMap[l.habit_id] = []; wlMap[l.habit_id].push(l); });
  function habitTodayDone(h) {
    if (h.type === 'sleep') {
      const l = hlMap[h.id];
      return (l ? (l.done_bed || 0) : 0) + (l ? (l.done_rise || 0) : 0) + (l ? (l.done_nap || 0) : 0) >= 3;
    }
    const target = Number(h.target) || 1;
    const freq = h.freq_type || 'daily';
    const fval = Number(h.freq_value) || 1;
    if (freq === 'weekly') {
      // 本周累计次数（当日完成度折算）达到 N 次即视为「完成」
      let occ = 0;
      (wlMap[h.id] || []).forEach((l) => { occ += Math.min(1, (Number(l.done) || 0) / target); });
      return occ >= fval;
    }
    if (freq === 'interval') {
      // 距最近一次打卡不足 N 天 → 本次周期已完成
      const logs = wlMap[h.id] || [];
      let last = null;
      logs.forEach((l) => { if (l.log_date <= today && (!last || l.log_date > last)) last = l.log_date; });
      if (!last) return false;
      return Math.round((Date.parse(today) - Date.parse(last)) / 86400000) < fval;
    }
    const done = hlMap[h.id] ? Number(hlMap[h.id].done || 0) : 0;
    return done >= target;
  }
  const habitDoneCount = habitList.filter(habitTodayDone).length;

  // 关系：30 天内有生日的联系人（生日向导三种形态 + 阳历/农历统一换算）
  let upcomingBirthdays = 0;
  try {
    const cRows = (
      await db.prepare('SELECT birthday_type, birthday_calendar, birth_year, birth_month, birth_day, is_deceased FROM contacts').all()
    ).results || [];
    upcomingBirthdays = cRows.filter((c) => !c.is_deceased && birthdayWithin30Of(c)).length;
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

  const now = cnNow();

  // ===== v0.6.0 P3 聚合：随手记 / 保持联系 / 今日服药 / 那年今天 =====
  // 一句话 memo（最近 5 条）
  let memos = [];
  try {
    memos = ((await db.prepare('SELECT id, content, memo_date FROM memos ORDER BY id DESC LIMIT 5').all()).results || [])
      .map((r) => ({ id: r.id, content: r.content, date: r.memo_date }));
  } catch (_) { /* 表未迁移忽略 */ }

  // keep-in-touch：按节奏超期未联系的联系人（前 5）
  let touchDue = [];
  try {
    const tRows = (await db.prepare(
      'SELECT id, name, touch_cadence c, last_touched FROM contacts WHERE touch_cadence > 0 AND is_deceased = 0'
    ).all()).results || [];
    const todayMs = Date.parse(today);
    touchDue = tRows
      .map((r) => {
        const days = r.last_touched ? Math.round((todayMs - Date.parse(r.last_touched)) / 86400000) : 365;
        return { id: r.id, name: r.name, cadence: r.cadence ?? r.c, days };
      })
      .filter((r) => r.days >= r.cadence)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  } catch (_) { /* 忽略 */ }

  // 今日服药计划（到期未处理的）
  let medToday = [];
  try {
    const dow = String(((new Date(today + 'T00:00:00+08:00').getUTCDay() + 6) % 7) + 1);
    const pRows = (await db.prepare(
      'SELECT p.id, p.time_of_day t, p.days, m.name FROM med_plans p JOIN medicines m ON m.id=p.medicine_id WHERE p.active=1'
    ).all()).results || [];
    const lRows = ((await db.prepare('SELECT plan_id FROM med_logs WHERE log_date=?').bind(today).all()).results) || [];
    const doneSet = new Set(lRows.map((r) => r.plan_id));
    medToday = pRows
      .filter((p) => String(p.days || '1,2,3,4,5,6,7').split(',').includes(dow) && !doneSet.has(p.id))
      .sort((a, b) => a.t.localeCompare(b.t))
      .slice(0, 5)
      .map((p) => ({ id: p.id, medicine: p.name, time: p.t }));
  } catch (_) { /* 忽略 */ }

  // 那年今天：有记录的年份数 + 最近一条样例
  let onthisday = null;
  try {
    const md = today.slice(5);
    const sample = await db.prepare(
      'SELECT memo_date d, content FROM memos WHERE memo_date LIKE ? ORDER BY memo_date DESC LIMIT 1'
    ).bind(`%-${md}`).first();
    const yRow = await db.prepare(
      'SELECT COUNT(DISTINCT substr(log_date,1,4)) y FROM habit_logs WHERE log_date LIKE ?'
    ).bind(`%-${md}`).first();
    if ((sample && sample.d !== today) || (yRow && yRow.y)) {
      onthisday = { years: yRow ? yRow.y : 0, sample: sample ? { date: sample.d, content: sample.content } : null };
    }
  } catch (_) { /* 忽略 */ }

  return json({
    version: '0.5.10',
    brand,
    appearance,
    today,
    todayLabel: `${now.getMonth() + 1}月${now.getDate()}日 星期${weekdayCN(now)}`,
    weekday: weekdayCN(now),
    stats,
    todayTasks,
    pendingHabits,
    p3: { memos, touchDue, medToday, onthisday },
  });
}
