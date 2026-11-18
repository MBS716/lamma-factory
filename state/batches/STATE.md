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

## Update 2026-11-17 (review1 b2 medium done)
- medium: 6 accept / 6 fix / 2 reject (rejected.txt). Medium now 12 viable.
- fix round 1 hard+easy nearly finished (23/24 lines in fixes1.txt). Next: send same fixer the 6 medium fixes; then review round 2.

## Update 2026-11-17 (fix round 1 hard+easy done)
- fixes1.txt: 24/24 hard+easy fixed, no "still". Originals in work/fix_b2/<id>.orig.py.
- Running: same fixer on 6 medium fixes (appends to fixes1.txt); review round 2 of the 24 → batches/b2/review2.json (ids in work/review2_b2/ids.txt).
- Next: review round 2 of the 6 medium fixes; then build b2, page, report.

## Update 2026-11-17 (review2 hard+easy done)
- review2.json: easy 6 accept / 5 fix; hard 7 accept / 6 fix; 0 reject.
- Next: after the fixer finishes the 6 medium fixes, send it the 11 review2 fixes → fixes2.txt. Then review round 3 (last) for those 11 + review round 2 for the 6 medium.

## Update 2026-11-17 (medium fix round 1 done)
- fixes1.txt 30/30 (incl. 6 medium), no "still".
- Running: fixer on 11 review2 fixes → fixes2.txt; reviewer (round-2 agent) on 6 medium fixes → adds keys to review2.json.
- Next: final review round 3 for the 11 (+ any medium fixes from round 2) → review3.json; then build/page/report.
- review2 medium: 0 accept / 6 fix (one difference each). Queued to fixer after the 11 → fixes2.txt. Then review3 (final) for 17 ids.

## Update 2026-11-17 ~23:xx — usage limit hit (5-hour limit, resets 00:10 Riyadh)
- Fixer stopped mid fix round 2. Progress = lines in batches/b2/fixes2.txt. Resume: SendMessage the fixer (continue; skip ids already in fixes2.txt; then the 6 medium).

## Update 2026-11-18 (fix round 2 done)
- fixes2.txt 17 lines: 15 fixed, 2 still → rejected.txt (w35074595, w11958525). b2 rejected total 4.
- Running: final review round 3 for 15 ids (work/review2_b2/r3_ids.txt) → review3.json.
- Started 4th source search (easy/medium simple scenes): scripts/spot_themes4.txt (64 themes) on spot-v5; spot-sources run 44180826227 → spot-sources:cand2. Next after it: selectors for b3 (easy+medium first).

## Update 2026-11-18 (review3 b2 done)
- review3: 13 accept + 2 small fixes (done by me, fixes3.txt). b2 FINAL: easy 9, medium 12, hard 19 = 40 pairs. rejected 4.
- flags.json added (Heraklion / Hoi An same-location notes). Building: batch_build.py b2 → build/b2. Next: upload page imgs to asset store (blobmap), batches.json + b2.json, publish, report.

## Update 2026-11-18 (b2 published)
- 80 page images uploaded (batches/b2/blobmap.txt 80 lines); page_b2.json; review page v6 with b2 (40 pairs, 369 differences). Report sent.
- Next: 4th source search result → selectors for b3 (easy+medium priority).

## Update 2026-11-18 12:xx — OWNER APPROVED all 100 (b1 60 + b2 40) in chat + page (db decisions all "ok")
- spotlib-v7 (190: easy 60, medium 61, hard 69) assembled in wt5/spot-v4/spotlib-v7 (not yet committed); scene groups g via library-tools/scene_groups.py; app.js pick avoids similar scenes (H.priv.rg); tests/t_spot_scene.js 10/10; verify_spot 190/190.
- Local spot tests running. Next: commit spot-v5 + spot5-full emulator run (six games); preview-spot5 on factory main (PREV build) + spot5-test.
- b3: candidates pulled (2869, new idx 2435-2868); selectors h (2435-2650) and i (2651-2868) running on sonnet. WORKER_BRIEF has a lessons section now.

## Update 2026-11-18 ~12:45
- Committed spot-v5 7365c36 (spotlib-v7, scene groups, test). Preview: factory main b08cab1 preview-spot5 (190) + _config.yml (Pages excludes reports/, tests/; site would pass 1 GB). Preview test fixed (stale fixed-60 counts) and rerunning; spot5-full emulator running (44275060383).
- b3: sources chosen (easy 60 / medium 50 / hard 40 [5 hard + 35 busy medium]) fetched + converted. Workers easy + medium running (resume via message; progress in *_done/_skipped.txt). Hard worker after one finishes.
- 5th search (spot_themes5.txt, hard) done on spot-sources: pull candidates + selectors later.

## Update 2026-11-18 ~13:30 — bank 190 DONE
- spot5-full (emulator, six games) PASS: other games PASS (letters, wheel, quiz, puzzle), akml 97/97, akml full 52/52, spot 65+32+28+28.
- Preview (factory main, preview-spot5, 190) real-DB tests PASS 65/32/28/28 after test-timing fixes (tests/spot5: counts from catalog; 15 s waits).
- Report sent to owner. b3 easy+medium workers running.

## Update 2026-11-18 ~13:50
- b3 easy FINISHED: 7 accepted / 53 skipped (60 sources). Hard worker started (40 sources). Medium running.
- Easy plan B: crops. 40 sources (batches/b3/easy_crop_sources.json, medium/easy-rated, native ≥4800) fetched at 4800 as "b3c" (spot-fetch supports "<batch>@<width>:ids"). Tool /home/claude/spot3/crop.py (show / crop → src/<id>.png + batches/b3/crop.txt). Put hires jpgs in /home/claude/spot3/hires/. Start easy-crop worker when a slot frees.

## Update 2026-11-18 ~14:10
- b3 medium FINISHED: 5 accepted / 45 skipped (stricter lessons → lower yield). Easy 7. Hard worker running.
- hires/ has 40 crop sources (max width 3840 = Commons thumb cap → crop ×1.6). Easy-crop worker running (target 17 more; crop.txt records crops).
