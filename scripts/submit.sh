#!/bin/sh
# Downloads the latest finished EAS production APK and submits it to the Solana dApp Store.
# Run locally so the publisher key stays on this machine.
# Needs: DAPP_STORE_API_KEY env var, keypair at ~/publisher-keypair.json
# Usage: npm run submit -- "What's new in this version"
set -e
cd "$(dirname "$0")/.."
URL=$(eas build:list --platform android --status finished --limit 1 --json --non-interactive \
  | node -pe "JSON.parse(require('fs').readFileSync(0))[0].artifacts.buildUrl")
echo "Downloading $URL"
curl -fL "$URL" -o /tmp/solpin.apk
./node_modules/.bin/dapp-store --apk-file /tmp/solpin.apk \
  --keypair "$HOME/publisher-keypair.json" \
  --whats-new "${1:-Bug fixes and improvements}" \
  --verbose
