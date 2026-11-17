# Production state (resume point) — updated 2026-11-16 05:20 +03
Target 750 = 250/level. Bank: 90 (spotlib-v6). Owner approval happens on the review page only.
## b1 — CLOSED 2026-11-16: 60 pairs (21 easy, 19 medium, 20 hard), all accepted by independent review; on the review page (batch "b1"); awaiting owner decisions
## b1 (history)
- easy 21 valid (16 accepted by review, 5 await round-2 review), medium 19 (18 + 1), hard 20 (7 + 13 await review; 1 hard fix left: w89114411).
- Decision: close b1 with what passes; shortfall vs 24/level carried to later batches and the final top-up.
- Next: finish w89114411 fix -> round-2 review of the 19 pending -> batch_build b1 -> review page -> report.
## b2
- hard: 5 accepted of 30 hard sources tried (25 skipped); next sources: hard_sources_extra.json (60, incl. busy medium-rated).
- easy sources 23 of 34 consumed by b1 replacements (see easy_taken_by_b1.txt); medium 7 consumed.
## Rules for running
- At most 2 agents at a time (usage limit hit twice). Back up (spot3/backup.sh) after each finished task.
## Update 2026-11-16 06:54 — weekly usage limit hit (resets 09:00 Riyadh)
- b2: hard 13 accepted / 48 skipped (worker stopped; resume via message); medium 4 accepted (27 sources done; 30 word-filtered extras in medium_sources_extra.json); easy 0 accepted (worker had just started).
- Resume order: b2 hard (resume) + b2 easy (resume), then b2 medium on medium_sources_extra.json, then independent review of b2.

## Update 2026-11-17 17:10
- b2 hard FINISHED: 19 accepted / 71 skipped (all 90 sources used). Shortfall 5 → carry to later batches/top-up.
- b2 easy: running (11 accepted so far).
- b2 medium: worker started on medium_sources_extra.json (4 accepted before).
- Next: when both finish → independent review of b2 (hard first, can start once a slot frees).

## Update 2026-11-17 20:10
- b2 easy FINISHED: 11 accepted / 30 skipped (all 41 sources used). Shortfall 13 → needs new easy sources (search) for later batches/top-up.
- Running: b2 medium worker; independent review round 1 of b2 hard+easy → batches/b2/review1.json + notes_ar.json (incremental; resume via message).
- Next: medium review after the worker ends; fix round; build; page; report. Then new search focused on easy + medium sources before b3.

## Update 2026-11-17 (review1 b2 done)
- review1.json b2 hard+easy: hard 6 accept / 13 fix; easy 0 accept / 11 fix; 0 reject.
- Running: b2 medium worker; fix round 1 b2 hard+easy → batches/b2/fixes1.txt (one line per id; resume skips ids already there).
- Next: review round 2 of fixed pairs + medium review round 1; then build/page/report.

## Update 2026-11-17 (b2 medium production done)
- b2 medium FINISHED: 14 accepted (4 + 10), all 57 sources used. Shortfall 10.
- b2 totals before review: hard 19, medium 14, easy 11 = 44 of 72.
- Running: fix round 1 b2 hard+easy (fixes1.txt); review round 1 b2 medium (merging into review1.json).
