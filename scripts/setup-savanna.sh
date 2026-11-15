#!/usr/bin/env bash
# Clone the Savanna starter into ./savanna and add the db-player tag to the lesson page.
# The starter's own files are not edited in any other way.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d savanna ]; then
  git clone --depth 1 https://github.com/alx-africa/Savanna-static-pages savanna
  rm -rf savanna/.git
fi
python3 scripts/mount_player.py savanna/pages/concept-with-navigation.html
echo "Done. Run: docker compose up   then open http://localhost:8080/pages/concept-with-navigation.html"
