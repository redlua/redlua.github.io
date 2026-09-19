#!/usr/bin/env bash
#
# red — the RedGet command (Linux / macOS)
#
#   ./red.sh help                every command
#   ./red.sh version             version, Node release, file inventory
#   ./red.sh startup             print startup.txt
#   ./red.sh serve [port]        run the site on http://localhost:4173
#   ./red.sh list                every forge in an exported database
#   ./red.sh export <forge>      copy a forge's files to your computer
#   ./red.sh check               run the validation suite
#   ./red.sh doctor              diagnose this install
#
# Everything lives next to this script; nothing is installed, downloaded or
# written outside the folder you ask for.

set -u

# The folder this script sits in, resolved through symlinks.
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [ "${SOURCE#/}" = "$SOURCE" ] && SOURCE="$DIR/$SOURCE"
done
ROOT="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"   # repo root = parent of cmd/

CLI="$ROOT/tools/cli.mjs"
VERSION_FILE="$ROOT/package.json"

read_version() {
  if [ -f "$VERSION_FILE" ]; then
    sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$VERSION_FILE" | head -1
  fi
}

usage() {
  VERSION="$(read_version)"
  cat <<EOF

  RedGet ${VERSION:-unknown} — a code forge that runs entirely in your browser

  USAGE
    ./red.sh <command> [options]
    red.bat <command> [options]        on Windows

  COMMANDS
    help, --help, -h                   this text
    version, --version, -v             version, Node release, file inventory
    info, about, --info, --about       about this install — what, where, commands
    startup, --startup, -s             how to open the site (prints startup.txt)
    serve [port], --serve              run RedGet on http://localhost:4173
    list, --list                       every forge in an exported database
    export <forge> [dir], --export     copy one forge's files to your computer
    export --all [dir]                 copy every forge, one folder each
    check, --check                     run the validation suite
    doctor, --doctor                   diagnose this install

  START THE SITE
    ./red.sh serve                     then open http://localhost:4173
    ./red.sh serve 8080                on another port

  COPY A FORGE OUT
    1. in RedGet:  Settings → Data → "Export data as JSON"
    2. put redget-data.json next to this script
    3. ./red.sh list
       ./red.sh export atlas ./atlas
       ./red.sh export --all ./backup

  MORE
    ./red.sh startup                   the full guide
    cat "$ROOT/startup.txt"

EOF
}

need_node() {
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="node"
  elif command -v nodejs >/dev/null 2>&1; then
    NODE_BIN="nodejs"
  else
    echo "red: Node.js is not installed (or not on PATH)." >&2
    echo "" >&2
    echo "  The site itself needs no Node — open index.html through any static" >&2
    echo "  server, for example:   python3 -m http.server 4173" >&2
    echo "  For the red commands:  https://nodejs.org  (v18 or newer)" >&2
    echo "" >&2
    exit 1
  fi

  if [ ! -f "$CLI" ]; then
    echo "red: $CLI is missing — run this script from the RedGet folder." >&2
    exit 1
  fi
}

case "${1:-help}" in
  help|-h|-?|--help|"")
    usage
    ;;

  version|-v|--version)
    VERSION="$(read_version)"
    echo "RedGet ${VERSION:-unknown}"
    if command -v node >/dev/null 2>&1; then
      echo "  node      $(node --version)"
      echo "  root      $ROOT"
      MODULES="$(find "$ROOT/src" -name '*.js' 2>/dev/null | wc -l | tr -d ' ')"
      VIEWS="$(find "$ROOT/src/views" -name '*.js' 2>/dev/null | wc -l | tr -d ' ')"
      CSS="$(find "$ROOT/assets/css" -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
      echo "  modules   ${MODULES:-0} ES modules, ${VIEWS:-0} views, ${CSS:-0} stylesheets"
      echo "  storage   localStorage key redget.db.v5"
    else
      echo "  node      not installed — the site still runs, the checks do not"
      echo "  root      $ROOT"
    fi
    ;;

  startup|-s|--startup)
    if [ -f "$ROOT/startup.txt" ]; then
      cat "$ROOT/startup.txt"
    else
      echo "red: startup.txt is missing from $ROOT" >&2
      exit 1
    fi
    ;;

  serve|start|--serve|--start)
    need_node
    shift
    exec "$NODE_BIN" "$CLI" serve "$@"
    ;;

  list|ls|--list|--ls)
    need_node
    exec "$NODE_BIN" "$CLI" list "${@:2}"
    ;;

  export|copy|--export|--copy)
    need_node
    exec "$NODE_BIN" "$CLI" export "${@:2}"
    ;;

  check|test|--check|--test)
    need_node
    exec "$NODE_BIN" "$CLI" check
    ;;

  doctor|--doctor|diagnose)
    need_node
    exec "$NODE_BIN" "$CLI" doctor
    ;;

  info|about|-i|--info|--about)
    need_node
    exec "$NODE_BIN" "$CLI" info
    ;;

  *)
    echo "red: \"$1\" is not a command. Try ./red.sh help" >&2
    exit 1
    ;;
esac
