#!/bin/bash
MSG="${1:-auto deploy}"
cd "$(dirname "$0")"
git pull --rebase 2>/dev/null
git add -A
git commit -m "$MSG"
git push origin HEAD
echo "Changes added, committed, and pushed successfully."
