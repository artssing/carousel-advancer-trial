#!/usr/bin/env bash
# Browser lane runner — Playwright inside a throwaway container.
#
# Founder ruling 2026-08-02: the container AND the image are removed after every
# run. That costs a ~1.5GB pull each time; it buys a machine that stays clean.
# To keep the image between runs, delete the `docker rmi` at the bottom.
#
#   ./docs/qa/browser/run.sh            # everything
#   ./docs/qa/browser/run.sh share      # only tests whose title matches "share"
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
IMAGE="mcr.microsoft.com/playwright:v1.49.0-jammy"
GREP="${1:-}"

GREP_ARG=""
[[ -n "$GREP" ]] && GREP_ARG="--grep '$GREP'"

# @playwright/test is installed globally INSIDE the throwaway container, and
# NODE_PATH points the config's import at it. The repo deliberately has no
# Playwright dependency: the browser lane must not drag a browser toolchain
# into the app's package.json, and this machine keeps nothing after the run.
RUN_CMD="npm install -g --silent @playwright/test@1.49.0 >/dev/null 2>&1 \
  && export NODE_PATH=\$(npm root -g) \
  && playwright test --config=docs/qa/browser/playwright.config.ts $GREP_ARG"

echo "▸ pulling $IMAGE (removed again when the run finishes)"
docker pull -q "$IMAGE"

echo "▸ running browser lane${GREP:+ (grep: $GREP)}"
docker run --rm \
  -v "$ROOT:/work" -w /work \
  -e QA_BASE_URL="${QA_BASE_URL:-https://uat.certifinehk.com}" \
  -e QA_API_URL="${QA_API_URL:-https://uat-api.certifinehk.com/api}" \
  "$IMAGE" bash -lc "$RUN_CMD"
STATUS=$?

echo "▸ removing image"
docker rmi "$IMAGE" >/dev/null 2>&1 || true

exit $STATUS
