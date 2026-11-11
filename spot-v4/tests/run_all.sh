#!/bin/bash
cd /home/claude/lamma-v2-test
run(){ n=$1; shift; timeout 900 "$@" > logs/$n.log 2>&1; echo "$n exit=$? $(grep -E 'checks passed|PASS|passed|FAIL' logs/$n.log | tail -1)"; }
mkdir -p logs
run l2_390 python3 t_letters2.py l2out 390 1280 &
run l2_360 python3 t_letters2.py l2out360 360 1024 &
run letters python3 t_letters.py &
wait
run endrace python3 t_endrace.py &
run endrace2 python3 t_endrace2.py &
run closesave python3 t_closesave.py &
run qa python3 t_qa.py &
run footer python3 t_footer.py &
run sessions python3 t_sessions.py &
wait
run lastseen python3 t_lastseen.py &
run secrets python3 t_secrets.py &
run resume python3 t_resume.py &
wait
run others python3 t_others.py &
run spot4 python3 t_spot4.py &
run spotjudge python3 t_spot_judge.py &
run akml python3 t_akml.py &
run akmlkey python3 t_akml_key.py &
run akmlfull python3 t_akml_full.py &
run akmltimer python3 t_akml_timer.py &
run touch python3 t_touch_puzzle.py &
wait
run w3eng node t_wheel3_engine.js &
FONTS=/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/fonts/all run w3lab python3 t_wheel3_labels.py w3labout &
run w3res python3 t_wheel3_resume.py &
run w3ui python3 t_wheel3_ui.py &
wait
run audit python3 audit_mobile.py auditout &
wait
echo ALLDONE
