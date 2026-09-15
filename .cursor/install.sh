#!/usr/bin/env bash
# Cloud Agent install step for the bookmate (Hasel) Astro app.
# Idempotent: safe to run multiple times and against cached state.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

SQLCL_ZIP_URL="${SQLCL_ZIP_URL:-https://download.oracle.com/otn_software/java/sqldeveloper/sqlcl-latest.zip}"

sqlcl_double_quote() {
  # SQLcl/SQL*Plus string literal: wrap in double quotes, double any inner quotes.
  local s=$1
  s=${s//\"/\"\"}
  printf '"%s"' "$s"
}

java_major_version() {
  java -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -n1
}

ensure_java() {
  local major
  if command -v java >/dev/null 2>&1; then
    major="$(java_major_version || true)"
    if [[ -n "${major:-}" && "$major" -ge 17 ]]; then
      echo "[install] Java ${major} found"
      return 0
    fi
    echo "[install] Java ${major:-unknown} is too old for SQLcl (need 17+)"
  else
    echo "[install] Java not found"
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "[install] ERROR: cannot install Java (sudo not available)" >&2
    return 1
  fi

  echo "[install] installing OpenJDK 21..."
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openjdk-21-jre-headless
}

sqlcl_version_ok() {
  local sql_bin=$1
  local out
  [[ -x "$sql_bin" ]] || return 1
  out="$("$sql_bin" -version 2>&1 || true)"
  grep -qi 'sqlcl' <<<"$out"
}

find_sqlcl() {
  local candidate
  if command -v sql >/dev/null 2>&1; then
    candidate="$(command -v sql)"
    if sqlcl_version_ok "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi
  for candidate in /opt/sqlcl/bin/sql "${HOME}/.local/opt/sqlcl/bin/sql"; do
    if sqlcl_version_ok "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_local_bin_on_profile() {
  local snippet='export PATH="$HOME/.local/bin:$PATH"'
  mkdir -p "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
  if [[ -f "$HOME/.profile" ]] && grep -Fqs '.local/bin' "$HOME/.profile"; then
    return 0
  fi
  printf '\n# Added by .cursor/install.sh so SQLcl (sql) is on PATH\n%s\n' "$snippet" >> "$HOME/.profile"
}

can_sudo() {
  command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null
}

install_sqlcl() {
  local tmp rc=0
  tmp="$(mktemp -d)"

  set +e
  (
    set -euo pipefail
    echo "[install] downloading SQLcl from Oracle OTN software..."
    curl -fL --retry 3 --retry-delay 2 \
      -A "Mozilla/5.0 (compatible; bookmate-cloud-agent-install)" \
      -o "$tmp/sqlcl.zip" \
      "$SQLCL_ZIP_URL"

    if can_sudo; then
      sudo unzip -qo "$tmp/sqlcl.zip" -d /opt
      if [[ ! -x /opt/sqlcl/bin/sql ]]; then
        echo "[install] ERROR: /opt/sqlcl/bin/sql missing after unzip" >&2
        exit 1
      fi
      sudo ln -sfn /opt/sqlcl/bin/sql /usr/local/bin/sql
    else
      mkdir -p "$HOME/.local/opt" "$HOME/.local/bin"
      unzip -qo "$tmp/sqlcl.zip" -d "$HOME/.local/opt"
      if [[ ! -x "$HOME/.local/opt/sqlcl/bin/sql" ]]; then
        echo "[install] ERROR: $HOME/.local/opt/sqlcl/bin/sql missing after unzip" >&2
        exit 1
      fi
      ln -sfn "$HOME/.local/opt/sqlcl/bin/sql" "$HOME/.local/bin/sql"
    fi
  )
  rc=$?
  rm -rf "$tmp"
  set -e

  if [[ $rc -ne 0 ]]; then
    echo "[install] ERROR: SQLcl download/install failed" >&2
    return "$rc"
  fi

  if ! can_sudo; then
    ensure_local_bin_on_profile
  fi
  hash -r 2>/dev/null || true
}

ensure_sqlcl() {
  local sql_bin
  if sql_bin="$(find_sqlcl)"; then
    echo "[install] SQLcl already installed ($sql_bin)"
    "$sql_bin" -version 2>&1 | head -n 3 || true
    return 0
  fi

  ensure_java
  install_sqlcl

  if ! sql_bin="$(find_sqlcl)"; then
    echo "[install] ERROR: SQLcl install finished but 'sql' is not usable" >&2
    return 1
  fi
  echo "[install] SQLcl installed ($sql_bin)"
  "$sql_bin" -version 2>&1 | head -n 3 || true
}

sanitize_sqlcl_output() {
  # Never echo CONNECT / password lines if SQLcl repeats them.
  grep -viE 'password|-pw[[:space:]]|connect[[:space:]]' || true
}

oracle_smoke_test() {
  local sql_bin user_q pass_q url_q cloud_q connect_line output rc
  sql_bin="$(find_sqlcl)"

  user_q="$(sqlcl_double_quote "$ORACLE_USER")"
  pass_q="$(sqlcl_double_quote "$ORACLE_PASSWORD")"
  url_q="$(sqlcl_double_quote "$ORACLE_CONNECT_STRING")"

  # Wallet path is optional and must come from the environment — never hardcoded.
  cloud_q=""
  if [[ -n "${ORACLE_CLOUD_CONFIG:-}" ]]; then
    cloud_q="$(sqlcl_double_quote "$ORACLE_CLOUD_CONFIG")"
  fi

  if [[ -n "${TNS_ADMIN:-}" ]]; then
    echo "[install] TNS_ADMIN is set; SQLcl will use it"
  fi
  if [[ -n "$cloud_q" ]]; then
    echo "[install] ORACLE_CLOUD_CONFIG is set; passing -cloudconfig to SQLcl"
    connect_line="CONNECT -cloudconfig ${cloud_q} -user ${user_q} -password ${pass_q} -url ${url_q}"
  else
    connect_line="CONNECT -user ${user_q} -password ${pass_q} -url ${url_q}"
  fi

  echo "[install] running Oracle smoke test: SELECT USER FROM dual;"
  set +e
  output="$(
    {
      if command -v timeout >/dev/null 2>&1; then
        timeout 60s "$sql_bin" -S /nolog
      else
        "$sql_bin" -S /nolog
      fi
    } <<EOF 2>&1
WHENEVER SQLERROR EXIT FAILURE
WHENEVER OSERROR EXIT FAILURE
SET DEFINE OFF
SET VERIFY OFF
SET ECHO OFF
SET FEEDBACK OFF
SET HEADING OFF
SET PAGESIZE 0
${connect_line}
SELECT USER FROM dual;
EXIT SUCCESS
EOF
  )"
  rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    echo "[install] ERROR: Oracle smoke test failed (exit ${rc})" >&2
    printf '%s\n' "$output" | sanitize_sqlcl_output >&2
    return 1
  fi

  if printf '%s\n' "$output" | grep -qE 'ORA-[0-9]+'; then
    echo "[install] ERROR: Oracle smoke test returned ORA- error" >&2
    printf '%s\n' "$output" | sanitize_sqlcl_output >&2
    return 1
  fi

  echo "[install] Oracle smoke test ok"
  printf '%s\n' "$output" | sanitize_sqlcl_output | sed '/^[[:space:]]*$/d' || true
}

maybe_oracle_smoke_test() {
  local missing=()
  [[ -n "${ORACLE_USER:-}" ]] || missing+=(ORACLE_USER)
  [[ -n "${ORACLE_PASSWORD:-}" ]] || missing+=(ORACLE_PASSWORD)
  [[ -n "${ORACLE_CONNECT_STRING:-}" ]] || missing+=(ORACLE_CONNECT_STRING)

  if ((${#missing[@]} > 0)); then
    echo "[install] Oracle smoke test skipped (secrets not set). Missing: ${missing[*]}" >&2
    echo "[install] Set ORACLE_USER, ORACLE_PASSWORD, and ORACLE_CONNECT_STRING to enable. Wallet/TNS_ADMIN is optional via env (never hardcoded)." >&2
    return 0
  fi

  oracle_smoke_test
}

corepack enable >/dev/null 2>&1 || true

pnpm install --frozen-lockfile

# Astro/Vite loads env by mode; `astro dev` reads `.env.development`.
# It is gitignored, so materialize a DEV file pointing at the public aoxdev
# ORDS endpoints when one is not already present. No secrets are written here.
if [ ! -f .env.development ]; then
  cat > .env.development <<'EOF'
# Auto-generated by .cursor/install.sh for Cloud Agent DEV. Edit as needed.
ORDS_API_BASE_URL=https://g9549f707e8ebfa-aoxdevelop.adb.sa-saopaulo-1.oraclecloudapps.com/ords/aoxdev/api/v1/
ORDS_PUBLIC_API_BASE_URL=https://g9549f707e8ebfa-aoxdevelop.adb.sa-saopaulo-1.oraclecloudapps.com/ords/aoxdev/public/v1/
ORDS_AI_BASE_URL=https://g9549f707e8ebfa-aoxdevelop.adb.sa-saopaulo-1.oraclecloudapps.com/ords/aoxdev/ai/

PUBLIC_BOOKMATE_PUBLIC_DOMAIN=http://localhost:4321
PUBLIC_BOOKMATE_PROFILE_PLACEHOLDER_IMAGE_URL=https://placehold.co/200x200?text=Bookmate
PUBLIC_G_MAPS_API_KEY=
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
PUBLIC_FIREBASE_MEASUREMENT_ID=
PUBLIC_FIREBASE_VAPID_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4321/api/google/callback

ESIGN_API_BASE_URL=https://api-staging.etick.uno
ESIGN_API_KEY=sk_test_placeholder
ESIGN_CALLBACK_SERVICE_TOKEN=
CRON_SECRET=

PUBLIC_STADIA_MAPS_KEY=
PUBLIC_ODONTOGRAM_GLB_URL=https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/gr7djv0kcgrr/b/bucket-hasel-aoxdev/o/odontograma%2Fboca.glb
EOF
  echo "[install] created .env.development"
else
  echo "[install] .env.development already present, leaving as-is"
fi

ensure_sqlcl
maybe_oracle_smoke_test
