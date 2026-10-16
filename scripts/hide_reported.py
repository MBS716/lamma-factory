"""Pairs that 3 or more players reported are added to catalog/hidden.json; the game skips them."""
import os, json, urllib.request
from factory.store import R2Store
db = os.environ.get("FIREBASE_DB", "").rstrip("/")
if not db: raise SystemExit("no FIREBASE_DB set, skipping")
reports = json.loads(urllib.request.urlopen(f"{db}/spotreports.json", timeout=30).read() or b"null") or {}
bad = sorted(pid for pid, who in reports.items() if isinstance(who, dict) and len(who) >= 3)
st = R2Store(os.environ["R2_ACCOUNT_ID"], os.environ["R2_BUCKET"], os.environ["R2_KEY_ID"], os.environ["R2_SECRET"])
old = json.loads(st.get("catalog/hidden.json") or b"[]")
new = sorted(set(old) | set(bad))
st.put("catalog/hidden.json", json.dumps(new).encode(), "application/json")
print("hidden pairs:", len(new))
