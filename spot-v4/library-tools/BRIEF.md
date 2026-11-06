# Making spot-the-difference pairs (Lamma)

The goal is a picture pair for a family party game. The second picture B is the original A with exactly N natural differences:
- easy: 5 differences, large and obvious;
- medium: 8 differences, mid-sized;
- hard: 12 differences, small but clearly visible when zoomed.

The quality bar is the 15 approved pairs. Their specs are in `/home/claude/spot2/specs/*.py`; study two or three before you start. For example, `h3_library.py` is a hard pair with 12 differences and `e2_cow.py` is an easy one. Each difference must:
- look natural, as if the photo were simply like that;
- be one clear object or thing;
- be independent of the others.

## Tools (all in /home/claude/spot3; source pictures are /home/claude/spot3/src/<id>.png, 2400 px wide)
- `python3 look2.py <id>`: the whole picture with a coordinate grid every 200 px, in full-resolution pixels. It prints a jpg path; open that path with the Read tool.
- `python3 look2.py <id> x0 y0 x1 y1 [step]`: an enlarged crop with a finer grid. Use it to get exact coordinates of an object.
- `python3 detect.py <id>`: objects found by a detector (COCO classes) with their boxes. This is a helper only; many good targets are not COCO objects.
- Write the spec to `/home/claude/spot3/manual/<id>.py`:
  - Set `SPEC = {'id': '<id>', 'src': '<id>', 'level': 0|1|2, 'n': 5|8|12, 'kind': 'photo'|'art', 'title': '<short Arabic title>', 'diffs': [...]}`.
  - The format is the same as `/home/claude/spot2/specs/*.py`.
  - Each diff needs `'name'`, which is a short Arabic description of what changed, e.g. 'اختفاء الإبريق الأزرق' or 'المظلة الحمراء صارت خضراء'.
- `python3 run.py <id>`: applies the spec. It prints a check line and writes two sheets. Open them with Read:
  - `/home/claude/spot3/out/crops_<id>.jpg`: before/after of every difference.
  - `/home/claude/spot3/out/rev_<id>.jpg`: the whole picture B with numbered circles.
- `python3 qc.py <id>`: the publishing quality gate. Every line must be PASS.
- `python3 look2.py <id> --b x0 y0 x1 y1`: a closer look at the edited picture B.

Run only ONE run.py at a time; two CPUs are shared by several workers. A run takes about 0.5 to 2 minutes.

## Edit operations (see /home/claude/spot2/kit2.py `apply` for all options)
- **remove**: the object disappears and LaMa fills the background.
  - `{'op':'remove','rect':(x0,y0,x1,y1),'sam':True,'dil':8}`
  - Set `dil` 6–18 so that no outline or shadow remains. `'shadow':(dx,dy)` sweeps the cast shadow too.
  - Use it for small or medium objects on a simple or textured background. Check the fill in the crops: no smears or ghosts.
- **recolor**: the object changes colour, and its shading and texture stay.
  - `{'op':'recolor','rect':..., 'sam':True,'pts':[(x,y)],'dil':1,'lcc':True,'set_hue':H, ...}`
  - H is in degrees: 0 red, 25 orange, 50 yellow, 120 green, 215 blue.
  - Colourful object: use `set_hue` plus `'minsat':<about half of its saturation>` so only the coloured parts change.
  - Grey or white object: use `'min_sat':110–150` together with `'minval':70,'maxval':235`, so tyres, windows and highlights stay.
  - Big fabrics: use `'val':0.6–0.9`, `'sat':0.8–1` to avoid neon.
  - Never use neon green or purple on stone, walls, sky, water, skin or food that would look unnatural.
  - When SAM gets only part of the object, use `'pick':'big'` and more `pts`. If needed use `'poly':[(x,y),...]` (no sam) for exact shapes.
- **flip**: mirror an asymmetric object (sign, person, animal, bicycle, vehicle). It shows only if the object is clearly asymmetric.
  - `{'op':'flip','rect':...,'sam':True,'dil':3}`
- **add**: copy an object to another place, e.g. a second bird or flower pot.
  - `{'op':'add','rect':...,'sam':True,'dx':..,'dy':..}`
  - The new place must make sense (same surface, same scale).
- **scale**: an object becomes smaller or bigger.
  - `{'op':'scale','rect':...,'sam':True,'f':0.7}`

## Rules
- Exactly N differences.
- **Spacing:**
  - Spread the differences over the whole picture.
  - Every box must be at least 60 px (at 2400) away from every other box. Never edit two touching objects.
  - Stay at least 30 px away from the picture edges.
- **Size:**
  - easy: each object at least about 150 px across, at 2400.
  - medium: at least about 70 px.
  - hard: at least about 35 px, and each change must still be clearly visible when zoomed. qc requires ≥250 changed pixels at 1600 px.
- **Do not:**
  - recolour skin or faces;
  - change or invent text on signs (a sign may vanish or change colour);
  - add brand names;
  - make edits that cut an object in half, e.g. half a cloth recoloured;
  - leave any trace in the crops: ghost outlines, smears, colour leaking onto the ground.
- **Variety:** mix removals, colour changes and a few flips or adds. Removals and recolours are the most reliable.
- **Done when** all of these hold, and you have looked at the crops sheet and every difference looks natural:
  - run.py check: `count == n`, `overlaps == []`, `stray == []`;
  - every qc.py line is PASS.
  - If an image cannot get N good differences, say so and skip it (reason). Do not force bad edits.

## Report at the end (plain text)
For each picture give the following, and list skipped pictures with the reason:
- id;
- level;
- title (Arabic);
- the qc result line;
- the list of differences (Arabic names);
- any concern.
