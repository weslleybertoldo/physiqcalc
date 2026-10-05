# Pegada pela MALHA (03/10/2026, pedido dele: "a mão não está pegando no peso"): o eixo da barra encosta
# na pele da palma, na dobra palma-dedos, e cada falange fecha em volta da barra até a PELE encostar
# (o osso não serve de medida: a falange não é centrada no osso).
#   g = pg.ponto_da_pegada(bon, "Left", raio)           # onde passa o eixo da barra nessa mão
#   pg.fechar_em_volta(bon, "Left", centro, eixo, raio)  # dedos e polegar fecham até encostar
import math
import numpy as np
from mathutils import Vector, Matrix
import poses3d as p3
import checagem3d as ck

APERTO = 0.0015      # quanto a pele afunda na barra (m) — a mão aperta
# Ângulos de uma mão de verdade segurando um cilindro (pedido dele 03/10/2026: "Os dedos estão tronchos não?
# Não tem nenhuma referência na internet de mão?"): flexão MP, PIP, DIP (graus) medida por tomografia em
# pegada de força (polegar oposto) — Applied Bionics and Biomechanics 2019, "Measurement of Flexion Angle of
# the Finger Joint during Cylinder Gripping…" (PMC6339738), cilindros de 10 e 60 mm interpolados pra barra de 29 mm.
ANGULOS_REF = {"Index": (56, 84, 43), "Middle": (65, 83, 53), "Ring": (62, 87, 46), "Pinky": (53, 70, 52)}
_SINAL = {}          # (lado, dedo) → sentido que fecha o dedo em volta do eixo dos nós
POLEGAR_U = 0.015    # onde a ponta do polegar cai, ao longo da barra a partir do meio da mão (sobre indicador/médio)
POLEGAR_FOLGA = 0.002  # distância mínima entre polegar e dedos (encostar pode, entrar não)
POLEGAR_PASSO = 0.002  # continuidade: cada 5° longe da solução do quadro anterior pesa como 2 mm na nota


def _base(rig, lado):
    s = 1 if lado == "Left" else -1
    mao = p3.cabeca(rig, lado + "Hand")
    ind, mind = p3.cabeca(rig, lado + "HandIndex1"), p3.cabeca(rig, lado + "HandPinky1")
    palma = (-((ind - mao).cross(mind - mao)) * s).normalized()
    nos = (ind + mind) / 2
    return palma, (mind - ind).normalized(), (nos - mao).normalized(), nos, (mind - ind).length


def _malha(bon):
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    return co, nomes, dono


def mao_de_referencia(rig, lado):
    """Dedos soltos → lado a lado → dobrados nos ângulos da mão real (ANGULOS_REF)."""
    p3.soltar_dedos(rig, lado)
    juntar_dedos(rig, lado)
    palma, eixo_nos = _base(rig, lado)[:2]
    for d, angs in ANGULOS_REF.items():
        o = "%sHand%s1" % (lado, d)
        f = (p3.ponta(rig, o) - p3.cabeca(rig, o)).normalized()
        sinal = _SINAL[(lado, d)] = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
        for i, a in enumerate(angs, start=1):            # mesmo sentido nas 3 juntas (o dedo só fecha)
            p3.girar_osso(rig, "%sHand%s%d" % (lado, d, i), p3.rot_eixo(a * sinal, eixo_nos))


def ponto_na_mao(bon, lado, raio, aperto=APERTO):
    """Onde o eixo da barra cabe na mão de referência: sem entrar na pele e com a mão abraçando o máximo."""
    rig = bon.rig
    palma, eixo_nos, dir_mao, nos, larg = _base(rig, lado)
    co, nomes, dono = _malha(bon)
    da_mao = np.array([n.startswith(lado + "Hand") and "Thumb" not in n for n in nomes] + [False])[dono]
    rel = co[da_mao] - np.array(nos)
    u = np.array(eixo_nos)
    P, D = np.meshgrid(np.arange(0.0, 0.05, 0.001), np.arange(-0.03, 0.04, 0.001))
    cand = np.outer(P.ravel(), np.array(palma)) + np.outer(D.ravel(), np.array(dir_mao))
    e1 = np.array(palma)
    e2 = np.cross(u, e1)
    melhor = None
    for q in cand:
        d = rel - q
        rad = d - np.outer(d @ u, u)
        rho = np.linalg.norm(rad, axis=1)
        if rho.min() < raio - aperto:
            continue
        cola = rho - raio < 0.006
        if cola.sum() < 3:
            continue
        ang = np.sort(np.degrees(np.arctan2(rad[cola] @ e2, rad[cola] @ e1)) % 360)
        envolve = 360 - np.diff(np.concatenate([ang, [ang[0] + 360]])).max()
        nota = (envolve, -(rho.min() - raio))
        if melhor is None or nota > melhor[0]:
            melhor = (nota, q)
    return Vector(np.array(nos) + melhor[1]), melhor[0][0]


def _radial(P, c, u):
    d = P - c
    return np.linalg.norm(d - np.outer(d @ u, u), axis=1)


def _rot(P, h, eixo, graus):
    R = np.array(Matrix.Rotation(math.radians(graus), 3, eixo))
    return (P - h) @ R.T + h


def juntar_dedos(rig, lado, fator=1.0):
    """Dedos lado a lado como num punho fechado (o repouso do MakeHuman deixa os dedos abertos em leque)."""
    palma = _base(rig, lado)[0]

    def plano(o):
        f = p3.ponta(rig, o) - p3.cabeca(rig, o)
        return (f - palma * f.dot(palma)).normalized()

    ref = plano(lado + "HandMiddle1")
    for d in ("Index", "Ring", "Pinky"):
        o = lado + "Hand" + d + "1"
        f = plano(o)
        ang = math.degrees(math.atan2(f.cross(ref).dot(palma), f.dot(ref)))
        p3.girar_osso(rig, o, p3.rot_eixo(ang * fator, palma))


def _cadeia_pts(pts, cab, ponta, ossos, eixos, angs):
    """Gira a cadeia (falange 1 → 3) pelos ângulos e devolve os pontos de cada falange."""
    pts = dict(pts)
    cab = dict(cab)
    for k, o in enumerate(ossos):
        if not angs[k]:
            continue
        h = cab[o]
        ex = eixos[k]
        for x in ossos[k:]:
            pts[x] = _rot(pts[x], h, ex, angs[k])
        for x in ossos[k + 1:]:
            cab[x] = _rot(cab[x][None], h, ex, angs[k])[0]
    return pts


def fechar_em_volta(bon, lado, centro, eixo, raio, polegar=(40, 45, 60),
                    aperto=APERTO, base_livre=0.022, polegar_antes=None):
    """Com a mão de referência já posta (mao_de_referencia) e a barra no lugar (ponto_na_mao): cada dedo
    fecha ou abre inteiro (as 3 juntas na mesma proporção) até a pele encostar na barra; o polegar procura
    apoio na barra ou nos dedos sem entrar em nenhum dos dois. polegar_antes = o angs["Thumb"] do quadro
    anterior: o polegar prefere ficar perto dele (sem isso, a melhor solução de um quadro pode cair do outro
    lado da faixa e a ponta do polegar salta ~10 cm entre 2 quadros — rosca, 04/10/2026)."""
    from mathutils.kdtree import KDTree
    rig = bon.rig
    c, u = np.array(centro), np.array(Vector(eixo).normalized())
    palma, eixo_nos, dir_mao, nos, larg = _base(rig, lado)
    co, nomes, dono = _malha(bon)
    pos = {n: i for i, n in enumerate(nomes)}
    angs, dedos_finais, finais = {}, [], {}

    def preparar(dedo):
        ossos = ["%sHand%s%d" % (lado, dedo, i) for i in (1, 2, 3)]
        pts = {o: co[dono == pos[o]] for o in ossos}
        cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
        return ossos, pts, cab, np.array(p3.ponta(rig, ossos[-1]))

    for d in p3.DEDOS:                              # ajuste fino: o dedo inteiro fecha/abre até encostar
        ossos, pts, cab, ponta = preparar(d)
        ref = ANGULOS_REF[d]
        sinal = _SINAL[(lado, d)]
        escolha = None
        for lam in np.arange(0.25, -0.31, -0.01):     # do mais fechado pro mais aberto: 1º sem entrar na barra
            delta = [lam * ref[k] * sinal for k in range(3)]
            pp = _cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, delta)
            if _radial(np.concatenate([pp[x] for x in ossos]), c, u).min() >= raio - aperto:
                escolha = (lam, delta, pp)
                break
        lam, delta, pp = escolha if escolha else (0.0, [0.0] * 3, pts)
        for k, o in enumerate(ossos):
            if delta[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(delta[k], eixo_nos))
        angs[d] = tuple(int(round(ref[k] * (1 + lam))) for k in range(3))
        dedos_finais += [pp[x] for x in ossos]
        finais.update(pp)

    # polegar: sai da palma (abdução, em volta do eixo da barra) → vira pra dentro (oposição, em volta da
    # normal da palma) → fecha em volta da barra. Procura a combinação em que a ponta cai sobre
    # indicador/médio sem entrar na barra nem nos dedos (tudo nos pontos da malha, sem mexer no Blender).
    ossos, pts0, cab0, ponta0 = preparar("Thumb")
    h1 = cab0[ossos[0]]
    meio = c + u * ((np.array(nos) - c) @ u)                 # eixo da barra na altura do meio da mão
    lado_pol = 1 if (h1 - meio) @ u > 0 else -1               # +u aponta pro lado do polegar
    alvo_u = lado_pol * POLEGAR_U
    arv = KDTree(sum(len(x) for x in dedos_finais))
    for i, v in enumerate(np.concatenate(dedos_finais)):
        arv.insert(Vector(v), i)
    arv.balance()
    eixo_u = Vector(u)

    def girar_tudo(pts, cab, ponta, eixo_g, graus):
        pts = {o: _rot(pts[o], h1, eixo_g, graus) for o in ossos}
        cab = {o: (_rot(cab[o][None], h1, eixo_g, graus)[0] if o != ossos[0] else cab[o]) for o in ossos}
        return pts, cab, _rot(ponta[None], h1, eixo_g, graus)[0]

    def bate(P, folga_dedo=POLEGAR_FOLGA):
        longe = P[np.linalg.norm(P - h1, axis=1) > base_livre]
        if len(longe) and _radial(longe, c, u).min() < raio - aperto:
            return True
        return any(arv.find(Vector(v))[2] < folga_dedo for v in P[::3])

    sinais_f = []
    for k, o in enumerate(ossos):
        f = Vector((cab0[ossos[k + 1]] if k < 2 else ponta0) - cab0[o]).normalized()
        ex = f.cross(palma).normalized()
        alvo = (p3.cabeca(rig, lado + "HandMiddle1") - Vector(cab0[o])).normalized()
        sinais_f.append((ex, 1 if ex.cross(f).dot(alvo) > 0 else -1))

    # mão de força de verdade: a ponta do polegar fecha por cima da falange média do indicador/médio
    meio2 = np.concatenate([finais[lado + "HandIndex2"], finais[lado + "HandMiddle2"]]).mean(axis=0)
    rad = (meio2 - c) - u * ((meio2 - c) @ u)
    alvo_pol = meio2 + rad / np.linalg.norm(rad) * 0.011

    melhor = None
    for abd in range(-40, 41, 5):                    # faixa natural: além disso a malha da base rasga
        pa, ca, ta = girar_tudo(pts0, cab0, ponta0, eixo_u, abd)
        for b in range(0, 61, 5):
            bb = -b * lado_pol
            pb, cb_, tb = girar_tudo(pa, ca, ta, Vector(palma), bb)
            for lam in np.arange(0, 1.05, 0.1):
                angs3 = [lam * polegar[k] * sinais_f[k][1] for k in range(3)]
                pp = _cadeia_pts(pb, cb_, tb, ossos, [x[0] for x in sinais_f], angs3)
                P = np.concatenate([pp[o] for o in ossos])
                if bate(P):
                    continue
                nota = float(np.linalg.norm(pp[ossos[2]].mean(axis=0) - alvo_pol))
                if isinstance(polegar_antes, tuple):
                    a0, b0, l0 = polegar_antes[:3]
                    nota += POLEGAR_PASSO * ((abs(abd - a0) + abs(bb - b0)) / 5 + abs(lam - l0) / 0.1)
                if melhor is None or nota < melhor[0]:
                    melhor = (nota, abd, bb, lam)
    if melhor is None:
        angs["Thumb"] = "sem solução"
        return angs
    nota, abd, bb, lam = melhor
    if abd:
        p3.girar_osso(rig, ossos[0], p3.rot_eixo(abd, eixo_u))
    if bb:
        p3.girar_osso(rig, ossos[0], p3.rot_eixo(bb, palma))
    for k, o in enumerate(ossos):                    # flexão: eixo de cada falange já girada junto
        f = (p3.ponta(rig, o) - p3.cabeca(rig, o)).normalized()
        ex = f.cross(palma).normalized()
        alvo = (p3.cabeca(rig, lado + "HandMiddle1") - p3.cabeca(rig, o)).normalized()
        sg = 1 if ex.cross(f).dot(alvo) > 0 else -1
        if lam * polegar[k]:
            p3.girar_osso(rig, o, p3.rot_eixo(lam * polegar[k] * sg, ex))
    angs["Thumb"] = (abd, int(bb), round(float(lam), 2), round(nota * 1000, 1))
    return angs


# ── mão de referência de outra grossura de barra (paralelas de 38 mm, lote 2, 05/10/2026): com a mão de 29 mm a barra
# de 38 mm não cabia no vão (ponto_na_mao sem solução). A mão de outro diâmetro sai da MESMA fonte do ANGULOS_REF,
# interpolada entre os 2 cilindros medidos — Shimawaki S, Murai T, Nakabayashi M, Sugimoto H. Applied Bionics and
# Biomechanics 2019:2839648, tabela 2 ("Mean flexion angle of each joint from the index to the little finger when
# cylinders of the different diameters were gripped"): (DIP, PIP, MP) em graus com o cilindro de 10 mm e com o de 60 mm.
# Com 29 mm a interpolação dá exatamente o ANGULOS_REF acima (conferido no Blender).
SHIMAWAKI_2019 = {"Index": ((48.2, 105.5, 65.6), (35.2, 48.0, 39.7)), "Middle": ((64.8, 104.8, 75.9), (34.5, 48.1, 46.3)),
                  "Ring": ((57.2, 110.5, 76.6), (27.1, 48.7, 38.7)), "Pinky": ((65.8, 93.0, 64.1), (30.0, 32.8, 35.2))}


def angulos_do_cilindro(diametro_mm):
    """Flexão (MP, PIP, DIP) de cada dedo segurando um cilindro de `diametro_mm` (10 a 60 mm), interpolada em linha
    reta entre os 2 cilindros de Shimawaki 2019 — a mesma conta que deu o ANGULOS_REF de 29 mm."""
    f = (diametro_mm - 10.0) / 50.0
    return {d: tuple(int(round(a[2 - i] + f * (b[2 - i] - a[2 - i]))) for i in range(3))
            for d, (a, b) in SHIMAWAKI_2019.items()}


def usar_cilindro(diametro_mm):
    """A mão de referência (mao_de_referencia, ponto_na_mao, fechar_em_volta e o maos3d.Maos) passa a ser a de um
    cilindro de `diametro_mm` em vez de 29 mm. Vale pro processo todo — cada exportação roda num Blender só dela —:
    chamar no começo do montar() da cena, antes de criar o maos3d.Maos. Sem chamar, nada muda (29 mm)."""
    global ANGULOS_REF
    ANGULOS_REF = angulos_do_cilindro(diametro_mm)
    return ANGULOS_REF
