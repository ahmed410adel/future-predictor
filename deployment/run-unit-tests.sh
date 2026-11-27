#!/usr/bin/env bash
# Install dependencies and run the tests of every package.
set -euo pipefail
cd "$(dirname "$0")/../source"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build
npm test
