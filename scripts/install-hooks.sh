#!/usr/bin/env bash
# Install git hooks for this repo. Safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

# pre-push: run smoke test before every push
cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/usr/bin/env bash
exec "$(git rev-parse --show-toplevel)/scripts/smoke-test.sh"
EOF
chmod +x "$HOOKS_DIR/pre-push"
echo "✓ pre-push hook installed"
