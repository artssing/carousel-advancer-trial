#!/usr/bin/env bash
# Empty-body smoke test (founder ruling 2026-08-02).
#
# Sends `{}` to every POST/PATCH route the API declares and asserts the answer
# is NOT 5xx. It does not need to know what any route means — which is the
# point: it permanently closes a whole class of bug rather than one instance.
#
# Why: 34 of 63 @Body() params are inline object literals, which vanish at
# runtime, so the global ValidationPipe skips them and an undefined value
# reaches Prisma, which throws, which surfaces as a 500. A 500 cannot be told
# apart from a real crash — during QA a case with one wrong body key produced a
# 500 that read exactly like a product bug and cost a full triage cycle.
#
#   ./scripts/qa-empty-body-smoke.sh                 # UAT (default)
#   API=http://localhost:4000/api ./scripts/qa-empty-body-smoke.sh
#
# Routes are discovered from the source, so a new controller is covered the day
# it lands, with nobody having to remember to add it here.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${API:-https://uat-api.certifinehk.com/api}"

case "$API" in
  *uat*|*localhost*|*127.0.0.1*) ;;
  *) echo "REFUSING: this only runs against UAT or localhost. Got: $API"; exit 2 ;;
esac

EMAIL="${QA_EMAIL:-qa-buyer@demo.hk}"
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("accessToken") or d.get("token",""))' 2>/dev/null)
[[ -z "$TOKEN" ]] && { echo "could not log in as $EMAIL"; exit 2; }

FAIL=0
CHECKED=0

# Extract (method, path) from every controller: the @Controller('base') prefix
# plus each @Post/@Patch('sub') below it.
# bash 3.2 (macOS default) has no `mapfile`, so read the list the long way.
ROUTES_RAW=$(python3 - "$ROOT" <<'PY'
import os, re, sys
root = sys.argv[1]
api = os.path.join(root, 'apps/api/src')
out = []
for dirpath, _, files in os.walk(api):
    for f in files:
        if not f.endswith('.controller.ts'):
            continue
        src = open(os.path.join(dirpath, f), encoding='utf-8').read()
        m = re.search(r"@Controller\(\s*'([^']*)'\s*\)", src)
        base = m.group(1) if m else ''
        for meth, sub in re.findall(r"@(Post|Patch)\(\s*'?([^')]*)'?\s*\)", src):
            path = '/'.join(p for p in [base, sub] if p)
            # A route with a path param needs a real id; feeding it a literal
            # ":id" tells us nothing, so skip rather than report a fake pass.
            if ':' in path:
                continue
            out.append(f"{meth.upper()} /{path}")
print('\n'.join(sorted(set(out))))
PY
)
ROUTES=()
while IFS= read -r line; do
  [ -n "$line" ] && ROUTES+=("$line")
done <<< "$ROUTES_RAW"

echo "▸ ${#ROUTES[@]} parameterless POST/PATCH routes against $API"
echo

for r in "${ROUTES[@]}"; do
  METHOD="${r%% *}"
  PATH_="${r#* }"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X "$METHOD" "$API$PATH_" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')
  CHECKED=$((CHECKED + 1))
  if [[ "$CODE" =~ ^5 ]]; then
    printf '  ✗ %-6s %-45s %s\n' "$METHOD" "$PATH_" "$CODE"
    FAIL=$((FAIL + 1))
  fi
done

echo
if [[ $FAIL -gt 0 ]]; then
  echo "FAIL — $FAIL of $CHECKED routes answered 5xx to an empty body"
  exit 1
fi
echo "PASS — $CHECKED routes, none answered 5xx to an empty body"
