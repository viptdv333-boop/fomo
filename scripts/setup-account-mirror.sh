#!/usr/bin/env bash
# Turns on the account mirror between the two instances on the server (docs/terminal-instance.md, "Единый аккаунт"):
#   /opt/fomo           (fomo.spot,          pm2 `fomo`)           -> ACCOUNT_MIRROR_PEER_URL = http://127.0.0.1:<port of fomo-terminal>
#   /opt/fomo-terminal  (terminal.fomo.spot, pm2 `fomo-terminal`)  -> ACCOUNT_MIRROR_PEER_URL = http://127.0.0.1:<port of fomo>
# and the SAME ACCOUNT_MIRROR_SECRET in both .env files.
#
# Run on the server:  bash scripts/setup-account-mirror.sh
# Idempotent: the secret (openssl rand -hex 32) is generated ONLY when /opt/fomo/.env has none; running it again changes nothing.
# Other lines of the .env files are never touched; the files are rewritten in place (same owner, mode and inode); the secret is never
# printed. Prints only "OK ..." (already in place) / "changed ..." lines. It restarts nothing: the deploy (scripts/deploy-swap.sh does
# `pm2 restart --update-env`) or `pm2 restart fomo fomo-terminal --update-env` makes the processes read the new variables.
# Overrides: MAIN_DIR, TERMINAL_DIR, MAIN_PORT, TERMINAL_PORT (otherwise PORT from each .env, defaults 3000 and 3100).
set -euo pipefail

MAIN_DIR="${MAIN_DIR:-/opt/fomo}"
TERMINAL_DIR="${TERMINAL_DIR:-/opt/fomo-terminal}"
MAIN_ENV="${MAIN_DIR}/.env"
TERMINAL_ENV="${TERMINAL_DIR}/.env"

die() { echo "ERROR: $*" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || die "missing command: openssl"
[ -f "$MAIN_ENV" ] || die "no $MAIN_ENV"
[ -f "$TERMINAL_ENV" ] || die "no $TERMINAL_ENV"
[ -w "$MAIN_ENV" ] || die "$MAIN_ENV is not writable (run as the owner of the file, or with sudo)"
[ -w "$TERMINAL_ENV" ] || die "$TERMINAL_ENV is not writable (run as the owner of the file, or with sudo)"

# value of KEY in an .env file (last assignment wins; one pair of surrounding quotes and a trailing CR are removed); empty when absent
get_val() {
  local key="$1" file="$2" line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  case "$line" in
    \"*\") line="${line#\"}"; line="${line%\"}" ;;
    \'*\') line="${line#\'}"; line="${line%\'}" ;;
  esac
  printf '%s' "$line"
}

# set KEY=VALUE in FILE without touching any other line: replaces the line(s) of KEY, or appends one. Prints one status line (no values).
set_val() {
  local key="$1" value="$2" file="$3" current tmp
  current="$(get_val "$key" "$file")"
  if [ "$current" = "$value" ]; then
    echo "OK      ${file}: ${key} already set"
    return 0
  fi
  tmp="$(mktemp)"
  if grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file"; then
    # replace in place; ENVIRON keeps the value away from awk's escape processing
    KEY="$key" VAL="$value" awk '
      $0 ~ "^[ \t]*(export[ \t]+)?" ENVIRON["KEY"] "=" { if (!done) { print ENVIRON["KEY"] "=" ENVIRON["VAL"]; done = 1 } ; next }
      { print }
    ' "$file" > "$tmp"
    cat "$tmp" > "$file"   # write through the existing file: owner, mode and inode stay
    echo "changed ${file}: ${key} updated"
  else
    if [ -s "$file" ] && [ "$(tail -c 1 "$file" | od -An -c | tr -d ' ')" != '\n' ]; then
      printf '\n' >> "$file"
    fi
    printf '%s=%s\n' "$key" "$value" >> "$file"
    echo "changed ${file}: ${key} added"
  fi
  rm -f "$tmp"
}

port_of() {
  local file="$1" fallback="$2" p
  p="$(get_val PORT "$file")"
  case "$p" in
    ''|*[!0-9]*) echo "$fallback" ;;
    *) echo "$p" ;;
  esac
}

MAIN_PORT="${MAIN_PORT:-$(port_of "$MAIN_ENV" 3000)}"
TERMINAL_PORT="${TERMINAL_PORT:-$(port_of "$TERMINAL_ENV" 3100)}"

# the secret: the one of /opt/fomo/.env if it has a usable one, otherwise a new one (the only place a secret is created)
SECRET="$(get_val ACCOUNT_MIRROR_SECRET "$MAIN_ENV")"
if [ "${#SECRET}" -lt 32 ]; then
  SECRET="$(openssl rand -hex 32)"
fi

set_val ACCOUNT_MIRROR_SECRET "$SECRET" "$MAIN_ENV"
set_val ACCOUNT_MIRROR_SECRET "$SECRET" "$TERMINAL_ENV"
set_val ACCOUNT_MIRROR_PEER_URL "http://127.0.0.1:${TERMINAL_PORT}" "$MAIN_ENV"
set_val ACCOUNT_MIRROR_PEER_URL "http://127.0.0.1:${MAIN_PORT}" "$TERMINAL_ENV"
unset SECRET
