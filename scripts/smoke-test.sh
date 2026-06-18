#!/usr/bin/env bash
# smoke-test.sh — quick regression check after every push
# Fails fast on the first problem found.
set -euo pipefail

PASS=0
FAIL=0
DOMAIN="https://thedreamlaboratory.org"

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Scoot smoke test ==="

# ── 1. Container running ─────────────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -q "^scoot-app-1$"; then
  ok "container scoot-app-1 is running"
else
  fail "container scoot-app-1 is NOT running"
  echo ""
  echo "Run: cd ri/physical && docker compose up -d"
  exit 1
fi

# ── 2. No Vite import errors in recent logs ──────────────────────────────────
if docker logs scoot-app-1 --since=5m 2>&1 | grep -q "Failed to resolve import"; then
  fail "Vite has unresolved import errors (white page risk)"
  echo ""
  echo "  Recent errors:"
  docker logs scoot-app-1 --since=5m 2>&1 | grep "Failed to resolve import" | head -5 | sed 's/^/    /'
  echo ""
  echo "  Fix: run 'docker exec scoot-app-1 npm install <missing-pkg>'"
else
  ok "no Vite import errors in last 5 min"
fi

# ── 3. Express health endpoint ───────────────────────────────────────────────
HEALTH=$(curl -sf --max-time 5 http://localhost:3000/api/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "Express /api/health responding"
else
  fail "Express /api/health not responding"
fi

# ── 4. Public HTTPS loads ─────────────────────────────────────────────────────
HTTP_CODE=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" "$DOMAIN" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "$DOMAIN returns 200"
else
  fail "$DOMAIN returned HTTP $HTTP_CODE (expected 200)"
fi

# ── 5. API reachable through Apache ─────────────────────────────────────────
API_CODE=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" "$DOMAIN/api/health" 2>/dev/null || echo "000")
if [ "$API_CODE" = "200" ]; then
  ok "$DOMAIN/api/health returns 200 through Apache"
else
  fail "$DOMAIN/api/health returned HTTP $API_CODE"
fi

# ── 6. SMS inbound endpoint reachable ────────────────────────────────────────
SMS_CODE=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" \
  -X POST "$DOMAIN/api/v1/sms/inbound" \
  -d "From=%2B15550000000&Body=smoke-test&MessageSid=SMsmoke" \
  -H "Content-Type: application/x-www-form-urlencoded" 2>/dev/null || echo "000")
# 403 = reached handler, sig rejected (expected without real Twilio sig)
# 200 = reached handler, sig skipped (TWILIO_SKIP_SIGNATURE=true)
if [ "$SMS_CODE" = "403" ] || [ "$SMS_CODE" = "200" ]; then
  ok "SMS inbound endpoint reachable (HTTP $SMS_CODE)"
else
  fail "SMS inbound endpoint returned HTTP $SMS_CODE (expected 200 or 403)"
fi

# ── 7. BigMo bot registered ──────────────────────────────────────────────────
CONTAINER_LOGS=$(docker logs scoot-app-1 2>&1 || true)
if echo "$CONTAINER_LOGS" | grep -q "Bot ready: bigmo"; then
  ok "BigMo bot registered on startup"
else
  fail "BigMo bot not found in container logs"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "  $PASS passed, $FAIL failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Smoke test FAILED. Fix the issues above before pushing."
  echo "(To skip: git push --no-verify)"
  exit 1
else
  echo "Smoke test passed."
fi
