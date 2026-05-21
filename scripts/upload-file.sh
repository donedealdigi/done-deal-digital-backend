#!/usr/bin/env bash
#
# Admin CLI to upload a client file to https://api.donedealdigital.com
# Uses the /api/admin/files/upload endpoint (multipart/form-data).
#
# Usage:
#   ADMIN_EMAIL=donedealdigital@gmail.com ADMIN_PASSWORD=... \
#     ./upload-file.sh path/to/file.zip customer@example.com [category] [description]
#
# Requirements:
#   - curl, jq
#   - An admin user account on Done Deal Digital (role='admin' in users table)

set -euo pipefail

API="${API_URL:-https://api.donedealdigital.com}"

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <file-path> <customer-email> [category] [description]"
  echo "Env: ADMIN_EMAIL, ADMIN_PASSWORD"
  exit 1
fi

FILE="$1"
CUSTOMER_EMAIL="$2"
CATEGORY="${3:-}"
DESCRIPTION="${4:-}"

if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "Set ADMIN_EMAIL and ADMIN_PASSWORD env vars (admin user with role='admin' in DB)."
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

echo "=== Login as admin ==="
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | jq -r '.accessToken // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Login failed."
  exit 1
fi
echo "✓ Logged in"

echo "=== Uploading $(basename "$FILE") to $CUSTOMER_EMAIL ==="
RESPONSE=$(curl -s -X POST "$API/api/admin/files/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$FILE" \
  -F "customerEmail=$CUSTOMER_EMAIL" \
  ${CATEGORY:+-F "category=$CATEGORY"} \
  ${DESCRIPTION:+-F "description=$DESCRIPTION"})

echo "$RESPONSE" | jq .

if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  echo "✓ Upload successful"
else
  echo "✗ Upload failed"
  exit 1
fi
