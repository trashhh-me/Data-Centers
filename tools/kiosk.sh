#!/bin/sh
# Opens the story full-screen in Chromium on the kiosk PC. Works with the network cable unplugged.
# Add ?staff=1 to the URL on a staff device to show the "Export votes (CSV)" button.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec chromium --kiosk --noerrdialogs --disable-infobars --no-first-run --overscroll-history-navigation=0 \
  --allow-file-access-from-files "file://$DIR/index.html"
