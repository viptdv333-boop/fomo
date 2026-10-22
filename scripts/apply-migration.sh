#!/bin/bash
# Applies ONE idempotent migration file to BOTH instances' databases (fomo.spot in /opt/fomo, terminal.fomo.spot in /opt/fomo-terminal)
# and regenerates the Prisma client in each. Run BEFORE the swap-deploy of the code that needs it:
#   cd /opt/fomo && git pull -q && bash scripts/apply-migration.sh 20261022120000_tariff_plans && bash scripts/deploy-swap.sh
set -u
NAME="${1:-}"
if [ -z "$NAME" ]; then echo "usage: bash scripts/apply-migration.sh <migration-folder-name>"; exit 1; fi
for d in /opt/fomo /opt/fomo-terminal; do
  cd "$d" || exit 1
  git pull -q --ff-only
  FILE="prisma/migrations/$NAME/migration.sql"
  if [ ! -f "$FILE" ]; then echo "NO MIGRATION FILE in $d: $FILE"; exit 1; fi
  if npx prisma db execute --schema prisma/schema.prisma --file "$FILE" >/dev/null 2>&1; then
    npx prisma generate >/dev/null 2>&1 && echo "MIGRATED $d" || echo "MIGRATED $d but prisma generate FAILED"
  else
    echo "MIGRATION FAILED in $d"
    exit 1
  fi
done
echo MIGRATION DONE
