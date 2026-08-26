#!/usr/bin/env python3
"""Gera GIFs v2 (motor 3D) para os exercícios do catálogo + folhas de contato.
  python3 gerar_v2.py out_dir [filtro]"""
import os, sys, math, re, unicodedata
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig3d_lib as R
from rig3d_lib import Camera, Scene, Body, draw_body, floor_grid, labels, arrow, CAMS, ease, lerp
from catalogo import E, D
from catalogo3d import SCENES

FRAMES, DUR = 24, 80


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def lerp_pose(A, B, k):
    out = {}
    for key in set(A) | set(B):
        a, b = A.get(key), B.get(key, A.get(key))
        if a is None: a = b
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            out[key] = lerp(a, b, k)
        elif isinstance(a, (tuple, list)) and isinstance(b, (tuple, list)) and all(isinstance(x, (int, float)) for x in a):
            out[key] = tuple(lerp(x, y, k) for x, y in zip(a, b))
        elif isinstance(a, dict) and isinstance(b, dict):
            out[key] = lerp_pose(a, b, k)
        else:
            out[key] = a if k < 0.5 else b
    return out


def frame(nome, meta, sc_def, t):
    k = ease(t)
    pose = lerp_pose(sc_def["A"], sc_def["B"], k)
    kc = k if sc_def["contract"] == "B" else 1 - k
    eye = CAMS[sc_def["cam"]]
    cam = Camera(eye=eye)
    sc = Scene(cam)
    body = Body(pose)
    # hanging: mãos fixas (barra fixa / mergulho) — alvo = posição da mão na pose A
    if sc_def["A"].get("arm", {}).get("hand", "x") is None:
        bodyA = Body(sc_def["A"])
        for s in (-1, 1):
            body.hand[s] = bodyA.hand[s]
            body.elbow[s] = R.ik(body.sh[s], bodyA.hand[s], R.L["ua"], R.L["fa"], body.Fw if sc_def["A"]["arm"].get("az", 0) < 90 else R.mul(body.Fw, -1))
    floor_grid(sc)
    if sc_def["equip"]:
        sc_def["equip"](sc, body, k)
    draw_body(sc, body, kc, muscles=sc_def["musc"], hide=sc_def["hide"])
    sc.autofit()
    img = sc.render()
    # seta: trajetória do efetuador entre A e B
    bA, bB = Body(sc_def["A"]), Body(sc_def["B"])
    eff = sc_def["arrow"]
    if eff:
        side = 1 if eff.endswith("R") else -1
        pa = bA.hand[side] if eff.startswith("hand") else (bA.ankle[side] if eff.startswith("foot") else bA.head)
        pb = bB.hand[side] if eff.startswith("hand") else (bB.ankle[side] if eff.startswith("foot") else bB.head)
        arrow(img, cam, pa, pb, forward=(t < 0.5))
    labels(img, nome, meta["grupo"] + " · " + meta["sub"].split("·")[0].strip())
    return img.convert("RGB").resize((R.W, R.H), Image.LANCZOS)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gif_supino/v2out"
    filtro = sys.argv[2].lower() if len(sys.argv) > 2 else None
    os.makedirs(out, exist_ok=True)
    tiles, faltam = [], []
    for e in E:
        nome = e["nome"]
        if filtro and filtro not in nome.lower():
            continue
        sc_def = SCENES.get(nome)
        if not sc_def:
            faltam.append(nome); continue
        try:
            frames = [frame(nome, e, sc_def, i / FRAMES) for i in range(FRAMES)]
        except Exception as ex:
            print("ERRO", nome, repr(ex)); faltam.append(nome); continue
        pal = [f.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
        path = os.path.join(out, slug(nome) + ".gif")
        pal[0].save(path, save_all=True, append_images=pal[1:], duration=DUR, loop=0, optimize=True, disposal=1)
        tile = Image.new("RGB", (900, 200), (13, 13, 13))
        for n, i in enumerate((0, 6, 12)):
            tile.paste(frames[i].resize((300, 200), Image.LANCZOS), (n * 300, 0))
        tiles.append(tile)
        print(f"ok {nome:45s} {os.path.getsize(path)//1024:4d} KB")
    for s in range(0, len(tiles), 8):
        sheet = Image.new("RGB", (900, 200 * min(8, len(tiles) - s)), (13, 13, 13))
        for i, t in enumerate(tiles[s:s + 8]):
            sheet.paste(t, (0, i * 200))
        sheet.save(os.path.join(out, f"contato-{s // 8 + 1:02d}.png"))
    print(len(tiles), "gifs;", "faltam:", faltam)


if __name__ == "__main__":
    main()
