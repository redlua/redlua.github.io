#!/usr/bin/env bash
#
# RedGet installer — Linux / macOS
#
#   curl -fsSL https://redlua.github.io/install.sh | bash
#
#   …or from a clone:      bash install.sh
#   …or non-interactive:   bash install.sh install | uninstall | about
#   …or piped + arg:       curl -fsSL https://redlua.github.io/install.sh | bash -s -- install
#
# Presents a RED INSTALLATION menu. Installing puts a `red` launcher on your
# PATH so you can run, from ANY folder (like git):
#
#   red            red --help     red --about    red --info    red version
#   red serve      red list       red export <forge>           red check
#
# When piped from curl there is no local copy, so the repo is downloaded to
# ~/.redget first. The website itself needs no install and no Node.

set -u

REPO_OWNER="redlua"
REPO_NAME="redlua.github.io"
BRANCH="main"
SITE="https://redlua.github.io"
TARBALL="https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${BRANCH}"
INSTALL_HOME="$HOME/.redget"

say() { printf '%s\n' "$*"; }
hr()  { say "  ----------------------------------------"; }

# ── where is this script? (empty when piped through `curl | bash`) ──────────
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

# A "local repo" is one with tools/cli.mjs sitting next to this script.
LOCAL_REPO=""
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/tools/cli.mjs" ]; then
  LOCAL_REPO="$SCRIPT_DIR"
fi

# ── node ────────────────────────────────────────────────────────────────────
NODE_BIN=""
find_node() {
  if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"
  elif command -v nodejs >/dev/null 2>&1; then NODE_BIN="$(command -v nodejs)"
  else NODE_BIN=""; fi
}
node_major() { if [ -n "$NODE_BIN" ]; then "$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; else echo 0; fi; }

# ── the repo `red` will point at: local clone, else the downloaded copy ─────
resolve_repo() {
  if [ -n "$LOCAL_REPO" ]; then printf '%s' "$LOCAL_REPO"; return; fi
  if [ -f "$INSTALL_HOME/tools/cli.mjs" ]; then printf '%s' "$INSTALL_HOME"; return; fi
  printf ''
}

download_repo() {
  dest="$INSTALL_HOME"
  say "  downloading RedGet to $dest …"
  tmp="$(mktemp "${TMPDIR:-/tmp}/redget.XXXXXX").tgz"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$TARBALL" -o "$tmp" || { rm -f "$tmp"; return 1; }
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$tmp" "$TARBALL" || { rm -f "$tmp"; return 1; }
  else
    say "  ✗ need curl or wget to download"; rm -f "$tmp"; return 1
  fi
  mkdir -p "$dest" || { rm -f "$tmp"; return 1; }
  tar -xzf "$tmp" -C "$dest" --strip-components=1 || { rm -f "$tmp"; return 1; }
  rm -f "$tmp"
  [ -f "$dest/tools/cli.mjs" ]
}

# ── bin dir + PATH ──────────────────────────────────────────────────────────
pick_bin() {
  if [ -n "${PREFIX:-}" ]; then printf '%s' "$PREFIX"; return; fi
  for d in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    if [ -d "$d" ] && [ -w "$d" ]; then printf '%s' "$d"; return; fi
    p="$(dirname "$d")"
    if [ ! -d "$d" ] && [ -d "$p" ] && [ -w "$p" ]; then printf '%s' "$d"; return; fi
  done
  printf '%s' "$HOME/.local/bin"
}
on_path() { case ":$PATH:" in *":$1:"*) return 0;; *) return 1;; esac; }
ensure_path() {
  bin="$1"
  on_path "$bin" && return 0
  say ""
  say "  $bin is not on your PATH yet. Add it with:"
  say ""
  say "      echo 'export PATH=\"$bin:\$PATH\"' >> ~/.bashrc     # or ~/.zshrc"
  say "      source ~/.bashrc"
  rc=""
  case "${SHELL:-}" in */zsh) rc="$HOME/.zshrc";; */bash) rc="$HOME/.bashrc";; esac
  if [ -z "$rc" ] && [ -f "$HOME/.profile" ]; then rc="$HOME/.profile"; fi
  if [ -n "$rc" ] && [ -f "$rc" ] && ! grep -qF "$bin" "$rc" 2>/dev/null; then
    printf '\n# Added by RedGet install.sh\nexport PATH="%s:$PATH"\n' "$bin" >> "$rc"
    say ""
    say "  (added it to $rc for you — open a new terminal, or run:  source $rc)"
  fi
  return 0
}

# ── read a line from the terminal even when piped via `curl | bash` ─────────
prompt() {
  printf '%s' "$1"
  if [ -t 0 ]; then read -r REPLY
  elif [ -e /dev/tty ]; then read -r REPLY < /dev/tty
  else REPLY=""; return 1
  fi
  return 0
}

# ── actions ─────────────────────────────────────────────────────────────────
do_install() {
  say ""; hr; say "  INSTALL red"; hr
  find_node
  if [ -z "$NODE_BIN" ]; then
    say "  ✗ Node.js v18+ is required for the red command."
    say "    Get it from https://nodejs.org, then re-run."
    say "    (The website itself needs no Node.)"
    return 1
  fi
  maj="$(node_major)"
  if [ "${maj:-0}" -lt 18 ] 2>/dev/null; then
    say "  ! Node $("$NODE_BIN" --version 2>/dev/null || echo '?') is older than v18; red may not run."
  fi

  repo="$(resolve_repo)"
  if [ -z "$repo" ]; then
    if download_repo; then repo="$INSTALL_HOME"
    else
      say "  ✗ could not download RedGet."
      say "    Try:  git clone https://github.com/$REPO_OWNER/$REPO_NAME && cd $REPO_NAME && bash install.sh"
      return 1
    fi
  fi
  CLI="$repo/tools/cli.mjs"
  if [ ! -f "$CLI" ]; then say "  ✗ $CLI is missing"; return 1; fi

  bin="$(pick_bin)"
  if [ ! -d "$bin" ]; then
    mkdir -p "$bin" 2>/dev/null || { say "  ✗ cannot create $bin — re-run:  sudo bash install.sh --prefix /usr/local/bin"; return 1; }
  fi
  if [ ! -w "$bin" ]; then say "  ✗ $bin is not writable — re-run:  sudo bash install.sh --prefix /usr/local/bin"; return 1; fi

  launcher="$bin/red"
  cat > "$launcher" <<EOF
#!/usr/bin/env bash
# RedGet launcher — installed by install.sh. Forwards everything to the CLI.
# Repo: $repo
exec "$NODE_BIN" "$CLI" "\$@"
EOF
  chmod +x "$launcher" 2>/dev/null || true

  say "  ✓ installed  $launcher"
  say "      → $NODE_BIN $CLI"
  ensure_path "$bin"
  say ""
  say "  Try it:"
  say "      red --help"
  say "      red --about"
  say "      red serve          # http://localhost:4173"
  say "      red export <forge>"
  return 0
}

do_uninstall() {
  say ""; hr; say "  UNINSTALL red"; hr
  removed=0
  for d in "${PREFIX:-}" /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    [ -n "$d" ] || continue
    if [ -e "$d/red" ]; then rm -f "$d/red" && { say "  removed $d/red"; removed=1; }; fi
  done
  if [ -d "$INSTALL_HOME" ]; then
    say ""
    say "  downloaded copy at $INSTALL_HOME"
    if prompt '  remove it too? [y/N]: '; then
      case "$REPLY" in
        y|Y|yes|YES) rm -rf "$INSTALL_HOME" && say "  removed $INSTALL_HOME";;
        *) say "  kept $INSTALL_HOME";;
      esac
    fi
  fi
  if [ "$removed" -eq 1 ]; then say "  ✓ red uninstalled."; else say "  nothing to remove."; fi
  return 0
}

do_about() {
  say ""; hr; say "  ABOUT red"; hr
  repo="$(resolve_repo)"; find_node
  if [ -n "$repo" ] && [ -n "$NODE_BIN" ] && [ -f "$repo/tools/cli.mjs" ]; then
    "$NODE_BIN" "$repo/tools/cli.mjs" --info
  else
    say "  RedGet — a complete code forge that runs entirely in your browser."
    say ""
    say "  live site   $SITE   (static · no build · no commands)"
    say "  install     curl -fsSL $SITE/install.sh | bash"
    say "  source      https://github.com/$REPO_OWNER/$REPO_NAME"
    say ""
    say "  commands    red help · red about · red info · red version · red startup"
    say "              red serve · red list · red export <forge> · red check · red doctor"
    say ""
    say "  (install first, then 'red --about' prints the full live details)"
  fi
  return 0
}

usage() {
  cat <<EOF

  RedGet installer

  USAGE
    curl -fsSL $SITE/install.sh | bash            interactive menu
    bash install.sh                               interactive menu (from a clone)
    bash install.sh install                       install non-interactively
    bash install.sh uninstall                     remove red
    bash install.sh about                         about red
    bash install.sh --prefix DIR install          install the launcher into DIR
    curl -fsSL $SITE/install.sh | bash -s -- install

EOF
}

menu() {
  while true; do
    cat <<EOF

  RED INSTALLATION
  ----------------
  1) install red        put the red command on your PATH
  2) uninstall red      remove it
  3) about red          what it is, version, every command
  4) quit

EOF
    if ! prompt '  choose [1-4]: '; then say "  no terminal available — run: bash install.sh install"; exit 1; fi
    case "$REPLY" in
      1) do_install ;;
      2) do_uninstall ;;
      3) do_about ;;
      4|q|Q) say "  bye"; exit 0 ;;
      "") : ;;
      *) say "  invalid choice" ;;
    esac
  done
}

# ── parse args ──────────────────────────────────────────────────────────────
ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="${2:-}"; shift 2;;
    --prefix=*) PREFIX="${1#*=}"; shift;;
    install|-i|--install) ARG="install"; shift;;
    uninstall|-u|--uninstall) ARG="uninstall"; shift;;
    about|--about|info|--info) ARG="about"; shift;;
    help|-h|--help) ARG="help"; shift;;
    *) say "  unknown option: $1"; ARG="help"; shift;;
  esac
done

case "$ARG" in
  install)   do_install;   exit $?;;
  uninstall) do_uninstall; exit $?;;
  about)     do_about;     exit $?;;
  help)      usage;        exit 0;;
  "")
    # No explicit action: show the menu if we can prompt, else just install.
    if [ -t 0 ] || [ -e /dev/tty ]; then menu
    else say "  (no terminal detected — installing red)"; do_install; exit $?
    fi
    ;;
esac
