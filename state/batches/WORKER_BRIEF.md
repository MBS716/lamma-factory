# Production worker brief — «اكتشف الفرق» v5, batch <BATCH>, level <LEVEL>

You produce spot-the-difference picture pairs for «لمّة», an Arabic family party game. Quality matters far more than count.

1. Read /home/claude/spot3/BRIEF.md completely. Its last section, "Large production rules", comes first: at most ~40% colour changes per pair (easy ≤2 of 5, medium ≤3 of 8, hard ≤5 of 12) when the picture allows it without losing quality; one change = one difference (no moved objects, no two parts of one object, no two objects in one difference); whole-object recolours with no leaks; clean removals; never touch any text; family-suitable content; no edits to people or religious buildings/symbols.
2. Study a few approved specs in /home/claude/spot3/manual/ of your level (pilot pairs; level is in the SPEC) — they passed an independent review.
3. Your sources: /home/claude/spot3/batches/<BATCH>/<LEVEL>_sources.json (ids with a note from the selector), pictures in /home/claude/spot3/src/<id>.png (2400 px wide). Work through them in order; target <TARGET> accepted pairs. Skip any picture that cannot carry n good differences — that is normal, more sources are listed than needed.
4. Per picture: `python3 /home/claude/spot3/look2.py <id>` (open the printed jpg with Read; zoom with `look2.py <id> x0 y0 x1 y1`); write /home/claude/spot3/manual/<id>.py (SPEC = {'id','src','level','n','kind':'photo','title':'<short Arabic title>','diffs':[...]}, an Arabic 'name' per difference); `python3 /home/claude/spot3/run.py <id>` (only one of your runs at a time; other workers share the CPUs); open /home/claude/spot3/out/crops_<id>.jpg and rev_<id>.jpg with Read and check EVERY difference closely; fix and rerun until clean; `python3 /home/claude/spot3/qc.py <id>` (every line PASS; run.py check count == n, overlaps [], stray []); `python3 /home/claude/spot3/colorshare.py <id>` (aim OK).
5. Record: append the id to /home/claude/spot3/batches/<BATCH>/<LEVEL>_done.txt when accepted; for a skipped picture append "<id> <short reason>" to <LEVEL>_skipped.txt and rename its spec (if any) to manual/_rejected_<id>.py.
6. Keep any helper scripts or notes of yours in /home/claude/spot3/work/<LEVEL>/ only (other workers run at the same time). No git. Touch nothing else.
Final answer: per accepted pair: id, Arabic title, qc summary line, colorshare line, concerns; skipped ids with reasons; time taken.

## Lessons from the b1/b2 independent reviews (read before the first picture — most fix rounds came from these)
Before you accept a pair, go through this list difference by difference on the crops; a pair that fails it costs a review and a fix round later.
- Size: easy = every changed object ≥ ~150 px at 2400 and in good light (never in deep shade); medium ≥ ~70 px and not thin (no 20–40 px poles, brooms, stripes, flues); hard = small but clearly readable zoomed. Prefer a picture with big separate objects over forcing small ones.
- Removals: no smear, ghost, blurry or smooth patch, repeated texture, cut rope or floating part. If the fill is not clean after two tries, choose another object.
- Adds: never sticker-like (no hard straight edges, halo, copied outline or block of background); sit on the ground with a soft edge or shadow; never copy an object another difference changes (that reads as a move).
- Recolours: the WHOLE object (a mast with its boom, a cloth with all its folds, a ribbon with all its strands), no leak onto neighbours, no left-over fringe; the new colour clearly different (not grey→grey-brown).
- Scale: no warping, no neighbour carried along, the object must not cover others.
- Variety: no two differences of the same kind on the same type of object (two shutter recolours, two jar cloths, two "walled-up openings", four things turned blue); mix removal / add / flip / scale / recolour.
- Spacing: boxes ≥ ~60 px apart at 2400 (qc's smallest gap ≥ 40 on its 1600 px scale).
- Names: the Arabic name must say exactly what changed (never "disappeared" for something still there).
- Content: no religious images or buildings edited or as subject, no alcohol or beer brands, no nudity, no people edited, no text touched (a whole sign may be removed only if it is cleanly gone).
- Skip early: if a picture clearly cannot carry n differences that meet this list, skip it in the first minutes instead of after many runs.
