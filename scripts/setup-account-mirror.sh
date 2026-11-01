#!/usr/bin/env bash
# Turns on the account mirror between the two instances on the server (docs/terminal-instance.md, "Единый аккаунт"):
#   /opt/fomo           (fomo.spot,          pm2 `fomo`)           -> ACCOUNT_MIRROR_PEER_URL = http://127.0.0.1:<port of fomo-terminal>
#   /opt/fomo-terminal  (terminal.fomo.spot, pm2 `fomo-terminal`)  -> ACCOUNT_MIRROR_PEER_URL = http://127.0.0.1:<port of fomo>
# and the SAME ACCOUNT_MIRROR_SECRET in both .env files.
#
# Run on the server:  bash scripts/setup-account-mirror.sh
# Idempotent: the secret (openssl rand -hex 32) is generated ONLY when /opt/fomo/.env has none; running it again changes nothing.
# Other lines of the .env files are never touched. Before a file is changed it is copied (cp -p) into a private backup directory
# (mode 0700; default ~/.fomo-env-backups, override with BACKUP_DIR), the new content is written to a temporary file in the SAME directory
# (mode and owner copied from the original) and moved over the original in one atomic step (mv), so a failure never leaves a half-written
# .env. The secret is never printed. Prints only "OK ..." (already in place) / "changed ..." lines. It restarts nothing: the deploy
# (scripts/deploy-swap.sh does `pm2 restart --update-env`) or `pm2 restart fomo fomo-terminal --update-env` makes the processes read the
# new variables.
# Overrides: MAIN_DIR, TERMINAL_DIR, MAIN_PORT, TERMINAL_PORT (otherwise PORT from each .env, defaults 3000 and 3100), BACKUP_DIR.
set -euo pipefail
umask 077

MAIN_DIR="${MAIN_DIR:-/opt/fomo}"
TERMINAL_DIR="${TERMINAL_DIR:-/opt/fomo-terminal}"
MAIN_ENV="${MAIN_DIR}/.env"
TERMINAL_ENV="${TERMINAL_DIR}/.env"
BACKUP_DIR="${BACKUP_DIR:-${HOME:-/root}/.fomo-env-backups}"

# the temporary file of the edit in progress; removed on any exit (success, error, Ctrl-C)
tmp=""
trap 'rm -f "${tmp:-}"' EXIT

die() { echo "ERROR: $*" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || die "missing command: openssl"
for f in "$MAIN_ENV" "$TERMINAL_ENV"; do
  [ -f "$f" ] || die "no $f"
  [ -w "$f" ] || die "$f is not writable (run as the owner of the file, or with sudo)"
  [ -w "$(dirname "$f")" ] || die "$(dirname "$f") is not writable (the new file is written next to the old one)"
done

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

BACKED_UP=" "
backup_once() {
  local file="$1" name
  case "$BACKED_UP" in *" ${file} "*) return 0 ;; esac
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  name="$(printf '%s' "$file" | tr '/' '_')"
  cp -p "$file" "${BACKUP_DIR}/${name}.$(date +%Y%m%d-%H%M%S)"
  BACKED_UP="${BACKED_UP}${file} "
}

# set KEY=VALUE in FILE without touching any other line: replaces the line(s) of KEY, or appends one. Prints one status line (no values).
set_val() {
  local key="$1" value="$2" file="$3" current action
  current="$(get_val "$key" "$file")"
  if [ "$current" = "$value" ]; then
    echo "OK      ${file}: ${key} already set"
    return 0
  fi
  backup_once "$file"
  tmp="$(mktemp "${file}.XXXXXX")"
  cp -p "$file" "$tmp"                 # same mode (and owner, where permitted) as the original; the content is rewritten below
  chown --reference="$file" "$tmp" 2>/dev/null || true
  if grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file"; then
    action="updated"
    # replace in place; ENVIRON keeps the value away from awk's escape processing
    KEY="$key" VAL="$value" awk '
      $0 ~ "^[ \t]*(export[ \t]+)?" ENVIRON["KEY"] "=" { if (!done) { print ENVIRON["KEY"] "=" ENVIRON["VAL"]; done = 1 } ; next }
      { print }
    ' "$file" > "$tmp"
  else
    action="added"
    cat "$file" > "$tmp"
    if [ -s "$file" ] && [ "$(tail -c 1 "$file" | od -An -c | tr -d ' ')" != '\n' ]; then
      printf '\n' >> "$tmp"
    fi
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  # never replace a good .env with an empty or wrong file
  [ -s "$tmp" ] || die "the new ${file} would be empty, nothing was changed"
  [ "$(KEY="$key" VAL="$value" awk '$0 == ENVIRON["KEY"] "=" ENVIRON["VAL"] { n++ } END { print n + 0 }' "$tmp")" -ge 1 ] || die "the new ${file} lacks ${key}, nothing was changed"
  mv -f "$tmp" "$file"                 # atomic: same directory
  tmp=""
  echo "changed ${file}: ${key} ${action} (backup in ${BACKUP_DIR})"
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
