#!/bin/bash
set -e

LIVE_WORKER_URL="https://alma-ai-admin.almagroupbranding.workers.dev"
DEFAULT_REPO="$HOME/Documents/GitHub/pub"

echo "================================================="
echo " The Alma SAFE Website Patch Helper v3"
echo "================================================="
echo ""
echo "This version:"
echo "  1. unzips an update package"
echo "  2. copies files into your local pub repo"
echo "  3. NEVER deletes existing files"
echo "  4. protects site-config.js with the live Worker URL"
echo "  5. stops only if Git reports actual deleted files"
echo ""

read -p "Local pub repo path [$DEFAULT_REPO]: " REPO_PATH
REPO_PATH="${REPO_PATH:-$DEFAULT_REPO}"
REPO_PATH="${REPO_PATH/#\~/$HOME}"

if [ ! -d "$REPO_PATH/.git" ]; then
  echo ""
  echo "ERROR: I could not find a Git repo at:"
  echo "$REPO_PATH"
  exit 1
fi

echo ""
echo "Drag the update .zip file into this Terminal window, then press Enter."
read -p "Update zip: " ZIP_PATH
ZIP_PATH="${ZIP_PATH%\"}"
ZIP_PATH="${ZIP_PATH#\"}"
ZIP_PATH="${ZIP_PATH/#\~/$HOME}"

if [ ! -f "$ZIP_PATH" ]; then
  echo ""
  echo "ERROR: I could not find the zip file:"
  echo "$ZIP_PATH"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
unzip -q "$ZIP_PATH" -d "$TMP_DIR"

UPDATE_ROOT="$(find "$TMP_DIR" -maxdepth 4 -type f \( -name "index.html" -o -name "site-config.js" -o -name "food-drink.html" \) -print -quit | xargs dirname)"

if [ -z "$UPDATE_ROOT" ] || [ ! -d "$UPDATE_ROOT" ]; then
  echo ""
  echo "ERROR: Could not find website files inside the zip."
  rm -rf "$TMP_DIR"
  exit 1
fi

cd "$REPO_PATH"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo ""
  echo "WARNING: Your repo already has uncommitted tracked changes."
  echo "Commit or discard those first."
  git status --short
  rm -rf "$TMP_DIR"
  exit 1
fi

echo ""
echo "Copying files safely. Existing files will not be deleted."
rsync -a --exclude ".git" --exclude ".DS_Store" "$UPDATE_ROOT/" "$REPO_PATH/"

cat > "$REPO_PATH/site-config.js" <<EOF
// The Alma AI settings
// LIVE WORKER URL — do not overwrite this file in future uploads.
window.ALMA_AI_API = "$LIVE_WORKER_URL";
EOF

echo ""
echo "Changed files:"
git status --short

DELETIONS="$(git status --porcelain | awk 'substr($0,1,2) ~ /D/ {print}')"
if [ -n "$DELETIONS" ]; then
  echo ""
  echo "STOP: actual deleted files detected:"
  echo "$DELETIONS"
  echo "Nothing committed."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo ""
read -p "Commit and push these changes? Type YES to continue: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Cancelled. Nothing committed."
  rm -rf "$TMP_DIR"
  exit 0
fi

read -p "Commit message [Update Alma menus and signage content]: " COMMIT_MSG
COMMIT_MSG="${COMMIT_MSG:-Update Alma menus and signage content}"

git add -A
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "$COMMIT_MSG"
  git push
fi

WORKER_FILE="$(find "$UPDATE_ROOT" -maxdepth 2 -type f \( -name "CLOUDFLARE-WORKER*.js" -o -name "*WORKER*CODE*.js" \) -print -quit)"
if [ -n "$WORKER_FILE" ] && command -v pbcopy >/dev/null 2>&1; then
  cat "$WORKER_FILE" | pbcopy
  echo ""
  echo "Cloudflare Worker code copied to clipboard:"
  echo "$WORKER_FILE"
fi

echo ""
echo "Done."
echo "Check:"
echo "https://almagroupbranding.github.io/pub/food-drink.html"
echo ""
rm -rf "$TMP_DIR"
