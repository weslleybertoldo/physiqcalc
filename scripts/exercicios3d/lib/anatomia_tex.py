# Anatomia v2 (03/10/2026): desenha os músculos numa TEXTURA do corpo (UV do MakeHuman), com linhas nítidas.
# A v1 marcava as partes por vértice (malha de ~1,5 cm) e as linhas saíam borradas; aqui cada texel (~0,8 mm)
# é classificado na posição de repouso, e a linha é a distância 3D até a fronteira entre dois músculos
# (vale também nas costuras do UV). Roda FORA do Blender, no .venv (numpy + scipy + pillow):
#   $EX3D_PY lib/anatomia_tex.py base [tam]                -> tex/anat_linhas.png (R linha, G sombra, B fibra),
#                                                             tex/anat_altura.png (16 bits), tex/anat_grupo.npy
#   $EX3D_PY lib/anatomia_tex.py alvo quadriceps,gluteo -> tex/alvo_gluteo+quadriceps.png
# Entrada: tex/malha.npz ($BLENDER -b -P exportar_malha.py -- tex/malha.npz). Repouso: chão z=0, frente -Y, esquerda +X.
import os, sys, time
import numpy as np
from scipy.spatial import cKDTree
from scipy import ndimage
from PIL import Image

import config
TEX = config.TEX
os.makedirs(TEX, exist_ok=True)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def faixa(x, a, b, borda):
    return smooth(a - borda, a, x) * (1 - smooth(b, b + borda, x))


def dome(t, expo=0.55):
    tt = np.clip(t, 0.0, 1.0)
    return np.where((t > 0) & (t < 1), np.sin(np.pi * tt) ** expo, 0.0)


def angdiff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


import musculos_def as MD

GRUPOS = sorted(set(p[1] for p in MD.PARTES))
TRONCO_OSSOS = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head")


def catmull(pts, amostras=8):
    """Curva fechada suave (Catmull-Rom) pelos pontos de controle."""
    P = np.asarray(pts, float)
    n = len(P)
    t = np.linspace(0, 1, amostras, endpoint=False)[:, None]
    out = []
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return np.concatenate(out)


def sdf_poligono(px, py, V):
    """Distância com sinal até o polígono V (negativa dentro) — sdPolygon do Inigo Quilez, vetorizado."""
    d = np.full(px.shape, np.inf)
    s = np.ones(px.shape)
    n = len(V)
    for i in range(n):
        vix, viy = V[i]
        vjx, vjy = V[i - 1]
        ex, ey = vjx - vix, vjy - viy
        wx, wy = px - vix, py - viy
        t = np.clip((wx * ex + wy * ey) / (ex * ex + ey * ey + 1e-18), 0.0, 1.0)
        bx, by = wx - ex * t, wy - ey * t
        d = np.minimum(d, bx * bx + by * by)
        c1 = py >= viy
        c2 = py < vjy
        c3 = ex * wy > ey * wx
        troca = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
        s = np.where(troca, -s, s)
    return s * np.sqrt(d)


def rasterizar(tri_uv, tam):
    tri = np.full((tam, tam), -1, np.int32)
    bar = np.zeros((tam, tam, 3), np.float32)
    P = tri_uv * tam
    sobrepostos = 0
    for t in range(len(P)):
        (x0, y0), (x1, y1), (x2, y2) = P[t]
        c0 = max(int(np.floor(min(x0, x1, x2) - 0.5)), 0); c1 = min(int(np.ceil(max(x0, x1, x2) - 0.5)), tam - 1)
        r0 = max(int(np.floor(min(y0, y1, y2) - 0.5)), 0); r1 = min(int(np.ceil(max(y0, y1, y2) - 0.5)), tam - 1)
        if c1 < c0 or r1 < r0:
            continue
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-12:
            continue
        X, Y = np.meshgrid(np.arange(c0, c1 + 1) + 0.5, np.arange(r0, r1 + 1) + 0.5)
        l0 = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / d
        l1 = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / d
        l2 = 1 - l0 - l1
        ok = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
        if not ok.any():
            continue
        rr = (Y[ok] - 0.5).astype(np.int32); cc = (X[ok] - 0.5).astype(np.int32)
        sobrepostos += int((tri[rr, cc] >= 0).sum())
        tri[rr, cc] = t
        bar[rr, cc] = np.stack([l0[ok], l1[ok], l2[ok]], -1)
    return tri, bar, sobrepostos


def gerar_base(tam=2048):
    t0 = time.time()
    d = np.load(os.path.join(TEX, "malha.npz"))
    co, no, W = d["co"], d["no"], d["W"].astype(np.float64)
    ossos = [str(o) for o in d["ossos"]]
    col = {o: k for k, o in enumerate(ossos)}
    cab = {o: d["cab"][k] for k, o in enumerate(ossos)}
    corpo_tri = d["corpo"][d["tri_v"]].all(axis=1)
    tri_v, tri_uv = d["tri_v"][corpo_tri], d["tri_uv"][corpo_tri]

    tri, bar, sob = rasterizar(tri_uv, tam)
    valido = tri >= 0
    print("raster %.1fs: %d texels (%.0f%%), sobrepostos %d" % (time.time() - t0, valido.sum(), 100 * valido.mean(), sob))
    V = tri_v[tri[valido]]
    B = bar[valido].astype(np.float64)
    p = np.einsum("nk,nkj->nj", B, co[V])
    nrm = np.einsum("nk,nkj->nj", B, no[V])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
    w = np.einsum("nk,nkj->nj", B, W[V])
    n = len(p)
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    esq = x >= 0

    def peso(lado_arr, nomes):
        s = np.zeros(n)
        for o in nomes:
            if o in TRONCO_OSSOS:
                s += w[:, col[o]]
            else:
                s += np.where(lado_arr, w[:, col["Left" + o]], w[:, col["Right" + o]])
        return s

    # ── mapas 2D da superfície ────────────────────────────────────────────────────────────────────
    # tronco: centro (y) por faixa de 2 cm de altura, medido nos vértices do tronco
    wtv = 2 * W[:, [col[o] for o in ("Hips", "Spine", "Spine1", "Spine2", "Neck")]].sum(1) + \
        W[:, col["LeftShoulder"]] + W[:, col["RightShoulder"]]
    sel_v = (np.abs(co[:, 0]) < 0.12) & (wtv > 0.5) & d["corpo"]
    kz = np.round(co[sel_v, 2] / 0.02).astype(int)
    k0, k1 = kz.min(), kz.max()
    centro = np.full(k1 - k0 + 1, np.nan)
    for kk in range(k0, k1 + 1):
        ys = co[sel_v, 1][kz == kk]
        if len(ys):
            centro[kk - k0] = (ys.min() + ys.max()) / 2
    ok_c = ~np.isnan(centro)
    centro = np.interp(np.arange(len(centro)), np.where(ok_c)[0], centro[ok_c])
    yc = centro[np.clip(np.round(z / 0.02).astype(int) - k0, 0, len(centro) - 1)]
    xs = np.abs(x)
    teta = np.degrees(np.arctan2(xs, -(y - yc)))
    no_tronco = np.hypot(xs, y - yc) <= 0.215          # braço em "A" fica mais longe do eixo do tronco
    mapas = {"frente": (xs, z, (teta <= 105) & no_tronco), "costas": (xs, z, (teta >= 75) & no_tronco),
             "lado": (np.radians(teta) * MD.R_TRONCO, z, no_tronco)}

    frente = np.array([0.0, -1.0, 0.0])
    membro = {}   # mapa -> (ang graus, u fração, ok, raio típico, comprimento do osso)
    for mapa, (o1, o2, rmax) in MD.MAPAS_MEMBRO.items():
        ang_t = np.zeros(n); u_t = np.zeros(n); ok_t = np.zeros(n, bool); dist_t = np.zeros(n)
        for lado, s, sel in (("Left", 1.0, esq), ("Right", -1.0, ~esq)):
            a, b = cab[lado + o1], cab[lado + o2]
            ax = b - a; L = np.linalg.norm(ax); ax = ax / L
            rel = p - a
            ua = rel @ ax
            radial = rel - np.outer(ua, ax)
            dist = np.linalg.norm(radial, axis=1) + 1e-9
            fd = frente - ax * (frente @ ax); fd /= np.linalg.norm(fd)
            fora = np.cross(ax, fd)
            if fora[0] * s < 0:
                fora = -fora
            ang = np.degrees(np.arctan2(radial @ fora, radial @ fd))
            ang_t = np.where(sel, ang, ang_t); u_t = np.where(sel, ua / L, u_t)
            dist_t = np.where(sel, dist, dist_t); ok_t = np.where(sel, dist <= rmax, ok_t)
        forte = ok_t & (peso(esq, (o1,)) > 0.8) & (u_t > 0.2) & (u_t < 0.8)
        r_tip = float(np.median(dist_t[forte])) if forte.any() else 0.05
        membro[mapa] = (ang_t, u_t, ok_t, r_tip, L)
        print("mapa %s: raio típico %.3f m, osso %.3f m" % (mapa, r_tip, L))

    melhor = np.full(n, -1.0)              # força da vencedora: camada + profundidade normalizada × portão
    rot = np.zeros(n, np.int32)            # 0 = pele; 1 + 2*parte + lado(direito=1)
    prof = np.zeros(n)                     # profundidade (m) dentro da vencedora
    fib = np.zeros(n)                      # coordenada através da fibra (m)
    for k, (nome, grupo, mapa, camada, ossos_p, fibra, pts) in enumerate(MD.PARTES):
        gate = smooth(0.2, 0.5, peso(esq, ossos_p))
        pts = np.asarray(pts, float)
        if mapa in membro:
            ang_t, u_t, ok_t, r_tip, L_m = membro[mapa]
            c = pts[:, 0].mean()
            X = np.radians(c + angdiff(ang_t, c)) * r_tip
            Y = u_t * L_m
            ok = ok_t
            esc = np.array([np.pi / 180 * r_tip, L_m])
        else:
            X, Y, ok = mapas[mapa]
            esc = np.array([np.pi / 180 * MD.R_TRONCO, 1.0]) if mapa == "lado" else np.array([1.0, 1.0])
            # mapa do tronco não pinta braço, cabeça nem perna (a não ser que a parte peça o osso)
            presos_no_braco = nome in ("peitoral", "grande_dorsal", "redondo_maior", "infraespinhal")
            fora_tronco = (smooth(0.4, 0.7, peso(esq, ("Arm", "ForeArm", "Hand"))) if presos_no_braco
                           else smooth(0.2, 0.45, peso(esq, ("Arm", "ForeArm", "Hand"))))
            if "Head" not in ossos_p:
                fora_tronco = np.maximum(fora_tronco, smooth(0.45, 0.75, peso(esq, ("Head",))))
            if "UpLeg" not in ossos_p:
                fora_tronco = np.maximum(fora_tronco, smooth(0.45, 0.75, peso(esq, ("UpLeg", "Leg"))))
            gate = gate * (1 - fora_tronco)
        V = catmull(pts * esc)
        lo, hi = V.min(0) - 0.01, V.max(0) + 0.01
        idx = np.nonzero(ok & (gate > 0.02) & (X >= lo[0]) & (X <= hi[0]) & (Y >= lo[1]) & (Y <= hi[1]))[0]
        if not len(idx):
            print("PARTE sem texel:", nome)
            continue
        sd = sdf_poligono(X[idx], Y[idx], V)
        dentro = sd < 0
        idx, sd = idx[dentro], sd[dentro]
        f = (camada + np.minimum(-sd / 0.015, 1.0)) * gate[idx]
        ganha = f > melhor[idx]
        g = idx[ganha]
        melhor[g] = f[ganha]
        rot[g] = 1 + 2 * k + (~esq[g]).astype(np.int32)
        prof[g] = -sd[ganha]
        if fibra[0] == "par":
            a_f = np.radians(fibra[1])
            fib[g] = -X[g] * np.sin(a_f) + Y[g] * np.cos(a_f)
        else:
            cx, cy = np.asarray(fibra[1], float) * esc
            fib[g] = np.arctan2(Y[g] - cy, X[g] - cx) * 0.10
    f1 = np.minimum(prof / 0.03, 1.0)
    print("classificação %.1fs" % (time.time() - t0))
    for regiao, ossos_r in (("braço", ("Arm",)), ("antebraço", ("ForeArm",))):
        sel = esq & (peso(esq, ossos_r) > 0.5)
        cont = np.bincount(rot[sel], minlength=1 + 2 * len(MD.PARTES))
        nomes = ["pele"] + [p[0] + s for p in MD.PARTES for s in ("", "_D")]
        print("NO %s:" % regiao, ", ".join("%s %d" % (nomes[i], c) for i, c in sorted(enumerate(cont), key=lambda x: -x[1]) if c > 200))

    # ── fronteiras: vizinhos no UV + pares nas costuras (3D) ─────────────────────────────────────────
    R = np.full((tam, tam), -1, np.int32)
    R[valido] = rot
    fr_mm = np.zeros((tam, tam), bool); fr_ms = np.zeros((tam, tam), bool)
    for a, b, sa, sb in ((R[:, :-1], R[:, 1:], np.s_[:, :-1], np.s_[:, 1:]),
                         (R[:-1, :], R[1:, :], np.s_[:-1, :], np.s_[1:, :])):
        dif = (a >= 0) & (b >= 0) & (a != b)
        mm = dif & (a > 0) & (b > 0)
        ms = dif & ~mm
        fr_mm[sa] |= mm; fr_mm[sb] |= mm
        fr_ms[sa] |= ms; fr_ms[sb] |= ms
    pos = np.full((tam, tam, 3), np.nan)
    pos[valido] = p
    borda = valido & ~ndimage.binary_erosion(valido, structure=np.ones((3, 3)), border_value=0)
    ib = np.argwhere(borda)
    pb = pos[borda]
    rb = R[borda]
    pares = cKDTree(pb).query_pairs(r=0.0022, output_type="ndarray")
    dif = rb[pares[:, 0]] != rb[pares[:, 1]]
    pares = pares[dif]
    mm = (rb[pares[:, 0]] > 0) & (rb[pares[:, 1]] > 0)
    for sel, alvo in ((mm, fr_mm), (~mm, fr_ms)):
        for c in (0, 1):
            ij = ib[pares[sel, c]]
            alvo[ij[:, 0], ij[:, 1]] = True
    print("fronteiras %.1fs: mm %d ms %d (costura %d pares)" % (time.time() - t0, fr_mm.sum(), fr_ms.sum(), len(pares)))

    LIM = 0.08
    d_mm = cKDTree(pos[fr_mm]).query(p, distance_upper_bound=LIM, workers=-1)[0]
    d_ms = cKDTree(pos[fr_ms]).query(p, distance_upper_bound=LIM, workers=-1)[0]
    d_mm = np.minimum(d_mm, LIM); d_ms = np.minimum(d_ms, LIM)
    print("distâncias %.1fs" % (time.time() - t0))

    musc = rot > 0
    d_any = np.minimum(d_mm, d_ms)
    linha = np.maximum(1 - smooth(0.0008, 0.0026, d_mm), 0.5 * (1 - smooth(0.0008, 0.0026, d_ms)))
    sombra = (1 - smooth(0.0, 0.009, d_mm)) * 0.9 + (1 - smooth(0.0, 0.008, d_ms)) * 0.35
    sombra = np.clip(sombra, 0, 1) * np.where(musc, 1.0, 0.6)
    # altura em DOMO por músculo: sobe do contorno até o centro (raio interno da parte); músculo grande sobe mais.
    # Pele (sem músculo) fica em 0,25 = nível neutro do Displace (midlevel), então rosto/mão/pé não mexem.
    raio_int = np.zeros(rot.max() + 1)
    np.maximum.at(raio_int, rot[musc], d_any[musc])
    r_i = np.maximum(raio_int[rot], 0.004)
    # perfil "almofada de borda íngreme" (03/10 21:10, pedido dele: linha vira SOMBRA): sobe rápido na borda
    # (vinco em V entre dois músculos, que a luz escurece sozinha) e arredonda no meio.
    tt = np.clip(d_any / np.minimum(r_i, 0.022), 0, 1)
    domo = np.sqrt(1 - (1 - tt) ** 2) * (0.75 + 0.25 * smooth(0.0, 1.0, np.clip(d_any / r_i, 0, 1)))
    amp = np.clip(r_i / 0.03, 0.5, 1.0)
    altura = np.where(musc, 0.25 + 0.75 * domo * amp - 0.18 * (1 - smooth(0.0, 0.003, d_any)),
                      0.25 * smooth(0.0, 0.012, d_ms))
    altura = np.clip(altura, 0.0, 1.0)
    # v4 "natural" (03/10 22:30, pedido dele: "os músculos estão um pouco artificiais… acho que é o relevo"):
    # o domo sobe devagar a partir da borda (sem parede vertical) e o vão entre dois músculos vira um vale
    # largo e raso — a separação continua, sem cara de peça encaixada.
    tn = np.clip(d_any / np.minimum(0.9 * r_i, 0.035), 0, 1)
    domo_n = 0.55 * (0.5 - 0.5 * np.cos(np.pi * tn)) + 0.45 * np.sin(0.5 * np.pi * tn)
    vale = 0.10 * (1 - smooth(0.0, 0.007, d_mm)) + 0.035 * (1 - smooth(0.0, 0.005, d_ms))
    altura_nat = np.where(musc, 0.25 + 0.62 * domo_n * amp - vale, 0.25 * smooth(0.0, 0.012, d_ms))
    altura_nat = np.clip(altura_nat, 0.0, 1.0)
    fase = fib / 0.011
    fibra = smooth(0.62, 0.95, 0.5 + 0.5 * np.cos(2 * np.pi * fase)) * smooth(0.002, 0.008, d_any) * musc

    grupo_de_rot = np.zeros(1 + 2 * len(MD.PARTES), np.int32)   # 0 = pele; 1.. = índice em GRUPOS + 1
    for k, g in enumerate(p[1] for p in MD.PARTES):
        grupo_de_rot[1 + 2 * k] = grupo_de_rot[2 + 2 * k] = GRUPOS.index(g) + 1
    grupo = grupo_de_rot[rot]

    # ── imagens (com "padding": texel vazio copia o vizinho válido mais próximo, sem costura preta) ──────
    _, (ii, jj) = ndimage.distance_transform_edt(~valido, return_indices=True)

    def img(vals, dtype=np.float32, vazio=0):
        a = np.full((tam, tam), vazio, dtype)
        a[valido] = vals
        return a[ii, jj]

    canais = [img(v) for v in (linha, sombra, fibra)]
    rgb = np.stack([np.clip(c * 255 + 0.5, 0, 255).astype(np.uint8) for c in canais], -1)
    Image.fromarray(np.flipud(rgb), "RGB").save(os.path.join(TEX, "anat_linhas.png"))
    paleta = np.zeros((1 + 2 * len(MD.PARTES), 3))
    paleta[0] = (0.85, 0.85, 0.85)
    import colorsys
    for k in range(len(MD.PARTES)):
        cor = colorsys.hsv_to_rgb((k * 0.618034) % 1.0, 0.75, 0.95)
        paleta[1 + 2 * k] = cor
        paleta[2 + 2 * k] = np.array(cor) * 0.8
    dbg = np.stack([img(paleta[rot][:, c]) for c in range(3)], -1)
    Image.fromarray(np.flipud(np.clip(dbg * 255 + 0.5, 0, 255).astype(np.uint8)), "RGB").save(os.path.join(TEX, "anat_debug.png"))
    alt16 = np.clip(img(altura) * 65535 + 0.5, 0, 65535).astype(np.uint16)
    Image.fromarray(np.flipud(alt16)).save(os.path.join(TEX, "anat_altura.png"))
    nat = ndimage.gaussian_filter(img(altura_nat), 2.0)          # ~1,6 mm: tira o degrau do texel
    nat16 = np.clip(nat * 65535 + 0.5, 0, 65535).astype(np.uint16)
    Image.fromarray(np.flipud(nat16)).save(os.path.join(TEX, "anat_altura_nat.png"))
    np.save(os.path.join(TEX, "anat_grupo.npy"), np.flipud(img(grupo, np.int32)).astype(np.int8))
    with open(os.path.join(TEX, "anat_grupos.txt"), "w") as fh:
        fh.write("\n".join(GRUPOS))
    cont = np.bincount(grupo, minlength=len(GRUPOS) + 1)
    print("GRUPOS (texels):", ", ".join("%s %d" % (g, cont[i + 1]) for i, g in enumerate(GRUPOS)))
    print("BASE pronta %.1fs (%dx%d)" % (time.time() - t0, tam, tam))


def gerar_alvo(alvos):
    alvos = sorted(a for a in alvos if a)
    grupo = np.load(os.path.join(TEX, "anat_grupo.npy")).astype(np.int32)
    nomes = open(os.path.join(TEX, "anat_grupos.txt")).read().split("\n")
    ids = [nomes.index(a) + 1 for a in alvos if a in nomes]
    falta = [a for a in alvos if a not in nomes]
    if falta:
        print("ALVO: grupo desconhecido", falta, "— grupos:", nomes)
    masc = np.isin(grupo, ids).astype(np.float32)
    masc = ndimage.gaussian_filter(masc, 0.8)
    caminho = os.path.join(TEX, "alvo_%s.png" % ("+".join(alvos) or "nenhum"))
    Image.fromarray(np.clip(masc * 255 + 0.5, 0, 255).astype(np.uint8), "L").save(caminho)
    print("ALVO", caminho, "texels", int((masc > 0.5).sum()))
    return caminho


def gerar_ids(v):
    """Mapa dos músculos pro app (public/exercicios3d/musculos-<v>.png): R = id do músculo (0 = pele), G = fibra.
    Os ids ficam em musculos_ids.json (versionado) e nunca mudam: grupo novo ganha o próximo número."""
    import json
    caminho_ids = os.path.join(config.AQUI, "musculos_ids.json")
    ids = json.load(open(caminho_ids)) if os.path.exists(caminho_ids) else {}
    nomes = open(os.path.join(TEX, "anat_grupos.txt")).read().split("\n")   # índice k-1 do anat_grupo.npy
    for g in nomes:
        if g not in ids:
            ids[g] = max(ids.values(), default=0) + 1
    if max(ids.values()) > 255:
        raise SystemExit("IDS: mais de 255 músculos não cabem no canal R")
    tabela = np.zeros(len(nomes) + 1, np.uint8)
    for k, g in enumerate(nomes):
        tabela[k + 1] = ids[g]
    r = tabela[np.load(os.path.join(TEX, "anat_grupo.npy")).astype(np.int32)]
    fibra = np.asarray(Image.open(os.path.join(TEX, "anat_linhas.png")).convert("RGB"))[..., 2]
    os.makedirs(config.SAIDA, exist_ok=True)
    saida = os.path.join(config.SAIDA, "musculos-%s.png" % v)
    Image.fromarray(np.stack([r, fibra, np.zeros_like(r)], -1), "RGB").save(saida, optimize=True)
    with open(caminho_ids, "w") as fh:
        json.dump(ids, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("IDS", saida, "%d músculos" % len(ids), "%d KB" % (os.path.getsize(saida) // 1024))
    return saida


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else "base"
    if modo == "base":
        gerar_base(int(sys.argv[2]) if len(sys.argv) > 2 else 2048)
    elif modo == "ids":
        gerar_ids(sys.argv[2])
    else:
        gerar_alvo(sys.argv[2].split(",") if len(sys.argv) > 2 else [])
