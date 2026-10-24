import { json, todayStr } from '../../_lib.js';

// GET /api/habits/heatmap?days=30
// 返回每个分类最近 days 天里「每日完成比例」(0~1) 的热力图数据
export async function onRequestGet(context) {
  const { env } = context;
  const rawDays = Number(new URL(context.request.url).searchParams.get('days'));
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 30, 14), 365);
  const today = todayStr();

  const habits = await env.DB.prepare('SELECT id, name, category, type, color, target FROM habits').all();
  const hrows = habits.results || [];

  // 按分类聚合：每个分类包含哪些习惯、各习惯类型、所需完成项数
  const catMap = {}; // name -> { color, habits:[{id,type,target}] }
  hrows.forEach((h) => {
    const c = h.category || '自定义';
    if (!catMap[c]) catMap[c] = { color: h.color || 'sage', habits: [] };
    if (!catMap[c].color) catMap[c].color = h.color || 'sage';
    catMap[c].habits.push({ id: h.id, type: h.type || 'normal', target: Number(h.target) || 1 });
  });

  // 日期序列：以北京「今天」为锚点做纯日期运算（ Workers 是 UTC，直接 setDate 会差 8 小时）
  const anchor = new Date(today + 'T00:00:00Z');
  const start = new Date(anchor.getTime() - (days - 1) * 86400000);
  const startStr = start.toISOString().slice(0, 10);
  const logRows =
    (
      await env.DB.prepare(
        `SELECT hl.habit_id, hl.log_date, hl.done, hl.done_bed, hl.done_rise, hl.done_nap, h.category, h.type, h.target
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
      a.needed += 3;
      a.completed += (l.done_bed || 0) + (l.done_rise || 0) + (l.done_nap || 0);
    } else {
      const target = Number(l.target) || 1;
      a.needed += target;
      // 完成度按目标封顶，避免超量打卡把整格刷满后影响比例
      a.completed += Math.min(target, Number(l.done || 0));
    }
  });

  // 生成日期序列
  const dayList = [];
  for (let i = 0; i < days; i++) {
    dayList.push(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
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
