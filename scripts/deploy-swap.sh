#!/bin/bash
# Swap-deploy of both instances on the VPS (fomo.spot in /opt/fomo and terminal.fomo.spot in /opt/fomo-terminal):
# build into .next-build, swap it in only if the build produced a BUILD_ID, restart pm2, report the commit.
# Run on the server:  cd /opt/fomo && git pull -q && bash scripts/deploy-swap.sh
# (docs: the long one-liner of the same steps was cut off by the serial console, hence the file)

# NOTE: no NODE_EXTRA_CA_CERTS here on purpose (it would widen TLS trust for every outbound request). The ALGOPACK gateway (apim.moex.com) and T-Invest are
# signed by the Russian root CA; the app trusts it for those hosts only, through ALGOPACK_CA_FILE (or RU_ROOT_CA_FILE) in .env (docs/algopack-tls.md).

# The VPS is small (12 GB) and the robots of terminal2 keep ~7 GB of it: a build with no memory to spare pushed the machine into swap and it froze
# (load 144, serial console and sites dead, hard reboot needed). So: do not even start without MIN_AVAIL_MB available, cap the Node heap, and build at
# the lowest CPU / disk priority so that the running apps and robots keep going. A skipped / failed build leaves the running version untouched.
MIN_AVAIL_MB=${MIN_AVAIL_MB:-3000}
HEAP_MB=${HEAP_MB:-2304}

deploy() {
  local dir="$1" app="$2" old="$3" pull="$4"
  cd "$dir" || return 1
  local avail
  avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  if [ "${avail:-0}" -lt "$MIN_AVAIL_MB" ]; then
    echo "NOT ENOUGH MEMORY for $app: ${avail} MB available, need $MIN_AVAIL_MB: build skipped, the running version stays"
    return 1
  fi
  git pull -q $pull
  rm -rf .next-build
  NODE_OPTIONS="--max-old-space-size=$HEAP_MB" NEXT_DIST_DIR=.next-build nice -n 19 ionice -c3 npm run build 2>&1 | tail -3
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
