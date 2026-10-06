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
                    aperto=APERTO, base_livre=0.022, polegar_antes=None, polegar_modo=None):
    """Com a mão de referência já posta (mao_de_referencia) e a barra no lugar (ponto_na_mao): cada dedo
    fecha ou abre inteiro (as 3 juntas na mesma proporção) até a pele encostar na barra; o polegar procura
    apoio na barra ou nos dedos sem entrar em nenhum dos dois. polegar_antes = o angs["Thumb"] do quadro
    anterior: o polegar prefere ficar perto dele (sem isso, a melhor solução de um quadro pode cair do outro
    lado da faixa e a ponta do polegar salta ~10 cm entre 2 quadros — rosca, 04/10/2026).
    polegar_modo (lote 3, 05/10/2026): None = o do processo (usar_polegar; padrão "busca" = o polegar de hoje, igual
    nos 24 exercícios prontos); "volta" = polegar_em_volta (o polegar dá a volta na barra — só nos exercícios novos)."""
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

    if (polegar_modo or POLEGAR_MODO) == "volta":    # jeito novo (lote 3): o polegar dá a volta na barra
        volta = polegar_em_volta(bon, lado, c, u, raio, aperto=aperto, antes=polegar_antes, base_livre=base_livre)
        if volta[-1]:                                 # achou postura viável
            angs["Thumb"] = volta
            return angs
        polegar_antes = None                          # nenhuma viável: o polegar de hoje (abaixo), do zero

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


# ── Polegar dando a VOLTA na barra/halter (lote 3, 05/10/2026) ─────────────────────────────────────────────────────────
# Achado do lote 2 (vale pra fábrica toda): o polegar de cima (busca em eixos fixos) não fecha — fica esticado ao lado
# ou por cima da barra. Decisão dele (05/10/2026): "1 mas não precisa corrigir os antigos, só para os novos" → o jeito
# novo é OPCIONAL e o padrão continua o de hoje (os 24 exercícios prontos não mudam). Uma cena nova liga com 1
# argumento: Maos(bon, raio, polegar_modo="volta") — ou pg.usar_polegar("volta") no começo do montar(), ou
# fechar_em_volta(..., polegar_modo="volta").
# Como (polegar3d.py tem a matemática, com testes sem o Blender): o polegar gira nos eixos ANATÔMICOS dele, tirados do
# próprio rig — CMC flexão/abdução/rotação, MCP flexão/abdução, IP flexão (convenção de Goislard 2012/Cooney 1981). A
# MCP e a IP ficam perto da pegada MEDIDA num cilindro de 33 mm (Goislard de Monsabert 2012: MCP 43,9 ± 11,4°, IP
# 56,5 ± 14,9°; busca em ±2 DP, custo por DP²); a CMC sai da busca (o zero dela é o polegar do MakeHuman em repouso, não
# o trapézio, então o número dela não compara com o artigo), limitada pela pele. A busca (determinística) leva a polpa
# da falange distal a ENCOSTAR por cima da falange média do indicador/médio (Napier, por Young 2003: "the thumb, which
# is wrapped over the dorsum of the fingers"), mais perto do alvo do polegar de hoje, com 3 travas medidas na pele
# de verdade (o mesmo LBS do Blender e do app, em numpy): nada do polegar entra na barra (> APERTO) nem nos dedos/palma
# (> POLEGAR_ENTRA); a pele da base (eminência tenar e prega polegar–indicador) não estica mais que POLEGAR_ALONGA_MAX
# nem vira do avesso (0 triângulo). Quadro seguinte (polegar_antes): parte da postura anterior e paga pra se afastar
# dela (a ponta não salta).
import polegar3d as P3

POLEGAR_MODO = "busca"           # "busca" = o polegar de hoje; "volta" = o jeito novo (só exercícios novos)
# Limite da pele da base, medido (05/10/2026; razão de comprimento das arestas, posado ÷ repouso): os dedos fechados
# de hoje (aceitos nos 24 exercícios) já esticam as arestas dos nós até 2,1–3,9× (p99 1,9–2,8×, tríceps testa t=0); o
# polegar de hoje fica em 1,7× no tríceps mas chega a 3,2–3,4× COM triângulos do avesso na rosca direta e nas
# paralelas; girar só o metacarpo 60° num eixo dá 3,0–3,8× e 75°, 3,7–4,5× — a 75° (4,1×) a pele da base fica fina e
# torcida (o "rasga" de 03/10). 2,5× sem nenhum triângulo do avesso fica no nível dos dedos de hoje e abaixo de onde
# rasga. Barra de 38 mm (paralelas): a polpa para ~7 mm antes da falange média mesmo afrouxando pra 3,0× — quem trava
# ali é a barra/dedos, não a pele (o polegar abraça a barra e fica do lado).
POLEGAR_ALONGA_MAX = 2.5
POLEGAR_ENTRA = 0.0015            # polegar apertando os dedos/palma: pode afundar a pele até isso (igual ao APERTO)
POLEGAR_FAIXAS = ((-60.0, 90.0), (-45.0, 90.0), (-60.0, 60.0),     # CMC flexão, abdução, rotação
                  (0.0, 66.7), (-29.3, 14.7), (-10.0, 86.3))         # MCP flexão e abdução, IP (MCP/IP: ±2 DP de Goislard)
_PELE = {}
_SEMENTE = {}                     # última postura boa por grossura de barra: semente da outra mão (ângulos espelham)


def usar_polegar(modo="volta"):
    """Polegar do processo todo (cada exportação roda num Blender só dela): "volta" = o jeito novo, "busca" = o de hoje.
    Chamar no começo do montar() da cena nova (o Maos(..., polegar_modo=) chama sozinho). Sem chamar, nada muda."""
    global POLEGAR_MODO
    if modo not in ("busca", "volta"):
        raise ValueError("polegar_modo desconhecido: %r (use 'busca' ou 'volta')" % (modo,))
    POLEGAR_MODO = modo
    return modo


def _pele(bon):
    """Malha em repouso (níveis 0, o esqueleto sem efeito), triângulos, arestas e pesos das mãos (só os ossos que
    deformam, normalizados como o Armature) — uma vez por corpo."""
    import bpy
    corpo, rig = bon.corpo, bon.rig
    chave = (corpo.session_uid, len(corpo.data.vertices))   # um boneco novo no mesmo processo não usa o antigo
    if chave in _PELE:
        return _PELE[chave]
    arm = [m for m in corpo.modifiers if m.type == "ARMATURE"]
    vis = [m.show_viewport for m in arm]
    for m in arm:
        m.show_viewport = False
    co_rep, tri, _ = ck._avaliar(corpo, 0)
    for m, v in zip(arm, vis):
        m.show_viewport = v
    sub = corpo.modifiers.get("Suave")
    antigo = None
    if sub is not None:
        antigo, sub.levels = sub.levels, 0
    ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    nomes = {g.index: g.name for g in corpo.vertex_groups}
    deforma = {b.name for b in rig.data.bones if b.use_deform}
    pesos = {}
    for v in me.vertices:
        gs = {nomes[e.group][len(p3.P):]: e.weight for e in v.groups if e.weight > 0 and nomes[e.group] in deforma}
        if gs and any(n.startswith(("LeftHand", "RightHand")) for n in gs):
            s = sum(gs.values())
            pesos[v.index] = {n: w / s for n, w in gs.items()}
    ev.to_mesh_clear()
    if sub is not None:
        sub.levels = antigo
    p3.atualizar()
    _PELE[chave] = dict(co=co_rep, tri=tri, E=P3.arestas(tri), pesos=pesos)
    return _PELE[chave]


def _rel(rig, nome):
    """4×4 (mundo) que leva o osso do repouso pra pose atual (o que o LBS aplica nos vértices dele)."""
    pb = rig.pose.bones[p3.P + nome]
    return np.array(rig.matrix_world @ pb.matrix @ (rig.matrix_world @ pb.bone.matrix_local).inverted())


def pele_do_polegar(bon, lado):
    """Medida da pele da BASE do polegar (eminência tenar e prega polegar–indicador) na pose atual × a malha em
    repouso: alongamento das arestas (posado ÷ repouso: máximo, p99 e o menor) e triângulos do avesso (normal contra a
    normal de repouso girada pelo osso de maior peso). Serve pra qualquer polegar (o de hoje e o novo)."""
    pele = _pele(bon)
    co, _, _ = ck._avaliar(bon.corpo, 0)
    base = P3.base_do_polegar(pele["pesos"], lado)
    E, T = pele["E"], pele["tri"]
    Eb = E[np.isin(E, list(base)).any(axis=1)]
    Tb = T[np.isin(T, list(base)).any(axis=1)]
    r = P3.razoes_arestas(pele["co"], co, Eb)
    donos = P3.dono_dos_triangulos(Tb, pele["pesos"])
    mats = {n: _rel(bon.rig, n)[:3, :3] for n in set(donos) if n}
    R = np.array([mats[n] if n else np.eye(3) for n in donos])
    return dict(alonga_max=float(r.max()), alonga_p99=float(np.percentile(r, 99)), encolhe_min=float(r.min()),
                viradas=P3.viradas(P3.normais(pele["co"], Tb), co, Tb, R), arestas=int(len(Eb)))


def polegar_em_volta(bon, lado, centro, eixo, raio, aperto=APERTO, antes=None, base_livre=0.022):
    """Polegar da mão `lado` dando a volta na barra (eixo `eixo` passando por `centro`, raio `raio`), com os 4 dedos
    já fechados (fechar_em_volta). antes = o angs["Thumb"] do quadro anterior (continuidade). Põe o polegar no Blender
    e devolve ("volta", cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex, alvo_mm, vão_mm, alongamento, viável):
    alvo = ponta (falange distal) → o mesmo alvo do polegar de hoje (11 mm por fora das falanges médias do indicador e
    do médio); vão = pele da falange distal → pele das falanges médias (0 = encostando). Sem nenhuma postura viável
    (nenhum caso medido em 05/10/2026), deixa o polegar solto e devolve viável = False: o fechar_em_volta cai no
    polegar de hoje nesse quadro."""
    from mathutils.bvhtree import BVHTree
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    pele = _pele(bon)
    pesos = pele["pesos"]
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {n: i for i, n in enumerate(nomes)}
    c, u = np.asarray(centro, float), P3.unit(eixo)
    # pele que o polegar mexe, por LBS: o que a mão/antebraço põem fica fixo; os 3 ossos do polegar variam
    idx = np.array(sorted(i for i, gs in pesos.items() if any(o in gs for o in ossos)))
    W = np.array([[pesos[i].get(o, 0.0) for o in ossos] for i in idx])
    H = np.c_[pele["co"][idx], np.ones(len(idx))]
    fixos = {}
    fixo = np.zeros((len(idx), 3))
    for k, i in enumerate(idx):
        for n, w in pesos[i].items():
            if n not in ossos:
                if n not in fixos:
                    fixos[n] = _rel(rig, n)
                fixo[k] += w * (fixos[n] @ H[k])[:3]
    M0 = [_rel(rig, o) for o in ossos]
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    ponta = np.array(p3.ponta(rig, ossos[2]))
    eixos = P3.eixos_do_polegar(np.array(_base(rig, lado)[0]), cab, ponta)
    # pele da base: arestas e triângulos (osso de maior peso de cada um)
    base = P3.base_do_polegar(pesos, lado)
    E, T = pele["E"], pele["tri"]
    Eb = E[np.isin(E, list(base)).any(axis=1)]
    Tb = T[np.isin(T, list(base)).any(axis=1)]
    l0 = np.linalg.norm(pele["co"][Eb[:, 0]] - pele["co"][Eb[:, 1]], axis=1)
    n0 = P3.normais(pele["co"], Tb)
    donos = P3.dono_dos_triangulos(Tb, pesos)
    dono_k = np.array([ossos.index(n) if n in ossos else -1 for n in donos])
    R_fixo = np.array([fixos.get(n, _rel(rig, n) if n else np.eye(4))[:3, :3] if n not in ossos else np.eye(3)
                       for n in donos])
    # quem o polegar não pode atravessar: dedos e palma (sem a pele que o próprio polegar mexe)
    tem = np.zeros(len(co), bool)
    tem[idx] = True
    ok = {pos[lado + "Hand"]} | {pos["%sHand%s%d" % (lado, d, i)] for d in p3.DEDOS for i in (1, 2, 3)}
    t_ok = tri[np.isin(dono[tri], list(ok)).all(axis=1) & ~tem[tri].any(axis=1)]
    bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in t_ok], all_triangles=True)
    medias = tri[np.isin(dono[tri], [pos[lado + "HandIndex2"], pos[lado + "HandMiddle2"]]).all(axis=1)]
    bvh_media = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in medias], all_triangles=True)
    linha = {int(i): k for k, i in enumerate(idx)}
    d_pol = [pos[o] for o in ossos]
    k_pol = np.array([linha[int(i)] for i in idx if dono[i] in d_pol])                 # pele do polegar
    k_teste = np.array([linha[int(i)] for i in idx if dono[i] in d_pol and not any(
        n in pesos[int(i)] for n in (lado + "Hand", lado + "HandIndex1", lado + "ForeArm"))])
    k_ponta = np.array([linha[int(i)] for i in idx if dono[i] == d_pol[2]])            # falange distal
    meio2 = co[(dono == pos[lado + "HandIndex2"]) | (dono == pos[lado + "HandMiddle2"])].mean(axis=0)
    rad = (meio2 - c) - u * ((meio2 - c) @ u)
    alvo = meio2 + rad / np.linalg.norm(rad) * 0.011                                    # o mesmo do polegar de hoje
    q_antes = tuple(antes[1:7]) if isinstance(antes, tuple) and antes and antes[0] == "volta" else None
    P = co.copy()

    def medir(q):
        rots = P3.rotacoes(eixos, q)
        Mc, juntas = P3.cadeia(cab, ponta, rots)
        Ms = [Mc[k] @ M0[k] for k in range(3)]
        Q = P3.lbs(H, W, fixo, Ms)
        D = Q[k_pol]
        D = D[np.linalg.norm(D - juntas[0], axis=1) > base_livre]
        dd = D - c
        barra = max(0.0, raio - float(np.linalg.norm(dd - np.outer(dd @ u, u), axis=1).min())) if len(D) else 0.0
        P[idx] = Q
        alonga = float((np.linalg.norm(P[Eb[:, 0]] - P[Eb[:, 1]], axis=1) / l0).max())
        R = R_fixo.copy()
        for k in range(3):
            R[dono_k == k] = Ms[k][:3, :3]
        vir = P3.viradas(n0, P, Tb, R)
        entra = 0.0
        for v in Q[k_teste]:
            loc, nor, _, dist = bvh.find_nearest(Vector(v))
            if loc is not None and dist < 0.03 and (Vector(v) - loc).dot(nor) < 0:
                entra = max(entra, dist)
        vao = min(bvh_media.find_nearest(Vector(v))[3] for v in Q[k_ponta])
        d_alvo = float(np.linalg.norm(Q[k_ponta].mean(axis=0) - alvo))
        return dict(rots=rots, barra=barra, alonga=alonga, viradas=vir, entra=entra, vao=vao, alvo=d_alvo)

    def custo(q):
        m = medir(q)
        viola = (10 * max(0.0, m["barra"] - aperto) + 10 * max(0.0, m["entra"] - POLEGAR_ENTRA) +
                 0.05 * max(0.0, m["alonga"] - POLEGAR_ALONGA_MAX) + 0.003 * m["viradas"])
        return m["vao"] + 0.3 * m["alvo"] + viola + P3.custo_postura(q, antes=q_antes), viola == 0

    if q_antes is not None:
        sementes = [q_antes]
    else:                       # 1º quadro: as melhores de uma grade larga + a pegada medida + a outra mão (espelho)
        grade = [(cf, ca, cr, mf, P3.REF_33MM[4], ipf) for cf in (-20, 0, 20, 40) for ca in (0, 20, 40, 60)
                 for cr in (-30, -15, 0, 15, 30, 45) for mf in (20, 40) for ipf in (35, 60)]
        sementes = [q for _, q in sorted((custo(q)[0], q) for q in grade)[:8]] + [P3.REF_33MM]
        if round(raio, 4) in _SEMENTE:
            sementes.append(_SEMENTE[round(raio, 4)])
    q, J, viavel, n = P3.buscar(custo, sementes, POLEGAR_FAIXAS)
    if viavel:
        _SEMENTE[round(raio, 4)] = q
    if not viavel and q_antes is not None:      # o quadro anterior não serve mais: procura de novo, do zero
        return polegar_em_volta(bon, lado, centro, eixo, raio, aperto=aperto, antes=None, base_livre=base_livre)
    m = medir(q)
    if viavel:
        for o, R in zip(ossos, m["rots"]):
            if not np.allclose(R, np.eye(3)):
                p3.girar_osso(rig, o, Matrix(R.tolist()))
    return ("volta",) + tuple(round(float(x), 1) for x in q) + (
        round(m["alvo"] * 1000, 1), round(m["vao"] * 1000, 1), round(m["alonga"], 2), bool(viavel))
