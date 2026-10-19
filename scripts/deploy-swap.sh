#!/bin/bash
# Swap-deploy of both instances on the VPS (fomo.spot in /opt/fomo and terminal.fomo.spot in /opt/fomo-terminal):
# build into .next-build, swap it in only if the build produced a BUILD_ID, restart pm2, report the commit.
# Run on the server:  cd /opt/fomo && git pull -q && bash scripts/deploy-swap.sh
# (docs: the long one-liner of the same steps was cut off by the serial console, hence the file)

deploy() {
  local dir="$1" app="$2" old="$3" pull="$4"
  cd "$dir" || return 1
  git pull -q $pull
  rm -rf .next-build
  NEXT_DIST_DIR=.next-build npm run build 2>&1 | tail -3
  if [ -f .next-build/BUILD_ID ]; then
    rm -rf "$old" && mv .next "$old" && mv .next-build .next \
      && pm2 restart "$app" --update-env >/dev/null && sleep 15 \
      && echo "DEPLOYNN DONE $app $(git rev-parse --short HEAD)"
  else
    echo "BUILD FAILED $app"
  fi
}

deploy /opt/fomo fomo .next-prev ""
deploy /opt/fomo-terminal fomo-terminal .next-old "--ff-only"
