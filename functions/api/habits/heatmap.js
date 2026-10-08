import { json, todayStr } from '../../_lib.js';

function z(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }

// GET /api/habits/heatmap?days=120
// 返回每个分类最近 days 天里「每日完成比例」(0~1) 的热力图数据
export async function onRequestGet(context) {
  const { env } = context;
  const days = Math.min(Math.max(Number(context.request.url.split('days=')[1]) || 120, 14), 365);
  const today = todayStr();

  const habits = await env.DB.prepare('SELECT id, name, category, type, color FROM habits').all();
  const hrows = habits.results || [];

  // 按分类聚合：每个分类包含哪些习惯、各习惯类型、所需完成项数
  const catMap = {}; // name -> { color, habits:[{id,type}] }
  hrows.forEach((h) => {
    const c = h.category || '自定义';
    if (!catMap[c]) catMap[c] = { color: h.color || 'sage', habits: [] };
    if (!catMap[c].color) catMap[c].color = h.color || 'sage';
    catMap[c].habits.push({ id: h.id, type: h.type || 'normal' });
  });

  // 取区间内的打卡记录
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startStr = fmt(start);
  const logRows =
    (
      await env.DB.prepare(
        `SELECT hl.habit_id, hl.log_date, hl.done, hl.done_bed, hl.done_rise, h.category, h.type
         FROM habit_logs hl JOIN habits h ON h.id = hl.habit_id
         WHERE hl.log_date BETWEEN ? AND ?`
      )
        .bind(startStr, today)
        .all()
    ).results || [];

  // 累加 每日每分类 的 completed / needed
  const agg = {}; // `${date}|${cat}` -> {completed, needed}
  const ensure = (date, cat) => {
    const k = date + '|' + cat;
    if (!agg[k]) agg[k] = { completed: 0, needed: 0 };
    return agg[k];
  };
  logRows.forEach((l) => {
    const cat = l.category || '自定义';
    const a = ensure(l.log_date, cat);
    if (l.type === 'sleep') {
      a.needed += 2;
      a.completed += (l.done_bed || 0) + (l.done_rise || 0);
    } else {
      a.needed += 1;
      a.completed += l.done || 0;
    }
  });

  // 生成日期序列
  const dayList = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dayList.push(fmt(d));
  }

  const categories = Object.keys(catMap).map((name) => {
    const values = dayList.map((date) => {
      const a = agg[date + '|' + name];
      if (!a || a.needed === 0) return 0;
      return Math.min(1, a.completed / a.needed);
    });
    return { name, color: catMap[name].color, values };
  });

  return json({ days: dayList, categories });
}
