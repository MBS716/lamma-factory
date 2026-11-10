# Batch 9 (replacement pool): what changes from BRIEF.md

Read BRIEF.md first: the item format and the owner's rules all apply. Then read lessons.txt, the items rejected in batches 2–8
with the reason. Do not repeat those mistakes.

Why this batch exists: the final review found ~170 items that repeat facts already asked in the platform's other games, and
they will probably be removed. This batch is a REPLACEMENT POOL so the bank stays above 2,500 unique items. It is held for the
owner's decision; nothing here is approved.

Every item is a "complete the phrase" item: a known phrase, verse, saying, expression or fact sentence with ONE gap. Never a
plain quiz question (no «ما/كم/من…؟»).

## Duplicates — the main risk now
- all_existing.txt holds ~3,800 lines: the game's 60, batches 1–8 in every status, and the skipped phrases. Never duplicate any.
- Wording counts and meaning counts: the same saying reworded, or with the gap moved, or the same fact asked from the other
  side, is a duplicate.
- grep the key words AND the answer of every candidate in all_existing.txt before writing it.

## Other games
other_games.txt lists the quiz and letters questions of the platform with their answers. If the same fact with the same answer
is there, pick another fact. This is exactly why this batch is needed — be strict.

## ids
B9-A… arab, B9-I… info, B9-L… lang, B9-F… fun. Keep to the id range in your task.

## Web search
LIMITED and shared. Your budget is in your task. Prefer the downloaded texts (read only): ../arab_src, ../fun_src, ../lang_src,
../b2h_src, ../rev_lang, ../rev_arab/dl, ../rv5/dl/lisan.txt, ../batch*/work_*/dl. Prefer OpenITI on GitHub and opening known
pages with WebFetch over searching.

## Quality, unchanged
- Never invent a proverb, wording, attribution or source.
- Check the answer, the alternatives and the dialect variants; put variants in alt. If the gap could be filled by other common
  words, drop typing (modes c,b) or choose another gap.
- No wrong option may also be right.
- Short, clear explanation (why ≤ 260 characters).
- Info: only facts that cannot change, from a reliable source you opened.
- Difficulty: about 45% easy, 35% medium, 20% hard.
- Fewer real items beat padding. Skipping is fine.

## Output
Write {"items":[...], "skipped":[{"text":"…","reason":"…"}]} to the path in your task, then validate it: the JSON parses;
exactly one {gap}; gap == ans == opts[0]; 4 distinct options; no wrong option is an accepted answer; why ≤ 260 characters.
Reply with counts and doubts only.
