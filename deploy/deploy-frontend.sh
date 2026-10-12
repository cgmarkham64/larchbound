#!/usr/bin/env bash
# Run from the repo root, on your laptop (not the Lightsail box).
# Builds the frontend and syncs it to S3, then invalidates CloudFront so the
# new build is served immediately instead of waiting out cache TTLs.
#
# Fill in BUCKET_NAME and DISTRIBUTION_ID below once both exist in the console.
set -euo pipefail

BUCKET_NAME="larchbound-frontend-761018878668-us-east-1-an"
DISTRIBUTION_ID="E3MBP3XVUNPUJX"

VITE_API_URL= npm run build

aws s3 sync dist/ "s3://${BUCKET_NAME}" --delete

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*"

echo "Deployed dist/ to s3://${BUCKET_NAME} and invalidated CloudFront distribution ${DISTRIBUTION_ID}."