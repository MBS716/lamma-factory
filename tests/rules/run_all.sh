#!/bin/bash
# Runs inside "firebase emulators:exec" (Database + Auth emulators, final rules loaded). Nothing reaches the real database.
set -u
mkdir -p reports/rules-test
node tests/rules/rules.test.mjs; r1=$?
(cd tests/emu-site && python -m http.server 8799 > /dev/null 2>&1 &)
sleep 2
RULES_ON=1 python tests/live_e2e_v3.py http://localhost:8799/ reports/rules-test/site-e2e; r2=$?
echo "rules: $r1  site on the emulator: $r2"
exit $(( r1 || r2 ))
