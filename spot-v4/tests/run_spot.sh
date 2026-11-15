#!/bin/bash
# «اكتشف الفرق» and «أكملها» local tests (fake database in the browser), in parallel batches.
# usage: DIST=<built site> OLD=<current official site folder> OUT=<results folder> bash run_spot.sh
cd "$(dirname "$0")"; mkdir -p "$OUT"
run(){ n=$1; shift; timeout 1500 "$@" > "$OUT/$n.txt" 2>&1; echo "$n exit=$? $(grep -E '[0-9]+/[0-9]+ (checks )?passed|PASS|FAIL' "$OUT/$n.txt" | tail -1)"; }
run spot4 python3 t_spot4.py & run spotcomp python3 t_spot_comp.py & run spotpick python3 t_spot_pick.py & wait
run spothost python3 t_spot_host.py & run spottaps python3 t_spot_taps.py & run spotjudge python3 t_spot_judge.py & wait
run vswitch env OLD="$OLD" NEW="$DIST" python3 t_version_switch.py & run vswitchspot env OLD="$OLD" NEW="$DIST" python3 t_version_switch_spot.py & wait
run akml python3 t_akml.py & run akmlkey python3 t_akml_key.py & run akmltimer python3 t_akml_timer.py & wait
run akmlfull python3 t_akml_full.py & run akmlux python3 t_akml_ux.py & wait
echo ALLDONE
