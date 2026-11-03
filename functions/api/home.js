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

  // 计数永不抛错（表未迁移等场景按 0 处理，与旧版逐段 try/catch 行为一致）
  const cnt = async (sql, ...params) => {
    try {
      const r = await db.prepare(sql).bind(...params).first();
      return r ? Number(r.c || 0) : 0;
    } catch (_) { return 0; }
  };
  // 月账单区间与「明天」（start/txn_date 边界比较可走索引；date()/strftime() 包列会架空索引）
  const nextMonth = (() => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  })();
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const dow = ((new Date(today + 'T00:00:00+08:00').getUTCDay() + 6) % 7) + 1;
  const monday = new Date(Date.parse(today + 'T00:00:00Z') - (dow - 1) * 86400000).toISOString().slice(0, 10);
  const md = today.slice(5);

  // ===== v0.5.47：15+ 次串行 D1 往返改为一批并发（登录后首屏延迟的主要来源） =====
  // 每个查询自带 catch 兜底，单表失败不影响其它数据。
  // 本周打卡日志一次查询同时供「今日完成」(log_date===today) 与「周/间隔频率」两处使用。
  const [settingRows, allHabitsRes, weekLogsRes, cRowsRes,
    todosOverdue, todosTodayCnt, todosWeek, medTotal, medExpiring, eventsTodayCnt,
    ledgerRow, todoRowsRes, eventRowsRes, memosRes, otSample, otYears,
    medPlanRows, medLogRows] = await Promise.all([
    db.prepare('SELECT key, value FROM app_settings').all().catch(() => ({ results: [] })),
    db.prepare('SELECT * FROM habits').all().catch(() => ({ results: [] })),
    db.prepare('SELECT habit_id, log_date, done, done_bed, done_rise, done_nap FROM habit_logs WHERE log_date >= ?')
      .bind(monday).all().catch(() => ({ results: [] })),
    db.prepare('SELECT birthday_type, birthday_calendar, birth_year, birth_month, birth_day, is_deceased FROM contacts')
      .all().catch(() => ({ results: [] })),
    cnt("SELECT COUNT(*) c FROM todos WHERE done=0 AND todo_date < ?", today),
    cnt("SELECT COUNT(*) c FROM todos WHERE done=0 AND todo_date = ?", today),
    cnt("SELECT COUNT(*) c FROM todos WHERE done=0 AND todo_date BETWEEN ? AND date(?, '+7 days')", today, today),
    cnt('SELECT COUNT(*) c FROM medicines'),
    cnt("SELECT COUNT(*) c FROM medicines WHERE expiry IS NOT NULL AND expiry BETWEEN ? AND date(?, '+30 days')", today, today),
    cnt('SELECT COUNT(*) c FROM events WHERE start >= ? AND start < ?', today, tomorrow),
    db.prepare(
      "SELECT COALESCE(SUM(CASE WHEN flow='income' THEN amount ELSE 0 END),0) inc, " +
        "COALESCE(SUM(CASE WHEN flow='expense' THEN amount ELSE 0 END),0) exp " +
        "FROM transactions WHERE txn_date >= ? AND txn_date < ?"
    ).bind(month + '-01', nextMonth).first().catch(() => null),
    db.prepare('SELECT id,title,todo_date,todo_time,list,priority FROM todos WHERE done=0 AND todo_date <= ? ORDER BY todo_date ASC, todo_time ASC')
      .bind(today).all().catch(() => ({ results: [] })),
    db.prepare('SELECT id,title,start,all_day FROM events WHERE start >= ? AND start < ? ORDER BY start ASC')
      .bind(today, tomorrow).all().catch(() => ({ results: [] })),
    db.prepare('SELECT id, content, memo_date FROM memos ORDER BY id DESC LIMIT 5').all().catch(() => ({ results: [] })),
    db.prepare('SELECT memo_date d, content FROM memos WHERE substr(memo_date, 6) = ? ORDER BY memo_date DESC LIMIT 1')
      .bind(md).first().catch(() => null),
    db.prepare('SELECT COUNT(DISTINCT substr(log_date,1,4)) y FROM habit_logs WHERE substr(log_date, 6) = ?')
      .bind(md).first().catch(() => null),
    db.prepare('SELECT p.id, p.time_of_day t, p.days, m.name FROM med_plans p JOIN medicines m ON m.id=p.medicine_id WHERE p.active=1')
      .all().catch(() => ({ results: [] })),
    db.prepare('SELECT plan_id FROM med_logs WHERE log_date=?').bind(today).all().catch(() => ({ results: [] })),
  ]);

  // 品牌 / 外观设置
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
    radius: settings.radius || '',
    gap_y: settings.gap_y || '',
    gap_x: settings.gap_x || '',
  };

  // 习惯今日完成情况（按目标值判定是否完成）
  const habitList = allHabitsRes.results || [];
  const weekLogs = weekLogsRes.results || [];
  const hlMap = {};
  weekLogs.forEach((l) => { if (l.log_date === today) hlMap[l.habit_id] = l; });
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
    upcomingBirthdays = (cRowsRes.results || []).filter((c) => !c.is_deceased && birthdayWithin30Of(c)).length;
  } catch (_) { /* 忽略 */ }

  const stats = {
    todos: { overdue: todosOverdue, today: todosTodayCnt, week: todosWeek },
    habits: { done: habitDoneCount, total: habitList.length },
    ledger: {},
    medicines: { total: medTotal, expiring: medExpiring },
    events: { today: eventsTodayCnt },
    relations: { upcoming: upcomingBirthdays },
  };
  stats.ledger.income = ledgerRow ? Number(ledgerRow.inc) : 0;
  stats.ledger.expense = ledgerRow ? Number(ledgerRow.exp) : 0;
  stats.ledger.balance = stats.ledger.income - stats.ledger.expense;

  // 「今天要处理」：待办（逾期/今日）+ 今日事件
  const todayTasks = [];
  (todoRowsRes.results || []).forEach((t) => {
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
  (eventRowsRes.results || []).forEach((e) => {
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

  // ===== v0.6.0 P3 聚合：随手记 / 今日服药 / 那年今天（数据已在上方并行取得） =====
  const memos = (memosRes.results || []).map((r) => ({ id: r.id, content: r.content, date: r.memo_date }));

  // 今日服药计划（到期未处理的）
  const doneSet = new Set((medLogRows.results || []).map((r) => r.plan_id));
  const medToday = (medPlanRows.results || [])
    .filter((p) => String(p.days || '1,2,3,4,5,6,7').split(',').includes(String(dow)) && !doneSet.has(p.id))
    .sort((a, b) => a.t.localeCompare(b.t))
    .slice(0, 5)
    .map((p) => ({ id: p.id, medicine: p.name, time: p.t }));

  // 那年今天：有记录的年份数 + 最近一条样例
  let onthisday = null;
  if ((otSample && otSample.d !== today) || (otYears && otYears.y)) {
    onthisday = { years: otYears ? otYears.y : 0, sample: otSample ? { date: otSample.d, content: otSample.content } : null };
  }

  return json({
    version: '0.5.47',
    brand,
    appearance,
    today,
    todayLabel: `${now.getMonth() + 1}月${now.getDate()}日 星期${weekdayCN(now)}`,
    weekday: weekdayCN(now),
    stats,
    todayTasks,
    pendingHabits,
    p3: { memos, medToday, onthisday },
  });
}
