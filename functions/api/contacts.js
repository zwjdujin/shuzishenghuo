import { json } from '../_lib.js';
import { nextBirthdayOf } from './_profile.js';

// GET /api/contacts —— 联系人简表（日历生日合并、账本 @人名反查等跨模块使用）
export async function onRequestGet(context) {
  const { env } = context;
  const rows = (
    await env.DB.prepare('SELECT * FROM contacts ORDER BY name').all()
  ).results || [];

  const contacts = rows.map((r) => {
    const nb = r.is_deceased ? null : nextBirthdayOf(r);
    return {
      id: r.id,
      name: r.name,
      gender: r.gender || '',
      phone: r.phone || '',
      isDeceased: !!r.is_deceased,
      birthdayRemind: !!r.birthday_remind,
      nextBirthday: nb ? nb.date : '',
      daysLeft: nb ? nb.days : null,
      age: nb ? nb.age : null,
    };
  });

  const upcoming = contacts
    .filter((c) => c.daysLeft !== null && c.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return json({ contacts, upcoming });
}
