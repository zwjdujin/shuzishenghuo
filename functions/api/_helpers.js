// 习惯相关共享逻辑（下划线前缀，不会被当作路由）
// progressOf：计算某习惯今日完成进度
// parseHabitBody：解析并校验 create / update 提交字段

export function progressOf(habit, log) {
  if (habit.type === 'sleep') {
    const bed = log ? (log.done_bed || 0) : 0;
    const rise = log ? (log.done_rise || 0) : 0;
    const nap = log ? (log.done_nap || 0) : 0;
    const completed = bed + rise + nap;
    return {
      done_bed: bed, done_rise: rise, done_nap: nap,
      target: 3, needed: 3, completed,
      todayDone: completed >= 3,
    };
  }
  const done = log ? Number(log.done || 0) : 0;
  const target = Number(habit.target) || 1;
  return {
    done, target, needed: target, completed: done,
    todayDone: done >= target,
  };
}

export function parseHabitBody(body, current) {
  const out = current ? { ...current } : {};
  const name = String(body.name || '').trim();
  if (!name) return { error: '请填写习惯名称' };

  let category = String(body.category || '').trim();
  if (category === '__custom__') {
    category = String(body.customCategory || '').trim() || '自定义';
  } else if (!category) {
    category = '自定义';
  }

  const type = body.type === 'sleep' ? 'sleep' : 'normal';
  const icon = String(body.icon || 'sprout').trim() || 'sprout';
  const color = String(body.color || 'sage').trim() || 'sage';

  const habit = {
    name,
    category,
    type,
    icon,
    color,
    method: 'count',
    target: 1,
    unit: '次',
    bed_time: '',
    rise_time: '',
    nap_time: '',
  };

  if (type === 'sleep') {
    habit.bed_time = String(body.bed_time || '').trim();
    habit.rise_time = String(body.rise_time || '').trim();
    habit.nap_time = String(body.nap_time || '').trim();
  } else {
    habit.method = body.method === 'duration' ? 'duration' : 'count';
    let target = Number(body.target);
    if (!Number.isFinite(target) || target <= 0) target = 1;
    habit.target = target;
    habit.unit = String(body.unit || '').trim() || (habit.method === 'duration' ? '分钟' : '次');
  }
  return { habit };
}
