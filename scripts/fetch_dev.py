"""Download a tuning sample of real Commons photos (same filters as production) for engine development.
Saves prepared 1280x853 JPEGs plus credits (author, licence, source page) for each file."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from PIL import Image
from factory.collect import Registry, Commons
from factory.engine import prepare
n = int(sys.argv[1]) if len(sys.argv) > 1 else 120
out = "dev/photos"; os.makedirs(out, exist_ok=True)
reg = Registry("/tmp/dev_registry.json"); reg.d["theme_i"] = 0
src = Commons(reg); credits = {}
for ph in src.photos():
    if len(credits) >= n: break
    try: A = prepare(src.download(ph))
    except Exception as e: print("skip", ph["id"], e); continue
    Image.fromarray(A).save(f"{out}/{ph['id']}.jpg", quality=90)
    credits[ph["id"]] = {k: ph[k] for k in ("theme", "url", "photographer", "licence", "licence_url")}
    print(len(credits), ph["id"], ph["theme"], flush=True)
json.dump(credits, open(f"{out}/credits.json", "w"), ensure_ascii=False, indent=1)
