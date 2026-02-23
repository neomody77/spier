#!/usr/bin/env bash
# Spier — installer for Claude Code
#
# Method 1 (recommended): Claude Code plugin system
#   /plugin marketplace add neomody77/spier
#   /plugin install spier@spier-marketplace
#
# Method 2: One-line install from source
#   curl -fsSL https://raw.githubusercontent.com/neomody77/spier/main/install.sh | bash
#
set -euo pipefail

# --- Check prerequisites ---
if ! command -v node &>/dev/null; then
  echo "Error: node is not installed."
  echo "Install Node.js 18+: https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found v$(node -v))"
  exit 1
fi

# --- Clone or use local repo ---
if [ -f "$(dirname "$0")/package.json" ] && grep -q '"spier"' "$(dirname "$0")/package.json" 2>/dev/null; then
  REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
  echo "Using local repo: $REPO_DIR"
else
  REPO_DIR=$(mktemp -d)
  echo "Cloning spier..."
  git clone --depth 1 https://github.com/neomody77/spier.git "$REPO_DIR"
  CLEANUP=1
fi

cd "$REPO_DIR"

SKILL_DIR="${HOME}/.claude/skills/spier"
mkdir -p "$SKILL_DIR"

echo "Installing dependencies..."
npm install --no-audit --no-fund

echo "Building extension..."
(cd extension && npm run build)

echo "Copying skill files..."
cp skills/spier/SKILL.md "$SKILL_DIR/SKILL.md"

# --- Cleanup temp clone ---
if [ "${CLEANUP:-}" = "1" ]; then
  rm -rf "$REPO_DIR"
fi

echo ""
echo "Spier installed to $SKILL_DIR"
echo ""
echo "Next steps:"
echo "  1. Load extension in Chrome: chrome://extensions → Load unpacked → $REPO_DIR/extension/.output/chrome-mv3"
echo "  2. Click the Spier icon in Chrome toolbar to enable it"
echo "  3. Use /spier in Claude Code"
