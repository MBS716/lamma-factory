#!/bin/bash
# «أكملها» on a site (a branch copy served locally, or the live site), real Firebase: the bank it serves (2,445) and the
# draws, matches in every answer method, the host's answer card, complete matches, the answer timer. Stops on the first failure.
# usage: akml_suite.sh URL OUTDIR
U=$1; D=$2/akml; mkdir -p $D
N=2445
run(){ local name=$1; shift; r=0; timeout 1800 "$@" > $D/$name.log 2>&1 || r=$?; mkdir -p $D/$name; cp $D/$name.log $D/$name/log.txt
  echo "$name: $(grep -E '[0-9]+/[0-9]+ (checks )?passed' $D/$name.log | tail -1) (exit $r)"; [ $r = 0 ] || { tail -25 $D/$name.log; exit 1; }; }
run bank env BANK_FILE=${BANK_FILE:-site/data/akml.json} python tests/live_akml_bank.py $U $D/bank $N
run akml python tests/live_akml.py $U $D/akml
run key python tests/live_akml_key.py $U $D/key
run full python tests/live_akml_full.py $U $D/full
run timer python tests/live_akml_timer.py $U $D/timer
echo "«أكملها»: all passed"
