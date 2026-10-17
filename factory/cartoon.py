"""Original cartoon scenes for spot-the-difference (no outside images, no licences to track).

Every scene is drawn from a seed as a list of objects (SVG). The second picture is the same list with a few objects
changed: hidden, recoloured within the scene palette, mirrored, moved a little, resized, or with a detail toggled.
Because the changes are made on the objects themselves, every difference has an exact box, and the pixel check
afterwards proves that each box really changed and that nothing outside the boxes changed.

  python -m factory.cartoon --out out/cartoon --count 30 --seed 1
"""
import math, random, json, os, io, argparse, copy
import numpy as np
from PIL import Image

W, H = 1280, 853

# ---------------------------------------------------------------- palettes
PAL = {
    "red": "#e8505b", "coral": "#f47c5a", "orange": "#f59f2f", "yellow": "#f7c948", "lime": "#8fd14f",
    "green": "#3fae6a", "teal": "#2bb3a3", "sky": "#4fb3f0", "blue": "#3d7be0", "purple": "#8e6bd8",
    "pink": "#ef7fb1", "brown": "#9a6a42", "white": "#ffffff", "cream": "#f6e7c8", "grey": "#9aa3b5",
}
BRIGHT = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"]
def col(c): return PAL.get(c, c)
def shade(hexc, k):
    hexc = col(hexc).lstrip("#"); r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    f = (lambda v: int(max(0, min(255, v * k)))) if k < 1 else (lambda v: int(max(0, min(255, v + (255 - v) * (k - 1)))))
    return "#%02x%02x%02x" % (f(r), f(g), f(b))

# ---------------------------------------------------------------- objects
# each kind: draw(e) -> svg (drawn around the origin), box -> (x0, y0, x1, y1) in local units, flags
def g(e, inner):
    sx = -e["s"] if e.get("f") else e["s"]
    return f'<g transform="translate({e["x"]:.1f},{e["y"]:.1f}) scale({sx:.3f},{e["s"]:.3f})">{inner}</g>'

def d_tree(e):
    c = col(e["c"]); return g(e, f'<rect x="-11" y="-72" width="22" height="72" rx="6" fill="#8a5a36"/>'
        f'<circle cx="0" cy="-112" r="52" fill="{c}"/><circle cx="-38" cy="-84" r="38" fill="{c}"/><circle cx="38" cy="-84" r="38" fill="{c}"/>'
        f'<circle cx="-14" cy="-128" r="22" fill="{shade(c, 1.25)}" opacity=".7"/>'
        + ("".join(f'<circle cx="{x}" cy="{y}" r="7" fill="{col(e["c2"])}"/>' for x, y in ((-30, -95), (20, -120), (35, -80), (-5, -75))) if e["v"].get("fruit") else ""))
def d_pine(e):
    c = col(e["c"]); return g(e, f'<rect x="-8" y="-32" width="16" height="32" fill="#7a4e2e"/><polygon points="-52,-30 52,-30 0,-110" fill="{shade(c, .85)}"/>'
        f'<polygon points="-42,-72 42,-72 0,-152" fill="{c}"/>')
def d_bush(e):
    c = col(e["c"]); return g(e, f'<circle cx="-30" cy="-26" r="28" fill="{shade(c, .9)}"/><circle cx="30" cy="-26" r="28" fill="{shade(c, .9)}"/><circle cx="0" cy="-36" r="34" fill="{c}"/>'
        + ("".join(f'<circle cx="{x}" cy="{y}" r="5" fill="{col(e["c2"])}"/>' for x, y in ((-30, -34), (-6, -52), (18, -40), (34, -22), (-12, -24))) if e["v"].get("berries") else ""))
def d_flower(e):
    c = col(e["c"]); pet = "".join(f'<circle cx="{11 * math.cos(a):.1f}" cy="{-52 + 11 * math.sin(a):.1f}" r="9" fill="{c}"/>' for a in [i * 2 * math.pi / 5 - math.pi / 2 for i in range(5)])
    return g(e, f'<path d="M0,0 L0,-46" stroke="#3a8f4f" stroke-width="5"/><ellipse cx="9" cy="-20" rx="10" ry="5" fill="#4aa35e" transform="rotate(-30 9 -20)"/>{pet}<circle cx="0" cy="-52" r="6" fill="#f7d14a"/>')
def d_house(e):
    c, r = col(e["c"]), col(e["c2"]); v = e["v"]
    win = lambda x: f'<rect x="{x}" y="-98" width="34" height="30" rx="3" fill="#bfe6ff" stroke="#fff" stroke-width="3"/><path d="M{x + 17},-98 V-68 M{x},-83 H{x + 34}" stroke="#fff" stroke-width="3"/>'
    return g(e, (f'<rect x="38" y="-188" width="20" height="44" fill="{shade(r, .8)}"/>' if v.get("chimney") else "")
        + f'<rect x="-82" y="-122" width="164" height="122" fill="{c}"/><polygon points="-98,-120 98,-120 0,-200" fill="{r}"/>'
        f'<rect x="-18" y="-62" width="36" height="62" rx="4" fill="{shade(c, .55)}"/><circle cx="10" cy="-30" r="3" fill="#f7d14a"/>'
        + win(-68) + (win(34) if v.get("win2", True) else ""))
def d_cloud(e):
    return g(e, '<g fill="#ffffff" opacity=".96"><ellipse cx="0" cy="0" rx="62" ry="26"/><circle cx="-34" cy="-6" r="28"/><circle cx="8" cy="-22" r="34"/><circle cx="40" cy="-4" r="24"/></g>')
def d_sun(e):
    rays = "".join(f'<line x1="{58 * math.cos(a):.1f}" y1="{58 * math.sin(a):.1f}" x2="{80 * math.cos(a):.1f}" y2="{80 * math.sin(a):.1f}" stroke="#f7c948" stroke-width="7" stroke-linecap="round"/>' for a in [i * math.pi / 6 for i in range(12)])
    return g(e, f'{rays}<circle r="48" fill="#f7c948"/><circle r="36" fill="#fbd96a"/>')
def d_bird(e):
    return g(e, '<path d="M-22,2 Q-11,-14 0,0 Q11,-14 22,2" fill="none" stroke="#2c3550" stroke-width="5" stroke-linecap="round"/>')
def d_balloon(e):
    c = col(e["c"]); return g(e, f'<path d="M0,0 C6,-20 -6,-40 0,-60" stroke="#555" stroke-width="2" fill="none"/><ellipse cx="0" cy="-92" rx="25" ry="31" fill="{c}"/>'
        f'<polygon points="-5,-61 5,-61 0,-66" fill="{c}"/><ellipse cx="-9" cy="-102" rx="6" ry="10" fill="#fff" opacity=".45"/>')
def d_kite(e):
    c, c2 = col(e["c"]), col(e["c2"]); return g(e, f'<polygon points="0,-48 32,0 0,58 -32,0" fill="{c}"/><polygon points="0,-48 32,0 0,0" fill="{c2}"/><polygon points="0,58 -32,0 0,0" fill="{c2}"/>'
        '<path d="M0,58 q14,22 0,40 q-14,20 4,38" stroke="#444" stroke-width="2" fill="none"/><path d="M-6,88 l12,4 l-12,4z M-2,118 l12,4 l-12,4z" fill="#e8505b"/>')
def d_bench(e):
    c = col(e["c"]); return g(e, f'<rect x="-58" y="-36" width="8" height="36" fill="#555"/><rect x="50" y="-36" width="8" height="36" fill="#555"/>'
        f'<rect x="-64" y="-42" width="128" height="10" rx="3" fill="{c}"/><rect x="-64" y="-70" width="128" height="9" rx="3" fill="{c}"/><rect x="-64" y="-56" width="128" height="9" rx="3" fill="{c}"/>')
def d_car(e):
    c = col(e["c"]); return g(e, f'<path d="M-78,-16 Q-78,-46 -50,-48 L-34,-74 Q-30,-78 -22,-78 L30,-78 Q38,-78 42,-72 L58,-48 Q78,-46 78,-22 L78,-16 Z" fill="{c}"/>'
        '<path d="M-26,-70 L-6,-70 L-6,-50 L-40,-50 Z M2,-70 L30,-70 L44,-50 L2,-50 Z" fill="#cdeeff"/>'
        '<circle cx="-46" cy="-14" r="15" fill="#2c3550"/><circle cx="-46" cy="-14" r="6" fill="#ccc"/><circle cx="46" cy="-14" r="15" fill="#2c3550"/><circle cx="46" cy="-14" r="6" fill="#ccc"/>'
        '<rect x="66" y="-40" width="10" height="7" rx="2" fill="#ffe08a"/>')
def d_lamp(e):
    return g(e, '<rect x="-4" y="-176" width="8" height="176" fill="#3d4766"/><rect x="-14" y="-6" width="28" height="6" rx="2" fill="#3d4766"/>'
        f'<path d="M-16,-176 L16,-176 L10,-196 L-10,-196 Z" fill="#3d4766"/><circle cx="0" cy="-172" r="9" fill="{"#ffe08a" if e["v"].get("on", True) else "#7d86a0"}"/>')
_uid = [0]
def d_umbrella(e):
    c, c2 = col(e["c"]), col(e["c2"]); _uid[0] += 1; cid = f"u{_uid[0]}"
    dome = "M-84,-128 Q-80,-182 0,-184 Q80,-182 84,-128 Q63,-140 42,-128 Q21,-140 0,-128 Q-21,-140 -42,-128 Q-63,-140 -84,-128 Z"
    return g(e, f'<defs><clipPath id="{cid}"><path d="{dome}"/></clipPath></defs><line x1="0" y1="0" x2="0" y2="-186" stroke="#6b4b30" stroke-width="5"/>'
        f'<path d="{dome}" fill="{c}"/><g clip-path="url(#{cid})"><path d="M-42,-190 L-30,-120 L-56,-120 Z M42,-190 L56,-120 L30,-120 Z M0,-190 L10,-120 L-10,-120 Z" fill="{c2}"/></g><circle cx="0" cy="-188" r="5" fill="#6b4b30"/>')
def d_ball(e):
    c, c2 = col(e["c"]), col(e["c2"]); return g(e, f'<circle r="22" fill="#fff"/><path d="M0,-22 A22,22 0 0,1 19,11 L0,0 Z" fill="{c}"/><path d="M-19,11 A22,22 0 0,1 0,-22 L0,0 Z" fill="{c2}"/><circle r="22" fill="none" stroke="#00000022" stroke-width="2"/>')
def d_boat(e):
    c = col(e["c"]); return g(e, '<path d="M-72,-22 L72,-22 L52,0 L-52,0 Z" fill="#8a5a36"/><line x1="0" y1="-22" x2="0" y2="-138" stroke="#5a3a22" stroke-width="5"/>'
        f'<polygon points="4,-134 4,-30 64,-30" fill="{c}"/><polygon points="-4,-120 -4,-30 -48,-30" fill="#fff"/>')
def d_palm(e):
    lv = "".join(f'<path d="M14,-172 q{dx * .5:.0f},{dy - 30:.0f} {dx},{dy}" stroke="#2f9a58" stroke-width="16" fill="none" stroke-linecap="round"/>' for dx, dy in ((-70, 10), (-50, 40), (60, 20), (75, -5), (10, 45)))
    return g(e, f'<path d="M0,0 Q4,-90 14,-172" stroke="#9a6a42" stroke-width="18" fill="none" stroke-linecap="round"/>{lv}'
        + ('<circle cx="6" cy="-160" r="8" fill="#6b4b30"/><circle cx="20" cy="-158" r="8" fill="#6b4b30"/>' if e["v"].get("coco", True) else ""))
def d_crab(e):
    c = col(e["c"]); legs = "".join(f'<line x1="{sx * 14}" y1="-10" x2="{sx * 30}" y2="{-2 + k * 6}" stroke="{c}" stroke-width="4"/>' for sx in (-1, 1) for k in range(3))
    return g(e, f'{legs}<ellipse cx="0" cy="-16" rx="24" ry="15" fill="{c}"/><circle cx="-30" cy="-28" r="9" fill="{c}"/><circle cx="30" cy="-28" r="9" fill="{c}"/>'
        '<circle cx="-7" cy="-34" r="4" fill="#fff"/><circle cx="7" cy="-34" r="4" fill="#fff"/><circle cx="-7" cy="-34" r="2" fill="#222"/><circle cx="7" cy="-34" r="2" fill="#222"/>')
def d_castle(e):
    c = "#e6c27a"; return g(e, f'<rect x="-50" y="-60" width="100" height="60" fill="{c}"/><rect x="-58" y="-90" width="30" height="90" fill="{shade(c, .92)}"/><rect x="28" y="-90" width="30" height="90" fill="{shade(c, .92)}"/>'
        f'<rect x="-14" y="-28" width="28" height="28" rx="12" fill="{shade(c, .7)}"/><line x1="43" y1="-90" x2="43" y2="-122" stroke="#555" stroke-width="3"/><polygon points="43,-122 66,-114 43,-106" fill="{col(e["c"])}"/>')
def d_fish(e):
    c, c2 = col(e["c"]), col(e["c2"]); return g(e, f'<polygon points="34,0 62,-20 62,20" fill="{shade(c, .85)}"/><ellipse cx="0" cy="0" rx="42" ry="23" fill="{c}"/>'
        f'<path d="M-6,-21 Q2,0 -6,21 M10,-20 Q18,0 10,20" stroke="{c2}" stroke-width="6" fill="none"/><circle cx="-24" cy="-6" r="6" fill="#fff"/><circle cx="-25" cy="-6" r="3" fill="#222"/>')
def d_star5(e):
    c = col(e["c"]); pts = " ".join(f'{(26 if i % 2 == 0 else 11) * math.cos(-math.pi / 2 + i * math.pi / 5):.1f},{(26 if i % 2 == 0 else 11) * math.sin(-math.pi / 2 + i * math.pi / 5):.1f}' for i in range(10))
    return g(e, f'<polygon points="{pts}" fill="{c}" stroke="{shade(c, .8)}" stroke-width="3" stroke-linejoin="round"/>')
def d_weed(e):
    return g(e, f'<path d="M0,0 C-18,-30 18,-60 0,-90 C-14,-110 6,-118 0,-128" stroke="{col(e["c"])}" stroke-width="10" fill="none" stroke-linecap="round"/>')
def d_bubble(e): return g(e, '<circle r="11" fill="#ffffff22" stroke="#ffffffcc" stroke-width="3"/><circle cx="-4" cy="-4" r="3" fill="#fff"/>')
def d_chest(e):
    return g(e, '<rect x="-46" y="-44" width="92" height="44" rx="4" fill="#8a5a36"/><path d="M-46,-44 Q0,-74 46,-44 Z" fill="#a8703f"/>'
        '<rect x="-46" y="-48" width="92" height="7" fill="#f2c14e"/><rect x="-7" y="-40" width="14" height="16" rx="3" fill="#f2c14e"/>')
def d_coral(e):
    c = col(e["c"]); return g(e, f'<path d="M0,0 V-60 M0,-40 L-26,-74 M0,-50 L24,-90 M-26,-74 L-34,-96 M24,-90 L40,-104 M0,-60 L6,-100" stroke="{c}" stroke-width="12" fill="none" stroke-linecap="round"/>')
def d_camel(e):
    c = "#d9a55e"; return g(e, f'<rect x="-52" y="-62" width="12" height="62" fill="{shade(c, .85)}"/><rect x="28" y="-62" width="12" height="62" fill="{shade(c, .85)}"/>'
        f'<ellipse cx="-6" cy="-80" rx="56" ry="30" fill="{c}"/><ellipse cx="-10" cy="-104" rx="26" ry="24" fill="{c}"/>'
        f'<path d="M42,-86 Q66,-110 64,-140" stroke="{c}" stroke-width="20" fill="none" stroke-linecap="round"/><ellipse cx="74" cy="-142" rx="18" ry="11" fill="{c}"/><circle cx="76" cy="-146" r="2.5" fill="#222"/>'
        + (f'<rect x="-34" y="-112" width="44" height="12" rx="4" fill="{col(e["c"])}"/>' if e["v"].get("saddle", True) else ""))
def d_tent(e):
    c, c2 = col(e["c"]), col(e["c2"]); return g(e, f'<polygon points="-112,0 0,-122 112,0" fill="{c}"/><path d="M-56,-61 L56,-61 M-84,-30 L84,-30" stroke="{c2}" stroke-width="10"/>'
        f'<polygon points="-28,0 0,-60 28,0" fill="{shade(c, .45)}"/>')
def d_dallah(e):
    c = "#e2b23c"; return g(e, f'<path d="M-18,0 L18,0 L14,-30 Q22,-46 10,-54 L-10,-54 Q-22,-46 -14,-30 Z" fill="{c}"/><path d="M14,-36 Q36,-44 40,-62" stroke="{c}" stroke-width="6" fill="none"/>'
        f'<path d="M-10,-54 Q0,-70 10,-54" fill="{shade(c, .85)}"/><circle cx="0" cy="-68" r="4" fill="{shade(c, .7)}"/>')
def d_fire(e):
    return g(e, '<rect x="-30" y="-8" width="60" height="8" rx="4" fill="#6b4b30"/><path d="M-20,-6 Q-26,-34 -6,-50 Q-8,-30 4,-28 Q2,-46 14,-56 Q26,-30 18,-6 Z" fill="#f59f2f"/><path d="M-8,-6 Q-10,-22 0,-30 Q8,-20 8,-6 Z" fill="#f7d14a"/>')
def d_moon(e): return g(e, '<circle r="38" fill="#f6e7a8"/><circle cx="16" cy="-10" r="34" fill="#1d2550"/>')
def d_star(e): return d_star5({**e, "s": e["s"] * .35, "c": "#ffe28a"})
def d_sheep(e):
    return g(e, '<rect x="-30" y="-30" width="9" height="30" fill="#333"/><rect x="18" y="-30" width="9" height="30" fill="#333"/>'
        '<g fill="#fdfdfd"><circle cx="-24" cy="-48" r="20"/><circle cx="0" cy="-56" r="24"/><circle cx="24" cy="-48" r="20"/><circle cx="0" cy="-36" r="22"/></g>'
        '<ellipse cx="-46" cy="-50" rx="14" ry="11" fill="#333"/><circle cx="-50" cy="-52" r="2.5" fill="#fff"/>')
def d_chicken(e):
    return g(e, '<line x1="-6" y1="0" x2="-4" y2="-16" stroke="#e8a23a" stroke-width="3"/><line x1="6" y1="0" x2="4" y2="-16" stroke="#e8a23a" stroke-width="3"/>'
        '<ellipse cx="0" cy="-30" rx="24" ry="18" fill="#fff"/><circle cx="-18" cy="-48" r="11" fill="#fff"/><path d="M-22,-60 l4,-8 l4,8 l4,-8 l3,8" fill="#e8505b"/><polygon points="-29,-48 -36,-45 -29,-42" fill="#f59f2f"/><circle cx="-21" cy="-50" r="2" fill="#222"/>')
def d_barn(e):
    c = col(e["c"]); return g(e, f'<rect x="-90" y="-110" width="180" height="110" fill="{c}"/><polygon points="-104,-108 0,-180 104,-108" fill="{shade(c, .75)}"/>'
        '<rect x="-34" y="-74" width="68" height="74" fill="#fff"/><path d="M-34,-74 L34,0 M34,-74 L-34,0" stroke="' + c + '" stroke-width="6"/>'
        + ('<circle cx="0" cy="-134" r="14" fill="#fff"/>' if e["v"].get("round", True) else ""))
def d_fence(e):
    return g(e, "".join(f'<rect x="{-60 + i * 30}" y="-50" width="14" height="50" rx="4" fill="#e7d3b0"/>' for i in range(5)) + '<rect x="-64" y="-38" width="136" height="8" fill="#d8c09a"/><rect x="-64" y="-18" width="136" height="8" fill="#d8c09a"/>')
def d_frame(e):
    c = col(e["c"]); return g(e, f'<rect x="-50" y="-40" width="100" height="80" rx="4" fill="#8a5a36"/><rect x="-40" y="-30" width="80" height="60" fill="#cdeeff"/>'
        f'<polygon points="-40,30 -10,-6 14,18 26,6 40,30" fill="{c}"/><circle cx="22" cy="-14" r="8" fill="#f7c948"/>')
def d_clock(e):
    return g(e, f'<circle r="34" fill="#fff" stroke="{col(e["c"])}" stroke-width="7"/><line x1="0" y1="0" x2="0" y2="-22" stroke="#333" stroke-width="4" stroke-linecap="round"/>'
        f'<line x1="0" y1="0" x2="{16 if e["v"].get("h3", True) else -16}" y2="0" stroke="#333" stroke-width="4" stroke-linecap="round"/><circle r="3" fill="#333"/>')
def d_jar(e):
    c = col(e["c"]); return g(e, f'<rect x="-16" y="-44" width="32" height="44" rx="7" fill="{c}"/><rect x="-18" y="-52" width="36" height="10" rx="3" fill="{shade(c, .7)}"/><rect x="-10" y="-34" width="20" height="14" rx="2" fill="#fff" opacity=".8"/>')
def d_plant(e):
    c = col(e["c"]); return g(e, f'<path d="M-24,-40 L24,-40 L18,0 L-18,0 Z" fill="{c}"/>'
        '<path d="M0,-40 Q-30,-70 -36,-100 M0,-40 Q2,-90 6,-118 M0,-40 Q30,-66 38,-96" stroke="#3fae6a" stroke-width="9" fill="none" stroke-linecap="round"/>')
def d_lampd(e):
    c = col(e["c"]); return g(e, f'<rect x="-3" y="-90" width="6" height="84" fill="#555"/><ellipse cx="0" cy="-4" rx="22" ry="6" fill="#555"/><path d="M-30,-86 L30,-86 L18,-126 L-18,-126 Z" fill="{c}"/>')
def d_books(e):
    cs = [col(x) for x in e["v"].get("cols", ["red", "blue", "green"])]
    return g(e, "".join(f'<rect x="{-30 + i * 20}" y="{-60 + (i % 2) * 6}" width="17" height="{60 - (i % 2) * 6}" rx="2" fill="{c}"/>' for i, c in enumerate(cs)))
def d_cup(e):
    c = col(e["c"]); return g(e, f'<path d="M-16,-30 L16,-30 L12,0 L-12,0 Z" fill="{c}"/><path d="M16,-24 q14,2 0,16" stroke="{c}" stroke-width="5" fill="none"/>'
        + ('<path d="M-4,-36 q-6,-10 0,-18 M6,-36 q-6,-10 0,-18" stroke="#ccc" stroke-width="3" fill="none"/>' if e["v"].get("steam", True) else ""))
def d_cat(e):
    c = col(e["c"]); return g(e, f'<ellipse cx="0" cy="-22" rx="34" ry="22" fill="{c}"/><circle cx="-30" cy="-46" r="18" fill="{c}"/><polygon points="-44,-58 -40,-76 -30,-62" fill="{c}"/><polygon points="-26,-62 -18,-76 -14,-56" fill="{c}"/>'
        f'<path d="M32,-24 Q56,-30 50,-60" stroke="{c}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="-36" cy="-48" r="3" fill="#222"/><circle cx="-25" cy="-48" r="3" fill="#222"/>')
def d_rocket(e):
    c = col(e["c"]); return g(e, f'<path d="M0,-130 Q30,-90 26,-30 L-26,-30 Q-30,-90 0,-130 Z" fill="#eef2fb"/><circle cx="0" cy="-80" r="12" fill="{col("sky")}" stroke="#9aa3b5" stroke-width="4"/>'
        f'<path d="M-26,-50 L-44,-14 L-26,-30 Z M26,-50 L44,-14 L26,-30 Z" fill="{c}"/><path d="M-14,-30 L14,-30 L0,0 Z" fill="#f59f2f"/>')
def d_planet(e):
    c = col(e["c"]); return g(e, f'<circle r="44" fill="{c}"/><ellipse rx="72" ry="14" fill="none" stroke="{shade(c, 1.4)}" stroke-width="6" transform="rotate(-18)"/><circle cx="-14" cy="-12" r="10" fill="{shade(c, .85)}"/>')

KINDS = {
    # kind: (draw, box (x0,y0,x1,y1), recolour?, mirror?, toggles)
    "tree": (d_tree, (-76, -164, 76, 0), True, False, ["fruit"]), "pine": (d_pine, (-52, -152, 52, 0), True, False, []),
    "bush": (d_bush, (-58, -70, 58, 0), True, False, ["berries"]), "flower": (d_flower, (-22, -64, 22, 0), True, False, []),
    "house": (d_house, (-98, -200, 98, 0), True, False, ["chimney", "win2"]), "cloud": (d_cloud, (-64, -56, 66, 28), False, False, []),
    "sun": (d_sun, (-82, -82, 82, 82), False, False, []), "bird": (d_bird, (-24, -14, 24, 6), False, False, []),
    "balloon": (d_balloon, (-26, -124, 26, 0), True, False, []), "kite": (d_kite, (-34, -50, 34, 132), True, True, []),
    "bench": (d_bench, (-64, -72, 64, 0), True, False, []), "car": (d_car, (-80, -80, 80, 2), True, True, []),
    "lamp": (d_lamp, (-18, -198, 18, 0), False, False, ["on"]), "umbrella": (d_umbrella, (-86, -194, 86, 0), True, False, []),
    "ball": (d_ball, (-23, -23, 23, 23), True, False, []), "boat": (d_boat, (-72, -140, 72, 2), True, True, []),
    "palm": (d_palm, (-62, -222, 92, 0), False, True, ["coco"]), "crab": (d_crab, (-40, -40, 40, 0), True, False, []),
    "castle": (d_castle, (-58, -124, 68, 0), True, False, []), "fish": (d_fish, (-44, -25, 64, 25), True, True, []),
    "star5": (d_star5, (-27, -27, 27, 27), True, False, []), "weed": (d_weed, (-20, -130, 20, 0), True, True, []),
    "bubble": (d_bubble, (-13, -13, 13, 13), False, False, []), "chest": (d_chest, (-48, -66, 48, 0), False, False, []),
    "coral": (d_coral, (-46, -110, 46, 0), True, True, []), "camel": (d_camel, (-60, -156, 94, 0), True, True, ["saddle"]),
    "tent": (d_tent, (-114, -124, 114, 0), True, False, []), "dallah": (d_dallah, (-22, -74, 42, 0), False, True, []),
    "fire": (d_fire, (-32, -58, 32, 0), False, False, []), "moon": (d_moon, (-40, -40, 40, 40), False, True, []),
    "star": (d_star, (-10, -10, 10, 10), False, False, []), "sheep": (d_sheep, (-62, -82, 46, 0), False, True, []),
    "chicken": (d_chicken, (-38, -70, 26, 0), False, True, []), "barn": (d_barn, (-106, -182, 106, 0), True, False, ["round"]),
    "fence": (d_fence, (-66, -52, 74, 0), False, False, []), "frame": (d_frame, (-52, -42, 52, 42), True, True, []),
    "clock": (d_clock, (-40, -40, 40, 40), True, False, ["h3"]), "jar": (d_jar, (-19, -54, 19, 0), True, False, []),
    "plant": (d_plant, (-40, -120, 40, 0), True, False, []), "lampd": (d_lampd, (-32, -128, 32, 0), True, False, []),
    "books": (d_books, (-32, -62, 32, 0), False, True, []), "cup": (d_cup, (-18, -56, 32, 0), True, True, ["steam"]),
    "cat": (d_cat, (-50, -78, 58, 0), True, True, []), "rocket": (d_rocket, (-46, -132, 46, 0), True, False, []),
    "planet": (d_planet, (-74, -48, 74, 48), True, False, []),
}

def box(e):
    x0, y0, x1, y1 = KINDS[e["k"]][1]; s = e["s"]
    if e.get("f"): x0, x1 = -x1, -x0
    return (e["x"] + x0 * s, e["y"] + y0 * s, e["x"] + x1 * s, e["y"] + y1 * s)

# ---------------------------------------------------------------- scenes
def E(k, x, y, s=1.0, c=None, c2=None, f=False, v=None, z=0, tgt=True):
    return {"k": k, "x": x, "y": y, "s": s, "c": c, "c2": c2, "f": f, "v": dict(v or {}), "z": z, "tgt": tgt}

def free_x(R, used, w, lo=40, hi=W - 40, tries=60):
    for _ in range(tries):
        x = R.uniform(lo + w / 2, hi - w / 2)
        if all(abs(x - u) > (w + uw) / 2 + 8 for u, uw in used): used.append((x, w)); return x
    return None

def birds(R, n, lo, hi):
    out, used = [], []
    for _ in range(n):
        x = free_x(R, used, 90, lo, hi)
        if x: out.append(E("bird", x, R.uniform(170, 310), R.uniform(.9, 1.25), z=1))
    return out

def scene_park(R):
    bg = ('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#d8f1ff"/></linearGradient></defs>'
          '<rect width="1280" height="853" fill="url(#sky)"/><path d="M0,520 Q320,440 640,500 T1280,480 L1280,853 L0,853 Z" fill="#9bd77a"/>'
          '<path d="M0,600 Q400,560 800,600 T1280,590 L1280,853 L0,853 Z" fill="#7cc35f"/><path d="M0,700 L1280,700 L1280,760 L0,760 Z" fill="#e8d3a6" opacity=".9"/>')
    els = [E("sun", R.uniform(90, 260), R.uniform(90, 150), R.uniform(.8, 1)), E("cloud", R.uniform(380, 600), R.uniform(90, 160), R.uniform(.9, 1.2)),
           E("cloud", R.uniform(800, 1150), R.uniform(80, 170), R.uniform(.8, 1.1), f=R.random() < .5)]
    els += birds(R, R.randint(2, 3), 300, 1200)
    used = []
    for i in range(R.randint(3, 4)):
        x = free_x(R, used, 160, 40, 1240)
        if x: els.append(E(R.choice(["tree", "tree", "pine"]), x, R.uniform(560, 600), R.uniform(1.1, 1.4), c=R.choice(["green", "lime", "teal"]), c2=R.choice(["red", "orange"]), v={"fruit": R.random() < .6}, z=2))
    if R.random() < .7:
        x = free_x(R, used, 200, 40, 1240)
        if x: els.append(E("house", x, R.uniform(590, 610), R.uniform(1.0, 1.2), c=R.choice(["cream", "yellow", "pink", "sky"]), c2=R.choice(["red", "brown", "blue"]), v={"chimney": R.random() < .7, "win2": True}, z=2))
    used2 = []
    for k in ("bench", "bush", "bush", "lamp"):
        x = free_x(R, used2, 140, 40, 1240)
        if x: els.append(E(k, x, R.uniform(690, 705), R.uniform(1.0, 1.2), c=R.choice(["green", "brown", "teal"]) if k != "bench" else R.choice(["brown", "red", "blue"]), c2=R.choice(["red", "purple", "pink"]), v={"berries": R.random() < .5, "on": True}, z=3))
    for i in range(R.randint(5, 7)):
        x = free_x(R, used2, 44, 40, 1240)
        if x: els.append(E("flower", x, R.uniform(800, 840), R.uniform(1.1, 1.4), c=R.choice(BRIGHT), z=4))
    els.append(E("kite", R.uniform(500, 1100), R.uniform(230, 330), R.uniform(1, 1.2), c=R.choice(BRIGHT), c2=R.choice(BRIGHT), f=R.random() < .5, z=1))
    for i in range(R.randint(1, 2)): els.append(E("balloon", R.uniform(200, 1100), R.uniform(380, 470), R.uniform(1, 1.2), c=R.choice(BRIGHT), z=1))
    els.append(E("ball", R.uniform(150, 1130), R.uniform(785, 815), 1.2, c=R.choice(BRIGHT), c2=R.choice(BRIGHT), z=5))
    return "حديقة", bg, els

def scene_beach(R):
    bg = ('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc6ff"/><stop offset="1" stop-color="#cdeeff"/></linearGradient>'
          '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b9ed8"/><stop offset="1" stop-color="#4fc3e8"/></linearGradient></defs>'
          '<rect width="1280" height="853" fill="url(#sky)"/><rect y="400" width="1280" height="200" fill="url(#sea)"/>'
          '<path d="M0,440 q40,-8 80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0 t80,0" stroke="#ffffff88" stroke-width="4" fill="none"/>'
          '<path d="M0,560 Q300,530 640,570 T1280,555 L1280,853 L0,853 Z" fill="#f2d79c"/>')
    els = [E("sun", R.uniform(950, 1180), R.uniform(90, 150), R.uniform(.8, 1)), E("cloud", R.uniform(200, 500), R.uniform(90, 170), R.uniform(.9, 1.2)),
           E("cloud", R.uniform(600, 850), R.uniform(70, 150), R.uniform(.7, 1), f=True)]
    els += birds(R, R.randint(2, 3), 100, 1200)
    used = []
    for i in range(R.randint(1, 2)):
        x = free_x(R, used, 160, 60, 1220)
        if x: els.append(E("boat", x, R.uniform(470, 520), R.uniform(.8, 1.1), c=R.choice(["red", "orange", "yellow", "white"]), f=R.random() < .5, z=1))
    used2 = []
    x = free_x(R, used2, 170, 30, 1250)
    if x: els.append(E("palm", x, R.uniform(640, 660), R.uniform(1.1, 1.3), f=R.random() < .5, v={"coco": True}, z=2))
    for k in ("umbrella", "umbrella", "castle"):
        x = free_x(R, used2, 180, 30, 1250)
        if x: els.append(E(k, x, R.uniform(700, 740), R.uniform(1, 1.2), c=R.choice(BRIGHT), c2=R.choice(["white", "yellow", "sky"]), z=3))
    for k in ("crab", "crab", "ball", "star5", "star5"):
        x = free_x(R, used2, 70, 30, 1250)
        if x: els.append(E(k, x, R.uniform(770, 830) if k != "ball" else R.uniform(760, 800), R.uniform(1.1, 1.3), c=R.choice(["red", "coral", "orange"]) if k != "ball" else R.choice(BRIGHT), c2=R.choice(BRIGHT), z=4))
    return "شاطئ", bg, els

def scene_desert(R):
    night = R.random() < .4
    sky = ("#1d2550", "#3a3f7a") if night else ("#ffb36b", "#ffe2a8")
    bg = (f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sky[0]}"/><stop offset="1" stop-color="{sky[1]}"/></linearGradient></defs>'
          '<rect width="1280" height="853" fill="url(#sky)"/><path d="M0,560 Q250,470 520,540 T1000,500 T1280,520 L1280,853 L0,853 Z" fill="#e3b26a"/>'
          '<path d="M0,650 Q350,590 700,640 T1280,620 L1280,853 L0,853 Z" fill="#d79e55"/>')
    els = []
    if night:
        els.append(E("moon", R.uniform(950, 1150), R.uniform(100, 170), R.uniform(1, 1.2), f=R.random() < .5))
        for i in range(R.randint(9, 12)): els.append(E("star", R.uniform(40, 1240), R.uniform(30, 380), R.uniform(1.6, 2.4)))
    else:
        els.append(E("sun", R.uniform(100, 300), R.uniform(100, 160), R.uniform(.8, 1)))
        els.append(E("cloud", R.uniform(500, 900), R.uniform(80, 160), R.uniform(.8, 1)))
        els += birds(R, 2, 300, 1200)
    used = []
    x = free_x(R, used, 260, 40, 1240)
    if x: els.append(E("tent", x, R.uniform(650, 670), R.uniform(1.2, 1.4), c=R.choice(["red", "brown", "coral"]), c2=R.choice(["cream", "yellow", "white"]), z=2))
    for i in range(R.randint(1, 2)):
        x = free_x(R, used, 190, 40, 1240)
        if x: els.append(E("palm", x, R.uniform(600, 640), R.uniform(1.0, 1.2), f=R.random() < .5, v={"coco": True}, z=2))
    for i in range(R.randint(1, 2)):
        x = free_x(R, used, 200, 40, 1240)
        if x: els.append(E("camel", x, R.uniform(700, 730), R.uniform(1.1, 1.3), c=R.choice(["red", "teal", "purple"]), f=R.random() < .5, v={"saddle": True}, z=3))
    used2 = []
    for k in ("fire", "dallah", "dallah", "cup", "bush", "cup"):
        x = free_x(R, used2, 90, 40, 1240)
        if x: els.append(E(k, x, R.uniform(790, 830), R.uniform(1.1, 1.4), c=R.choice(["white", "cream", "teal"]) if k == "cup" else R.choice(["green", "lime"]), c2="red", v={"steam": True}, z=4))
    return "مخيم صحراوي", bg, els

def scene_sea(R):
    bg = ('<defs><linearGradient id="wat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6e0"/><stop offset="1" stop-color="#155a9c"/></linearGradient></defs>'
          '<rect width="1280" height="853" fill="url(#wat)"/><path d="M0,90 L1280,40" stroke="#ffffff22" stroke-width="80"/><path d="M0,700 Q320,660 640,700 T1280,690 L1280,853 L0,853 Z" fill="#e9cf94"/>')
    els = []
    used = []
    for k in ("weed", "weed", "weed", "coral", "coral", "chest"):
        x = free_x(R, used, 110, 30, 1250)
        if x: els.append(E(k, x, R.uniform(740, 790), R.uniform(1.1, 1.5), c=R.choice(["green", "teal", "lime"]) if k == "weed" else R.choice(["pink", "coral", "purple", "orange"]), f=R.random() < .5, z=2))
    for k in ("star5", "star5", "crab"):
        x = free_x(R, used, 70, 30, 1250)
        if x: els.append(E(k, x, R.uniform(800, 835), R.uniform(1.1, 1.3), c=R.choice(["orange", "red", "pink", "yellow"]), z=3))
    zones = []
    for i in range(R.randint(6, 8)):
        for _ in range(40):
            x, y = R.uniform(90, 1190), R.uniform(110, 600)
            if all(abs(x - a) > 150 or abs(y - b) > 80 for a, b in zones): zones.append((x, y)); break
        else: continue
        els.append(E("fish", x, y, R.uniform(1.0, 1.4), c=R.choice(BRIGHT), c2=R.choice(["white", "yellow", "blue", "purple"]), f=R.random() < .5, z=4))
    for i in range(R.randint(4, 6)): els.append(E("bubble", R.uniform(50, 1230), R.uniform(80, 650), R.uniform(1, 1.6), z=5))
    return "تحت البحر", bg, els

def scene_farm(R):
    bg = ('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9bd8ff"/><stop offset="1" stop-color="#e6f6ff"/></linearGradient></defs>'
          '<rect width="1280" height="853" fill="url(#sky)"/><path d="M0,540 Q400,480 800,530 T1280,510 L1280,853 L0,853 Z" fill="#a9d86e"/><path d="M0,680 Q640,640 1280,690 L1280,853 L0,853 Z" fill="#8cc85a"/>')
    els = [E("sun", R.uniform(1000, 1180), R.uniform(90, 150), .9), E("cloud", R.uniform(250, 600), R.uniform(80, 170), 1.1), E("cloud", R.uniform(650, 900), R.uniform(100, 180), .9, f=True)]
    els += birds(R, 2, 200, 1200)
    used = []
    x = free_x(R, used, 230, 40, 1240)
    if x: els.append(E("barn", x, R.uniform(600, 620), R.uniform(1.2, 1.35), c=R.choice(["red", "brown", "coral"]), v={"round": True}, z=2))
    for i in range(R.randint(2, 3)):
        x = free_x(R, used, 160, 40, 1240)
        if x: els.append(E("tree", x, R.uniform(580, 610), R.uniform(1.1, 1.3), c=R.choice(["green", "lime"]), c2=R.choice(["red", "orange"]), v={"fruit": R.random() < .6}, z=2))
    used2 = []
    for k in ("fence", "fence", "sheep", "sheep", "chicken", "chicken", "chicken"):
        x = free_x(R, used2, 150 if k in ("fence", "sheep") else 100, 30, 1250)
        if x: els.append(E(k, x, R.uniform(720, 760) if k == "fence" else R.uniform(780, 830), R.uniform(1.1, 1.3), f=R.random() < .5, z=3))
    for i in range(R.randint(3, 4)):
        x = free_x(R, used2, 44, 30, 1250)
        if x: els.append(E("flower", x, R.uniform(820, 845), 1.2, c=R.choice(BRIGHT), z=4))
    return "مزرعة", bg, els

def scene_room(R):
    wall = R.choice(["#f3e3c3", "#dbeaf5", "#efd9e6", "#e2f0da"])
    bg = (f'<rect width="1280" height="853" fill="{wall}"/><rect y="610" width="1280" height="243" fill="#c89a6a"/><rect y="600" width="1280" height="14" fill="#a87a4e"/>'
          '<rect x="80" y="300" width="460" height="16" rx="4" fill="#8a5a36"/><rect x="760" y="460" width="420" height="16" rx="4" fill="#8a5a36"/>'
          '<rect x="800" y="476" width="14" height="134" fill="#8a5a36"/><rect x="1126" y="476" width="14" height="134" fill="#8a5a36"/>'
          '<rect x="600" y="70" width="240" height="190" rx="8" fill="#8fd3ff" stroke="#fff" stroke-width="12"/><path d="M720,70 V260 M600,165 H840" stroke="#fff" stroke-width="8"/>')
    els = [E("cloud", 700, 140, .5, tgt=False, z=0)]
    used = []
    for i in range(R.randint(4, 5)):
        x = free_x(R, used, 60, 100, 520)
        if x: els.append(E(R.choice(["jar", "jar", "books"]), x, 300, R.uniform(1.0, 1.25), c=R.choice(BRIGHT), f=R.random() < .5, v={"cols": R.sample(BRIGHT, 3)}, z=2))
    els.append(E("clock", R.uniform(950, 1150), R.uniform(150, 220), 1.2, c=R.choice(BRIGHT), v={"h3": True}, z=2))
    els.append(E("frame", R.uniform(200, 450), R.uniform(150, 200), R.uniform(1.1, 1.3), c=R.choice(["green", "teal", "blue"]), f=R.random() < .5, z=2))
    used2 = []
    for k in ("cup", "plant", "books", "lampd"):
        x = free_x(R, used2, 70, 820, 1160)
        if x: els.append(E(k, x, 460, R.uniform(1.0, 1.2), c=R.choice(BRIGHT), f=R.random() < .5, v={"steam": True, "cols": R.sample(BRIGHT, 3)}, z=3))
    used3 = []
    for k in ("plant", "cat", "ball", "books"):
        x = free_x(R, used3, 120, 60, 760)
        if x: els.append(E(k, x, R.uniform(760, 800) if k != "ball" else 770, R.uniform(1.2, 1.4), c=R.choice(["orange", "grey", "brown"]) if k == "cat" else R.choice(BRIGHT), c2=R.choice(BRIGHT), f=R.random() < .5, z=4))
    return "غرفة الجلوس", bg, els

SCENES = [scene_park, scene_beach, scene_desert, scene_sea, scene_farm, scene_room]

def svg(bg, els):
    body = "".join(KINDS[e["k"]][0](e) for e in sorted(els, key=lambda e: e["z"]) if not e.get("hide"))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{bg}{body}</svg>'

# ---------------------------------------------------------------- differences
def overlap(a, b, pad=0):
    return not (a[2] + pad < b[0] or b[2] + pad < a[0] or a[3] + pad < b[1] or b[3] + pad < a[1])
def area(b): return max(0, b[2] - b[0]) * max(0, b[3] - b[1])
def inter(a, b): return area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))

def candidates(R, els, level):
    """Objects that may be changed (fully visible, inside the picture, right size for the level), shuffled."""
    out = []
    for i, e in enumerate(els):
        if not e["tgt"]: continue
        b = box(e); a = area(b)
        if b[0] < 6 or b[1] < 6 or b[2] > W - 6 or b[3] > H - 6: continue
        size = max(b[2] - b[0], b[3] - b[1])
        if level == 0 and size < 46: continue
        if level == 1 and size > 230: continue
        covered = sum(inter(b, box(o)) for o in els if o is not e and o["z"] > e["z"])
        if covered > .25 * a: continue
        out.append(i)
    R.shuffle(out); return out

NATURAL = {"tree": ["green", "lime", "teal", "orange"], "pine": ["green", "teal", "lime"], "bush": ["green", "lime", "teal"],
           "weed": ["green", "teal", "lime"], "coral": ["pink", "coral", "purple", "orange"], "crab": ["red", "coral", "orange"],
           "house": ["cream", "yellow", "pink", "sky", "white"], "barn": ["red", "brown", "coral"], "camel": ["red", "teal", "purple", "blue"],
           "tent": ["red", "brown", "coral", "blue"], "cat": ["orange", "grey", "brown"], "star5": ["orange", "red", "pink", "yellow"],
           "cup": ["white", "cream", "teal", "red", "blue"]}
def propose(R, e, level, ops_used, n):
    """One change of one object. Returns (new object, op) or None."""
    kind = KINDS[e["k"]]; e = copy.deepcopy(e)
    ops = ["hide"]
    if kind[2] and e["c"]: ops += ["recolor", "recolor"]
    if kind[3]: ops += ["mirror"]
    if kind[4] and level == 1: ops += ["toggle", "toggle"]
    if level == 1: ops += ["move", "resize"]
    ops = [o for o in ops if ops_used.get(o, 0) < max(2, (n + 1) // 2)]
    if not ops: return None
    op = R.choice(ops)
    if op == "hide": e["hide"] = True
    elif op == "recolor":
        pool = NATURAL.get(e["k"], BRIGHT)
        alt = [c for c in pool if c != e["c"] and abs(_lum(c) - _lum(e["c"])) < 100 and c != e.get("c2")]
        if not alt: return None
        e["c"] = R.choice(alt)
    elif op == "mirror": e["f"] = not e.get("f")
    elif op == "toggle":
        t = R.choice(kind[4]); e["v"][t] = not e["v"].get(t, True)
    elif op == "move":
        b0 = box(e); e["x"] += R.choice([-1, 1]) * max(26, (b0[2] - b0[0]) * .45)
    elif op == "resize": e["s"] *= R.choice([.7, 1.3])
    return e, op

def _lum(c):
    h = col(c).lstrip("#"); r, g_, b = (int(h[i:i + 2], 16) for i in (0, 2, 4)); return .3 * r + .59 * g_ + .11 * b

# ---------------------------------------------------------------- render + check
class Renderer:
    async def __aenter__(self):
        from playwright.async_api import async_playwright
        self.p = await async_playwright().start(); self.b = await self.p.chromium.launch()
        self.pg = await self.b.new_page(viewport={"width": W, "height": H}); return self
    async def __call__(self, s):
        await self.pg.set_content(f'<html><body style="margin:0">{s}</body></html>')
        png = await self.pg.screenshot(clip={"x": 0, "y": 0, "width": W, "height": H})
        return np.array(Image.open(io.BytesIO(png)).convert("RGB"))
    async def __aexit__(self, *a): await self.b.close(); await self.p.stop()

def changed(A, B): return np.abs(A.astype(int) - B.astype(int)).sum(2) > 30
def tight(mask):
    ys, xs = np.nonzero(mask)
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), int(len(xs))) if len(xs) else None

async def make_pair(R, render, scene, level, n):
    """Draw a scene, then try changes one at a time: each is rendered on its own and kept only if it is clearly
    visible and far from the others. The final picture is checked again as a whole."""
    title, bg, els = scene(R)
    A = await render(svg(bg, els)); B_els = copy.deepcopy(els); kept = []; ops_used = {}
    min_px = 1100 if level == 0 else 380
    for i in candidates(R, els, level):
        if len(kept) >= n: break
        pr = propose(R, els[i], level, ops_used, n)
        if not pr: continue
        new, op = pr
        if op in ("move", "resize", "mirror"):      # a changed object must not end up on top of another one
            nb = box(new)
            if any(j != i and not o.get("hide") and o["tgt"] and inter(nb, box(o)) > 0 for j, o in enumerate(B_els)): continue
        trial = copy.deepcopy(els); trial[i] = new
        t = tight(changed(A, await render(svg(bg, trial))))
        if not t or t[4] < min_px: continue
        if (t[2] - t[0]) > 420 or (t[3] - t[1]) > 420: continue          # a difference must be a spot, not half the picture
        if any(overlap(t[:4], k[1][:4], 40) for k in kept): continue
        B_els[i] = new; kept.append((i, t, op)); ops_used[op] = ops_used.get(op, 0) + 1
    if len(kept) < n: return None, "not enough clear changes"
    B = await render(svg(bg, B_els)); d = changed(A, B)
    inside = np.zeros_like(d)
    for _, (x0, y0, x1, y1, _), _ in kept: inside[max(0, y0 - 4):y1 + 5, max(0, x0 - 4):x1 + 5] = True
    if int((d & ~inside).sum()) > 12: return None, "changes interact"
    diffs = [{"x": round((x0 + x1) / 2), "y": round((y0 + y1) / 2), "rx": round(max(20, (x1 - x0) / 2 + 8)), "ry": round(max(20, (y1 - y0) / 2 + 8))} for _, (x0, y0, x1, y1, _), _ in kept]
    return {"title": title, "A": A, "B": B, "diffs": diffs, "ops": [op for *_, op in kept], "kinds": [els[i]["k"] for i, *_ in kept], "px": [t[4] for _, t, _ in kept]}, ""

def main():
    import asyncio
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default="out/cartoon"); ap.add_argument("--count", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1); ap.add_argument("--easy", type=float, default=.6); ap.add_argument("--prefix", default="c")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    async def run():
        R = random.Random(a.seed); lib, report, tries = [], [], 0
        async with Renderer() as render:
            while len(lib) < a.count and tries < a.count * 4:
                tries += 1
                level = 0 if len(lib) < round(a.count * a.easy) else 1
                scene = SCENES[(tries - 1) % len(SCENES)]
                n = R.choice([5, 6]) if level == 0 else R.choice([6, 7])
                res, why = await make_pair(R, render, scene, level, n)
                report.append({"try": tries, "scene": scene.__name__, "level": level, "ok": bool(res), "why": why, **({k: res[k] for k in ("ops", "kinds", "px")} if res else {})})
                if not res: continue
                pid = f"{a.prefix}{len(lib) + 1:03d}"
                for s_, arr in (("a", res["A"]), ("b", res["B"])): Image.fromarray(arr).save(os.path.join(a.out, pid + s_ + ".webp"), "WEBP", quality=90, method=5)
                lib.append({"id": pid, "a": pid + "a.webp", "b": pid + "b.webp", "w": W, "h": H, "level": level, "title": res["title"], "kind": "art", "credit": None, "diffs": res["diffs"]})
        json.dump(lib, open(os.path.join(a.out, "pairs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        json.dump(report, open(os.path.join(a.out, "report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{len(lib)} pairs in {tries} tries; levels", [sum(p["level"] == l for p in lib) for l in range(3)])
    asyncio.run(run())

if __name__ == "__main__": main()
