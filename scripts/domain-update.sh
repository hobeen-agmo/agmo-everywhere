#!/usr/bin/env bash
# Merge agent-supplied keywords into {VAULT}/{project}/domain-keywords.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/obsidian-common.sh"

PROJECT="" DATA_SRC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --data)    DATA_SRC="$2"; shift 2 ;;
    --help|-h) echo "Usage: domain-update.sh --project <name> --data <@file | ->" >&2; exit 0 ;;
    *) _log ERROR "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -z "$PROJECT" ]] && { _log ERROR "--project required"; exit 1; }
[[ -z "$DATA_SRC" ]] && { _log ERROR "--data required"; exit 1; }

VAULT_ROOT="$(_vault_root)"
[[ -z "$VAULT_ROOT" ]] && { _log ERROR "Vault not configured"; exit 1; }

# Load input JSON (from file @path or stdin -)
if [[ "$DATA_SRC" == "-" ]]; then
  INPUT_JSON="$(cat)"
elif [[ "${DATA_SRC:0:1}" == "@" ]]; then
  INPUT_JSON="$(cat "${DATA_SRC:1}")"
else
  INPUT_JSON="$DATA_SRC"
fi

TARGET_DIR="${VAULT_ROOT}/${PROJECT}"
TARGET_FILE="${TARGET_DIR}/domain-keywords.json"
mkdir -p "$TARGET_DIR"

INPUT_JSON="$INPUT_JSON" python3 - "$TARGET_FILE" <<'PYEOF'
import json, sys, os
from datetime import date

target = sys.argv[1]
today = date.today().isoformat()

# Load input from env-passed JSON
input_json = os.environ['INPUT_JSON']
incoming = json.loads(input_json)

# Load existing
if os.path.exists(target):
    with open(target) as f:
        store = json.load(f)
else:
    store = {"patterns": []}

patterns = store.get("patterns", [])

# Build lookup by lowercased name/alias
def keys_of(p):
    return {p["name"].lower(), *(a.lower() for a in p.get("aliases", []))}

def find_pattern(name, aliases):
    incoming_keys = {name.lower(), *(a.lower() for a in aliases)}
    for i, p in enumerate(patterns):
        if keys_of(p) & incoming_keys:
            return i
    return -1

# Flatten tags + nouns
entries = []
for t in incoming.get("tags", []):
    entries.append({"name": t["name"], "aliases": t.get("aliases", [])})
for n in incoming.get("nouns", []):
    entries.append({"name": n["name"], "aliases": n.get("aliases", [])})

for e in entries:
    name = e["name"]
    aliases = e.get("aliases", [])
    idx = find_pattern(name, aliases)
    if idx >= 0:
        p = patterns[idx]
        p["count"] = p.get("count", 0) + 1
        p["last_used"] = today
        # merge aliases
        existing_al = set(a.lower() for a in p.get("aliases", []))
        for a in aliases:
            if a.lower() not in existing_al and a.lower() != p["name"].lower():
                p.setdefault("aliases", []).append(a)
                existing_al.add(a.lower())
    else:
        patterns.append({
            "name": name,
            "aliases": [a for a in aliases if a.lower() != name.lower()],
            "count": 1,
            "last_used": today,
        })

store["patterns"] = patterns
with open(target, "w") as f:
    json.dump(store, f, indent=2, ensure_ascii=False)

print(f"Updated {target}: {len(patterns)} total patterns")
PYEOF
