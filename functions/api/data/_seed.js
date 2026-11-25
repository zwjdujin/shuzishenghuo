// ===== 默认数据种子（v0.5.56，审计 P2-2）=====
// 与迁移里的播种语句保持一致（0001 分类 / 0013 账户 / 0016 清单 / 0008 药箱词库），
// 抽成可重放的一份：迁移建库时播一次，「清空全部数据」后重放一次——否则清空后
// 药箱的剂型/分类/位置下拉变空、账本没有默认分类和账户、待办没有「生活」清单。
// 全部幂等（WHERE NOT EXISTS / OR IGNORE），跑多少遍结果一致。

const TXN_CATEGORIES = [
  ['expense', '餐饮', 0], ['expense', '零食', 1], ['expense', '美妆', 2], ['expense', '烟酒', 3],
  ['expense', '日常', 4], ['expense', '购物', 5], ['expense', '交通', 6], ['expense', '娱乐', 7],
  ['expense', '社交', 8], ['expense', '装修', 9], ['expense', '旅游', 10], ['expense', '医疗', 11],
  ['expense', '学习', 12], ['expense', '其他', 13],
  ['income', '礼金', 0], ['income', '理财', 1], ['income', '报销', 2], ['income', '工资', 3],
  ['income', '奖金', 4], ['income', '生活费', 5], ['income', '外快兼职', 6], ['income', '退款', 7],
  ['income', '投资收益', 8], ['income', '其他', 9],
];

const TXN_ACCOUNTS = [
  ['默认账户', 0, 1], ['现金', 1, 0], ['微信', 2, 0], ['支付宝', 3, 0],
  ['银行卡', 4, 0], ['信用卡', 5, 0], ['医保卡', 6, 0], ['人情往来', 7, 0],
];

const TODO_LISTS = [
  ['生活', 0], ['工作', 1], ['健康', 2], ['学习', 3], ['家庭', 4],
];

const VOCAB = {
  med_form: ['片剂', '胶囊剂', '颗粒剂', '散剂', '口服液', '煎膏剂', '丸剂', '喷雾剂', '酊剂', '锭剂', '丹剂', '糖浆剂', '栓剂', '软膏剂', '注射剂', '其他'],
  med_category: ['外感呼吸病', '脾胃消化病', '头面五官病', '筋骨疼痛病', '妇科经带病', '泌尿男科病', '皮肤瘙痒病', '睡眠情志病', '心脑血管病', '气血阴阳虚', '儿科常见病', '外科肛肠病'],
  med_location: ['客厅药箱', '卧室床头', '厨房抽屉', '冰箱冷藏', '卫生间镜柜', '玄关抽屉', '随身包'],
};

/** 重放种子；返回播了哪些组（失败抛错，由调用方决定是否忽略） */
export async function reseedData(env) {
  const stmts = [];
  for (const [flow, name, sort] of TXN_CATEGORIES) {
    stmts.push(env.DB.prepare(
      'INSERT INTO txn_categories (flow, name, parent_id, sort_order) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM txn_categories WHERE flow=? AND name=? AND parent_id IS NULL)'
    ).bind(flow, name, null, sort, flow, name));
  }
  for (const [name, sort, def] of TXN_ACCOUNTS) {
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO txn_accounts (name, sort_order, is_default) VALUES (?,?,?)').bind(name, sort, def));
  }
  // 半执行兜底（与迁移 0013 一致）：库里没有默认账户时，把「默认账户」补为默认
  stmts.push(env.DB.prepare(
    "UPDATE txn_accounts SET is_default = 1 WHERE name = '默认账户' AND NOT EXISTS (SELECT 1 FROM txn_accounts WHERE is_default = 1)"
  ));
  for (const [name, sort] of TODO_LISTS) {
    stmts.push(env.DB.prepare(
      'INSERT INTO todo_lists(name, sort_order) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE name=?)'
    ).bind(name, sort, name));
  }
  for (const [kind, words] of Object.entries(VOCAB)) {
    words.forEach((w, i) => {
      stmts.push(env.DB.prepare(
        'INSERT INTO vocab(kind, word, hits, sort_order) SELECT ?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM vocab WHERE kind=? AND word=?)'
      ).bind(kind, w, i, kind, w));
    });
  }
  await env.DB.batch(stmts);
  return ['txn_categories', 'txn_accounts', 'todo_lists', 'vocab'];
}
