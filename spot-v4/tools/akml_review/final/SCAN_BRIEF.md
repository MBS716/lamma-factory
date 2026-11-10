# Final review scan of «أكملها» (complete the phrase): find the cases the owner must see first

The bank has 2,484 items that passed internal review. They are for an Arabic family party game played in Saudi Arabia. The
owner will approve the bank in bulk. Before that, he wants to see a short list of the items that need his judgement, each
with a clear recommendation. Your job is to find those items in your file and recommend what to do with each one.

Item fields:
- `text` holds the phrase with one `{gap}`.
- `ans` is the answer. `alt` holds the accepted alternatives.
- `opts` holds the 4 options, the answer first.
- `modes` says how the item can be played: c = choose from 4, t = typed (the game accepts only `ans` and `alt`, after
  ignoring hamza and diacritics), b = said aloud and judged by the host.
- `src` and `ref` are the sources.
- `review` holds the independent reviewer's verdict and notes.
- `xgame` is set when the same fact and answer is already asked in another game.

Flag an item ONLY if it falls in one of these categories:
- **weak**: the source is weak or the wording is not confirmed. Examples:
  - the reviewer did not open the ref («لم أفتحه»);
  - there is a single weak source (a blog, forum, a single headline, an article that only uses the phrase);
  - the meaning is taken from usage only;
  - the wording differs between sources and the item picks one;
  - the attribution is disputed, or rests on a late collected diwan;
  - the Saudi usage is not shown (a proverb sourced only from a Kuwaiti, Emirati, Egyptian or Palestinian collection).
- **multi**: more than one answer could be correct. Examples:
  - a wrong option is also arguably right;
  - a common synonym or a dialect variant of the answer is missing from `alt` while typed mode (t) is on;
  - the gap fits several common words, so typing or saying another one is unfairly wrong.

Do NOT flag items that are fine. Most items are fine. Expect roughly 5–15% of your file, not more. Be specific: name what
is weak or which other answer is right.

For every flagged item give ONE recommendation:
- `keep`: fine as it is; the weakness is minor.
- `fix`: give the exact change, as a `fix` object with only the fields to change: `alt` (the full new list), `opts`
  (the full new list, answer first), `modes` (for example "cb" to drop typing) or `text`.
- `reserve`: let the owner decide; say the question to ask him.
- `reject`: say why.

Prefer `fix` when a small change removes the doubt. Prefer dropping typed mode, or adding the variant to `alt`, over
rejecting.

Verify when in doubt:
- With WebFetch of the ref. Web search is scarce; use at most 15.
- Or with the local texts under /tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/
  (arab_src, lang_src, fun_src, rv5/dl/lisan.txt, rev_arab/dl, batch*/work_*/dl).

## Output
Write JSON to the path given in your task:
`[{"id":…, "cat":["weak"|"multi"], "issue":"one line in Arabic", "rec":"keep|fix|reserve|reject", "why":"one line in Arabic", "fix":{…}?}]`

Write the `issue` and `why` lines in Arabic, short and plain. Do not edit any other file. Reply with counts per
category and per recommendation.
