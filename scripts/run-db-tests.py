"""Formatea la salida de `npm run db:test:dev` (JSON de supabase db query)."""
import json
import sys

raw = sys.stdin.read()
try:
    data = json.loads(raw[raw.index("{"):])
except ValueError:
    print(raw[-3000:])
    sys.exit(1)
rows = data.get("rows") or []
if not rows:
    print(raw[-3000:])
    sys.exit(1)
for r in rows:
    print(f"{r['result']} | {r['name']} | {r.get('detail') or ''}")
fails = sum(r["result"] == "FAIL" for r in rows)
print(f"\nTOTAL {len(rows)} · FAIL {fails}")
sys.exit(1 if fails else 0)
