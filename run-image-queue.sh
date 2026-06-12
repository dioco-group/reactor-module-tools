#!/usr/bin/env bash
# Wait for each book's extraction to finish, then run image generation.
# Runs sequentially to keep API load modest. Logs to /tmp/images-<book>.log
set -u
cd "$(dirname "$0")"

for c in alc-lla-24 alc-lla-4 alc-st-4 alc-st-24; do
  echo "[queue] waiting for extraction of $c to finish..."
  while pgrep -f "configs/$c/pdf-extract.json" >/dev/null 2>&1; do
    sleep 15
  done
  echo "[queue] extraction of $c done; starting image generation $(date -Is)"
  node pdf-extract/generate-images.js "configs/$c/pdf-extract.json" > "/tmp/images-$c.log" 2>&1
  echo "[queue] image generation of $c finished $(date -Is)"
done
echo "[queue] all image generation complete $(date -Is)"
