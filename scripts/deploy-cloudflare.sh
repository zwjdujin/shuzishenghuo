#!/usr/bin/env bash
# ==============================================================================
# 数字生活 (shuzishenghuo) —— Cloudflare 一键部署脚本
# 用法:
#   CLOUDFLARE_API_TOKEN=<你的API Token> \
#   CLOUDFLARE_ACCOUNT_ID=<你的账户ID> \
#   ADMIN_PASS=<你想设的管理员密码> \
#   [ADMIN_USER=admin] [SESSION_SECRET=<可选随机串>] \
#   bash scripts/deploy-cloudflare.sh
#
# 前置: 已安装 wrangler (本机路径 ~/.bun/bin/wrangler)
# 说明: 本脚本只读取环境变量，绝不把任何密钥写进代码/仓库。
# ==============================================================================
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

# ---------- 必填环境变量检查 ----------
: "${CLOUDFLARE_API_TOKEN:?请设置 CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?请设置 CLOUDFLARE_ACCOUNT_ID}"
: "${ADMIN_PASS:?请设置 ADMIN_PASS (管理员登录密码)}"

ADMIN_USER="${ADMIN_USER:-admin}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')}"
PROJECT="shuzishenghuo"
DB_PLACEHOLDER="f22fddc8-5f8f-4498-9dab-539fea617bba"

echo "==> 校验 wrangler 登录态"
wrangler whoami

# ---------- 1) 创建 D1 数据库（已存在则忽略）----------
echo "==> 确保 D1 数据库 $PROJECT 存在"
if ! wrangler d1 create "$PROJECT" --yes 2>&1 | tee /tmp/d1create.log; then
  if grep -qi "already exist" /tmp/d1create.log; then
    echo "    (数据库已存在，继续)"
  else
    echo "!! d1 create 失败，请检查 API Token 的 d1:write 权限" >&2
    exit 1
  fi
fi

# 取出真实 database_id（优先 --json，回退到表格解析）
DB_ID="$(wrangler d1 list --json 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print([x['uuid'] for x in d if x['name']=='$PROJECT'][0])" 2>/dev/null || \
        wrangler d1 list 2>/dev/null | grep -i "$PROJECT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
if [ -z "${DB_ID:-}" ]; then
  echo "!! 无法获取 D1 database_id" >&2; exit 1
fi
echo "    D1 database_id = $DB_ID"

# 把占位 ID 替换为真实 ID，写回 wrangler.toml
if [ -f wrangler.toml ]; then
  sed -i "s/$DB_PLACEHOLDER/$DB_ID/" wrangler.toml
  echo "    wrangler.toml 已更新 database_id"
fi

# ---------- 2) 初始化表结构 + 示例数据 ----------
echo "==> 执行 schema.sql"
wrangler d1 execute "$PROJECT" --file=./schema.sql --yes
echo "==> 执行 seed.sql"
wrangler d1 execute "$PROJECT" --file=./seed.sql --yes

# ---------- 3) 创建 R2 存储桶（失败不阻断，当前版本未使用）----------
echo "==> 确保 R2 桶 $PROJECT 存在"
if ! wrangler r2 bucket create "$PROJECT" 2>&1 | tee /tmp/r2create.log; then
  if grep -qi "already exist" /tmp/r2create.log; then
    echo "    (R2 桶已存在，继续)"
  else
    echo "    [警告] R2 创建失败（可能缺少 r2 权限）；当前版本未使用 R2，可稍后手动创建。"
  fi
fi

# ---------- 4) 创建 Pages 项目（已存在则忽略）----------
echo "==> 确保 Pages 项目 $PROJECT 存在"
if ! wrangler pages project create "$PROJECT" --production-branch=main 2>&1 | tee /tmp/ppcreate.log; then
  if grep -qi "already exist" /tmp/ppcreate.log; then
    echo "    (Pages 项目已存在，继续)"
  else
    echo "!! pages project create 失败" >&2; exit 1
  fi
fi

# ---------- 5) 写入后台密钥（管理员账号/密码/签名密钥）----------
echo "==> 写入后台变量 (secrets)"
echo -n "$ADMIN_USER"      | wrangler pages secret put ADMIN_USER      --project-name="$PROJECT" --yes
echo -n "$ADMIN_PASS"      | wrangler pages secret put ADMIN_PASS      --project-name="$PROJECT" --yes
echo -n "$SESSION_SECRET"  | wrangler pages secret put SESSION_SECRET  --project-name="$PROJECT" --yes

# ---------- 6) 部署前端 + Functions ----------
echo "==> 部署到 Cloudflare Pages"
wrangler pages deploy ./public --project-name="$PROJECT" --commit-dirty=true

echo ""
echo "✅ 部署完成！访问你的 Pages 域名（控制台可查），用 ADMIN_USER / ADMIN_PASS 登录。"
echo "   若修改管理员账号密码，重新运行本脚本第 5 步即可（或到控制台改环境变量后重新部署）。"
