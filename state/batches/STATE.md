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
