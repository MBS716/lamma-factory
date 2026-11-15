#!/bin/bash
# copy the production state (specs, done/skip lists, reviews, fixes) to branch spot-batches and push (no images: they are rebuilt from specs + sources)
W=/home/claude/sbw; S=/home/claude/spot3
cd $W || exit 1
git fetch -q origin spot-batches && git reset -q --mixed origin/spot-batches 2>/dev/null
mkdir -p state/manual state/batches
cp $S/manual/*.py state/manual/ 2>/dev/null
for b in $S/batches/*/; do n=$(basename $b); mkdir -p state/batches/$n; cp $b/*.txt $b/*.json state/batches/$n/ 2>/dev/null; done
cp $S/batches/*.md state/batches/ 2>/dev/null
git add -A state >/dev/null 2>&1
git -c user.name=lamma-factory -c user.email=factory@users.noreply.github.com commit -qm "production state backup $(date -u +%FT%TZ)" >/dev/null 2>&1 || exit 0
for i in 1 2 3; do git push -q origin HEAD:spot-batches 2>/dev/null && exit 0; git fetch -q origin spot-batches; git rebase -q origin/spot-batches 2>/dev/null; sleep 5; done
