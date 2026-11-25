import { json, todayStr } from '../../_lib.js';

// GET /api/habits/heatmap?days=30
// 返回每个分类最近 days 天里「每日完成比例」(0~1) 的热力图数据
export async function onRequestGet(context) {
  const { env } = context;
  const rawDays = Number(new URL(context.request.url).searchParams.get('days'));
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 30, 14), 365);
  const today = todayStr();

  const habits = await env.DB.prepare(
    'SELECT id, name, category, type, color, target, freq_type, freq_value, created_at FROM habits'
  ).all();
  const hrows = habits.results || [];

  // 按分类聚合：每个分类包含哪些习惯（含创建日期与频率，用于分母）
  const catMap = {}; // name -> { color, habits:[habit行] }
  hrows.forEach((h) => {
    const c = h.category || '自定义';
    if (!catMap[c]) catMap[c] = { color: h.color || 'sage', habits: [] };
    if (!catMap[c].color) catMap[c].color = h.color || 'sage';
    catMap[c].habits.push(h);
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

  // 累加 每日每分类 的 completed（完成量）。
  // v0.5.56（审计 P2-10）：分母不再从 logRows 里累加——那会把「当天没打卡的习惯」排除在分母外，
  // 同分类 3 个习惯只打了 1 个，该格就显示 100%。分母改为「该分类当日已存在的全部习惯的日目标之和」
  // （创建日晚于当日的习惯不计；频率型习惯把周期目标摊到天：每周 N 次 → 目标×N/7，每 N 天一次 → 目标/N）。
  const agg = {}; // `${date}|${cat}` -> { completed }
  const ensure = (date, cat) => {
    const k = date + '|' + cat;
    if (!agg[k]) agg[k] = { completed: 0 };
    return agg[k];
  };
  logRows.forEach((l) => {
    const cat = l.category || '自定义';
    const a = ensure(l.log_date, cat);
    if (l.type === 'sleep') {
      a.completed += (l.done_bed || 0) + (l.done_rise || 0) + (l.done_nap || 0);
    } else {
      const target = Number(l.target) || 1;
      // 完成度按目标封顶，避免超量打卡把整格刷满后影响比例
      a.completed += Math.min(target, Number(l.done || 0));
    }
  });

  // 生成日期序列
  const dayList = [];
  for (let i = 0; i < days; i++) {
    dayList.push(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
  }

  // 单个习惯的「日目标」（分母摊到天）
  const dayNeed = (h) => {
    if ((h.type || 'normal') === 'sleep') return 3;
    const target = Number(h.target) || 1;
    const fv = Math.max(1, Number(h.freq_value) || 1);
    if (h.freq_type === 'weekly') return (target * fv) / 7;    // 每周 N 次
    if (h.freq_type === 'interval') return target / fv;        // 每 N 天一次
    return target;                                             // 每天目标
  };

  const categories = Object.keys(catMap).map((name) => {
    const values = dayList.map((date) => {
      const a = agg[date + '|' + name];
      const hs = catMap[name].habits.filter((h) => String(h.created_at || '').slice(0, 10) <= date);
      const needed = hs.reduce((s, h) => s + dayNeed(h), 0);
      if (!a || needed <= 0) return 0;
      return Math.min(1, a.completed / needed);
    });
    return { name, color: catMap[name].color, values };
  });

  return json({ days: dayList, categories });
}
