# Elevação Pélvica na Máquina — cena da fábrica 3D (lote 15, 13/10/2026). Peça: a MÁQUINA DE ELEVAÇÃO PÉLVICA nova (e3.elevacao_pelvica_maquina,
# a Nautilus Glute Drive: o banco que gira — encosto, cinto e a barra dos pinos de anilha — num eixo embaixo do encosto, a plataforma
# inclinada dos pés, os 2 montantes com os pegadores e a base). As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   Nautilus (loja Fitness Superstore, Glute Drive): "A comfortable padded belt secures the user to the back pad which supports the full
#   length of the spine"; "Upper body pivot bench provides full spinal stabilization and support"; ficha técnica: "Oversized angled foot
#   platform". A loja diz que ela é "covered by U.S. patent no. 10,226,665": o pivô do banco fica "generally aligned with an inferior
#   aspect of the user's scapulae", "the user secures the belt assembly 315 across his/her lower abdomen", embaixo "the user's hips are
#   bent to an angle between 60 degrees and 110 degrees" e a âncora, a 15" do pivô, sobe "approximately 9 inches upward and approximately
#   3 inches closer" (36,9° de giro do batente até o banco deitado).
#   Contreras, Cronin e Schoenfeld 2011 (Strength Cond J): "The feet should be positioned around shoulder width apart and placed at a
#   distance that creates a 90° angle at the knee joint with a vertical tibia relative to the ground at the top portion of the movement";
#   "The hips rise until the torso is parallel with the ground and a hip-neutral position is reached"; "the head and neck should track
#   accordingly to remain in alignment with the spine"; "The knees should track directly over the toes and not cave inward."
#   ExRx, Barbell Hip Thrust: "Movement should occur through hip with torso rigid. Avoid chest arching upward and anterior pelvic tilt".
# t = 0 embaixo: o banco no amortecedor, BATENTE° abaixo do topo — o tronco ~37° acima da horizontal, o quadril dobrado ~72°, o joelho a
#   ~126° · t = 1 em cima: o banco e o tronco deitados (paralelos ao chão), o quadril neutro (a coxa na linha do tronco), o joelho a 90°
#   em cima do tornozelo (a canela em pé). O app faz a volta.
# Como o rig faz: em pé, mede quanto a sola fica abaixo do tornozelo com o pé girado ANG_PLAT (a plataforma); deita o corpo de costas
#   com o tronco na horizontal e o eixo do banco em y = 0, na altura da ponta de baixo das escápulas (Y_PIVO ao longo do tronco a partir
#   das articulações do quadril) e PROF_PIVO embaixo do estofado, que fica com o topo AFUNDA acima da pele mais baixa das costas; o
#   pescoço estende até a nuca (ou o cabelo) encostar no estofado — a cabeça na linha do tronco; as pernas vão por IK até os tornozelos de
#   cima (coxa na horizontal, joelho em cima do tornozelo, pés na largura dos ombros), com a trava do pé girada ANG_PLAT (a ponta pra
#   cima); a plataforma é o plano que encosta nas solas; o cinto tem o lado de dentro na forma do baixo abdômen (raios saindo do eixo do
#   tronco, casca convexa por fora, 1 mm de aperto) e a máquina é montada em volta do corpo. As mãos ficam soltas no cinto (fotos da BLK
#   BOX), por cima do quadril: a palma encostada, os dedos na linha do antebraço (virados um pouco pro umbigo) dobrando até encostar, e os
#   braços ficam parados em relação ao tronco. No pose(t), o corpo inteiro (o osso Hips) e o banco giram o MESMO ângulo em volta do eixo
#   do banco: as costas não escorregam no encosto e o cinto não anda no quadril (0 mm); só as pernas mexem, por IK, com os pés parados.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from cena import Cena

LADOS = dt.LADOS            # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
BATENTE = 37.0              # graus que o banco desce do topo (deitado) até o amortecedor embaixo (patente: âncora a 15" do pivô, 9" embaixo)
PROF_PIVO = 0.16            # eixo do banco embaixo do topo do estofado (m): estofado 7 cm + chapa + trilho 5 cm + mancal (estimativa)
Y_PIVO = 0.32               # eixo na ponta de baixo das escápulas: m ao longo do tronco a partir das articulações do quadril
AFUNDA = 0.006              # pele das costas dentro do estofado
AFUNDA_CABECA = 0.003       # pele da nuca dentro do estofado (ou o cabelo encostando)
ENCOSTO_Y = (-0.04, 0.80)   # o estofado: de 4 cm abaixo das articulações do quadril (o sacro e o glúteo em cima dele) até depois da cabeça
ENCOSTO = (0.30, 0.07)      # largura e espessura do estofado
PE_X = 0.19                 # tornozelos na largura dos ombros (Contreras 2011; a Elevação Pélvica com Barra também)
ANG_PLAT = 15.0             # plataforma inclinada (a ponta dos pés mais alta)
Z_CALCANHAR = 0.217         # altura da sola no calcanhar, na plataforma (dá a altura total de ~89 cm da Nautilus)
AFUNDA_PE = 0.001           # sola dentro da borracha da plataforma
CINTO_Y = (0.07, 0.17)      # o cinto no baixo abdômen: m ao longo do tronco a partir das articulações do quadril
CINTO_ESP = 0.022           # espessura do cinto acolchoado
CINTO_ANG = 100.0           # o cinto cobre ±CINTO_ANG graus a partir da frente do corpo (as fitas saem das pontas)
A_MAO = 64.0                # o meio da palma no cinto, a A_MAO graus da frente (por cima do quadril, do lado)
COTOVELO = (0.50, 0.26, -0.20)  # polo do cotovelo: pra fora (x), na altura do tronco (m a partir do quadril) e embaixo do estofado
MAO_DY = 0.020              # o meio da palma fica na metade de cima do cinto (pra cabeça): o dedo mínimo não desce até a dobra do quadril
DEDOS_CABECA = 0.35         # os dedos viram um pouco pra cabeça (pro umbigo) além da linha do antebraço: o mínimo longe da dobra do quadril
OFF_D = 0.045               # o punho fica OFF_D m antes do ponto da palma (pros dedos)
AFUNDA_MAO = 0.0006         # a mão encostando no cinto (sem entrar)
DEDOS_RELAX = (20.0, 12.0)  # mão relaxada: as 2 últimas falanges de cada dedo um pouco dobradas
DEDOS_MAX = 40.0            # cada dedo dobra na base no máximo isso pra encostar no cinto
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder")


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _bvh_de(co, tri, m=None):
    t = tri if m is None else tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def _dist(bvh, P):
    """Menor distância com sinal (m) dos pontos P até a malha do bvh (− = entrou), como o contatos() da checagem."""
    menor = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, dist = bvh.find_nearest(v)
        if loc is None:
            continue
        menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
    return menor


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    coxa = (c("LeftLeg") - c("LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - c("LeftLeg")).length
    q0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    a_pl = math.radians(ANG_PLAT)
    Rp = Matrix.Rotation(-a_pl, 3, "X")                       # o pé gira com a ponta pra cima (o ângulo da plataforma)
    n_pl = Vector((0.0, math.sin(a_pl), math.cos(a_pl)))      # normal da plataforma (pra cima)

    def malha():
        return ck._avaliar(bon.corpo, 1)

    # ── 1) em pé: quanto a sola fica abaixo do tornozelo com o pé girado ANG_PLAT ──────────────────────────────────────────────
    co, tri, (nomes, dono) = malha()
    z_sola = 0.0
    for lado, _ in LADOS:
        F = co[_grupo(nomes, dono, (lado + "Foot", lado + "ToeBase"))] - np.array(c(lado + "Foot"))
        z_sola = min(z_sola, float((F @ np.array(Rp).T)[:, 2].min()))
    z_q = Z_CALCANHAR - z_sola + canela         # em cima: joelho na altura do quadril, canela em pé, calcanhar na plataforma

    # ── 2) deitado de costas com o tronco na horizontal (em cima), a cabeça pra +Y; o eixo do banco em y = 0 ──────────────────────
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=q0, mover=Vector((0.0, -Y_PIVO, z_q)) - q0)
    H = (c("LeftUpLeg") + c("RightUpLeg")) / 2

    # ── 3) estofado: plano deitado embaixo das costas, a pele AFUNDA dentro dele; o eixo PROF_PIVO embaixo do topo ─────────────
    co, tri, (nomes, dono) = malha()
    y0, y1 = H.y + ENCOSTO_Y[0], H.y + ENCOSTO_Y[1]
    meia_util = ENCOSTO[0] / 2 - 0.015                        # o chanfro de 1,5 cm não conta
    T = co[_grupo(nomes, dono, TRONCO)]
    f = (T[:, 1] >= y0) & (T[:, 1] <= y1) & (np.abs(T[:, 0]) < meia_util)
    z_top = float(T[f, 2].min()) + AFUNDA
    PP = Vector((0.0, 0.0, z_top - PROF_PIVO))

    # ── 4) a cabeça apoiada no estofado, na linha do tronco: o pescoço estende até a nuca (ou o cabelo) encostar ────────────────
    cabelo = getattr(bon, "cabelo", None)

    def cabeca_z():
        co_, _, (nm, dn) = malha()
        Hd = co_[_grupo(nm, dn, ("Head",))]
        Hd = Hd[(Hd[:, 1] >= y0) & (Hd[:, 1] <= y1) & (np.abs(Hd[:, 0]) < meia_util)]
        zc = float(Hd[:, 2].min()) if len(Hd) else 9.0
        zh = 9.0
        if cabelo is not None:
            Pc = ck._avaliar_simples(cabelo)[0]
            Pc = Pc[(Pc[:, 1] >= y0) & (Pc[:, 1] <= y1) & (np.abs(Pc[:, 0]) < meia_util)]
            zh = float(Pc[:, 2].min()) if len(Pc) else 9.0
        return zc, zh

    pescoco = 0
    while pescoco < 30:
        zc, zh = cabeca_z()
        if zc <= z_top - AFUNDA_CABECA or zh <= z_top:
            break
        p3.girar_osso(rig, "Neck", p3.rot_x(-1))
        pescoco += 1
    zc, zh = cabeca_z()
    print("CABEÇA | pescoço estendido %d° | nuca %.1f mm, cabelo %.1f mm do topo do estofado" % (pescoco, (zc - z_top) * 1000,
                                                                                            (zh - z_top) * 1000))

    # ── 5) pernas em cima: coxa na horizontal (quadril neutro), joelho em cima do tornozelo a ~90° (canela em pé), pés na largura dos
    #    ombros, a ponta dos pés pra cima no ângulo da plataforma (a trava do pé gira junto) ─────────────────────────────────────
    pernas, travas = {}, {}
    for lado, s in LADOS:
        q = c(lado + "UpLeg")
        ky = q.y - math.sqrt(max(coxa ** 2 - (s * PE_X - q.x) ** 2, 0.01))
        tz = Vector((s * PE_X, ky, q.z - canela))
        alvo = p3.vazio("tornozelo_" + lado, tz)
        d = tz - q
        cima = Vector((0, -d.z, d.y)).normalized()
        if cima.z < 0:
            cima.negate()
        polo = p3.vazio("polo_joelho_" + lado, (q + tz) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0)))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        travas[lado] = p3.travar_rotacao(rig, lado + "Foot")
        travas[lado].matrix_world = Rp.to_4x4() @ travas[lado].matrix_world
    p3.atualizar()
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)

    # ── 6) plataforma: o plano inclinado que encosta nas 2 solas (a pele AFUNDA_PE dentro), dos calcanhares + 10 cm até os dedos + 10 cm
    co, tri, (nomes, dono) = malha()
    Pp = co[_grupo(nomes, dono, ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))]
    d_pl = float((Pp @ np.array(n_pl)).min()) + AFUNDA_PE
    y_perto, y_longe = float(Pp[:, 1].max()) + 0.10, float(Pp[:, 1].min()) - 0.10
    z_perto = (d_pl - n_pl.y * y_perto) / n_pl.z
    comp_pl = (y_perto - y_longe) / math.cos(a_pl)

    # ── 7) cinto: raios saindo do eixo do tronco no baixo abdômen (CINTO_Y), a pele do tronco fechada por fora (casca convexa) ─────
    yc = H.y + (CINTO_Y[0] + CINTO_Y[1]) / 2
    m_q = _grupo(nomes, dono, ("Hips", "Spine", "Spine1"))
    fat = (np.abs(co[:, 1] - yc) < 0.01) & m_q
    centro = Vector((0.0, yc, (float(co[fat, 2].min()) + float(co[fat, 2].max())) / 2))
    m_tr = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg"))
    alts, angs, raios = e3.perfil_da_canela(_bvh_de(co, tri, m_tr), centro, (0, 1, 0), (0, 0, 1), largura=CINTO_Y[1] - CINTO_Y[0],
                                             n_ang=72, passo=0.01, folga=-0.001, pontos=co[m_tr])
    a_s = np.where(angs > math.pi, angs - 2 * math.pi, angs)
    sel = np.where(np.abs(a_s) <= math.radians(CINTO_ANG) + 1e-6)[0]
    ordem = sel[np.argsort(a_s[sel])]
    angs_c, raios_c = a_s[ordem], raios[:, ordem]
    r_ponta = max(float(np.interp(0.0, alts, raios_c[:, 0])), float(np.interp(0.0, alts, raios_c[:, -1])))
    ancora_x = (r_ponta + CINTO_ESP / 2) * math.sin(math.radians(CINTO_ANG)) + 0.015   # a fita desce um pouco pra fora: não raspa no quadril
    cinto = dict(centro=centro, alts=alts, angs=angs_c, raios=raios_c, espessura=CINTO_ESP, ancora_x=ancora_x)

    # ── 8) a máquina em volta do corpo: montantes na frente do arco da barra, base com o comprimento da Nautilus ────────────────
    recuo, r_b = (CINTO_Y[0] + CINTO_Y[1]) / 2 - ENCOSTO_Y[0], 0.02     # a barra embaixo do meio do cinto: as fitas descem retas
    B0 = Vector((0.0, y0 + recuo, z_top - ENCOSTO[1] - 0.012 - 0.025))
    ys = [(PP + Matrix.Rotation(math.radians(b), 3, "X") @ (B0 - PP)).y for b in np.linspace(0.0, BATENTE, 25)]
    y_m = min(ys) - r_b - 0.06 - 0.03
    topo_m = 0.89 - 0.14
    y_frente = y_longe - 0.02
    y_tras = max(y_frente + 1.575, 0.30)
    mq = e3.elevacao_pelvica_maquina("glute_drive", pivo=(PP.y, PP.z), encosto=(y0, y1, z_top, ENCOSTO[0], ENCOSTO[1]), cinto=cinto,
                                      plataforma=(y_perto, z_perto, ANG_PLAT, comp_pl, 0.75, 0.025),
                                      montantes=(y_m, 0.42, topo_m, 0.12, 0.016), base=(y_frente, y_tras), barra=(recuo, r_b, 0.46), pinos=(0.28, 0.025),
                                      batente=BATENTE)
    faixa = [o for o in mq.raizes["cinto"].children if o.name.endswith("_cinto_faixa")][0]
    bvh_c = _bvh_de(*ck._avaliar_simples(faixa))

    bvh_barriga = _bvh_de(co, tri, _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2")))   # o tronco não mexe em relação ao cinto

    def dist_cinto(P):
        return _dist(bvh_c, P)

    def dist_apoio_mao(P):
        """A mão encosta no cinto ou na barriga em cima dele, o que vier primeiro (sem entrar em nenhum)."""
        return min(_dist(bvh_c, P), _dist(bvh_barriga, P))

    # ── 9) braços: as mãos soltas no cinto, por cima do quadril, os dedos pro meio da barriga (fotos da BLK BOX, embaixo e em cima) ─
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:                 # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, c(lado + "ForeArm") + Vector((s * 0.3, 0.0, -0.3)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
        iks[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    dedos_pose, polo_ok = {}, {}

    def por_mao(lado, W, dedos_q, palma_q, polo):
        """Punho em W, dedos pra `dedos_q` e palma pra `palma_q` (mundo), cotovelo do lado do `polo` (o da Prancha Lateral): o antebraço
        gira até a linha dos nós (indicador → mínimo) ficar na direção certa e o punho só acerta a palma, sem torcer."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        iks[lado].mute = False
        punhos[lado].location = W
        polos[lado].location = polo
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes_ = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_]
        iks[lado].mute = True
        for n, M in zip(nomes_, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        f0, f1 = c(lado + "ForeArm"), c(lado + "Hand")
        nos_q = dedos_q.cross(palma_q) * (1 if lado == "Left" else -1)
        ax = (f1 - f0).normalized()
        quer = nos_q - ax * nos_q.dot(ax)
        tem = pg._base(rig, lado)[1]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m_ = pg._base(rig, lado)[:3]
        n_m = (n_m - y_m_ * n_m.dot(y_m_)).normalized()
        F_tem = Matrix((y_m_, n_m, y_m_.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (c(lado + "Hand") - W).length

    def ponto_cinto(s):
        """Ponto da face de fora do cinto a A_MAO graus da frente (no meio da largura), a normal ali e a direção dos dedos (tangente)."""
        a = math.radians(s * A_MAO)
        d = Vector((math.sin(a), 0.0, math.cos(a)))
        loc, nor, _, _ = bvh_c.ray_cast(centro + d * 0.40 + Vector((0.0, MAO_DY, 0.0)), -d, 0.5)
        tg = Vector((-s * math.cos(math.radians(A_MAO)), 0.0, math.sin(math.radians(A_MAO))))
        return loc, nor.normalized(), (tg - nor * tg.dot(nor)).normalized()

    MAO = {L: {"n_off": 0.03, "d": None} for L, _ in LADOS}

    def braco(lado, s):
        P, n, d = ponto_cinto(s)
        if MAO[lado]["d"] is not None:
            d = MAO[lado]["d"]
        W = P + n * MAO[lado]["n_off"] - d * OFF_D
        polo = Vector((s * COTOVELO[0], H.y + COTOVELO[1], z_top + COTOVELO[2]))    # cotovelo pra fora e pra baixo, do lado do tronco
        return por_mao(lado, W, d, -n, polo)

    def alinhar(lado, s):
        """Os dedos passam a apontar pra linha do antebraço deitada no plano do cinto (o punho sem desviar de lado)."""
        P, n, _ = ponto_cinto(s)
        f_ = c(lado + "Hand") - c(lado + "ForeArm")
        f_ = (f_ - n * f_.dot(n)).normalized()
        y_ = Vector((0.0, 1.0, 0.0))
        MAO[lado]["d"] = (f_ + (y_ - n * y_.dot(n)) * DEDOS_CABECA).normalized()

    def mao_cinto(lado, so_palma=False):
        co_, _, (nm, dn) = malha()
        return dist_apoio_mao(co_[_grupo(nm, dn, (lado + "Hand",) if so_palma else tuple([lado + "Hand"] + DEDOS[lado]))])

    def encostar(lado, s, so_palma=True):
        lo, hi = MAO[lado]["n_off"] - 0.04, MAO[lado]["n_off"] + 0.04
        for _ in range(15):
            MAO[lado]["n_off"] = (lo + hi) / 2
            braco(lado, s)
            if mao_cinto(lado, so_palma) < -AFUNDA_MAO:
                lo = MAO[lado]["n_off"]
            else:
                hi = MAO[lado]["n_off"]
        MAO[lado]["n_off"] = hi
        return braco(lado, s)

    def dedos_no_cinto(lado):
        """Com a palma encostada: cada dedo (fora o polegar) gira só na base, do mais esticado (−20°) pro mais dobrado (DEDOS_MAX), até a
        pele dele encostar no cinto (−AFUNDA_MAO) — os dedos acompanham a curva do cinto (a mão relaxada)."""
        palma, eixo_nos = pg._base(rig, lado)[:2]
        for dd in p3.DEDOS:                                    # as 2 últimas falanges um pouco dobradas (mão relaxada)
            for k, g in zip((2, 3), DEDOS_RELAX):
                o = "%sHand%s%d" % (lado, dd, k)
                fd = (p3.ponta(rig, o) - c(o)).normalized()
                sinal = 1 if eixo_nos.cross(fd).dot(palma) > 0 else -1
                p3.girar_osso(rig, o, p3.rot_eixo(g * sinal, eixo_nos))
        co_, _, (nm, dn) = malha()
        out = []
        for dd in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, dd, i) for i in (1, 2, 3)]
            Pd = co_[_grupo(nm, dn, ossos)]
            h = c(ossos[0])
            fd = (p3.ponta(rig, ossos[0]) - h).normalized()
            sinal = 1 if eixo_nos.cross(fd).dot(palma) > 0 else -1
            escolha = DEDOS_MAX
            for g in np.arange(-20.0, DEDOS_MAX + 0.01, 0.5):
                if dist_apoio_mao(pg._rot(Pd, np.array(h), eixo_nos, g * sinal)) <= -AFUNDA_MAO:
                    escolha = float(g)
                    break
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo_nos))
            out.append("%s %+.1f°" % (dd, escolha))
        dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        return out

    for lado, s in LADOS:
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.6)
        dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        for _ in range(3):
            braco(lado, s)
            alinhar(lado, s)
            encostar(lado, s)
        giros = dedos_no_cinto(lado)
        e_c = encostar(lado, s, so_palma=False)
        print("MÃO %s | punho a %.1f mm do alvo | afastada %.1f mm | mão × cinto %.2f mm | dedos %s | cotovelo %.1f° | punho %.1f°" % (
            lado, e_c * 1000, MAO[lado]["n_off"] * 1000, mao_cinto(lado) * 1000, ", ".join(giros),
            ck.medir_juntas(rig)["cotovelo" + ("E" if s > 0 else "D")], ck.medir_juntas(rig)["punho" + ("E" if s > 0 else "D")]))

    base_hips = PB[p3.P + "Hips"].matrix_basis.copy()

    def pose(t):
        """t = 0 embaixo (o banco no amortecedor, BATENTE° abaixo do topo), t = 1 em cima (o banco e o tronco deitados, o quadril neutro)."""
        beta = p3.lerp(BATENTE, 0.0, t)
        PB[p3.P + "Hips"].matrix_basis = base_hips.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", Matrix.Rotation(math.radians(beta), 3, "X"), pivo=PP)
        mq.girar(beta)
        pose.beta = beta

    pose.beta = 0.0
    pose(0.5)                                                  # polos dos joelhos certos no meio do movimento
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho (meio)", lado, "erro %.3f ang %d" % e)

    def info():
        Hq = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        return "banco %.1f° | quadril y %.3f z %.3f" % (pose.beta, Hq.y, Hq.z)

    for t in (0.0, 1.0):
        pose(t)
        co, tri, (nomes, dono) = malha()
        jj = ck.posicoes(rig)
        J = ck.medir_juntas(rig)
        Hq = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        Mh = p3.mundo_osso(rig, "Hips")
        Mc = mq.raizes["cinto"].matrix_world
        rel = Mh.inverted() @ Mc
        print("t=%g | banco %.1f° | quadril y %.3f z %.3f | glúteo z %.3f | joelho %.0f/%.0f | quadril %.0f/%.0f (sinal %s) | tronco %s | "
              "canela %s | tornozelo %s | coluna %.1f | cabeça × tronco %.1f | cinto no osso Hips %s" % (
                  t, pose.beta, Hq.y, Hq.z, float(co[_grupo(nomes, dono, ("Hips", "LeftUpLeg", "RightUpLeg"))][:, 2].min()), J["joelhoE"],
                  J["joelhoD"], J["quadrilE"], J["quadrilD"], tc.valores("quadril_sinal", tc.quadril_sinal(jj)),
                  ck.angulo_chave(rig, {"medida": "tronco"}), ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Leg", "Foot"]}),
                  tc.valores("tornozelo", tc.tornozelo(jj)), tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0],
                  tuple(round(v * 1000, 2) for v in rel.to_translation())))
        MAOS = tuple(n for L, _ in LADOS for n in [L + "ForeArm", L + "Hand"] + DEDOS[L])
        bvh_coxas = _bvh_de(co, tri, _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg")))
        bvh_tronco = _bvh_de(co, tri, _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2")))
        Pm = co[_grupo(nomes, dono, MAOS)]
        alto = max(float(ck._avaliar_simples(o)[0][:, 2].max()) for r in mq.equipamentos + mq.apoios for o in ck._malhas(r))
        print("t=%g | antebraços/mãos × coxas %.1f mm, × tronco %.1f mm | máquina até z %.3f" % (
            t, _dist(bvh_coxas, Pm) * 1000, _dist(bvh_tronco, Pm) * 1000, alto))
    pose(1.0)
    co, tri, (nomes, dono) = malha()
    for lado, _ in LADOS:
        print("POLEGAR %s × cinto %.1f mm | dedos × cinto %.1f mm" % (
            lado, dist_cinto(co[_grupo(nomes, dono, tuple(n for n in DEDOS[lado] if "Thumb" in n))]) * 1000,
            dist_cinto(co[_grupo(nomes, dono, tuple(n for n in DEDOS[lado] if "Thumb" not in n))]) * 1000))
    print("MÁQUINA | %s" % mq.medidas)
    return Cena(pose, mq.equipamentos, pegadas=[], foco_luz=(0, -0.3, 0.5), camera_video=((3.6, -2.4, 1.1), (0, -0.3, 0.45), 50),
                info=info, apoios=mq.apoios, afunda_apoio_mm=10)
