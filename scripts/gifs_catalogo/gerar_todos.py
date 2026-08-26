#!/usr/bin/env python3
"""Gera 1 GIF por exercício do catálogo-alvo + folhas de contato (frames A/meio/B).

  python3 gerar_todos.py out_dir [filtro-de-nome]
"""
import math
import os
import re
import sys
import unicodedata
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402
from rig import (ACCENT, ACCENT_DARK, BENCH, BODY, BODY_DARK, MACHINE, MACHINE_DARK, MUTED,
                 Canvas, add, draw_barbell, draw_bench, draw_cable, draw_dumbbell, draw_figure, draw_floor,
                 draw_handle, draw_incline_bench, draw_labels, draw_lever, draw_pad, draw_seat, draw_stack,
                 draw_tower, ease, joints, lerp_pose, vec)
from catalogo import E  # noqa: E402

FRAMES, DUR_MS = 24, 80


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def ik(shoulder, hand, l1, l2, bend):
    sx, sy = shoulder
    dx, dy = hand[0] - sx, hand[1] - sy
    d = max(1e-6, min(math.hypot(dx, dy), l1 + l2 - 0.5))
    ux, uy = dx / d, dy / d
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    px, py = sx + a * ux, sy + a * uy
    return (px + bend * h * (-uy), py + bend * h * ux)


def resolve(pose):
    """joints() + alvos de mão por IK."""
    j = joints(pose)
    L = dict(rig.LEN); L.update(pose.get("len", {}))
    if "hand_target" in pose:
        j["hand"] = tuple(pose["hand_target"])
        j["elbow"] = ik(j["shoulder"], j["hand"], L["ua"], L["fa"], pose.get("bend", 1))
        if "ua2" not in pose and "hand2_target" not in pose:
            j["elbow2"], j["hand2"] = j["elbow"], j["hand"]
    if "hand2_target" in pose:
        j["hand2"] = tuple(pose["hand2_target"])
        j["elbow2"] = ik(j["shoulder"], j["hand2"], L["ua"], L["fa"], pose.get("bend2", 1))
    return j


def point_of(j, ref):
    return j[ref] if isinstance(ref, str) else tuple(ref)


def draw_props(c, j, k, props, pose, layer):
    """layer 'back' = atrás do boneco, 'front' = na frente."""
    stack_top = None
    for p in props:
        kind = p[0]
        if layer == "back":
            if kind == "bench":
                draw_bench(c, p[1], p[2], p[3], legs=(p[4] if len(p) > 4 else True))
            elif kind == "incline":
                draw_incline_bench(c, j["hip"], pose["torso"])
            elif kind == "seat":
                draw_seat(c, j["hip"], back=p[1] is not None, back_angle=p[1] or 90)
            elif kind == "tower":
                draw_tower(c, p[1])
            elif kind == "stack":
                stack_top = draw_stack(c, k, p[1])
            elif kind == "chest_pad":
                x = j["hip"][0] + p[1]
                c.line([(x, j["hip"][1] - 10), (x, j["shoulder"][1] - 6)], MACHINE, 12)
                c.line([(x, j["hip"][1] + 20), (x, 340)], MACHINE_DARK, 8)
            elif kind == "chest_pad_incline":
                a = (j["hip"][0] + 20, j["hip"][1] + 4)
                b = add(a, vec(pose["torso"], 80))
                c.line([a, b], BENCH, 16)
                c.line([(a[0] + 4, a[1]), (a[0] + 4, 340)], MACHINE_DARK, 10)
            elif kind == "knee_pad":
                c.line([(j["knee"][0] - 20, j["knee"][1] - 14), (j["knee"][0] + 20, j["knee"][1] - 14)], MACHINE, 10)
            elif kind == "footplate":
                x, y = p[1]
                c.line([(x, y - 30), (x, y + 30)], MACHINE, 10)
                c.line([(x, y + 30), (x, 340)], MACHINE_DARK, 6)
            elif kind == "preacher":
                a = add(j["shoulder"], vec(pose["ua"], 8))
                b = add(j["shoulder"], vec(pose["ua"], 46))
                c.line([add(a, (0, 12)), add(b, (0, 12))], BENCH, 16)
                c.line([(b[0], b[1] + 12), (b[0], 340)], MACHINE_DARK, 8)
            elif kind == "pullup_bar":
                c.line([(190, p[1]), (410, p[1])], MACHINE, 8)
                c.line([(200, p[1]), (200, 340)], MACHINE_DARK, 8)
                c.line([(400, p[1]), (400, 340)], MACHINE_DARK, 8)
            elif kind == "dip_bars":
                c.line([(230, p[1]), (370, p[1])], MACHINE, 8)
                c.line([(240, p[1]), (240, 340)], MACHINE_DARK, 8)
                c.line([(360, p[1]), (360, 340)], MACHINE_DARK, 8)
            elif kind == "roman_chair":
                c.line([(232, 312), (312, 232)], BENCH, 22)
                c.line([(150, 300), (150, 340)], MACHINE_DARK, 8)
                c.line([(140, 300), (200, 300)], MACHINE, 10)
                c.line([(270, 300), (270, 340)], MACHINE_DARK, 8)
            elif kind == "step":
                x = j["foot_tip"][0]
                c.rect((x - 30, 318), (x + 14, 340), MACHINE)
            elif kind == "legpress":
                # trilho + sled inclinados a 30°, plataforma no pé
                base = (250, 336)
                c.line([base, add(base, vec(30, 190))], MACHINE_DARK, 8)
                f = j["foot"]
                pa, pb = add(f, vec(120, 34)), add(f, vec(-60, 34))
                c.line([pa, pb], MACHINE, 12)
                c.circle(add(f, vec(30, 26)), 16, MACHINE)
                c.circle(add(f, vec(30, 26)), 10, MACHINE_DARK)
            elif kind == "mat":
                c.rect((150, 336), (470, 346), (36, 36, 36))
            elif kind == "treadmill":
                c.rect((170, 336), (440, 348), (36, 36, 36))
                c.line([(180, 342), (430, 342)], MACHINE_DARK, 2)
                c.line([(430, 336), (440, 200)], MACHINE, 8)
                c.line([(400, 200), (470, 200)], MACHINE, 8)
            elif kind == "nordic_anchor":
                c.rect((180, 322), (330, 340), (36, 36, 36))
            elif kind == "hand_rest":
                x = j["hand"][0] + 4
                c.line([(x, j["hand"][1] - 14), (x, j["hand"][1] + 14)], MACHINE, 8)
                c.line([(x, j["hand"][1] + 14), (x, 340)], MACHINE_DARK, 6)
            elif kind == "shoulder_pads":
                s = j["shoulder"]
                c.line([(s[0] - 14, s[1] - 16), (s[0] + 14, s[1] - 16)], MACHINE, 12)
            elif kind == "lever":
                pv = point_of(j, p[1]); tgt = point_of(j, p[2])
                draw_lever(c, pv, tgt, MACHINE_DARK if False else MACHINE, 9)
            elif kind == "cable":
                anchor = tuple(p[1]); tgt = point_of(j, p[2])
                draw_cable(c, anchor, tgt)
            elif kind == "cable_via":
                via = tuple(p[1]); tgt = point_of(j, p[2])
                draw_cable(c, via, tgt)
                c.circle(via, 6, MUTED)
        else:  # front
            if kind == "barbell":
                draw_barbell(c, j["hand"], p[1])
            elif kind == "barbell_back":
                s = j["shoulder"]
                draw_barbell(c, (s[0] - 6, s[1] - 8), 16)
            elif kind == "dumbbell":
                draw_dumbbell(c, j["hand"], vertical=p[1])
            elif kind == "handle":
                draw_handle(c, j["hand"], vertical=p[1])
            elif kind == "rope":
                h = j["hand"]
                c.line([h, (h[0] - 6, h[1] + 16)], ACCENT, 5)
                c.line([h, (h[0] + 6, h[1] + 16)], ACCENT, 5)
            elif kind == "pad_foot":
                draw_pad(c, j["foot"], pose["shin"] + 90, 30)
            elif kind == "pad_at":
                draw_pad(c, j[p[1]], p[2], 30)
            elif kind == "plate_hip":
                draw_barbell(c, (j["hip"][0] + 2, j["hip"][1] - 12), 20)
            elif kind == "nordic_anchor":
                draw_pad(c, (j["foot"][0], j["foot"][1] - 6), 0, 34)
            elif kind == "footplate" and False:
                pass
    return stack_top


def frame_side(e, k):
    pose = lerp_pose(e["A"], e["B"], k)
    if "hand_target" in e["A"] and "hand_target" in e["B"]:
        pose["hand_target"] = tuple(a + (b - a) * k for a, b in zip(e["A"]["hand_target"], e["B"]["hand_target"]))
    c = Canvas(facing=e.get("facing", 1))
    j = resolve(pose)
    draw_floor(c)
    draw_props(c, j, k, e["props"], pose, "back")
    draw_figure(c, j)
    draw_props(c, j, k, e["props"], pose, "front")
    draw_labels(c, e["nome"], e["grupo"] + " · " + e["sub"].split("·")[0].strip())
    return c.final()


def frame_front(e, k):
    """Vista frontal simplificada (abdução/adução)."""
    c = Canvas()
    draw_floor(c)
    mode = e["front"]
    hip = (300, 232)
    if mode in ("abducao", "aducao"):
        # máquina sentada: assento, encosto, pilha
        c.rect((240, 236), (360, 254), BENCH); c.line([(240, 236), (360, 236)], ACCENT, 2)
        c.rect((250, 254), (262, 340), MACHINE_DARK); c.rect((338, 254), (350, 340), MACHINE_DARK)
        c.rect((232, 120), (368, 236), (30, 30, 30))
        draw_tower(c, 470); draw_stack(c, k, 515)
        spread = 10 + 28 * (k if mode == "abducao" else (1 - k))
        for s in (-1, 1):
            knee = add(hip, vec(-90 + s * spread, 60))
            foot = add(knee, vec(-90 + s * spread * 0.4, 62))
            c.line([hip, knee], BODY, 18); c.line([knee, foot], BODY, 14)
            c.line([foot, add(foot, (s * 14, 0))], BODY, 8)
            # pad do lado de fora (abdução) ou de dentro (adução) do joelho
            px = knee[0] + (s * 16 if mode == "abducao" else -s * 16)
            c.line([(px, knee[1] - 22), (px, knee[1] + 22)], ACCENT, 10)
            c.line([(px, knee[1] + 22), (px, 340)], MACHINE_DARK, 6)
        # tronco + cabeça + braços apoiados
        c.line([hip, (300, 160)], BODY, 40)
        c.line([(300, 160), (300, 140)], BODY, 12); c.circle((300, 124), 17, BODY)
        for s in (-1, 1):
            c.line([(300 + s * 20, 168), (300 + s * 44, 210), (300 + s * 36, 246)], BODY, 13)
    else:  # abducao_polia (em pé, vista frontal, perna direita abre)
        draw_tower(c, 130); draw_stack(c, k, 110)
        c.line([(180, 150), (180, 340)], MACHINE, 8)  # apoio de mão
        hip = (300, 212)
        # perna de apoio
        c.line([hip, (292, 272), (292, 332)], BODY, 16); c.line([(292, 332), (276, 332)], BODY, 8)
        # perna que abduz
        ang = -90 + 38 * k
        knee = add(hip, vec(ang, 60)); foot = add(knee, vec(ang, 60))
        c.line([hip, knee, foot], BODY, 16); c.line([foot, add(foot, (14, 0))], BODY, 8)
        draw_cable(c, (130, 325), (foot[0] - 4, foot[1] - 6))
        c.line([(foot[0] - 12, foot[1] - 6), (foot[0] + 8, foot[1] - 6)], ACCENT, 8)
        c.line([hip, (300, 142)], BODY, 36)
        c.line([(300, 142), (300, 124)], BODY, 12); c.circle((300, 108), 17, BODY)
        c.line([(284, 150), (200, 190), (184, 190)], BODY, 13)  # mão no apoio
        c.line([(316, 150), (330, 200), (322, 236)], BODY, 13)
    draw_labels(c, e["nome"], e["grupo"] + " · " + e["sub"].split("·")[0].strip())
    return c.final()


def frame(e, t):
    k = ease(t)
    return frame_front(e, k) if e.get("front") else frame_side(e, k)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gif_supino/out"
    filtro = sys.argv[2].lower() if len(sys.argv) > 2 else None
    os.makedirs(out, exist_ok=True)
    tiles = []
    for e in E:
        if filtro and filtro not in e["nome"].lower():
            continue
        frames = [frame(e, i / FRAMES) for i in range(FRAMES)]
        pal = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
        path = os.path.join(out, slug(e["nome"]) + ".gif")
        pal[0].save(path, save_all=True, append_images=pal[1:], duration=DUR_MS, loop=0, optimize=True, disposal=1)
        e["arquivo"] = path
        tile = Image.new("RGB", (900, 200), (13, 13, 13))
        for n, i in enumerate((0, 6, 12)):
            tile.paste(frames[i].resize((300, 200), Image.LANCZOS), (n * 300, 0))
        tiles.append(tile)
        print(f"ok {e['nome']:45s} {os.path.getsize(path)//1024:4d} KB")
    # folhas de contato: 10 exercícios por folha (900x2000)
    for s in range(0, len(tiles), 10):
        sheet = Image.new("RGB", (900, 200 * min(10, len(tiles) - s)), (13, 13, 13))
        for i, t in enumerate(tiles[s:s + 10]):
            sheet.paste(t, (0, i * 200))
        sheet.save(os.path.join(out, f"contato-{s // 10 + 1:02d}.png"))
    print(len(tiles), "gifs")


if __name__ == "__main__":
    main()
