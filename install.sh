#!/bin/bash
set -e

SKILL_DIR="${HOME}/.claude/skills/spier"
mkdir -p "$SKILL_DIR"

echo "Installing dependencies..."
bun install

echo "Building server..."
bun build server/src/index.ts --target=bun --outfile="$SKILL_DIR/server.js" --minify

echo "Building extension..."
(cd extension && bun run build)

rm -rf "$SKILL_DIR/extension"
cp -r extension/.output/chrome-mv3 "$SKILL_DIR/extension"
cp skills/spier/SKILL.md "$SKILL_DIR/SKILL.md"

echo ""
echo "Spier installed to $SKILL_DIR"
echo ""
echo "  1. Load extension: chrome://extensions -> Load unpacked -> $SKILL_DIR/extension"
echo "  2. Use /spier in Claude Code"
