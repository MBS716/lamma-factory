# Audit of the candidate bank of «أكملها»

Auditor: independent; no file was changed. Audited `/home/claude/lamma/data/akml.candidate.src.json` (2,532 items).
Working files (scripts, sample, hit lists): `/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/audit_work/`.
Seeds: content sample `random.Random(20261111)` (15 batch 9 + 15 fixed + 30 others); cross-game sample `random.Random(40)`.

## Verdict

**Not ready to approve as is.** The build is faithful to the flags (rejects out, fixes applied, rebuild byte-identical), but:
1. **115 questions still repeat a fact with the same answer from «الأسئلة العامة» or «الحروف»** — the same reason 160 others were rejected. The earlier scan only caught repeats that reviewers had noted (almost all in batches 1–5), and it never looked at the game's own 60 (AK…), 22 of which are word-for-word «أكمل المثل» / general-knowledge questions in quiz.json.
2. **5 questions recommended «reserve» (owner to decide) are in the bank** though the script says reserved questions stay out until the owner approves them.
3. One phrase is asked twice (`هلا و{…}`).

Removing all of them leaves about 2,412, **below the 2,500 target**. Batch 9's pool (141, all already in) cannot cover this, so new items or a policy decision (keep some repeats) are needed.

## Machine-readable summary

```json
{
 "file": "/home/claude/lamma/data/akml.candidate.src.json",
 "rebuild_identical_to_candidate": true,
 "counts": {
  "total": 2532,
  "target_min": 2500,
  "by_section": {
   "info": 955,
   "lang": 600,
   "fun": 312,
   "arab": 274,
   "hikam": 240,
   "gulf": 151
  },
  "by_level": {
   "0": 883,
   "1": 1112,
   "2": 537
  },
  "section_level": {
   "gulf": {
    "0": 66,
    "1": 62,
    "2": 23
   },
   "arab": {
    "0": 98,
    "1": 132,
    "2": 44
   },
   "hikam": {
    "0": 57,
    "1": 129,
    "2": 54
   },
   "info": {
    "0": 257,
    "1": 416,
    "2": 282
   },
   "lang": {
    "0": 234,
    "1": 265,
    "2": 101
   },
   "fun": {
    "0": 171,
    "1": 108,
    "2": 33
   }
  },
  "by_mode": {
   "c": 2532,
   "t": 2337,
   "b": 2398
  },
  "by_origin": {
   "AK (game's 60)": 60,
   "B1": 142,
   "B2": 326,
   "B3": 309,
   "B4": 239,
   "B5": 190,
   "B6": 523,
   "B7": 224,
   "B8": 378,
   "B9": 141
  },
  "build_how": {
   "in": 2439,
   "in_with_fix": 93,
   "out_recommended_reject": 160,
   "out_held_reject": 13,
   "out_held_reserve": 5
  },
  "matches_build_script_output": true,
  "total_if_all_proposed_removals_applied": "about 2,412 (2532 - 115 repeats - 5 reserve, overlaps counted once) -> BELOW 2,500"
 },
 "checks": {
  "1_counts": "PASS",
  "2a_rejects_absent": "PASS (173/173 absent)",
  "2b_fixes_applied_exactly": "PASS (93/93; 'modes' given as string 'cb'/'c' in flags stored as list — same value)",
  "2c_no_rejected_or_held_slipped_in": "FAIL (5 items recommended 'reserve' are in the bank)",
  "2d_no_duplicate_ids": "PASS",
  "2e_no_duplicate_phrases": "FAIL (1 pair: same phrase frame «هلا و{…}»)",
  "3_no_repeats_with_other_games": "FAIL (2/40 clear repeats in the seeded sample; full scan finds 115 clear repeats)",
  "4_format": "PASS with notes (one {gap}: 2532/2532; 4 distinct opts after akNorm: 2532/2532; no wrong option accepted: 0 cases; gap==ans==opts[0] exactly: 2528/2532, the 4 others differ only by diacritics/shadda)",
  "5_content_sample60": "PASS with notes (0 factual errors, 0 family-unfriendly, 0 second-right options; 3 cross-game repeats, 3 minor wording/ref notes)"
 },
 "problems_summary": {
  "reserve_included": [
   "B2-I015",
   "B2-I079",
   "B3-I020",
   "B2-G012",
   "B2-G040"
  ],
  "duplicate_phrase": [
   [
    "B6-F023",
    "B7-F010"
   ]
  ],
  "cross_game_repeats": 115,
  "cross_game_repeats_flagged_already": 7
 }
}
```

## 1. Counts — PASS
Recomputed from the file and identical to the build script's output; rerunning the script to `audit_candidate.json` gives a byte-identical file.

| section | lv0 | lv1 | lv2 | total |
|---|---|---|---|---|
| info | 257 | 416 | 282 | 955 |
| lang | 234 | 265 | 101 | 600 |
| fun | 171 | 108 | 33 | 312 |
| arab | 98 | 132 | 44 | 274 |
| hikam | 57 | 129 | 54 | 240 |
| gulf | 66 | 62 | 23 | 151 |
| **all** | 883 | 1112 | 537 | **2532** |

Modes: c 2532, t 2337, b 2398. Build: 2,439 in as is + 93 with fix; out: 160 recommended reject, 13 held + reject, 5 held + reserve.
Against review_page targets (gulf 200, arab 300, hikam 250, info 800, lang 550, fun 400): gulf, arab, hikam and fun are below target. Level 2 is thin in gulf (23) and fun (33).

## 2. Rejects, fixes, held items, duplicates
- Rejects absent — **PASS**: all 173 `reject` ids are absent; no item with review status `rejected` is present; batch files and review_page/data.json agree on every status.
- Fixes applied exactly — **PASS**: 93/93 fix objects match field by field (`modes:"cb"` is stored as `["c","b"]`, which is the same value). Every other field of every item equals the reviewed version (0 unflagged changes).
- No held question slipped in — **FAIL**: the script only drops a `rec: reserve` item when its review status is also `reserve`. These 5 have status `accepted` and `rec: reserve`, so they are **in** without an owner decision:
  B2-I015 (فرسان, repeat question), B2-I079 (البحر الميت, repeat question), B3-I020 (بغداد/المنصور, repeat question), B2-G012 «كلّ مشروك مبروك» (Kuwaiti source only), B2-G040 «الساحة فضّاحة» (Emirati source only).
  Note: 7 items whose review status is `reserve` are in because the recommendation is keep/fix (B1-G023, B1-H001, B1-H006, B1-H011, B1-H012, B3-G016, B3-G037). That follows the recommendation, but the owner should know they were held.
- Duplicate ids — **PASS** (0). Duplicate full phrases — 0. Same phrase with a different gap — **FAIL (1)**: B6-F023 «هلا و{غلا}» and B7-F010 «هلا و{مسهلا}», each listing the other's answer as alt.

## 3. Repeats with the other games — FAIL
Seeded sample of 40: 2 clear repeats (B7-L040 الضحى = letters «وقت ارتفاع الشمس صباحًا…»; B2-L042 الوغى = quiz «ما معنى كلمة الوغى») and 1 borderline (B4-L018 الضاد). The other 37 are clean.
Since the sample suggested ~5%, I scanned all 2,532 (answer, ignoring «ال» and hamza, matched against quiz.json and letters.json, then read each hit). **115 clear repeats** (same fact, same answer): 22 of the game's own 60, 4 proverbs from batch 1–2, 89 facts and words. Only 7 of the 115 carry any flag (fix/keep/reserve). The full list is at the end.
The worst cases are «أكمل المثل» questions in quiz.json that are word for word the same as items here (AK011–AK026, AK045, B2-A001, B1-G038), and the vocabulary («ما معنى كلمة …»), young-animal, animal-home and animal-sound questions in quiz (B2-L034…B4-L089).

## 4. Format — PASS (with notes)
- Exactly one `{gap}`: 2532/2532. gap == ans == opts[0]: 2528 exact; AK015, AK030, AK050, AK054 differ only by diacritics/shadda (gap «يُهان» vs ans «يهان»). akNorm makes them equal, so play is not affected; align them for tidiness.
- 4 options, distinct after akNorm: 2532/2532. Wrong option akNorm-equal to ans/alt: 0.
- Typing variants: no hard defect found. Notes: 808 typed items whose answer has «ال» and no alt without «ال» send that answer to the host («?»). That is by design but adds work for the host. 198 alt entries repeat the answer after akNorm (harmless). 33 typed number answers (years, counts) have no alt in words (acceptable). 3 typed answers of 3 words or more already have a short alt.
- `ref` is not a URL in 1,122 items (mostly OpenITI or book citations). 30 of the game's own 60 have no real ref («مثل عربي عام معروف»; AK002 says «لم يُتحقق»).

## 5. Content sample of 60 — PASS (with notes)
Checked: 15 from batch 9 (B9-F004, L006, L026, I059, F008, L018, I047, I065, I014, I006, F012, F013, L002, I055, L011), 15 fixed (B6-I248, B2-H036, B8-I664, B7-F415, B5-I071, B7-L053, B3-L061, B2-H031, B8-I014, B2-H032, B1-H024, B6-F019, B8-I444, B6-G005, B2-H033) and 30 others.
All 60 are correct, well formed and family-friendly, with no second correct option. I fetched 4 refs: Britannica Ramla (founded 716 by Sulayman, administrative capital — confirmed), Nat Geo electric eel (up to 600 V, not a true eel — confirmed), Britannica skeletal quiz (a little more than 300 bones at birth — confirmed), Britannica Kids inventors (Birdseye rapid freezing, about 1924 — confirmed). Web searches used: 0.
Notes:
- B2-L047, B3-I068, B3-L070: cross-game repeats (in the list below).
- B8-I664: the fix added «أو أكثر», but the cited ref says «up to 600 volts». Suggest «نحو {600} فولت» or cite the 2019 study (860 V).
- B3-A010 «جاؤوا عن بكرة أبيهم»: the cited ref (مجمع الأمثال 941) has «على بكرة أبيهم». Both are in use; suggest the text follow the ref, or the ref note the variant.
- B3-I015 «العاصمة الإدارية لمنطقة مكة المكرمة هي مدينة {مكة المكرمة}»: the answer is given away by the sentence. Suggest rewording or rejecting.

## Concrete problems and suggested actions

| id | problem | suggested action |
|---|---|---|
| B2-I015, B2-I079, B3-I020 | rec reserve (cross-game, owner to decide) but included | out until the owner decides; they are also in the repeat list |
| B2-G012, B2-G040 | rec reserve (Saudi usage unproven) but included | out until the owner decides |
| akml_candidate.py | `rec == 'reserve'` with status `accepted` is not excluded | also exclude `rec == 'reserve'` when there is no owner decision |
| B6-F023 / B7-F010 | same phrase «هلا و…» twice, each other's answer as alt | keep one (B7-F010 «مسهلا»), drop the other |
| 115 ids below | same fact and answer as in quiz/letters | reject (same policy as the 160), or the owner decides to allow repeats; then refill to ≥2,500 |
| AK015, AK030, AK050, AK054 | gap ≠ ans by diacritics | set ans = gap (or the other way round) |
| B8-I664 | «أو أكثر» not supported by the ref | «نحو 600» or update the ref |
| B3-A010 | text «عن» vs ref «على» | align |
| B3-I015 | answer appears in the question | reword or reject |
| AK002 and 29 other AK items | no checkable ref | add refs (low priority) |

### Full list of the 115 cross-game repeats

| id | candidate | other game | existing flag |
|---|---|---|---|
| AK011 | الصديق وقت {الضيق} | quiz: أكمل المثل: "الصديق وقت ..."؟ = الضيق | none |
| AK012 | الجار قبل {الدار} | quiz: أكمل المثل: "الجار قبل ..."؟ = الدار | none |
| AK013 | من جدّ {وجد} | quiz: أكمل المثل: "من جدّ ..."؟ = وجد | none |
| AK014 | في التأنّي السلامة، وفي العجلة {الندامة} | quiz: أكمل المثل: "في التأني السلامة وفي العجلة ..."؟ = الندامة | none |
| AK015 | عند الامتحان يُكرَم المرء أو {يُهان} | quiz: أكمل المثل: "عند الامتحان يُكرم المرء أو ..."؟ = يُهان | none |
| AK016 | رجع بخفّي {حنين} | quiz: أكمل المثل: "رجع بخفّي ..."؟ = حنين | none |
| AK017 | لكلّ جواد {كبوة} | quiz: أكمل المثل: "لكل جواد ..."؟ = كبوة | none |
| AK019 | سبق السيف {العذل} | quiz: أكمل المثل: "سبق السيف ..."؟ = العذل | none |
| AK020 | على نفسها جنت {براقش} | quiz: أكمل المثل: "على نفسها جنت ..."؟ = براقش | none |
| AK021 | العلم في الصغر كالنقش على {الحجر} | quiz: أكمل المثل: "العلم في الصغر كالنقش في ..."؟ = الحجر | none |
| AK022 | خير الكلام ما قلّ {ودلّ} | quiz: أكمل المثل: "خير الكلام ما قلّ و..."؟ = دلّ | none |
| AK023 | درهم وقاية خير من قنطار {علاج} | quiz: أكمل المثل: "درهم وقاية خير من قنطار ..."؟ = علاج | none |
| AK024 | الوقت كالسيف إن لم تقطعه {قطعك} | quiz: أكمل المثل: "الوقت كالسيف إن لم تقطعه ..."؟ = قطعك | none |
| AK026 | إذا كان الكلام من فضة فالسكوت من {ذهب} | quiz: أكمل المثل: "إذا كان الكلام من فضة فالسكوت من ..."؟ = ذهب | none |
| AK032 | أطول نهر في قارة أفريقيا هو نهر {النيل} | quiz: ما أطول نهر في أفريقيا؟ = النيل | none |
| AK033 | الحيوان الملقّب بسفينة الصحراء هو {الجمل} | quiz: ما الحيوان الملقب بسفينة الصحراء؟ = الجمل | none |
| AK034 | أكبر كواكب المجموعة الشمسية هو كوكب {المشتري} | quiz: ما أكبر كواكب المجموعة الشمسية؟ = المشتري | none |
| AK035 | أقرب كواكب المجموعة الشمسية إلى الشمس هو كوكب {عطارد} | letters: أقرب كواكب المجموعة الشمسية إلى الشمس؟ = عطارد | none |
| AK036 | يغلي الماء النقي عند مستوى سطح البحر في درجة {100} مئوية | quiz: عند أي درجة مئوية يغلي الماء عند مستوى سطح البحر؟ = 100 | none |
| AK037 | عدد أيام السنة الكبيسة في التقويم الميلادي {366} يومًا | quiz: كم يومًا في السنة الكبيسة؟ = 366 | none |
| AK038 | أعلى قمة جبلية في العالم فوق سطح البحر هي قمة {إيفرست} | letters: أعلى قمة جبلية في العالم؟ = إيفرست | none |
| AK045 | ما كلّ ما يتمنّى المرء يدركه، تجري الرياح بما لا تشتهي {السفن} | quiz: أكمل البيت: "تجري الرياح بما لا تشتهي ..."؟ = السفن | none |
| B2-A001 | اتّقِ شرَّ مَن {أحسنتَ} إليه | quiz: أكمل المثل: "اتقِ شرّ من ..."؟ = أحسنت إليه | none |
| B1-G038 | اليد الوحدة ما {تصفّق} | quiz: أكمل المثل: "اليد الواحدة لا ..."؟ = تصفق | none |
| B1-A034 | أحمقُ من {هبنّقة} | quiz: من يُضرب به المثل في الحمق؟ = هبنقة | none |
| B1-A035 | أطمعُ من {أشعب} | quiz: من يُضرب به المثل في الطمع؟ = أشعب | none |
| B5-I006 | الصحابي الوحيد الذي ذُكر اسمه صراحة في القرآن الكريم هو {زيد} بن حارثة | letters: الصحابي الوحيد الذي ذُكر اسمه في القرآن؟ = زيد بن حارثة | keep |
| B3-I032 | أقرب نجم إلى الأرض بعد الشمس هو نجم {بروكسيما} قنطورس | quiz: ما أقرب نجم إلى المجموعة الشمسية بعد الشمس؟ = بروكسيما قنطورس | none |
| B2-I056 | الصبغة التي تمتص الضوء في النباتات الخضراء لإتمام البناء الضوئي هي {الكلوروفيل} | letters: الصبغة الخضراء في النبات التي تمتص الضوء للبناء الضوئي؟ = كلوروفيل | none |
| B4-I061 | طائر {الدودو} الذي لا يطير انقرض في جزيرة موريشيوس قبل أكثر من ثلاثة قرون | letters: طائر منقرض لا يطير كان يعيش في جزيرة موريشيوس؟ = دودو | none |
| B4-I002 | تقع أطلال مدينة ماتشو بيتشو التابعة لحضارة الإنكا في دولة {البيرو} | quiz: في أي بلد تقع آثار حضارة الإنكا ومدينة ماتشو بيتشو؟ = بيرو | none |
| B3-I077 | صاحب قوانين الحركة الثلاثة وقانون الجذب العام هو العالم {نيوتن} | quiz: من صاحب قوانين الحركة الثلاثة الشهيرة؟ = إسحاق نيوتن | none |
| B2-I079 | أخفض مسطّح مائي على سطح الأرض هو {البحر الميت} | quiz: ما المسطح المائي الذي يُعد شاطئه أخفض نقطة على اليابسة؟ = البحر الميت | reserve |
| B2-I047 | أسرع طائر في العالم عند انقضاضه على فريسته هو {الشاهين} | quiz: ما أسرع طائر في العالم عند الانقضاض؟ = صقر الشاهين | fix |
| B5-I042 | يتوسط علم المملكة العربية السعودية نصُّ {الشهادة} وتحته سيف | quiz: ما العبارة المكتوبة على علم المملكة العربية السعودية؟ = الشهادتان | fix |
| B5-I048 | يُثبَّت الشماغ أو الغترة على الرأس بحبل أسود يُسمّى {العقال} | letters: حلقة سوداء توضع فوق الشماغ أو الغترة؟ = عقال | none |
| B5-I039 | يشتهر تمر {العجوة} بزراعته في منطقة المدينة المنورة | quiz: ما نوع التمر الشهير الذي تشتهر به المدينة المنورة؟ = العجوة | none |
| B5-I007 | يُؤدّى الحج في شهر {ذي الحجة}، آخر شهور السنة الهجرية | letters: الشهر الهجري الذي يؤدى فيه الحج؟ = ذو الحجة | none |
| B4-I081 | أعمق فوهة بركانية في المملكة العربية السعودية هي فوهة {الوعبة} | quiz: ما اسم الفوهة البركانية الشهيرة في حرة كشب غرب المملكة؟ = الوعبة | none |
| B4-I068 | يخزّن نبات {الصبار} الماء في أنسجته السميكة ليعيش في الأماكن الجافة | letters: نبات صحراوي شوكي يخزن الماء؟ = صبار | none |
| B4-I051 | العنصر الكيميائي الذي رمزه Pb هو {الرصاص} | letters: عنصر سام رمزه الكيميائي Pb؟ = رصاص | none |
| B4-I050 | العنصر الكيميائي الذي رمزه K هو {البوتاسيوم} | letters: العنصر الكيميائي الذي رمزه K؟ = بوتاسيوم | none |
| B4-I044 | يوافق عيد الفطر اليوم الأول من شهر {شوال} | letters: الشهر الهجري الذي يقع فيه عيد الفطر؟ = شوال | none |
| B3-L049 | «ديوان الحماسة» مختاراتٌ شعرية جمعها {أبو تمام} | quiz: من الشاعر العباسي صاحب كتاب "الحماسة" في المختارات الشعرية؟ = أبو تمام | none |
| B3-I079 | صاحب قاعدة الطفو الشهيرة هو العالم الإغريقي {أرخميدس} | quiz: من العالم الذي صاح "وجدتها" عند اكتشافه قاعدة الطفو؟ = أرخميدس | none |
| B3-I078 | صاحب النظرية النسبية الخاصة (1905م) والعامة (1916م) هو العالم {أينشتاين} | quiz: من صاحب النظرية النسبية؟ = ألبرت أينشتاين | none |
| B3-I023 | سُمّي جبل طارق بهذا الاسم نسبة إلى القائد {طارق بن زياد} | quiz: من القائد الذي عبر بالمسلمين إلى الأندلس وسُمّي جبل باسمه؟ = طارق بن زياد | none |
| B2-I091 | اشتُقّ مصطلح «الجبر» من عنوان كتاب العالم المسلم {الخوارزمي} | letters: العالم المسلم الذي ينسب إليه علم الجبر؟ = الخوارزمي | none |
| B2-I035 | أصلب نسيج في جسم الإنسان هو {مينا} الأسنان | quiz: ما المادة التي تغطي الأسنان وتُعد أصلب مادة في الجسم؟ = المينا | none |
| B2-I015 | أكبر جزيرة سعودية في البحر الأحمر هي جزيرة {فرسان} | letters: جزر سعودية في البحر الأحمر تتبع منطقة جازان؟ = فرسان | reserve |
| B2-I014 | يربط جسر الملك فهد بين المملكة العربية السعودية و{البحرين} | quiz: ما الدولة التي يربطها جسر الملك فهد بالسعودية؟ = البحرين | none |
| B2-I033 | تحتوي الخلية الجسدية للإنسان على {46} كروموسومًا | quiz: كم عدد الكروموسومات في الخلية الجسمية للإنسان؟ = 46 | none |
| B2-I029 | يتكوّن الهيكل العظمي للإنسان البالغ من {206} عظمة | quiz: كم عدد عظام جسم الإنسان البالغ؟ = 206 | none |
| B2-I048 | أطول الحيوانات البرية هي {الزرافة} | letters: أطول الحيوانات في العالم؟ = زرافة | none |
| B2-I050 | الثدييات الوحيدة القادرة على الطيران هي {الخفافيش} | letters: الحيوان الثديي الوحيد القادر على الطيران؟ = خفاش | none |
| B2-I043 | تتكوّن خلايا الدم الحمراء في {نخاع العظم} | quiz: أين تُصنع خلايا الدم في جسم الإنسان البالغ؟ = نخاع العظم | none |
| B2-I040 | الصبغة الحمراء في الدم التي تحتوي على الحديد تُسمّى {الهيموغلوبين} | letters: البروتين في خلايا الدم الحمراء الذي ينقل الأكسجين؟ = هيموغلوبين | none |
| B2-I006 | صحراء {الربع الخالي} أوسع مسطّح رملي متّصل في العالم | letters: أكبر صحراء رملية متصلة في العالم؟ = الربع الخالي | none |
| B3-I026 | صاحب فكرة حفر الخندق في غزوة الأحزاب هو الصحابي {سلمان الفارسي} | quiz: من الصحابي الذي أشار بحفر الخندق؟ = سلمان الفارسي | none |
| B3-I016 | كان خط سكة حديد الحجاز العثماني، الذي اكتمل عام 1908م، ينتهي جنوبًا في {المدينة المنورة} | quiz: ما المدينة التي كانت محطة النهاية لسكة حديد الحجاز؟ = المدينة المنورة | none |
| B3-I011 | يُعرف حيّ جدة التاريخية المسجّل في اليونسكو باسم «جدة {البلد}» | quiz: ما الاسم الشائع لمنطقة جدة التاريخية؟ = البلد | none |
| B3-I028 | أول قمر صناعي في التاريخ أطلقه الاتحاد السوفيتي عام 1957م، واسمه {سبوتنيك} | quiz: ما اسم أول قمر صناعي أُطلق إلى الفضاء؟ = سبوتنيك 1 | none |
| B3-I039 | أُطلق تلسكوب الفضاء {هابل} إلى مداره عام 1990م | quiz: ما اسم التلسكوب الفضائي الذي أُطلق عام 1990؟ = هابل | none |
| B3-I059 | من الثدييات القليلة التي تضع البيض حيوان {منقار البط} | quiz: أي هذه الثدييات يضع البيض؟ = خلد الماء | none |
| B3-I066 | أصغر الطيور الحية في العالم هو {الطائر الطنان} النحلي | letters: أصغر طائر في العالم يرفرف بسرعة هائلة؟ = طنان | none |
| B3-I075 | الغاز الخامل المستخدم في أنابيب الإعلانات واللوحات المضيئة هو {النيون} | quiz: ما الغاز النبيل المستخدم في لافتات الإضاءة الحمراء البرتقالية؟ = النيون | none |
| B3-I100 | أعلى قمة في جبال الأنديز هي قمة {أكونكاغوا} | quiz: ما أعلى قمة في قارة أمريكا الجنوبية؟ = أكونكاغوا | none |
| B4-I023 | تحدث معظم السحب والظواهر الجوية في الطبقة السفلى من الغلاف الجوي المسمّاة {التروبوسفير} | quiz: ما الطبقة الجوية الأقرب إلى سطح الأرض؟ = التروبوسفير | none |
| B4-I027 | أسمك طبقات الأرض هي الطبقة الواقعة بين القشرة واللب، وتُسمّى {الوشاح} | quiz: ما أكبر طبقات الأرض الداخلية حجمًا؟ = الوشاح | none |
| B4-I038 | تُقاس شدة الصوت (علوّه) بوحدة {الديسيبل} | letters: وحدة قياس شدة الصوت؟ = ديسيبل | none |
| B4-I105 | تمثال الحرية في نيويورك هدية من شعب {فرنسا} | quiz: أي بلد أهدى تمثال الحرية للولايات المتحدة؟ = فرنسا | none |
| B4-I109 | الطبيب الأندلسي أبو القاسم {الزهراوي} ألّف أول كتاب مستقل مصوّر في الجراحة، ورسم فيه أكثر من 200 أداة جراحية | quiz: من العالم الأندلسي الملقب بأبي الجراحة؟ = الزهراوي | none |
| B5-I023 | صاحب «ساعة الفيل» المائية وكتاب «الجامع بين العلم والعمل النافع في صناعة الحيل» (1206م) هو المهندس {الجزري} | quiz: من المهندس المسلم الشهير بساعة الفيل والآلات الذاتية الحركة؟ = الجزري | none |
| B5-I026 | فن الصيد بالطيور الجارحة وتربيتها وتدريبها يُسمّى {الصقارة} | quiz: ما اسم رياضة الصيد باستخدام الطيور الجارحة؟ = الصقارة | none |
| B5-I057 | التابل الذي يعطي مسحوق الكاري لونه الأصفر هو {الكركم} | letters: بهار أصفر اللون يلوّن الطعام ويدخل في خلطة الكاري؟ = كركم | none |
| B5-L059 | صوتُ حركة أغصان الشجر وأوراقه يُسمّى {الحفيف} | quiz: ما اسم صوت أوراق الشجر حين تحركها الريح؟ = الحفيف | none |
| B5-L063 | أنثى الأسد تُسمّى {اللبؤة} | letters: أنثى الأسد؟ = لبؤة | none |
| B3-L043 | لُقّب الشاعر الجاهلي عروة بن الورد بـ«عروة {الصعاليك}» | letters: لقب شعراء جاهليين كعروة بن الورد والشنفرى؟ = الصعاليك | none |
| B3-L027 | كتاب «فقه اللغة وسرّ العربية» من تأليف أبي منصور {الثعالبي} | letters: مؤلف كتابي "يتيمة الدهر" و"فقه اللغة"؟ = الثعالبي | none |
| B3-L081 | «النَّجيع» يعني {الدم} | quiz: ما معنى كلمة "النجيع"؟ = الدم | none |
| B3-L072 | «السُّهاد» يعني {الأرق} | quiz: ما معنى كلمة "السُّهاد"؟ = الأرق | none |
| B3-L067 | «اللُّجَين» يعني {الفضة} | quiz: ما معنى كلمة "اللُّجين"؟ = الفضة | none |
| B3-L066 | «العَسْجَد» يعني {الذهب} | quiz: ما معنى كلمة "العسجد"؟ = الذهب | none |
| B5-L066 | «الوَهْن» يعني {الضعف} | quiz: ما معنى كلمة "الوهن"؟ = الضعف | none |
| B4-L056 | «الجِيد» يعني {العنق} | quiz: ما معنى كلمة "الجِيد"؟ = العنق | none |
| B3-L070 | «الظَّمأ» يعني {العطش} | quiz: ما معنى كلمة "الظمأ"؟ = العطش | none |
| B2-L045 | «السَّغَب» تعني {الجوع} | quiz: ما معنى كلمة "السَّغَب"؟ = الجوع | none |
| B2-L047 | «اليَمّ» يعني {البحر} | quiz: ما معنى كلمة "اليمّ"؟ = البحر | none |
| B2-L041 | «الحُسام» من أسماءِ {السيف} | quiz: ما معنى كلمة "الحُسام"؟ = السيف | none |
| B2-L042 | «الوغى» في الشعر العربي تعني {الحرب} | quiz: ما معنى كلمة "الوغى"؟ = الحرب | none |
| B2-L034 | ولدُ الأسدِ يُسمّى {الشبل} | letters: صغير الأسد؟ = شبل | none |
| B3-L060 | ولدُ البقرة يُسمّى {العجل} | quiz: ما اسم صغير البقرة؟ = العجل | none |
| B3-L059 | ولدُ الحمار يُسمّى {الجحش} | quiz: ما اسم صغير الحمار؟ = الجحش | none |
| B2-L036 | ولدُ الناقةِ قبل أن يُفطَم يُسمّى {الحُوار} | quiz: ما اسم صغير الناقة؟ = الحُوار | none |
| B2-L038 | مأوى الأسدِ يُسمّى {العرين} | quiz: ما اسم بيت الأسد؟ = العرين | none |
| B2-L039 | الموضعُ الذي يستتر فيه الظبيُ بين الشجر يُسمّى {الكِناس} | quiz: ما اسم بيت الظبي؟ = الكِناس | none |
| B4-L089 | صوتُ الإبل يُسمّى {الرُّغاء} | quiz: ما اسم صوت الجمل؟ = الرُّغاء | none |
| B3-L053 | صوتُ الغنم يُسمّى {الثغاء} | letters: اسم صوت الخروف؟ = ثغاء | none |
| B2-L065 | أشهرُ كتب النحو، المعروف باسم «الكتاب»، ألّفه {سيبويه} | letters: إمام النحاة صاحب الكتاب؟ = سيبويه | none |
| B3-I025 | حكم الأمويون الأندلس من عاصمتهم مدينة {قرطبة} | letters: عاصمة الدولة الأموية في الأندلس؟ = قرطبة | none |
| B4-I078 | تقع قلعة مارد الأثرية على تلّ في الطرف الجنوبي من مدينة {دومة الجندل} | quiz: في أي محافظة يقع قصر مارد الأثري؟ = دومة الجندل | none |
| B3-I068 | يكاد غذاء الباندا العملاقة يقتصر على نبات {الخيزران} | quiz: ماذا يأكل حيوان الباندا العملاق بشكل رئيسي؟ = الخيزران | none |
| B5-I029 | المكوّنان الرئيسان للقهوة السعودية هما البن و{الهيل} | quiz: ما التابل الذي يضاف عادة إلى القهوة العربية السعودية؟ = الهيل | fix |
| B2-I062 | لا ينتقل الصوت في {الفراغ} | quiz: في أي وسط لا يمكن للصوت أن ينتقل؟ = الفراغ | fix |
| B6-I462 | تُصنع جبنة الموتزاريلا الأصلية من حليب {الجاموس} | letters: حيوان من فصيلة البقر يصنع من حليبه جبن الموزاريلا الأصلي؟ = جاموس | none |
| B3-I067 | تُصنَّف الثعابين من {الزواحف} | letters: صنف من الحيوانات يضم السحالي والثعابين؟ = زواحف | none |
| B3-I034 | أعاد الاتحاد الفلكي الدولي عام 2006م تصنيف {بلوتو} ليصبح كوكبًا قزمًا | quiz: ما الجرم الذي فقد صفة الكوكب وصُنّف قزمًا عام 2006؟ = بلوتو | none |
| B2-I054 | تتنفس الأسماك الأكسجين الذائب في الماء بواسطة {الخياشيم} | quiz: ما العضو الذي يستخدمه السمك للتنفس في الماء؟ = الخياشيم | none |
| B2-I038 | العضلة التي تفصل تجويف الصدر عن تجويف البطن هي {الحجاب الحاجز} | quiz: ما العضلة الرئيسية المسؤولة عن عملية التنفس؟ = الحجاب الحاجز | none |
| B5-I086 | العالم الفرنسي الذي نشر عام 1822م فكّ رموز الكتابة الهيروغليفية المصرية هو {شامبليون} | quiz: من فك رموز حجر رشيد؟ = جان فرانسوا شامبليون | none |
| B4-I006 | تقع دائرة الحجارة الأثرية العملاقة «ستونهنج» في {إنجلترا} | quiz: في أي دولة يقع موقع ستونهنج الأثري؟ = المملكة المتحدة | none |
| B5-I124 | يتكوّن القفص الصدري للإنسان من {12} زوجًا من الأضلاع | quiz: كم عدد أزواج الأضلاع في جسم الإنسان عادة؟ = 12 | none |
| B4-I094 | يصدر صوت الإنسان من اهتزاز الحبال الصوتية الموجودة في {الحنجرة} | letters: العضو في الرقبة الذي يحتوي على الأحبال الصوتية؟ = حنجرة | none |
| B3-L090 | الاسم المثنّى يُرفع بـ{الألف} | quiz: ما علامة رفع المثنى؟ = الألف | none |
| B7-L040 | وقتُ ارتفاع الشمس أوّلَ النهار يُسمّى {الضحى} | letters: وقت ارتفاع الشمس صباحًا وتُنسب إليه صلاة؟ = ضحى | none |
