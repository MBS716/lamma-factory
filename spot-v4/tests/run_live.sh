#!/bin/bash
# «اكتشف الفرق» v5 on a real site: the spot tests of the spot-v5 branch, with the real database.
# usage: LIVE_URL=https://.../preview-spot5/ DIST=preview-spot5 OUT=reports/spot5/preview bash tests/spot5/run_live.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd); W=$(mktemp -d); mkdir -p "$OUT"
cp "$HERE"/t_spot4.py "$HERE"/t_spot_comp.py "$HERE"/t_spot_pick.py "$HERE"/t_spot_host.py "$W"/; cp "$HERE"/live_common.py "$W"/common.py
r=0
for t in t_spot4 t_spot_comp t_spot_pick t_spot_host; do
  SHOTS="$OUT/$t" OUT="$OUT/$t" timeout 1800 python "$W/$t.py" > "$OUT/$t.log" 2>&1; e=$?; mkdir -p "$OUT/$t"
  echo "$t exit=$e $(grep -E '[0-9]+/[0-9]+ passed' "$OUT/$t.log" | tail -1)" | tee -a "$OUT/result.txt"; [ $e -ne 0 ] && r=1
done
exit $r
