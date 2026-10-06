# Abdominal Bicicleta — cena da fábrica 3D (lote 2, 05/10/2026; refeito no lote 3 no mesmo dia).
# REFEITO (Weslley, 05/10/2026, olhando no app: "Na bicicleta só as escápulas saem do chão também. O problema maior é
# só esse, o movimento está correto"): o tórax subia a 49° do chão no meio da pedalada e 55° nas pontas — o tronco
# quase sentado. Agora só a parte de cima das costas sai do chão: no meio o tórax fica a ~32° (escápulas ~1 cm fora,
# como no fim do abdominal supra) e nas pontas a ~40°, porque o giro sobe o ombro de cima — a escápula de baixo fica
# rente ao chão (ACE: "lifting your left shoulder blade off the floor and rotating your trunk"). Com o tórax baixo, a
# parte de baixo dele (~T8–T11) fica apoiada no colchonete e o giro vem de cima (Spine2, ~T7–C7): girando embaixo,
# o lado de baixo das costas entrava no chão. O giro, as pernas, as mãos e os cotovelos ficam como no lote 2.
# t = 0 cotovelo DIREITO indo em direção ao joelho ESQUERDO: tronco enrolado e girado pra esquerda, joelho esquerdo
# dobrado vindo pro peito e a perna direita esticada no ar · t = 1 o contrário (cotovelo esquerdo → joelho direito,
# perna esquerda esticada) — o app toca 0 → 1 e volta 1 → 0, então a volta é a outra pedalada, simétrica.
# ACE (Supine Bicycle Crunches): deitado de costas, coxas na vertical e joelhos a 90° no começo; "Drive your right knee
# towards your chest in a straight line and allow the knee to bend to a deeper angle", "Extend (straightening) your
# left leg outward while keeping it elevated off the floor", "flex (curl) your trunk, lifting your left shoulder blade
# off the floor and rotating your trunk slowly to drive your left elbow towards your right knee"; "keep your low back
# pressed into the floor / mat", "The rotation should come from your trunk and not your hips", "Do not pull forward on
# your head... Support your head in your hands while maintaining alignment of your head with your thoracic (upper)
# spine". Livestrong (reproduzido pelo ACE): "hands behind your head (elbows out wide)".
# Como o rig faz isso: mãos atrás da cabeça montadas EM PÉ (IK do braço → FK, palma virada pra cabeça, dedos juntos
# curvando até encostar no cabelo, polegar solto) — o braço vira filho do tórax e acompanha o tronco sem a mão sair
# da cabeça; deitado, a pelve vai em retroversão e a lombar dobra até a curva sumir (lombar inteira no colchonete);
# o tórax (Spine1/Spine2) enrola e a parte de cima dele (Spine2) gira; a lombar e a pelve não giram. Pernas por FK
# (quadril e joelho), em linha reta.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import deitado3d as dt
import checagem3d as ck
from cena import Cena

TOPO = 0.012                  # colchonete de 12 mm no chão (o da elevação de pernas)
AFUNDA = 0.002                # pele da lombar dentro do colchonete (lote 2: 4 mm; com o tórax baixo, na ponta do giro
                              # o lado de baixo da lombar afunda ~7 mm a mais e passava dos 9 mm da regra "costas sem
                              # atravessar o colchonete")
MAO_ANG = 112                 # onde a mão encosta na cabeça, graus em volta do eixo da cabeça (0 = rosto, 90 = orelha
                              # esquerda, 180 = nuca): atrás da orelha
MAO_Z = 1.615                 # altura do contato na cabeça em pé (m): na altura do alto da orelha
DEDOS_SOBE = 40               # dedos apontando pra trás da cabeça e pra cima (graus acima da horizontal): as pontas
                              # ficam atrás da cabeça sem chegar no meio (as duas mãos não se encostam)
FOLGA_PALMA = 0.004           # vão entre a palma e a cabeça/cabelo (m): a mão apoia pelos dedos, de leve, sem puxar
POLO_COTOVELO = (0.55, -0.28, 0.0)   # polo do cotovelo em relação ao ombro (m: pra fora, pra trás (+) / frente (−),
                                     # pra cima): cotovelo aberto pro lado, um pouco à frente da orelha
DEDOS_DOBRA = (22, 18, 10)    # dobra de cada falange (graus × λ) quando o dedo se curva pra encostar na cabeça
RETRO = 20                    # retroversão da pelve (graus): a lombar desce até o colchonete
LOMBAR = 30                   # flexão da lombar (osso Spine) em relação à pelve: a curva da lombar some
ENROLA = (17, 8)              # flexão do tórax no meio da pedalada (Spine1, Spine2), graus: o tórax a ~32° do chão e as
                              # escápulas ~1 cm fora dele (só elas saem do chão). Lote 2: (24, 24), tórax a 49°
ENROLA_PONTA = (22, 12)       # flexão do tórax nas pontas (cotovelo indo ao joelho): o mínimo pra escápula do lado
                              # de baixo do giro ficar rente ao chão sem entrar nele (~5 mm); tórax a ~40°. Lote 2:
                              # (31, 31)
GIRO = 44                     # giro do tórax nas pontas (graus): + = pra esquerda (ombro direito sobe). Mede ±38° do
                              # tórax em relação à pelve, igual ao lote 2 (lá 48 com o giro espalhado em Spine1 e
                              # Spine2)
GIRO_PARTE = (0.0, 0.0, 1.0)  # quanto do giro vai em cada vértebra do rig (Spine, Spine1, Spine2): a lombar e o fim do
                              # tórax (~T8–T11, que agora ficam no colchonete) não giram; quem gira é a parte de cima
                              # (~T7–C7) — as vértebras de cima giram mais que as de baixo (Wilke 2017: 10–12° por
                              # segmento em T1–T10, 7–8° em T10–T12). Lote 2: (0, 0,45, 0,55), que com o tórax baixo
                              # levava o lado de baixo das costas pra dentro do chão
DENTRO = (68, 110)            # perna que vem pro peito: quadril (graus além da pelve) e joelho
FORA = (8, 5)                 # perna que estica, no ar
PLANTAR = 20                  # pés soltos, apontando pra longe (flexão plantar, graus)
VINCO_QUADRIL = 0.10          # coxa × barriga até 10 cm da junta do quadril = dobra da virilha (não conta)


def _pontos(bon, objs_extra=()):
    """Pele da cabeça + cabelo (mundo) e a árvore BVH deles, pra medir a mão encostando na cabeça."""
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    cab = np.array([n in ("Head", "Neck") for n in nomes] + [False])[dono]
    tri_c = tri[cab[tri].all(axis=1)]
    vs, ts = [co], [tri_c]
    base = len(co)
    for o in objs_extra:
        eco, etri = ck._avaliar_simples(o)
        vs.append(eco)
        ts.append(etri + base)
        base += len(eco)
    V = np.concatenate(vs)
    T = np.concatenate(ts)
    return co, (nomes, dono), BVHTree.FromPolygons([tuple(p) for p in V], [tuple(t) for t in T], all_triangles=True)


def mao_x_cabeca(bon, lado, objs_extra=(), so_palma=False):
    """Menor distância (m, − = dentro) da pele da mão `lado` (ou só da palma, sem os dedos) até a pele da
    cabeça/pescoço e o cabelo."""
    co, (nomes, dono), bvh = _pontos(bon, objs_extra)
    m = np.array([(n in (lado + "Hand", lado + "HandThumb1")) if so_palma else n.startswith(lado + "Hand")
                  for n in nomes] + [False])[dono]
    pior, onde = 1e9, ""
    for i in np.where(m)[0]:
        v = Vector(co[i])
        loc, nor, idx, dist = bvh.find_nearest(v, 0.05)
        if loc is None:
            continue
        d = -dist if (v - loc).dot(nor) < 0 else dist
        if d < pior:
            pior, onde = d, nomes[dono[i]]
    return pior, onde


def _congelar(rig, ik, lado):
    """O que o IK do braço fez vira FK (o IK fica mudo): o braço passa a seguir o tronco como filho dele."""
    PB = rig.pose.bones
    nomes = (lado + "Arm", lado + "ForeArm")
    mats = [PB[p3.P + n].matrix.copy() for n in nomes]
    ik.mute = True
    for n, M in zip(nomes, mats):
        PB[p3.P + n].matrix = M
        p3.atualizar()


def _orientar(rig, lado, dedos_q, palma_q):
    """Antebraço gira (pronação/supinação) pra palma ir pra `palma_q` e o resto vai no punho até os dedos
    apontarem pra `dedos_q` (o mesmo jeito do maos3d.Maos.segurar, sem fechar a mão)."""
    f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
    ax = (f1 - f0).normalized()
    quer = palma_q - ax * palma_q.dot(ax)
    tem = pg._base(rig, lado)[0]
    tem = tem - ax * tem.dot(ax)
    if quer.length > 1e-6 and tem.length > 1e-6:
        quer.normalize()
        tem.normalize()
        p3.girar_osso(rig, lado + "ForeArm",
                      Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
    h0 = p3.cabeca(rig, lado + "Hand")
    y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
    n_m = pg._base(rig, lado)[0]
    n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
    F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
    pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
    F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
    p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())


def _contato(bon, s, extras):
    """Ponto da cabeça (pele ou cabelo, o que estiver mais pra fora) onde a mão encosta, a normal pra fora ali e a
    direção dos dedos (tangente pra nuca, subindo DEDOS_SOBE), tudo em pé. s = +1 esquerda, −1 direita."""
    H = dt.malha(bon, ("Head",))
    P = np.concatenate([H] + [ck._avaliar_simples(o)[0] for o in extras])
    fatia = H[np.abs(H[:, 2] - MAO_Z) < 0.01]
    eixo = np.array([0.0, (fatia[:, 1].min() + fatia[:, 1].max()) / 2])          # eixo vertical da cabeça (x, y)
    a = math.radians(MAO_ANG)
    dirh = np.array([s * math.sin(a), -math.cos(a)])
    perto = P[np.abs(P[:, 2] - MAO_Z) < 0.008]
    rel = perto[:, :2] - eixo
    ang = np.degrees(np.arctan2(rel @ np.array([-dirh[1], dirh[0]]), rel @ dirh))
    f = perto[np.abs(ang) < 6]
    r = np.linalg.norm(f[:, :2] - eixo, axis=1)
    pc = Vector(f[r.argmax()])
    fora = Vector((dirh[0], dirh[1], 0.0))
    tang = Vector((s * math.cos(a), math.sin(a), 0.0))                            # pra nuca (ângulo crescendo)
    sobe = math.radians(DEDOS_SOBE)
    dedos = (tang * math.cos(sobe) + Vector((0, 0, 1)) * math.sin(sobe)).normalized()
    return pc, fora, dedos


def _arvore_cabeca(bon, extras):
    return _pontos(bon, extras)[2]


def _distancia(bvh, P, alcance=0.05):
    """Menor distância (m, − = dentro) dos pontos P até a superfície da árvore."""
    pior = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, dist = bvh.find_nearest(v, alcance)
        if loc is None:
            continue
        d = -dist if (v - loc).dot(nor) < 0 else dist
        pior = min(pior, d)
    return pior


def dedos_na_cabeca(bon, lado, extras, folga=0.0006):
    """Cada dedo (fora o polegar) curva inteiro (as 3 falanges na proporção DEDOS_DOBRA) até a pele encostar na
    cabeça/cabelo sem entrar: a mão apoia a cabeça de leve, com os dedos juntos e soltos (sem entrelaçar)."""
    rig = bon.rig
    bvh = _arvore_cabeca(bon, extras)
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    pos = {n: i for i, n in enumerate(nomes)}
    palma, eixo_nos = pg._base(rig, lado)[:2]
    escolhas = {}
    for d in p3.DEDOS:
        ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
        pts = {o: co[dono == pos[o]] for o in ossos}
        cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
        f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
        sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
        melhor = None
        for lam in np.arange(-1.5, 3.01, 0.05):
            angs = [lam * DEDOS_DOBRA[k] * sinal for k in range(3)]
            pp = pg._cadeia_pts(pts, cab, None, ossos, [eixo_nos] * 3, angs)
            dm = _distancia(bvh, np.concatenate([pp[o][::2] for o in ossos]))
            if dm < folga:
                break
            melhor = (lam, angs, dm)
        if melhor is None:
            escolhas[d] = "sem solução"
            continue
        lam, angs, dm = melhor
        for k, o in enumerate(ossos):
            if angs[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(angs[k], eixo_nos))
        escolhas[d] = (round(float(lam), 2), round(dm * 1000, 1))
    return escolhas


POLEGAR_DOBRA = (10, 20, 20)  # dobra de cada falange do polegar (graus × λ)


def polegar_na_cabeca(bon, lado, extras, folga=(0.0005, 0.003)):
    """Polegar solto do lado da cabeça: procura o giro na base (em volta da normal da palma) e a dobra das 3
    falanges que deixam a pele dele encostando de leve (folga[0] a folga[1]) na cabeça/cabelo, sem entrar; sem
    solução que encoste, fica o mais perto sem entrar."""
    rig = bon.rig
    bvh = _arvore_cabeca(bon, extras)
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    pos = {n: i for i, n in enumerate(nomes)}
    palma = pg._base(rig, lado)[0]
    ossos = ["%sHandThumb%d" % (lado, i) for i in (1, 2, 3)]
    pts0 = {o: co[dono == pos[o]] for o in ossos}
    cab0 = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
    h1 = cab0[ossos[0]]
    eixos, sinais = [], []
    for k, o in enumerate(ossos):
        f = (p3.ponta(rig, o) - p3.cabeca(rig, o)).normalized()
        ex = f.cross(palma).normalized()
        alvo = (p3.cabeca(rig, lado + "HandMiddle1") - p3.cabeca(rig, o)).normalized()
        eixos.append(ex)
        sinais.append(1 if ex.cross(f).dot(alvo) > 0 else -1)
    melhor = None
    for b in range(-30, 31, 5):
        pa = {o: pg._rot(pts0[o], h1, palma, b) for o in ossos}
        ca = {o: (pg._rot(cab0[o][None], h1, palma, b)[0] if k else cab0[o]) for k, o in enumerate(ossos)}
        eix = [Vector(pg._rot(np.array(e)[None], np.zeros(3), palma, b)[0]) for e in eixos]
        for lam in np.arange(-0.5, 1.51, 0.1):
            angs = [lam * POLEGAR_DOBRA[k] * sinais[k] for k in range(3)]
            pp = pg._cadeia_pts(pa, ca, None, ossos, eix, angs)
            dm = _distancia(bvh, np.concatenate([pp[o][::2] for o in ossos]))
            if dm < folga[0]:
                continue
            nota = (0 if dm <= folga[1] else 1, abs(b) / 30 + abs(lam), dm)
            if melhor is None or nota < melhor[0]:
                melhor = (nota, b, lam, dm)
    if melhor is None:
        return "sem solução"
    _, b, lam, dm = melhor
    if b:
        p3.girar_osso(rig, ossos[0], p3.rot_eixo(b, palma))
    for k, o in enumerate(ossos):
        f = (p3.ponta(rig, o) - p3.cabeca(rig, o)).normalized()
        ex = f.cross(palma).normalized()
        alvo = (p3.cabeca(rig, lado + "HandMiddle1") - p3.cabeca(rig, o)).normalized()
        sg = 1 if ex.cross(f).dot(alvo) > 0 else -1
        if lam * POLEGAR_DOBRA[k]:
            p3.girar_osso(rig, o, p3.rot_eixo(lam * POLEGAR_DOBRA[k] * sg, ex))
    return (b, round(float(lam), 1), round(dm * 1000, 1))


def maos_na_cabeca(bon, extras, voltas=6):
    """Mãos atrás da cabeça (em pé, antes de deitar), dedos soltos sem entrelaçar, palma virada pra cabeça e
    encostando de leve atrás da orelha, cotovelos abertos pro lado. Devolve o que mediu (punho, vão)."""
    rig = bon.rig
    out = {}
    for lado, s in dt.LADOS:
        pc, fora, dedos = _contato(bon, s, extras)
        palma = -fora
        palma = (palma - dedos * palma.dot(dedos)).normalized()
        S = p3.cabeca(rig, lado + "Arm")
        punho = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))      # alvo nasce no punho de repouso
        polo = p3.vazio("polo_cotovelo_" + lado, S + Vector((s * POLO_COTOVELO[0], POLO_COTOVELO[1],
                                                             POLO_COTOVELO[2])))
        ik = p3.ik(rig, lado + "ForeArm", punho, polo)
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado)
        alvo = pc - dedos * 0.055 + fora * 0.03
        punho.location = alvo
        p3.atualizar()
        polo_erro = p3.acertar_polo(rig, ik, lado + "ForeArm", lado + "Arm", lado + "Hand")
        d = 0.0
        for _ in range(voltas):
            ik.mute = False
            punho.location = alvo
            p3.atualizar()
            _congelar(rig, ik, lado)
            _orientar(rig, lado, dedos, palma)
            d, onde = mao_x_cabeca(bon, lado, extras, so_palma=True)
            if abs(d - FOLGA_PALMA) < 0.0005:
                break
            alvo = alvo + palma * (d - FOLGA_PALMA)
        dedos_esc = dedos_na_cabeca(bon, lado, extras)
        dedos_esc["Thumb"] = polegar_na_cabeca(bon, lado, extras)
        fa = p3.ponta(rig, lado + "ForeArm") - p3.cabeca(rig, lado + "ForeArm")
        mo = p3.ponta(rig, lado + "Hand") - p3.cabeca(rig, lado + "Hand")
        out[lado] = dict(dedos=dedos_esc, vao=mao_x_cabeca(bon, lado, extras)[0] * 1000, vao_palma=d * 1000,
                         punho=math.degrees(fa.angle(mo)), contato=tuple(pc),
                         cotovelo=tuple(p3.cabeca(rig, lado + "ForeArm")), polo=polo_erro)
    return out


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _arvore(co, tri, m):
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def _entra(co, ma, bvh_b, alcance=0.03):
    """Menor distância (mm, − = dentro) dos vértices `ma` até a superfície da árvore B."""
    pior = 1e9
    for p in co[ma]:
        v = Vector(p)
        loc, nor, idx, dist = bvh_b.find_nearest(v, alcance)
        if loc is not None:
            pior = min(pior, -dist if (v - loc).dot(nor) < 0 else dist)
    return pior * 1000


def _cruza(co, tri, ma, mb, junta=None, raio=0.0):
    """Quanto a pele A entra na pele B (mm, 0 = não cruza), só onde os triângulos se cruzam de verdade (o jeito do
    checagem3d.corpo_x_corpo); perto da `junta` (até `raio` m) é o vinco normal e não conta. Devolve (mm, cm da junta)."""
    ta, tb = tri[ma[tri].all(axis=1)], tri[mb[tri].all(axis=1)]
    if not len(ta) or not len(tb):
        return 0.0, 0.0
    ba = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in ta], all_triangles=True)
    bb = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tb], all_triangles=True)
    pares = ba.overlap(bb)
    fundo, onde = 0.0, 0.0
    for i in np.unique(ta[[p_[0] for p_ in pares]].ravel()) if pares else ():
        v = Vector(co[i])
        longe = (v - junta).length if junta is not None else 0.0
        if junta is not None and longe < raio:
            continue
        loc, nor, idx, dist = bb.find_nearest(v, 0.03)
        if loc is not None and (v - loc).dot(nor) < 0 and dist > fundo:
            fundo, onde = dist, longe
    return fundo * 1000, onde * 100


def giro_torax(rig):
    """Giro do tórax em relação à pelve em volta do eixo do tronco (graus, + = pra esquerda: ombro direito vai pra
    frente/cima): linha das clavículas × linha dos quadris, vistas ao longo do eixo quadril → pescoço."""
    c = lambda n: p3.cabeca(rig, n)
    eixo = (c("Neck") - c("Hips")).normalized()
    pel = c("RightUpLeg") - c("LeftUpLeg")
    pel = (pel - eixo * pel.dot(eixo)).normalized()
    tor = c("RightShoulder") - c("LeftShoulder")
    tor = (tor - eixo * tor.dot(eixo)).normalized()
    frente = eixo.cross(pel)
    return math.degrees(math.atan2(tor.dot(frente), tor.dot(pel)))


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    extras = [bon.cabelo]
    colchonete = e3.caixa("colchonete", (0, -0.03, TOPO / 2), (0.62, 1.95, TOPO), e3.mat_estofado(), chanfro=0.004)
    # região das escápulas, marcada em pé: costas entre a ponta de baixo da escápula (~T7, z 1,22) e a espinha dela
    # (z 1,40), de 4 a 15 cm do meio — pra medir quanto cada escápula sai do chão
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    tronco_v = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))
    escap = {s_: tronco_v & (co[:, 1] > 0.0) & (co[:, 2] > 1.20) & (co[:, 2] < 1.40) & (s_ * co[:, 0] > 0.04)
             & (s_ * co[:, 0] < 0.15) for s_ in (1, -1)}
    maos = maos_na_cabeca(bon, extras)                         # em pé: o braço vira filho do tronco e vai junto
    for lado, o in maos.items():
        print("MÃOS NA CABEÇA %s | vão %.1f mm (palma %.1f) | punho %.0f° | cotovelo (%.3f %.3f %.3f) | dedos %s" % (
            lado, o["vao"], o["vao_palma"], o["punho"], *o["cotovelo"], o["dedos"]))
    # deitado de costas (cabeça pra +Y), pelve em retroversão e lombar achatada no chão
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-RETRO), pivo=pivo)
    p3.girar_osso(rig, "Spine", p3.rot_x(LOMBAR))
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in ("Spine", "Spine1", "Spine2")}
    acerto = [0.0]                                             # giro que zera o tórax no meio (o boneco não é simétrico)

    def tronco(t):
        """Tórax enrolado e girado no quadro t (a pelve e a lombar ficam paradas no chão)."""
        u = 1 - 2 * t                                          # +1 em t=0 (gira pra esquerda) → −1 em t=1
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for n, a, b in zip(("Spine1", "Spine2"), ENROLA, ENROLA_PONTA):
            p3.girar_osso(rig, n, p3.rot_x(a + (b - a) * u * u))
        for n, f in zip(("Spine", "Spine1", "Spine2"), GIRO_PARTE):
            if f:
                ax = (p3.ponta(rig, n) - p3.cabeca(rig, n)).normalized()
                p3.girar_osso(rig, n, Matrix.Rotation(math.radians((GIRO * u + acerto[0]) * f), 3, ax))

    # o tórax do boneco já sai ~2° girado pra direita em relação à pelve (malha/rig não são simétricos): sem acertar,
    # uma pedalada girava 35° e a outra 40° (05/10/2026) — acerta o giro do meio pra 0 e as duas pontas ficam iguais
    for _ in range(3):
        tronco(0.5)
        acerto[0] -= giro_torax(rig) / 0.73                    # ~0,73° medido por grau aplicado (tórax enrolado)
    tronco(0.5)
    print("GIRO acerto %+.1f° | tórax no meio %+.1f°" % (acerto[0], giro_torax(rig)))

    def pernas(t):
        for lado, _ in dt.LADOS:
            for o in ("UpLeg", "Leg", "Foot"):
                PB[p3.P + lado + o].matrix_basis = Matrix()
        p3.atualizar()
        for lado, ini, fim in (("Left", DENTRO, FORA), ("Right", FORA, DENTRO)):
            q, k = p3.lerp(ini[0], fim[0], t), p3.lerp(ini[1], fim[1], t)
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(-q))
            p3.girar_osso(rig, lado + "Leg", p3.rot_x(k))
            p3.girar_osso(rig, lado + "Foot", p3.rot_x(PLANTAR))

    # assenta: a pele do meio da lombar e do sacro encosta AFUNDA dentro do colchonete (no meio da pedalada)
    tronco(0.5)
    pernas(0.5)
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    lomb = np.array([n in ("Hips", "Spine") for n in nomes] + [False])[dono]
    P = co[lomb]
    P = P[np.abs(P[:, 0]) < 0.05]
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - P[:, 2].min())))
    print("DEITADO | retroversão %d° lombar %d° | quadril z %.3f" % (RETRO, LOMBAR, p3.cabeca(rig, "Hips").z))

    def pose(t):
        """t=0 cotovelo direito indo ao joelho esquerdo (perna direita esticada), t=1 o contrário."""
        tronco(t)
        pernas(t)

    def medidas():
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = {}
        m["escapula"] = {L: (co[escap[sg]][:, 2].min() - TOPO) * 1000 for L, sg in (("E", 1), ("D", -1))}
        bvh_cab = _pontos(bon, extras)[2]                       # pele da cabeça/pescoço + cabelo
        for L in ("Left", "Right"):
            m["mao" + L[0]] = _entra(co, np.array([n.startswith(L + "Hand") for n in nomes] + [False])[dono], bvh_cab)
        mE = np.array([n.startswith("LeftHand") for n in nomes] + [False])[dono]
        mD = np.array([n.startswith("RightHand") for n in nomes] + [False])[dono]
        m["mao_mao"] = _entra(co, mE, _arvore(co, tri, mD), 0.1)
        for L, O in (("Left", "Right"), ("Right", "Left")):
            cot = p3.cabeca(rig, L + "ForeArm")
            m["cot_joelho" + L[0]] = (cot - p3.cabeca(rig, O + "Leg")).length * 1000
            braco = _grupo(nomes, dono, (L + "Arm", L + "ForeArm"))
            m["cot_coxa" + L[0]] = _entra(co, braco, _arvore(co, tri, _grupo(nomes, dono, (O + "UpLeg", O + "Leg"))), 0.1)
            m["braco_z" + L[0]] = co[braco][:, 2].min() * 1000
            m["coxa_tronco" + L[0]] = _cruza(co, tri, _grupo(nomes, dono, (L + "UpLeg",)),
                                             _grupo(nomes, dono, ("Spine", "Spine1", "Spine2")),
                                             p3.cabeca(rig, L + "UpLeg"), VINCO_QUADRIL)
        m["giro"] = giro_torax(rig)
        c_ = lambda n: p3.cabeca(rig, n)
        m["pescoco_torax"] = math.degrees((c_("Head") - c_("Neck")).angle(c_("Neck") - c_("Spine2")))
        return m

    def info():
        m = medidas()
        perto = lambda v: ("%.0f" % v) if v < 100 else ">100"          # pele a pele, só mede até 10 cm
        return ("tórax %.0f° do chão | giro do tórax %+.0f° | escápula E %.0f D %.0f mm do colchonete | "
                "cotovelo D→joelho E %.0f mm, cotovelo E→joelho D %.0f mm (centro a centro) | pele do braço × perna do "
                "outro lado E %s D %s mm | "
                "braço mais baixo E %.0f D %.0f mm do chão | coxa × tronco cruzando E %.1f D %.1f mm (fora da virilha) | "
                "mão × cabeça E %.1f D %.1f mm | mão × mão %.1f mm | pescoço × tórax %.0f° (a curva do pescoço de pé, "
                "sem dobrar)" % (
                    ck.tc.torax_chao(ck.posicoes(rig))[0], m["giro"], m["escapula"]["E"], m["escapula"]["D"],
                    m["cot_joelhoR"], m["cot_joelhoL"],
                    perto(m["cot_coxaL"]), perto(m["cot_coxaR"]), m["braco_zL"], m["braco_zR"], m["coxa_troncoL"][0],
                    m["coxa_troncoR"][0], m["maoL"], m["maoR"], m["mao_mao"], m["pescoco_torax"]))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.1, 0.25),
                camera_video=((0.9, -2.6, 1.75), (0, -0.1, 0.22), 50), info=info, apoios=[colchonete],
                afunda_apoio_mm=20)
