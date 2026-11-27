#!/usr/bin/env bash
# Build both apps and package them for upload to S3.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/deployment/regional-assets"
cd "$root/source"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build
rm -rf "$out" && mkdir -p "$out"
for app in frontend backend; do
  extra=""
  [ "$app" = "frontend" ] && extra="frontend/public" # index.html, styles.css and the bundled 3D app
  tar -czf "$out/$app.tar.gz" "$app/package.json" "$app/dist" $extra data-models/package.json data-models/dist
done
# TODO: bundle runtime dependencies. The instances have no internet access.
echo "Artifacts written to $out"
