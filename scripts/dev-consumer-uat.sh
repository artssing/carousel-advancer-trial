#!/usr/bin/env bash
# Launch the consumer dev server bound to the UAT environment (port 3018,
# API 4010). Used by .claude/launch.json so the preview MCP can drive UAT.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/consumer"
exec env \
  NEXT_PUBLIC_API_URL="http://localhost:4010/api" \
  NEXT_PUBLIC_CONSUMER_URL="http://localhost:3018" \
  NEXT_PUBLIC_AUTHENTICATOR_URL="http://localhost:3011" \
  npx next dev -p 3018
