#!/usr/bin/env bash
#
# RedGet installer — Linux / macOS
#
#   bash install.sh                 install the `red` command onto your PATH
#   bash install.sh --prefix DIR    install the launcher into DIR instead
#   bash install.sh --uninstall     remove the `red` command
#
# Afterwards you can run `red` from ANY folder, exactly like git:
#
#   red              red --help      red --info     red version
#   red serve        red list        red export <forge>     red check
#
# Nothing is downloaded and nothing is copied out of this folder: the launcher
# simply points at this folder's tools/cli.mjs, so keep the folder where it is.
# The website itself needs no Node and no install — this is only for the CLI.

set -eu

# ── resolve the folder this script lives in (following symlinks) ──────────
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [ "${SOURCE#/}" = "$SOURCE" ] && SOURCE="$DIR/$SOURCE"
done
ROOT="$(cd -P "$(dirname "$SOURCE")" && pwd)"
CLI="$ROOT/tools/cli.mjs"

say() { printf '%s\n' "$*"; }
die() { printf 'install: %s\n' "$*" >&2; exit 1; }

# ── arguments ─────────────────────────────────────────────────────────────
PREFIX="${PREFIX:-}"
ACTION="install"
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)   PREFIX="${2:-}"; shift 2 ;;
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --uninstall|-u) ACTION="uninstall"; shift ;;
    --help|-h)  say "usage: bash install.sh [--prefix DIR] [--uninstall]"; exit 0 ;;
    *)          die "unknown option: $1  (try --help)" ;;
  esac
done

[ -f "$CLI" ] || die "tools/cli.mjs not found next to install.sh — run it from inside the RedGet folder."

# ── choose the install directory ──────────────────────────────────────────
pick_dir() {
  if [ -n "$PREFIX" ]; then printf '%s' "$PREFIX"; return; fi
  for d in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    if [ -d "$d" ] && [ -w "$d" ]; then printf '%s' "$d"; return; fi
    parent="$(dirname "$d")"
    if [ ! -d "$d" ] && [ -d "$parent" ] && [ -w "$parent" ]; then printf '%s' "$d"; return; fi
  done
  printf '%s' "$HOME/.local/bin"
}
BIN="$(pick_dir)"
LAUNCHER="$BIN/red"

# ── uninstall ─────────────────────────────────────────────────────────────
if [ "$ACTION" = "uninstall" ]; then
  for d in "$BIN" /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    if [ -e "$d/red" ]; then rm -f "$d/red"; say "  removed $d/red"; fi
  done
  say "  red uninstalled."
  exit 0
fi

# ── find Node (the CLI needs it; the website does not) ────────────────────
NODE_BIN=""
if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"
elif command -v nodejs >/dev/null 2>&1; then NODE_BIN="$(command -v nodejs)"
fi
[ -n "$NODE_BIN" ] || die "Node.js v18+ is required for the red command.
  Install it from https://nodejs.org, then re-run.
  (The website itself needs no Node — open it through any static server.)"

NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 18 ] 2>/dev/null; then
  say "  warning: Node $("$NODE_BIN" --version 2>/dev/null || echo '?') is older than v18; the red command may not run."
fi

# ── make sure the directory exists and is writable ────────────────────────
if [ ! -d "$BIN" ]; then
  mkdir -p "$BIN" 2>/dev/null || die "cannot create $BIN — re-run with:  sudo bash install.sh --prefix /usr/local/bin"
fi
[ -w "$BIN" ] || die "$BIN is not writable — re-run with:  sudo bash install.sh --prefix /usr/local/bin"

# ── write the launcher ────────────────────────────────────────────────────
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
# RedGet launcher — installed by install.sh. Forwards everything to the CLI.
# Installed from: $ROOT
exec "$NODE_BIN" "$CLI" "\$@"
EOF
chmod +x "$LAUNCHER" 2>/dev/null || true

say ""
say "  ✓ installed  $LAUNCHER"
say "      → $NODE_BIN $CLI"

# ── is BIN on PATH? if not, offer to add it ───────────────────────────────
case ":$PATH:" in
  *":$BIN:"*) ONPATH=1 ;;
  *)          ONPATH=0 ;;
esac

if [ "$ONPATH" -eq 0 ]; then
  say ""
  say "  $BIN is not on your PATH yet. Add it with:"
  say ""
  say "      echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.bashrc     # or ~/.zshrc"
  say "      source ~/.bashrc"
  RC=""
  case "${SHELL:-}" in
    */zsh)  RC="$HOME/.zshrc" ;;
    */bash) RC="$HOME/.bashrc" ;;
  esac
  if [ -z "$RC" ] && [ -f "$HOME/.profile" ]; then RC="$HOME/.profile"; fi
  if [ -n "$RC" ] && [ -f "$RC" ] && ! grep -qF "$BIN" "$RC" 2>/dev/null; then
    printf '\n# Added by RedGet install.sh\nexport PATH="%s:$PATH"\n' "$BIN" >> "$RC"
    say ""
    say "  (added it to $RC for you — open a new terminal, or run:  source $RC)"
  fi
fi

say ""
say "  Try it now:"
say "      red --help"
say "      red --info"
say "      red serve          # then open http://localhost:4173"
say "      red export <forge> # copy a forge's files to your computer"
say ""
