#!/bin/bash
set -e

LIVE_WORKER_URL="https://alma-ai-admin.almagroupbranding.workers.dev"
DEFAULT_REPO="$HOME/Documents/GitHub/pub"

echo "================================================="
echo " The Alma SAFE Website Patch Helper v2"
echo "================================================="
echo ""
echo "This version:"
echo "  1. unzips an update package"
echo "  2. copies files into your local pub repo"
echo "  3. NEVER deletes existing files"
echo "  4. protects site-config.js with the live Worker URL"
echo "  5. refuses to commit only if ACTUAL deletions are detected"
echo ""

read -p "Local pub repo path [$DEFAULT_REPO]: " REPO_PATH
REPO_PATH="${REPO_PATH:-$DEFAULT_REPO}"
REPO_PATH="${REPO_PATH/#\~/$HOME}"

if [ ! -d "$REPO_PATH/.git" ]; then
  echo ""
  echo "ERROR: I could not find a Git repo at:"
  echo "$REPO_PATH"
  echo ""
  echo "Open GitHub Desktop, clone almagroupbranding/pub, then run this again."
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
echo ""
echo "Unzipping update..."
unzip -q "$ZIP_PATH" -d "$TMP_DIR"

UPDATE_ROOT="$(find "$TMP_DIR" -maxdepth 4 -type f \( -name "ai-admin.html" -o -name "index.html" -o -name "site-config.js" \) -print -quit | xargs dirname)"

if [ -z "$UPDATE_ROOT" ] || [ ! -d "$UPDATE_ROOT" ]; then
  echo ""
  echo "ERROR: Could not find website files inside the zip."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Found update files in:"
echo "$UPDATE_ROOT"
echo ""

cd "$REPO_PATH"

echo "Checking for uncommitted existing changes first..."
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo ""
  echo "WARNING: Your local repo already has changes."
  echo "Open GitHub Desktop and either commit or discard those first."
  echo ""
  echo "Current changes:"
  git status --short
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Copying files safely into local repo..."
echo "No existing files will be deleted."

rsync -a \
  --exclude ".git" \
  --exclude ".DS_Store" \
  "$UPDATE_ROOT/" "$REPO_PATH/"

cat > "$REPO_PATH/site-config.js" <<EOF
// The Alma AI settings
// LIVE WORKER URL — do not overwrite this file in future uploads.
window.ALMA_AI_API = "$LIVE_WORKER_URL";
EOF

echo ""
echo "Checking site-config.js..."
if grep -q "$LIVE_WORKER_URL" "$REPO_PATH/site-config.js"; then
  echo "OK: site-config.js has the live Worker URL."
else
  echo "ERROR: site-config.js does not contain the live Worker URL."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo ""
echo "Changed files:"
git status --short

DELETIONS="$(git status --porcelain | awk 'substr($0,1,2) ~ /D/ {print}')"
if [ -n "$DELETIONS" ]; then
  echo ""
  echo "STOP: actual deletions detected."
  echo "$DELETIONS"
  echo ""
  echo "Nothing has been committed."
  echo "Open GitHub Desktop and discard changes, then ask for help."
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

read -p "Commit message [Upgrade Alma site with current content and photos]: " COMMIT_MSG
COMMIT_MSG="${COMMIT_MSG:-Upgrade Alma site with current content and photos}"

echo ""
echo "Committing and pushing..."
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
  echo "Cloudflare Worker code was found and copied to your clipboard:"
  echo "$WORKER_FILE"
  echo "Open Cloudflare Worker editor, select all, paste, and Deploy."
fi

echo ""
echo "Done."
echo "Live site: https://almagroupbranding.github.io/pub/"
echo "Hard refresh if needed: Command + Shift + R"
echo ""

rm -rf "$TMP_DIR"
