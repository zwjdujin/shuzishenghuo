-- 0005 · v0.5.9 智能管理：外部访问令牌
-- 明文令牌只在生成时返回一次，库里存 sha256 哈希；scopes 为 JSON：
--   {"ledger":{"read":true,"write":false},"todos":{...},...}
-- 功能键：ledger todos calendar habits medicine relations memos
-- 该表不参与备份/清空（凭据等同密码，见 _tables.js EXCLUDE）。

CREATE TABLE IF NOT EXISTS api_tokens(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,               -- 明文前 10 位，用于列表辨认
  scopes TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_used_at TEXT
);
