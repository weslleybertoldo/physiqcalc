# Remada Unilateral com Halter (Serrote) — cena da fábrica 3D (lote 2, 04/10/2026).
# t = 0 braço direito estendido pro chão, halter pendurado embaixo do ombro e o ombro solto pra baixo · t = 1 cotovelo
# puxado pra cima e pra trás, junto do tronco, com o braço um pouco acima da horizontal e a escápula retraída.
# Joelho e mão ESQUERDOS no banco reto (ACE — Single-arm Row: "place your left knee and left hand on a bench"): coxa
# de apoio na vertical (joelho embaixo do quadril), canela deitada no estofado e o pé pendurado pra fora do banco; mão
# espalmada um pouco à frente do ombro (ExRx: "Positioning supporting knee and/or arm slightly forward or back will
# allow for proper levelling of torso"), cotovelo de apoio levemente dobrado. Perna direita quase estendida, pé
# chapado no chão um pouco atrás e pro lado (ExRx: "Position foot of opposite leg slightly back to side"). Tronco
# quase paralelo ao chão, costas retas, cabeça na linha da coluna, sem girar o tronco.
# Braço que rema igual à rosca martelo (cena aprovada): braço e antebraço calculados, pegada neutra (palma pro banco),
# mão de referência e o halter no vão da mão.
import math
import numpy as np
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

APOIO, REMA = "Left", "Right"
TOPO = 0.44            # altura do estofado (m), igual aos supinos
LARGURA = 0.30         # largura do estofado
INCLINA = 82.5         # tronco, graus da vertical: quase paralelo ao chão (ExRx "Torso should be close to horizontal");
                       # com a coxa de apoio na vertical e o braço de apoio solto, a mão fica ~14 cm à frente do ombro
                       # e o punho de apoio abaixo dos 70° de extensão (com 84° a mão ia 18 cm à frente; com 82° o
                       # punho chegava a 70°)
AFUNDA_JOELHO = 0.004  # canela de apoio afundando no estofado (m)
AFUNDA_MAO = 0.003     # palma de apoio afundando no estofado (m)
AFUNDA_DEDO = 0.0015   # pontas dos dedos de apoio encostando no estofado (m)
CANELA = 2             # canela de apoio descendo um pouco pro tornozelo, graus abaixo da horizontal (deitada no
                       # estofado; o tornozelo e o pé ficam pra fora do banco, atrás)
NO_BANCO = 0.06        # só a pele da canela até 6 cm antes do tornozelo conta pro apoio (o resto fica pra fora)
PLANTAR = 25           # pé de apoio pendurado pra fora do banco, relaxado (flexão plantar, graus)
PE_D = (-0.07, 0.16)   # tornozelo direito em relação à articulação do quadril direito (m): pro lado e pra trás, com
                       # a perna quase estendida (com o pé 7 cm atrás a coxa ficava em pé e o halter entrava 37 mm
                       # nela em cima)
COTOVELO_APOIO = 12    # flexão do cotovelo de apoio (graus): solto, sem travar — a mão vai à frente do ombro o que
                       # for preciso pra palma chegar no banco com essa dobra
MAO_DENTRO = 0.02      # punho de apoio pra dentro do ombro (m)
DEDOS_GIRO = 8         # dedos da mão de apoio virados pra dentro (graus)
ALFA = (0, 105)        # braço que rema (ombro → cotovelo) pra trás da vertical, graus: pendurado → ~15° acima da
                       # horizontal (ExRx: "until upper arm is just beyond horizontal")
GAMA = (6, 8)          # antebraço à frente da vertical, graus: o halter pende quase reto embaixo do cotovelo e em cima
                       # fica do lado da cintura, à frente da coxa direita
BETA = (5, 10)         # braço aberto pra fora do plano do tronco, graus: cotovelo junto do tronco, sem encostar
ESCAPULA = (7, -8)     # giro da escápula direita em volta do eixo do tronco, graus: + protração (ombro desce pro
                       # chão, ExRx "shoulder is stretched downward") → − retração (ExRx "Allow scapula to articulate")
RAIO = 0.0145          # pegada do halter: 29 mm, o cilindro da mão de referência (igual à rosca martelo)
PEGADA_H = 0.13        # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    tornozelo_z = p3.cabeca(rig, "RightFoot").z                                    # pé chapado em pé

    # ── pernas por IK: alvos nascem no tornozelo de repouso (alvo = polo dá NaN) ─────────────────────────────────
    tornozelos, polos_j, pernas = {}, {}, {}
    for lado, s in (("Left", 1), ("Right", -1)):
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos_j[lado] = p3.vazio("polo_joelho_" + lado, (s * 0.15, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos_j[lado])
    p3.travar_rotacao(rig, REMA + "Foot")                  # pé direito chapado no chão
    rot_pe_apoio = p3.travar_rotacao(rig, APOIO + "Foot")   # pé de apoio: gira com a canela (abaixo)
    M_pe_apoio = rot_pe_apoio.matrix_world.copy()
    d0 = (p3.cabeca(rig, APOIO + "Foot") - p3.cabeca(rig, APOIO + "Leg")).normalized()   # canela em pé
    d1 = Vector((0, math.cos(math.radians(CANELA)), -math.sin(math.radians(CANELA))))   # canela deitada, pra trás
    R_pe = p3.rot_x(PLANTAR) @ d0.rotation_difference(d1).to_matrix()

    # ── braços por IK (o de apoio fica parado; o direito rema) ───────────────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado in ("Left", "Right"):
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    halter = e3.halter("halter", pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA)

    def _corpo(zq):
        """Tronco inclinado INCLINA graus em volta das articulações do quadril (que ficam na altura zq), coxa de apoio
        na vertical com a canela deitada pra trás e o pé direito no chão."""
        for n in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((0, 0, zq - pivo.z)))
        qe, qd = p3.cabeca(rig, APOIO + "UpLeg"), p3.cabeca(rig, REMA + "UpLeg")
        joelho = qe - Vector((0, 0, coxa))                                 # joelho embaixo do quadril (ACE)
        tornozelos[APOIO].location = joelho + d1 * canela
        polos_j[APOIO].location = joelho + Vector((0, -0.5, -0.35))         # joelho aponta pra frente e pra baixo
        rot_pe_apoio.matrix_world = R_pe.to_4x4() @ M_pe_apoio
        tornozelos[REMA].location = Vector((qd.x + PE_D[0], qd.y + PE_D[1], tornozelo_z))
        polos_j[REMA].location = Vector((qd.x + PE_D[0] * 0.5, qd.y - 1.0, 0.55))
        p3.atualizar()
        return joelho

    def _pele(partes):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    def _canela_no_banco():
        """Pele da perna de apoio em cima do banco (até NO_BANCO antes do tornozelo, que fica pra fora)."""
        P = _pele((APOIO + "Leg",))
        return P[P[:, 1] < tornozelos[APOIO].location.y - NO_BANCO]

    # altura do quadril: a canela de apoio afunda AFUNDA_JOELHO no estofado (2 voltas: polo dos joelhos → altura)
    zq = 0.915
    for volta in range(2):
        _corpo(zq)
        for lado in ("Left", "Right"):
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            print("polo joelho", lado, "erro %.3f ang %d" % e)
        for _ in range(3):
            _corpo(zq)
            zq += (TOPO - AFUNDA_JOELHO) - _canela_no_banco()[:, 2].min()
    joelho = _corpo(zq)
    print("QUADRIL z %.3f | joelho de apoio (%.3f %.3f %.3f) | tornozelo de apoio (%.3f %.3f %.3f)" % (
        zq, *joelho, *tornozelos[APOIO].location))

    # ── mão de apoio espalmada no banco (uma vez só: o braço de apoio não mexe) ──────────────────────────────────
    S_apoio = p3.cabeca(rig, APOIO + "Arm")
    a = math.radians(DEDOS_GIRO)
    dedos_q = Vector((-math.sin(a), -math.cos(a), 0))      # dedos pra frente, um pouco pra dentro
    palma_q = Vector((0, 0, -1))                            # palma pro estofado

    def _congelar(lado):
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def _girar_antebraco(lado, quer):
        """Prona/supina o antebraço pra palma (com a mão reta no antebraço) ir pra `quer` (projetado ⟂ antebraço)."""
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = (quer - ax * quer.dot(ax)).normalized()
        tem = pg._base(rig, lado)[0]
        tem = (tem - ax * tem.dot(ax)).normalized()
        ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
        p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))

    def _esticar_dedos(lado):
        """Dedos esticados e deitados no plano da palma (a mão de repouso tem os dedos meio dobrados pra palma)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.5)
        for d in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, d, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if d == "Thumb":                     # polegar deitado do lado do indicador, encostando de leve
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def _dedos_no_banco(lado, alvo_z):
        """Cada dedo (fora o polegar) dobra ou estica só na base até a pele encostar no estofado: com os dedos no
        plano da palma eles ficavam 12 mm acima dele (a palma tem as almofadas mais baixas que os dedos)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        palma, eixo_nos = pg._base(rig, lado)[:2]
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
            P = co[np.array([n in ossos for n in nomes] + [False])[dono]]
            h = p3.cabeca(rig, ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1     # + = dobra pro lado da palma (pro banco)
            escolha = 0.0
            for g in np.arange(-15.0, 30.01, 0.5):
                if pg._rot(P, np.array(h), eixo_nos, g * sinal)[:, 2].min() <= alvo_z:
                    escolha = float(g)
                    break
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo_nos))

    def _apoiar(W):
        iks[APOIO].mute = False
        punhos[APOIO].location = W
        p3.atualizar()
        _congelar(APOIO)
        _girar_antebraco(APOIO, palma_q)
        h0 = p3.cabeca(rig, APOIO + "Hand")                 # o resto no punho: dedos pra frente, palma pra baixo
        y_m = (p3.ponta(rig, APOIO + "Hand") - h0).normalized()
        n_m = pg._base(rig, APOIO)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, APOIO + "Hand", F_quer @ F_tem.transposed())
        _esticar_dedos(APOIO)
        _dedos_no_banco(APOIO, TOPO - AFUNDA_DEDO)

    alcance = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO_APOIO)))   # ombro → punho

    def _a_frente(W):
        """Punho à frente do ombro o quanto o braço com COTOVELO_APOIO de dobra alcança, na altura W.z."""
        dz, dx = S_apoio.z - W.z, MAO_DENTRO
        return Vector((S_apoio.x - dx, S_apoio.y - math.sqrt(max(alcance ** 2 - dz ** 2 - dx ** 2, 0.0)), W.z))

    W = _a_frente(Vector((0, 0, TOPO + 0.009)))
    polos[APOIO].location = (S_apoio + W) / 2 + Vector((0.25, 0.45, 0))       # cotovelo pra trás e pra fora
    iks[APOIO].mute = False
    punhos[APOIO].location = W
    p3.atualizar()
    e = p3.acertar_polo(rig, iks[APOIO], APOIO + "ForeArm", APOIO + "Arm", APOIO + "Hand")
    print("polo cotovelo de apoio erro %.3f ang %d" % e)
    for _ in range(5):                                      # palma afundando AFUNDA_MAO no estofado
        _apoiar(W)
        W.z += (TOPO - AFUNDA_MAO) - _pele((APOIO + "Hand",))[:, 2].min()
        W = _a_frente(W)
    _apoiar(W)
    ossos_apoio = sorted((pb.name for pb in PB
                          if pb.name[len(p3.P):].startswith((APOIO + "Arm", APOIO + "ForeArm", APOIO + "Hand"))),
                         key=lambda n: len(PB[n].parent_recursive))
    apoio_mats = [(n, PB[n].matrix.copy()) for n in ossos_apoio]
    mao_pele = _pele(tuple(n[len(p3.P):] for n in ossos_apoio if "Hand" in n))
    print("MÃO DE APOIO punho (%.3f %.3f %.3f) | pele mais baixa z %.4f | dedos y até %.3f" % (
        *W, mao_pele[:, 2].min(), mao_pele[:, 1].min()))

    # ── banco: estofado debaixo da mão e do joelho de apoio, pé de apoio pendurado pra fora atrás ───────────────
    y_frente = float(mao_pele[:, 1].min()) - 0.08
    pe_pele = _pele((APOIO + "Foot", APOIO + "ToeBase"))
    y_tras = min(float(tornozelos[APOIO].location.y) - 0.05, float(pe_pele[:, 1].min()) - 0.012)
    x_banco = (joelho.x + W.x) / 2
    banco = e3.banco("banco", y_frente, y_tras, topo=TOPO, largura=LARGURA)
    banco.location.x = x_banco
    p3.atualizar()
    print("BANCO x %.3f | y %.3f → %.3f (%.2f m)" % (x_banco, y_frente, y_tras, y_tras - y_frente))

    # ── braço que rema ───────────────────────────────────────────────────────────────────────────────────────
    def _escapula(t):
        PB[p3.P + REMA + "Shoulder"].matrix_basis = Matrix()
        p3.atualizar()
        g = p3.lerp(*ESCAPULA, t)
        if g:
            cima = (p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).normalized()
            p3.girar_osso(rig, REMA + "Shoulder", Matrix.Rotation(math.radians(g), 3, cima))

    def _alvo_rema(t):
        _escapula(t)
        S = p3.cabeca(rig, REMA + "Arm")
        al, ga, be = (math.radians(p3.lerp(*x, t)) for x in (ALFA, GAMA, BETA))
        u = Vector((0, math.sin(al), -math.cos(al))) * math.cos(be) + Vector((-math.sin(be), 0, 0))
        E = S + u * Lb
        Wr = E + Vector((0, -math.sin(ga), -math.cos(ga))) * La
        iks[REMA].mute = False
        punhos[REMA].location = Wr
        eixo = (Wr - S).normalized()                     # polo do lado em que o cotovelo calculado fica
        fora = (E - S) - eixo * (E - S).dot(eixo)
        polos[REMA].location = E + (fora.normalized() if fora.length > 1e-4 else Vector((0, -1, 0))) * 0.4
        p3.atualizar()
        return S, E, Wr

    def _restaurar_apoio():
        iks[APOIO].mute = True
        for n, M in apoio_mats:
            PB[n].matrix = M
            p3.atualizar()

    def pose(t):
        """t=0 braço estendido pro chão, t=1 cotovelo em cima, junto do tronco."""
        _restaurar_apoio()
        _alvo_rema(t)
        _congelar(REMA)
        pg.mao_de_referencia(rig, REMA)
        _girar_antebraco(REMA, Vector((1, 0, 0)))        # pegada neutra: palma pro banco (pro meio do corpo)
        pg.mao_de_referencia(rig, REMA)
        g, _ = pg.ponto_na_mao(bon, REMA, RAIO)
        eixo = pg._base(rig, REMA)[1]                     # o halter fica na linha dos nós dos dedos
        halter.rotation_mode = "QUATERNION"
        halter.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
        halter.location = g
        p3.atualizar()
        antes = pose.dedos.get("Thumb") if t > 0 else None
        pose.dedos = pg.fechar_em_volta(bon, REMA, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    _alvo_rema(0.5)                                       # polo certo do cotovelo no meio do movimento
    e = p3.acertar_polo(rig, iks[REMA], REMA + "ForeArm", REMA + "Arm", REMA + "Hand")
    print("polo cotovelo", REMA, "erro %.3f ang %d" % e)

    def info():
        """Pele da mão e da canela de apoio até o estofado, punho de apoio, cotovelo que rema em relação ao ombro."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = lambda *ps: co[np.array([n in ps for n in nomes] + [False])[dono]]
        palma = m(APOIO + "Hand")
        dedos = m(*["%sHand%s%d" % (APOIO, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)])
        perna = m(APOIO + "Leg")
        perna = perna[perna[:, 1] < y_tras]                  # só a pele em cima do banco
        jt = ck.medir_juntas(rig)
        S, E = p3.cabeca(rig, REMA + "Arm"), p3.cabeca(rig, REMA + "ForeArm")
        Wd = p3.cabeca(rig, REMA + "Hand")
        ante = math.degrees(math.atan2(-(Wd - E).y, -(Wd - E).z))
        return ("apoio: palma %+.1f mm, dedos %+.1f mm, canela %+.1f mm do estofado, punho %.0f°, cotovelo %.0f° | "
                "rema: cotovelo %+.0f mm acima do ombro, antebraço %+.0f° à frente da vertical, ombro z %.3f" % (
                    (palma[:, 2].min() - TOPO) * 1000, (dedos[:, 2].min() - TOPO) * 1000,
                    (perna[:, 2].min() - TOPO) * 1000, jt["punhoE"], jt["cotoveloE"],
                    (E.z - S.z) * 1000, ante, S.z))

    pegs = [(REMA, ck.Barra(halter, raio=RAIO, meio_compr=PEGADA_H / 2))]
    return Cena(pose, [halter], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 0.7),
                camera_video=((-3.3, -2.1, 1.45), (0.0, -0.2, 0.65), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
