# Tríceps Coice com Halter — cena da fábrica 3D (lote 10, 10/10/2026; 0 usos nos treinos prontos e 6 como troca equivalente).
# t = 0 começo: joelho e mão ESQUERDOS no banco reto, tronco quase paralelo ao chão, o braço direito parado na horizontal junto
#       do tronco e o antebraço pendurado na vertical (cotovelo a 90°), com o halter embaixo do cotovelo, em pegada neutra
# t = 1 fim: só o cotovelo estendeu — o braço inteiro esticado pra trás, na linha do corpo, o halter ao lado do quadril.
# O app faz a volta (o antebraço desce até ficar pendurado de novo).
# Técnica (fontes na ficha, com as frases):
#   • ExRx, Dumbbell Kickback: "Kneel over bench with arm supporting body. Grasp dumbbell. Position upper arm parallel to
#     floor." / "Extend arm until it is straight. Return and repeat. Continue with opposite arm."; ExRx, Kinesiology Errors —
#     Dumbbell Triceps Kickback (elbow too low): "upper arm needs to be positioned horizontal" / "exerciser merely tries to bend
#     over slightly (typically without arm support) thinking that will do." → COM APOIO no banco, o braço na horizontal.
#   • Catalyst Athletics, Tricep Kickback: "Support yourself with one knee and hand on a bench with the trunk horizontal. Hold a
#     dumbbell in the free hand with the palm facing inward. Keep the upper arm horizontal and against your side, and extend the
#     elbow completely, then return to the start under control." → pegada neutra (palma pro corpo), braço colado ao lado.
#   • ACE, Triceps Kickback (e o estudo da "Base" da dica, Boehler et al., ACE 2011–2012 — feito EM PÉ, com a outra mão na coxa):
#     "Position the your left upper arm parallel to, and close to, your torso. Bend your elbow to 90 degrees or at least to a
#     point where your forearm hangs vertical to the floor." / "Your upper arm should remain stationary next to your torso and not
#     raised during the movement." / "Depress and retract your left scapula (pull your shoulder down and back) and maintain this
#     position throughout the exercise. Your head should be aligned with your spine."
# Montagem: o corpo e o banco são os da Remada Unilateral com Halter (Serrote), cena aprovada: joelho e mão esquerdos no banco
# reto (coxa de apoio na vertical, canela deitada no estofado, mão espalmada um pouco à frente do ombro, cotovelo de apoio solto),
# perna direita quase estendida com o pé chapado no chão (PE_D: só 3 cm pro lado, pra coxa sair do caminho do halter), tronco
# INCLINA graus da vertical (quase paralelo ao chão), costas retas e cabeça na linha da coluna. O braço direito fica PARADO:
# escápula retraída (ESCAPULA) e abaixada (DESCE), braço paralelo ao chão (BRACO graus acima da horizontal) e ABRE graus pra fora
# do plano do tronco — a pele do braço encosta na do tronco —, um pouco girado pra fora (GIRO: o antebraço pendurado sai 6° da
# vertical, pro lado de fora, e o halter passa por fora da coxa direita); só o cotovelo mexe, como dobradiça e sem o IK do Blender
# (perto de esticado o IK trava o braço reto — Tríceps Francês com Halter, lote 7): de COTOVELO[0] (antebraço pendurado) até
# COTOVELO[1] (esticado, na linha do braço). O antebraço fica com a palma virada pro corpo (pegada neutra) e o punho reto; a mão
# de referência, o halter no vão dela (na linha dos nós dos dedos) e o polegar novo dando a volta no pegador saem UMA vez (a mão
# não mexe em relação ao halter) e vão juntos com o antebraço em todos os quadros.
import math
import numpy as np
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

APOIO, TRABALHA = "Left", "Right"
TOPO = 0.44            # altura do estofado (m), igual à do Serrote e dos supinos
LARGURA = 0.30         # largura do estofado
INCLINA = 82.5         # tronco, graus da vertical: quase paralelo ao chão (Catalyst: "with the trunk horizontal"); o mesmo do
                       # Serrote, com a mão de apoio ~14 cm à frente do ombro e o punho de apoio abaixo dos 70° de extensão
AFUNDA_JOELHO = 0.004  # canela de apoio afundando no estofado (m)
AFUNDA_MAO = 0.003     # palma de apoio afundando no estofado (m)
AFUNDA_DEDO = 0.0015   # pontas dos dedos de apoio encostando no estofado (m)
CANELA = 2             # canela de apoio descendo um pouco pro tornozelo, graus abaixo da horizontal
NO_BANCO = 0.06        # só a pele da canela até 6 cm antes do tornozelo conta pro apoio (o resto fica pra fora)
PLANTAR = 25           # pé de apoio pendurado pra fora do banco, relaxado (flexão plantar, graus)
PE_D = (-0.03, 0.16)   # tornozelo direito em relação à articulação do quadril direito (m): atrás e um pouco pro lado (ExRx,
                       # Dumbbell Bent-over Row: "Position foot of opposite leg slightly back to side"). Menos pro lado que no
                       # Serrote (−0,07, 0,16): a coxa direita fica mais longe do caminho do halter — no começo da ida a anilha
                       # passa a 17 mm da coxa (checagem de 25 quadros; na sonda, com o pé do Serrote, ficava 9 mm mais perto);
                       # com o pé 26 cm atrás a perna esticava toda e o pé ficava 18 mm acima do chão
COTOVELO_APOIO = 12    # flexão do cotovelo de apoio (graus): solto, sem travar
MAO_DENTRO = 0.02      # punho de apoio pra dentro do ombro (m)
DEDOS_GIRO = 8         # dedos da mão de apoio virados pra dentro (graus)
ESCAPULA = -8          # escápula direita girada em volta do eixo do tronco, graus (− = retraída, parada o movimento todo)
DESCE = 5              # e abaixada (o ombro direito vai pro lado do quadril), graus: ACE, "Depress and retract your left
                       # scapula (pull your shoulder down and back) and maintain this position throughout the exercise"
BRACO = 0              # braço direito acima da horizontal, graus (ExRx: "Position upper arm parallel to floor")
ABRE = 12              # braço direito pra fora do plano do tronco, graus: a pele do braço encosta na do tronco (colado ao
                       # lado, Catalyst: "against your side") sem entrar nele
GIRO = 6               # braço girado pra fora em volta do próprio eixo (rotação externa do ombro), graus: o antebraço
                       # pendurado sai esse tanto da vertical, pro lado de fora, e o halter passa por fora da coxa direita
                       # (com o antebraço a prumo, a anilha de dentro entrava até 21 mm na coxa no começo da ida; abrindo só
                       # o braço, a 16°, ela ainda raspava na coxa — 0 mm — e o braço descolava 10 mm do tronco)
COTOVELO = (90, 3)     # flexão do cotovelo direito, graus: antebraço pendurado na vertical → esticado (ACE: "Bend your elbow
                       # to 90 degrees or at least to a point where your forearm hangs vertical to the floor"; ExRx: "Extend
                       # arm until it is straight")
REF = 45               # flexão do cotovelo na pose de referência (IK uma vez só, pro FK do braço)
RAIO = 0.0145          # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13        # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05


def montar(bon):
    pg.usar_polegar("volta")                           # polegar dando a volta no halter (exercícios novos, 05/10/2026)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    Lb = {l: (c(l + "ForeArm") - c(l + "Arm")).length for l in ("Left", "Right")}       # braço
    La = {l: (c(l + "Hand") - c(l + "ForeArm")).length for l in ("Left", "Right")}      # antebraço
    coxa = (c("LeftLeg") - c("LeftUpLeg")).length
    canela = (c("LeftFoot") - c("LeftLeg")).length
    tornozelo_z = c("RightFoot").z                                                      # pé chapado em pé

    # ── pernas por IK: alvos nascem no tornozelo de repouso (alvo = polo dá NaN) ─────────────────────────────────────
    tornozelos, polos_j, pernas = {}, {}, {}
    for lado, s in (("Left", 1), ("Right", -1)):
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos_j[lado] = p3.vazio("polo_joelho_" + lado, (s * 0.15, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos_j[lado])
    p3.travar_rotacao(rig, TRABALHA + "Foot")              # pé direito chapado no chão
    rot_pe_apoio = p3.travar_rotacao(rig, APOIO + "Foot")   # pé de apoio: gira com a canela (abaixo)
    M_pe_apoio = rot_pe_apoio.matrix_world.copy()
    d0 = (c(APOIO + "Foot") - c(APOIO + "Leg")).normalized()                            # canela em pé
    d1 = Vector((0, math.cos(math.radians(CANELA)), -math.sin(math.radians(CANELA))))   # canela deitada, pra trás
    R_pe = p3.rot_x(PLANTAR) @ d0.rotation_difference(d1).to_matrix()

    # ── braços por IK (o de apoio fica parado; o direito só serve de referência pro FK) ──────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado in ("Left", "Right"):
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, c(lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    halter = e3.halter("halter", pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA, larg_anilha=LARG_ANILHA)
    halter.rotation_mode = "QUATERNION"

    def _corpo(zq):
        """Tronco inclinado INCLINA graus em volta das articulações do quadril (que ficam na altura zq), coxa de apoio na
        vertical com a canela deitada pra trás e o pé direito no chão (a montagem do Serrote)."""
        for n in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((0, 0, zq - pivo.z)))
        qe, qd = c(APOIO + "UpLeg"), c(TRABALHA + "UpLeg")
        joelho = qe - Vector((0, 0, coxa))                                 # joelho embaixo do quadril
        tornozelos[APOIO].location = joelho + d1 * canela
        polos_j[APOIO].location = joelho + Vector((0, -0.5, -0.35))         # joelho aponta pra frente e pra baixo
        rot_pe_apoio.matrix_world = R_pe.to_4x4() @ M_pe_apoio
        tornozelos[TRABALHA].location = Vector((qd.x + PE_D[0], qd.y + PE_D[1], tornozelo_z))
        polos_j[TRABALHA].location = Vector((qd.x + PE_D[0] * 0.5, qd.y - 1.0, 0.55))
        p3.atualizar()
        return joelho

    def _pele(partes, niveis=1):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
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

    # ── mão de apoio espalmada no banco (uma vez só: o braço de apoio não mexe) ──────────────────────────────────────
    S_apoio = c(APOIO + "Arm")
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
        f0, f1 = c(lado + "ForeArm"), c(lado + "Hand")
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
                f = p3.ponta(rig, o) - c(o)
                plano = f - palma * f.dot(palma)
                if d == "Thumb":                     # polegar deitado do lado do indicador, encostando de leve
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def _dedos_no_banco(lado, alvo_z):
        """Cada dedo (fora o polegar) dobra ou estica só na base até a pele encostar no estofado."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        palma, eixo_nos = pg._base(rig, lado)[:2]
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
            P = co[np.array([n in ossos for n in nomes] + [False])[dono]]
            h = c(ossos[0])
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
        h0 = c(APOIO + "Hand")                              # o resto no punho: dedos pra frente, palma pra baixo
        y_m = (p3.ponta(rig, APOIO + "Hand") - h0).normalized()
        n_m = pg._base(rig, APOIO)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, APOIO + "Hand", F_quer @ F_tem.transposed())
        _esticar_dedos(APOIO)
        _dedos_no_banco(APOIO, TOPO - AFUNDA_DEDO)

    alcance = math.sqrt(Lb[APOIO] ** 2 + La[APOIO] ** 2 +
                        2 * Lb[APOIO] * La[APOIO] * math.cos(math.radians(COTOVELO_APOIO)))   # ombro → punho

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

    # ── banco: estofado debaixo da mão e do joelho de apoio, pé de apoio pendurado pra fora atrás ───────────────────
    y_frente = float(mao_pele[:, 1].min()) - 0.08
    pe_pele = _pele((APOIO + "Foot", APOIO + "ToeBase"))
    y_tras = min(float(tornozelos[APOIO].location.y) - 0.05, float(pe_pele[:, 1].min()) - 0.012)
    x_banco = (joelho.x + W.x) / 2
    banco = e3.banco("banco", y_frente, y_tras, topo=TOPO, largura=LARGURA)
    banco.location.x = x_banco
    p3.atualizar()
    print("BANCO x %.3f | y %.3f → %.3f (%.2f m)" % (x_banco, y_frente, y_tras, y_tras - y_frente))

    def _restaurar_apoio():
        iks[APOIO].mute = True
        for n, M in apoio_mats:
            PB[n].matrix = M
            p3.atualizar()

    # ── braço que trabalha: escápula retraída e braço PARADOS; o cotovelo é uma dobradiça ───────────────────────────
    PB[p3.P + TRABALHA + "Shoulder"].matrix_basis = Matrix()
    p3.atualizar()
    cima = (c("Neck") - c("Hips")).normalized()
    S0 = c(TRABALHA + "Arm")
    if ESCAPULA:
        p3.girar_osso(rig, TRABALHA + "Shoulder", Matrix.Rotation(math.radians(ESCAPULA), 3, cima))
    if DESCE:                                          # em volta do eixo peito–costas do tronco, pro lado que leva o ombro
        lado_t = (c("RightArm") - c("LeftArm"))        # pro quadril
        lado_t = (lado_t - cima * lado_t.dot(cima)).normalized()
        eixo_pc = cima.cross(lado_t).normalized()
        antes = c(TRABALHA + "Arm")
        p3.girar_osso(rig, TRABALHA + "Shoulder", Matrix.Rotation(math.radians(DESCE), 3, eixo_pc))
        if (c(TRABALHA + "Arm") - antes).dot(cima) > 0:
            p3.girar_osso(rig, TRABALHA + "Shoulder", Matrix.Rotation(math.radians(-2 * DESCE), 3, eixo_pc))
    S = c(TRABALHA + "Arm")
    desce_mm = -(S - S0).dot(cima) * 1000
    frente = cima.cross((c("RightArm") - c("LeftArm")).normalized()).normalized()     # pro peito (tecnica3d.eixos_tronco)
    print("ESCÁPULA D: ombro %.1f mm pro quadril, %+.1f mm pro peito (− = pras costas)" % (desce_mm, (S - S0).dot(frente) * 1000))
    lb, la = Lb[TRABALHA], La[TRABALHA]
    al, be = math.radians(90 + BRACO), math.radians(ABRE)
    u = (Vector((0, math.sin(al), -math.cos(al))) * math.cos(be) + Vector((-math.sin(be), 0, 0))).normalized()
    E = S + u * lb
    baixo = Vector((0, 0, -1))
    w = (baixo - u * baixo.dot(u)).normalized()       # ⟂ ao braço, no plano vertical do braço, pro lado do chão
    w = Matrix.Rotation(math.radians(GIRO), 3, u) @ w  # rotação externa: o antebraço pendurado vai GIRO graus pra fora
    print("BRAÇO ombro (%.3f %.3f %.3f) | cotovelo (%.3f %.3f %.3f) | braço %.3f m, antebraço %.3f m" % (*S, *E, lb, la))

    def antebraco(b):
        """Direção do antebraço (cotovelo → punho) com o cotovelo dobrado b graus: 0 = na linha do braço, 90 = pendurado
        (com o braço na horizontal)."""
        r = math.radians(b)
        return u * math.cos(r) + w * math.sin(r)

    # referência do FK: o braço dobrado que o IK acha com o cotovelo a REF graus, com o cotovelo levado exatamente pro E
    Wr = E + antebraco(REF) * la
    iks[TRABALHA].mute = False
    punhos[TRABALHA].location = Wr
    eixo = (Wr - S).normalized()
    fora = (E - S) - eixo * (E - S).dot(eixo)
    polos[TRABALHA].location = E + fora.normalized() * 0.4
    p3.atualizar()
    e = p3.acertar_polo(rig, iks[TRABALHA], TRABALHA + "ForeArm", TRABALHA + "Arm", TRABALHA + "Hand")
    print("polo cotovelo", TRABALHA, "erro %.3f ang %d" % e)
    _congelar(TRABALHA)
    Rr = (c(TRABALHA + "ForeArm") - S).normalized().rotation_difference(u).to_matrix().to_4x4()
    Rs = Matrix.Translation(S) @ Rr @ Matrix.Translation(-S)          # cotovelo exatamente em E
    ref = dict(MA=Rs @ PB[p3.P + TRABALHA + "Arm"].matrix, MF=Rs @ PB[p3.P + TRABALHA + "ForeArm"].matrix)
    fr = (Rs @ c(TRABALHA + "Hand") - Rs @ c(TRABALHA + "ForeArm")).normalized()
    ref["n"], ref["b"] = u.cross(fr).normalized(), u.angle(fr)

    def braco_fk(Wq):
        """Braço parado (só gira em volta do próprio eixo se o plano da dobra mudar) e o cotovelo dobrando como dobradiça
        (eixo fixo no braço) até o punho cair em Wq — exato, sem o IK do Blender (como no Tríceps Francês com Halter)."""
        f = (Wq - E).normalized()
        n = u.cross(f)
        n = n.normalized() if n.length > 1e-6 else ref["n"]
        fi = math.atan2(ref["n"].cross(n).dot(u), ref["n"].dot(n))
        Rt = Matrix.Translation(S) @ Matrix.Rotation(fi, 4, u) @ Matrix.Translation(-S)
        Rh = Matrix.Translation(E) @ Matrix.Rotation(u.angle(f) - ref["b"], 4, n) @ Matrix.Translation(-E)
        PB[p3.P + TRABALHA + "Arm"].matrix = Rt @ ref["MA"]
        p3.atualizar()
        PB[p3.P + TRABALHA + "ForeArm"].matrix = Rh @ Rt @ ref["MF"]
        p3.atualizar()

    # pegada neutra (palma virada pro corpo, pro lado do banco), com a mão reta no antebraço: o antebraço gira em volta do
    # próprio eixo uma vez, na referência, e a dobradiça mantém o giro em todos os quadros
    braco_fk(Wr)
    pg.mao_de_referencia(rig, TRABALHA)
    _girar_antebraco(TRABALHA, Vector((1, 0, 0)))
    ref["MF"] = PB[p3.P + TRABALHA + "ForeArm"].matrix.copy()
    braco_fk(Wr)

    # a mão fecha no halter UMA vez (o halter fica no vão da mão de referência, na linha dos nós dos dedos, e o polegar
    # novo dá a volta no pegador); depois ela e o halter só acompanham o antebraço
    pg.mao_de_referencia(rig, TRABALHA)
    g, envolve = pg.ponto_na_mao(bon, TRABALHA, RAIO)
    eixo_h = pg._base(rig, TRABALHA)[1]
    halter.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo_h)
    halter.location = g
    p3.atualizar()
    dedos = pg.fechar_em_volta(bon, TRABALHA, g, eixo_h, RAIO)
    print("PEGADA vão (%.3f %.3f %.3f) envolve %.0f° | dedos %s" % (*g, envolve, dedos))
    ossos_mao = [pb.name for pb in PB if pb.name[len(p3.P):].startswith(TRABALHA + "Hand") and pb.name != p3.P + TRABALHA + "Hand"]
    pose_dedos = {n: PB[n].matrix_basis.copy() for n in ossos_mao}
    H_rel = p3.mundo_osso(rig, TRABALHA + "Hand").inverted() @ halter.matrix_world

    def pose(t):
        """t=0 antebraço pendurado na vertical (cotovelo a 90°), t=1 braço esticado pra trás na linha do corpo."""
        _restaurar_apoio()
        b = p3.lerp(*COTOVELO, t)
        braco_fk(E + antebraco(b) * la)
        for n, M in pose_dedos.items():
            PB[n].matrix_basis = M
        p3.atualizar()
        loc, rot, _ = (p3.mundo_osso(rig, TRABALHA + "Hand") @ H_rel).decompose()
        halter.location = loc
        halter.rotation_quaternion = rot
        p3.atualizar()
        pose.b = b

    pose.b = COTOVELO[0]

    def _cilindros():
        M = halter.matrix_world
        return np.array(M.to_translation()), np.array((M.to_3x3() @ Vector((1, 0, 0))).normalized())

    def _dist_halter(P):
        """Menor distância (m, − = dentro) dos pontos P até o halter (as 2 anilhas e o eixo, cilindros fechados)."""
        cc, ux = _cilindros()
        d = P - cc
        a_ = d @ ux
        rho = np.linalg.norm(d - np.outer(a_, ux), axis=1)
        menor = 1e9
        meio = PEGADA_H / 2
        for lo, hi, r in ((-meio - LARG_ANILHA, -meio, RAIO_ANILHA), (meio, meio + LARG_ANILHA, RAIO_ANILHA),
                          (-meio - LARG_ANILHA - 0.01, meio + LARG_ANILHA + 0.01, RAIO)):
            fora_ = np.hypot(np.maximum(np.maximum(lo - a_, a_ - hi), 0.0), np.maximum(rho - r, 0.0))
            dentro = (a_ > lo) & (a_ < hi) & (rho < r)
            prof = np.minimum(np.minimum(a_ - lo, hi - a_), r - rho)
            menor = min(menor, float(np.where(dentro, -prof, fora_).min()))
        return menor

    def _mao_x_anilhas(co, nomes, dono):
        """Menor distância (mm, − = dentro) da pele da mão (palma, dedos e polegar) até as 2 anilhas: a checagem de peso ×
        corpo não olha a mão (o que fica dentro dela é assunto da pegada)."""
        m = np.array([n.startswith(TRABALHA + "Hand") for n in nomes] + [False])[dono]
        cc, ux = _cilindros()
        d = co[m] - cc
        a_ = d @ ux
        rho = np.linalg.norm(d - np.outer(a_, ux), axis=1)
        pior = 1e9
        for s in (-1, 1):
            lo, hi = sorted((s * PEGADA_H / 2, s * (PEGADA_H / 2 + LARG_ANILHA)))
            fora_ = np.hypot(np.maximum(np.maximum(lo - a_, a_ - hi), 0.0), np.maximum(rho - RAIO_ANILHA, 0.0))
            dentro = (a_ > lo) & (a_ < hi) & (rho < RAIO_ANILHA)
            prof = np.minimum(np.minimum(a_ - lo, hi - a_), RAIO_ANILHA - rho)
            pior = min(pior, float(np.where(dentro, -prof, fora_).min()))
        return pior * 1000

    def info():
        """Braço que trabalha (inclinação, pro lado, à frente do tronco), cotovelo e punho, halter × pele (tronco, coxa
        direita, braço, antebraço), mão × anilhas, polegar, e o apoio (palma, dedos e canela até o estofado)."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = lambda *ps: co[np.array([n in ps for n in nomes] + [False])[dono]]
        jt = ck.medir_juntas(rig)
        j = ck.posicoes(rig)
        Sd, Ed = c(TRABALHA + "Arm"), c(TRABALHA + "ForeArm")
        inc = math.degrees(math.atan2(-(Ed - Sd).z, math.hypot((Ed - Sd).x, (Ed - Sd).y)))
        palma = m(APOIO + "Hand")
        dedos_a = m(*["%sHand%s%d" % (APOIO, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)])
        perna = m(APOIO + "Leg")
        perna = perna[perna[:, 1] < y_tras]
        h = halter.matrix_world.to_translation()
        pol = dedos.get("Thumb")
        tr = np.array([n in ("Hips", "Spine", "Spine1", "Spine2") for n in nomes] + [False])[dono]
        bvh_t = ck._bvh(co, tri[tr[tri].all(axis=1)])
        Sd0 = np.array(Sd)
        braco = m(TRABALHA + "Arm")
        braco = braco[np.linalg.norm(braco - Sd0, axis=1) > 0.15]
        gap = min(bvh_t.find_nearest(Vector(v))[3] for v in braco[::2]) if len(braco) else float("nan")
        pe = m(TRABALHA + "Foot", TRABALHA + "ToeBase")
        return ("joelho D %.0f°, planta do pé D %+.1f mm | cotovelo D %.1f° (pedido %.1f°) punho D %.0f° | braço D %+.1f° da horizontal, %.0f° pro lado, %+.0f° à frente "
                "do tronco, escápula %+.0f mm (ombro %.0f mm pro quadril), braço × tronco %.0f mm | antebraço × vertical %.0f° | halter (%.3f %.3f %.3f) × tronco %.0f mm, × coxa D %.0f mm, × braço D %.0f mm,"
                " × antebraço D %.0f mm | mão × anilhas %+.1f mm | polegar %s | apoio: palma %+.1f mm, dedos %+.1f mm, canela "
                "%+.1f mm do estofado, punho E %.0f°" % (
                    jt["joelhoD"], pe[:, 2].min() * 1000, jt["cotoveloD"], pose.b, jt["punhoD"], -inc, ck.tc.cotovelo_tronco(j)[1], ck.tc.braco_frente(j)[1],
                    ck.tc.escapula_frente(j)[1], desce_mm, gap * 1000, ck.tc.antebraco_vertical(j)[1], h.x, h.y, h.z,
                    _dist_halter(m("Hips", "Spine", "Spine1", "Spine2")) * 1000,
                    _dist_halter(m(TRABALHA + "UpLeg")) * 1000, _dist_halter(m(TRABALHA + "Arm")) * 1000,
                    _dist_halter(m(TRABALHA + "ForeArm")) * 1000, _mao_x_anilhas(co, nomes, dono),
                    (pol[:2] + pol[-4:]) if isinstance(pol, tuple) and len(pol) > 10 else pol,
                    (palma[:, 2].min() - TOPO) * 1000, (dedos_a[:, 2].min() - TOPO) * 1000,
                    (perna[:, 2].min() - TOPO) * 1000, jt["punhoE"]))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("POSE t=%.1f | %s" % (t, info()), flush=True)

    pegs = [(TRABALHA, ck.Barra(halter, raio=RAIO, meio_compr=PEGADA_H / 2))]
    return Cena(pose, [halter], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.1, 0.75),
                camera_video=((-3.6, -0.6, 1.2), (0.0, -0.05, 0.75), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
