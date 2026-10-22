#!/bin/bash
# Runs inside "firebase emulators:exec" (Database + Auth emulators, final rules loaded). Nothing reaches the real database.
set -u
mkdir -p reports/rules-test
timeout 300 node tests/rules/rules.test.mjs > reports/rules-test/rules.log 2>&1; r1=$?
(cd tests/emu-site && python -m http.server 8799 > /dev/null 2>&1 &)
sleep 2
EMU=1 RULES_ON=1 timeout 2400 python tests/live_e2e_v3.py http://localhost:8799/ reports/rules-test/site-e2e > reports/rules-test/site-e2e.log 2>&1; r2=$?
echo "rules: $r1  site on the emulator: $r2"
exit $(( r1 || r2 ))
