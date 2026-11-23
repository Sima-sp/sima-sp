#!/usr/bin/env bash
# Cria infra/.env a partir do .env.example, com senhas e chave do token novas (#60).
# Uso: ./gerar-env.sh admin@exemplo.com   (o e-mail do primeiro administrador)
# Não sobrescreve um .env que já existe.
set -euo pipefail
cd "$(dirname "$0")"

if [ -e .env ]; then
  echo "infra/.env já existe; apague-o antes se quiser gerar outro." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "Precisa do openssl." >&2; exit 1; }

senha() { openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24; }
admin_email="${1:-admin@simasp.local}"
admin_senha="$(senha)"

vapid_pub=""
vapid_priv=""
if command -v npx >/dev/null; then
  if chaves="$(npx -y web-push generate-vapid-keys --json 2>/dev/null)"; then
    vapid_pub="$(printf '%s' "$chaves" | sed -E 's/.*"publicKey":"([^"]+)".*/\1/')"
    vapid_priv="$(printf '%s' "$chaves" | sed -E 's/.*"privateKey":"([^"]+)".*/\1/')"
  fi
fi

sed \
  -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(senha)|" \
  -e "s|^MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=$(senha)|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" \
  -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${admin_email}|" \
  -e "s|^ADMIN_SENHA=.*|ADMIN_SENHA=${admin_senha}|" \
  -e "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${vapid_pub}|" \
  -e "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${vapid_priv}|" \
  .env.example > .env
chmod 600 .env

echo "infra/.env criado."
echo "Admin: ${admin_email} (a senha está no .env, em ADMIN_SENHA)."
[ -n "$vapid_pub" ] || echo "Chaves do push vazias: gere com 'npx web-push generate-vapid-keys' e preencha VAPID_*."
