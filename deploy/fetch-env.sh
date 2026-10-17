#!/usr/bin/env bash
# Run on the Lightsail box (not locally). Regenerates server/.env from SSM
# Parameter Store using the larchbound-api-ssm-reader credentials configured
# via `aws configure`. Re-run after rotating any param, then
# restart the container to pick up the refreshed file.
set -euo pipefail

REGION="us-east-1"
PREFIX="/larchbound/prod"
ENV_FILE="$HOME/larchbound/server/.env"

get_param() {
  aws ssm get-parameter \
    --name "${PREFIX}/$1" \
    --with-decryption \
    --region "$REGION" \
    --query "Parameter.Value" \
    --output text
}

JWT_SECRET="$(get_param JWT_SECRET)"
MONGODB_URI="$(get_param MONGODB_URI)"
CORS_ORIGIN="$(get_param CORS_ORIGIN)"
ORIGIN_VERIFY_SECRET="$(get_param ORIGIN_VERIFY_SECRET)"
AI_FEATURES_ENABLED="$(get_param AI_FEATURES_ENABLED)"
ANTHROPIC_API_KEY="$(get_param ANTHROPIC_API_KEY)"
USDA_FDC_API_KEY="$(get_param USDA_FDC_API_KEY)"

cat > "$ENV_FILE" <<EOF
PORT=8000
JWT_SECRET=${JWT_SECRET}
MONGODB_URI=${MONGODB_URI}
CORS_ORIGIN=${CORS_ORIGIN}
ORIGIN_VERIFY_SECRET=${ORIGIN_VERIFY_SECRET}
AI_FEATURES_ENABLED=${AI_FEATURES_ENABLED}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
USDA_FDC_API_KEY=${USDA_FDC_API_KEY}
EOF

chmod 600 "$ENV_FILE"
echo "Wrote $ENV_FILE from SSM. Now run:"
echo "  docker compose -f ~/larchbound/docker-compose.prod.yml up -d --force-recreate"
