-- 0014 · v0.5.46 令牌生命周期
-- api_tokens 增加过期时间（NULL = 永不过期，存量令牌兼容）。
-- 校验集中在 _tokens.js resolveToken；改密时吊销全部令牌（auth/password.js）。
-- 前端生成令牌时可选 30/90/365 天或永久（index.html tokenForm + app.js submitToken）。

ALTER TABLE api_tokens ADD COLUMN expires_at TEXT;
