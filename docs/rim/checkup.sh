#!/usr/bin/env bash
# Post-reboot checkup for the BigMo machine. READ-ONLY -- it writes nothing, which is
# why it is safe to run from the RIM position that owns nothing in the repo.
#
# Mechanical on purpose. A checklist a person has to remember is the detection failure
# our own proposed 3.1b calls "accidental"; this is the same checks, run by a command.
# Where a check could pass on a proxy, it reads the artifact instead -- content type
# rather than HTTP status, both registry doctors rather than the agreeable one.
#
# Usage:  ~/RIM/checkup.sh          Exit 0 = all green.
set -uo pipefail
export SCOOT_RIM_OWNERSHIP="${SCOOT_RIM_OWNERSHIP:-$HOME/.scoot-rim/ownership.toml}"
AGENTD=$HOME/scoot-rim-agentd/scoot-rim-agentd
SCOOTRIM=$HOME/scoot-win-term/linux-agent/scoot-rim
fails=0; warns=0
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fails=$((fails+1)); }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$1"; warns=$((warns+1)); }
sec()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

sec "1. Host"
up=$(uptime -p); ok "uptime: $up"
avail=$(free -m | awk '/Mem:/{print $7}')
[ "$avail" -gt 600 ] && ok "memory available: ${avail}MB" || bad "memory available: ${avail}MB (under 600)"
oom=$(journalctl -k --since "-1 hour" 2>/dev/null | grep -ci 'out of memory')
[ "$oom" = 0 ] && ok "no kernel OOM in the last hour" || bad "$oom kernel OOM events in the last hour"
[ -e /var/run/reboot-required ] && warn "a further reboot is flagged as required" || ok "no pending reboot flag"

sec "2. Containers (all must be running)"
for c in scoot-app-1 scoot-postgres-1 memory-vault-app-1 memory-vault-db-1 scoot-pmp-searxng; do
  st=$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null || echo missing)
  [ "$st" = running ] && ok "$c" || bad "$c is '$st'"
done

sec "3. Services and timers"
for u in docker apache2 scoot-pmp; do
  systemctl is-active --quiet $u && ok "$u active" || bad "$u is $(systemctl is-active $u)"
done
for t in card-render-worker.timer card-art-cold-sync.timer scoot-rim-reconcile.timer; do
  systemctl is-active --quiet $t && ok "$t armed" || bad "$t is $(systemctl is-active $t)"
done

sec "4. The bot, end to end"
h=$(curl -s -m 10 localhost:3000/api/health 2>/dev/null)
if echo "$h" | grep -q '"ok":true'; then
  ok "api/health responds"
  deg=$(echo "$h" | python3 -c 'import sys,json;print(",".join(json.load(sys.stdin).get("degraded",[])) or "none")' 2>/dev/null)
  [ "$deg" = none ] && ok "no degraded dependencies" || warn "degraded: $deg"
else bad "api/health did not respond"; fi
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST localhost:3000/api/v1/sms/inbound -d 'Body=&From=' 2>/dev/null)
[ -n "$code" ] && [ "$code" != 000 ] && ok "SMS inbound endpoint reachable (HTTP $code)" || bad "SMS inbound endpoint unreachable"
sched=$(docker exec scoot-postgres-1 psql -U scoot -d scoot -Atc \
  "select count(*) from scoot_sessions where starts_at > now()" 2>/dev/null)
[ "${sched:-0}" -gt 0 ] && ok "$sched future sessions on the schedule" \
  || bad "no future sessions -- BigMo will refuse to name a date (run the Monday seeder)"

sec "5. Both vhosts, by CONTENT TYPE not status code"
for host in fairchildlabs.org thedreamlaboratory.org; do
  ct=$(curl -sD- -o /dev/null --resolve $host:443:127.0.0.1 \
       https://$host/rim-sim/_shared/sim_common.css 2>/dev/null | awk 'BEGIN{IGNORECASE=1}/^content-type:/{gsub(/\r/,"");print $2}')
  [ "${ct%%;*}" = "text/css" ] && ok "$host serves the stylesheet as text/css" \
    || bad "$host returned '${ct:-nothing}' for the stylesheet (an SPA fallback looks like 200 OK)"
done

sec "6. Session registry -- BOTH doctors, because they can disagree"
$AGENTD doctor >/dev/null 2>&1 && ok "agentd: log internally consistent" || warn "agentd doctor reports issues"
if $SCOOTRIM doctor >/dev/null 2>&1; then ok "scoot-rim: registry matches what is running"
else warn "scoot-rim: registry INCOMPLETE -- $($SCOOTRIM doctor 2>&1 | tail -2 | head -1)"; fi

sec "7. Drift checks (proposed 3.1b, the ones that exist)"
if diff -rq /var/www/html/rim-sim "$HOME/scoot/docs/rim-sim" >/dev/null 2>&1; then
  ok "served RIM pages match the committed copy"
else
  warn "served RIM pages differ from the repo copy:"; diff -rq /var/www/html/rim-sim "$HOME/scoot/docs/rim-sim" 2>&1 | sed 's/^/       /' | head -5
fi
un=$(cd "$HOME/scoot" && git status --short | wc -l)
[ "$un" = 0 ] && ok "scoot working tree clean" || warn "$un uncommitted files in scoot"

sec "Result"
if [ $fails -eq 0 ] && [ $warns -eq 0 ]; then echo "  ALL GREEN"; exit 0
elif [ $fails -eq 0 ]; then echo "  $warns warning(s), nothing failed"; exit 0
else echo "  $fails FAILURE(S), $warns warning(s)"; exit 1; fi
