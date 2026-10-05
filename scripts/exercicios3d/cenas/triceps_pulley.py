# Tríceps Pulley — cena da fábrica 3D (lote 3, 05/10/2026; exercício do treino do Weslley).
# t = 0 começo: cotovelos dobrados, antebraços um pouco acima da horizontal · t = 1 fim: cotovelos estendidos (sem travar),
# braços esticados com a barra na frente das coxas.
# Em pé de frente pra polia ALTA (roldana a 2,05 m), perto dela: no começo o cabo desce quase na vertical até a barra
# (CSCS: "Stand close enough to the machine that the cable hangs straight down in the starting position"). Tronco ereto,
# joelhos levemente dobrados (parados), pés na largura dos ombros (o repouso do boneco); pegada pronada fechada na barra
# reta curta da polia, com o polegar em volta da barra (o polegar novo); braços PARADOS encostados nas laterais do tronco,
# um pouco à frente da linha do tronco (pra barra passar na frente das coxas), e só o cotovelo mexe; punho reto. O cabo
# vai da roldana até o engate da barra em todo quadro (equip3d.polia), na frente do rosto e do peito.
# Mesmo jeito do Tríceps Testa na Polia (cenas/triceps_testa_na_polia.py): braço parado, antebraço girando no cotovelo
# num plano fixo, mão com o vão na barra (Maos), polia ligada no centro da pegada.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.01524           # pegada de borracha de 1,2" (equip3d.barra_polia)
COMPR_BARRA = 0.508            # barra reta de 20"
JOELHO = 15.0                  # joelhos levemente dobrados (graus), parados o movimento todo
ABRE = 5.0                     # braço aberto pro lado (graus): o cotovelo encosta na lateral do tronco sem entrar nele
FRENTE = 14.0                  # braço à frente da vertical (graus), parado: a barra passa na frente das coxas (com 9°
                               # a barra e os dedos entravam 2–3 cm nas coxas no fim; com 13,5° os dedos ficavam a 0,7 mm)
MEIA = 0.185                   # meia distância entre os vãos das mãos (m): 37 cm entre os centros das mãos, ~28 cm
                               # entre as bordas de dentro (CSCS: pegada de 15–30 cm); mais estreita, o antebraço fica
                               # em V e o cotovelo não estica abaixo de ~13° (34 cm: o braço abre 5° e o antebraço fecha 8°)
ACIMA = 18.0                   # começo: antebraço acima da horizontal (graus)
COTOVELO_FIM = 13.0            # fim: flexão do cotovelo (graus) — estendido sem travar (~9° dele é o V de lado)
POLIA_Z, ALTO = 2.05, 2.30     # eixo da roldana alta e altura da coluna (a caixa de cima fica acima do carrinho)
RECUO_CABO = 0.06              # no começo a barra fica 6 cm mais perto do corpo que a vertical da saída do cabo (o cabo
                               # desce ~4° fora da vertical): a luva da barra fica a ~7 cm do trilho da torre
LADOS = (("Left", 1), ("Right", -1))
EIXO = Vector((1, 0, 0))
PERNAS = ("LeftUpLeg", "RightUpLeg")
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head")


def _malha(bon, partes):
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    return co[np.array([n in partes for n in nomes] + [False])[dono]]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def montar(bon):
    pg.usar_cilindro(RAIO_BARRA * 2000)          # mão de referência da pegada de 30,5 mm (antes do Maos)
    rig = bon.rig
    # ── joelhos levemente dobrados com os pés chapados (como no stiff, sem inclinar o tronco): tornozelos fixos, o
    # quadril desce o que precisar pra flexão pedida
    pernas = {}
    for lado, s in LADOS:
        alvo = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo_j = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo_j)
        p3.travar_rotacao(rig, lado + "Foot")
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - p3.cabeca(rig, "LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q = p3.cabeca(rig, "LeftUpLeg")
    th_j = math.radians(JOELHO)
    d_j = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th_j))     # quadril → tornozelo
    desce = tornoz.z + math.sqrt(max(d_j ** 2 - (q.x - tornoz.x) ** 2 - (q.y - tornoz.y) ** 2, 0.01)) - q.z
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, desce)))
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    print("JOELHOS quadril desceu %.1f mm | joelho E %.0f° D %.0f°" % (
        -desce * 1000, ck.medir_juntas(rig)["joelhoE"], ck.medir_juntas(rig)["joelhoD"]))

    barra = e3.barra_polia("barra_polia", comprimento=COMPR_BARRA, raio=RAIO_BARRA)
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    a_, f_ = math.radians(ABRE), math.radians(FRENTE)
    braco = {l: Vector((s * math.sin(a_), -math.sin(f_) * math.cos(a_), -math.cos(f_) * math.cos(a_))) for l, s in LADOS}
    E = {l: S[l] + braco[l] * Lb for l, _ in LADOS}       # cotovelo parado o movimento todo

    def mao_sagital(th):
        """Dedos e palma (mundo) com o antebraço a `th` graus da vertical pra baixo, girando pra frente: th = 0 dedos pra
        baixo e palma pra trás (pro corpo), th = 90 dedos pra frente e palma pra baixo (pegada pronada; o punho não
        dobra pra frente nem pra trás)."""
        a = math.radians(th)
        return Vector((0, -math.sin(a), -math.cos(a))), Vector((0, math.cos(a), -math.sin(a)))

    def polo(lado, Ec, W):
        eixo = (W - S[lado]).normalized()
        fora = (Ec - S[lado]) - eixo * (Ec - S[lado]).dot(eixo)
        return Ec + fora.normalized() * 0.4

    # ── referência (antebraço a 60° da vertical), como no tríceps testa: (1) giro da mão em volta da palma pra linha dos
    # nós dos dedos ficar paralela à barra (desvio de lado, sem dobrar o punho pra frente/trás); (2) vão da mão em
    # relação ao punho, no referencial da mão (fixo o movimento todo)
    TH_REF = 60.0
    giro, off_local = {}, {}
    for lado, s in LADOS:
        dq, pq = mao_sagital(TH_REF)
        W = E[lado] + dq * La
        maos.segurar(lado, W + dq * 0.09, dq, pq, polo=polo(lado, E[lado], W))
        nos = pg._base(rig, lado)[1]
        nos_p = (nos - pq * nos.dot(pq)).normalized()
        quer = Vector((1, 0, 0)) if nos_p.x > 0 else Vector((-1, 0, 0))
        giro[lado] = math.atan2(nos_p.cross(quer).dot(pq), nos_p.dot(quer))
        dq2 = Matrix.Rotation(giro[lado], 3, pq) @ dq
        maos.segurar(lado, W + dq2 * 0.09, dq2, pq, polo=polo(lado, E[lado], W))
        g = W + dq2 * 0.09
        off = g - p3.cabeca(rig, lado + "Hand")
        lat = dq2.cross(pq)
        off_local[lado] = (off.dot(dq2), off.dot(pq), off.dot(lat))
        nos2 = pg._base(rig, lado)[1]
        print("REF %s: giro da mão %.1f° | nós × barra antes %.1f° depois %.1f° | vão−punho no referencial da mão "
              "(%.3f %.3f %.3f)" % (lado, math.degrees(giro[lado]), math.degrees(min(nos.angle(quer), nos.angle(-quer))),
                                    math.degrees(min(nos2.angle(quer), nos2.angle(-quer))), *off_local[lado]))

    def mao(lado, th):
        dq, pq = mao_sagital(th)
        dq = Matrix.Rotation(giro[lado], 3, pq) @ dq
        return dq, pq, dq.cross(pq)

    # o punho fica sempre na mesma largura: x do antebraço fixo (o vão da mão cai em ±MEIA na barra); o desvio do vão
    # em x no referencial da mão não depende de th (a mão só gira em volta do eixo x)
    fx = {}
    for lado, s in LADOS:
        dq, pq, lat = mao(lado, TH_REF)
        o = off_local[lado]
        k = (dq * o[0] + pq * o[1] + lat * o[2]).x
        fx[lado] = (s * MEIA - E[lado].x - k) / La

    def juntas(th):
        """Por lado: punho W, vão da mão g, dedos e palma, com o antebraço a `th` graus da vertical pra baixo."""
        out = {}
        a = math.radians(th)
        for lado, s in LADOS:
            c = math.sqrt(1 - fx[lado] ** 2)
            W = E[lado] + Vector((fx[lado], -c * math.sin(a), -c * math.cos(a))) * La
            dq, pq, lat = mao(lado, th)
            o = off_local[lado]
            out[lado] = (W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq)
        return out

    def centro(th):
        j = juntas(th)
        g = (j["Left"][1] + j["Right"][1]) / 2
        return Vector((0, g.y, g.z))

    def flexao(th):
        """Ângulo do cotovelo (braço × antebraço, graus) com o antebraço a `th` graus da vertical pra baixo."""
        c = math.sqrt(1 - fx["Left"] ** 2)
        a = math.radians(th)
        d = Vector((fx["Left"], -c * math.sin(a), -c * math.cos(a)))
        return math.degrees(braco["Left"].angle(d))

    def bisseca(f, a, b, n=40):
        fa = f(a)
        for _ in range(n):
            m = (a + b) / 2
            fm = f(m)
            if (fm > 0) == (fa > 0):
                a, fa = m, fm
            else:
                b = m
        return (a + b) / 2

    # começo: antebraço ACIMA graus acima da horizontal; fim: cotovelo a COTOVELO_FIM graus (o antebraço à frente do braço)
    c_l = math.sqrt(1 - fx["Left"] ** 2)
    th0 = math.degrees(math.acos(-math.sin(math.radians(ACIMA)) / c_l))
    if flexao(FRENTE) >= COTOVELO_FIM:            # o V de lado (braço aberto + antebraço fechando) já passa do pedido
        raise ValueError("cotovelo não estica até %.0f°: o mínimo com essa pegada é %.1f°" % (COTOVELO_FIM, flexao(FRENTE)))
    th1 = bisseca(lambda th: flexao(th) - COTOVELO_FIM, FRENTE, FRENTE + 40.0)
    c0, c1 = centro(th0), centro(th1)

    # polia alta de frente pro corpo (a torre fica na frente da pessoa, em −Y): a saída do cabo (atrás da roldana, que
    # dá a volta por trás e por baixo dela) fica RECUO_CABO à frente da barra do começo
    raio_rold = 0.045
    pol = e3.polia("polia", x=0.0, y=c0.y - RECUO_CABO + raio_rold, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)

    # pontos do corpo pra medir as folgas (o corpo de baixo não mexe; braços fora)
    tronco_pts = _malha(bon, TRONCO)
    coxas_pts = _malha(bon, PERNAS)
    cabelo = ck._avaliar_simples(bon.cabelo)[0]

    def folgas_cena(th):
        """Barra (superfície) → pele da frente das coxas, cabo → pele do tronco/cabeça e cabelo (m)."""
        c = centro(th)
        P = coxas_pts[np.abs(coxas_pts[:, 0]) < MEIA + 0.05]
        coxa_ = float(np.hypot(P[:, 1] - c.y, P[:, 2] - c.z).min()) - RAIO_BARRA
        u = pol.direcao(c)
        A = c + u * e3.ENGATE_BARRA_POLIA
        T = pol.tangente(A)[0]
        cabo = float(_dist_segmento(tronco_pts, A, T).min()) - 0.003
        cab = float(_dist_segmento(cabelo, A, T).min()) - 0.003
        return coxa_, cabo, cab

    f0, f1 = folgas_cena(th0), folgas_cena(th1)
    u0, u1 = pol.direcao(c0), pol.direcao(c1)
    print("PULLEY antebraço de %.1f° a %.1f° da vertical pra baixo | cotovelo %.0f° → %.0f° | barra no começo (y %.3f z %.3f) "
          "no fim (y %.3f z %.3f) | barra → coxas fim %.0f mm | cabo → tronco/cabeça começo %.0f fim %.0f mm | cabo → "
          "cabelo começo %.0f fim %.0f mm | cabo × vertical começo %.1f° fim %.1f° | ombro E (%.3f %.3f %.3f) cotovelo E "
          "(%.3f %.3f %.3f) | antebraço pra dentro %.1f° | roldana y %.3f" % (
              th0, th1, flexao(th0), flexao(th1), c0.y, c0.z, c1.y, c1.z, f1[0] * 1000, f0[1] * 1000, f1[1] * 1000,
              f0[2] * 1000, f1[2] * 1000, math.degrees(u0.angle(Vector((0, 0, 1)))),
              math.degrees(u1.angle(Vector((0, 0, 1)))), *S["Left"], *E["Left"], -math.degrees(math.asin(fx["Left"])),
              pol.centro.y))

    def pose(t):
        """t=0 cotovelos dobrados (antebraços um pouco acima da horizontal), t=1 braços estendidos, barra na frente das
        coxas."""
        th = p3.lerp(th0, th1, t)
        j = juntas(th)
        c = centro(th)
        u = pol.direcao(c)
        e3.por_acessorio(barra, c, EIXO, u)               # gancho virado pro cabo (gira livre na barra)
        pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)          # cabo reto da saída da roldana até o engate
        p3.atualizar()
        for lado, s in LADOS:
            W, g, dq, pq = j[lado]
            maos.segurar(lado, Vector((s * MEIA, c.y, c.z)), dq, pq, polo=polo(lado, E[lado], W))
        for lado, _ in LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, EIXO, RAIO_BARRA, polegar_antes=antes)
        pose.desvio = {l: (p3.cabeca(rig, l + "ForeArm") - E[l]).length * 1000 for l, _ in LADOS}
        pose.folgas = [x * 1000 for x in folgas_cena(th)]

    pose.dedos = {}
    pose.desvio = {}
    pose.folgas = [0.0, 0.0, 0.0]

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | barra → coxas %.0f mm | cabo → "
                              "tronco/cabeça %.0f mm | cabo → cabelo %.0f mm | cabo %.3f m | polegar %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.folgas[0], pose.folgas[1], pose.folgas[2],
            pol.comprimento, pol_)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra] + pol.raizes, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, -0.2, 1.1), camera_video=((3.4, -2.6, 1.35), (0, -0.2, 1.05), 50), info=info)
