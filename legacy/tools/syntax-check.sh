#!/usr/bin/env bash
# RedGet — syntax gate.
# `node --check` parses .js as CommonJS, where a top-level `import` becomes a
# dynamic import call and module-level syntax errors hide. Copying each file to
# a .mjs path forces ESM parsing, which is what the browser will do.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0
total=0
while IFS= read -r -d '' file; do
  total=$((total + 1))
  rel="${file#"$ROOT"/}"
  target="$TMP/$(echo "$rel" | tr '/' '_').mjs"
  cp "$file" "$target"
  if ! node --check "$target" 2>"$TMP/err"; then
    fail=$((fail + 1))
    echo "✗ $rel"
    sed 's/^/    /' "$TMP/err" | head -12
  fi
done < <(find "$ROOT/src" "$ROOT/data" "$ROOT/tools" -name '*.js' -o -name '*.mjs' 2>/dev/null | tr '\n' '\0')
echo "syntax: $((total - fail))/$total files OK"
exit $fail
