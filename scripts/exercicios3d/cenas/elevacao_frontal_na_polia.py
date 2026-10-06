# Elevação Frontal na Polia — cena da fábrica 3D (lote 3, 06/10/2026; exercício do treino do Weslley).
# t = 0 começo: braços quase estendidos, pendurados um pouco à frente do corpo, com a barra na frente das coxas · t = 1
# fim: braços na altura dos ombros, um pouco acima da horizontal.
# Técnica: em pé de COSTAS pra polia BAIXA, um pouco à frente dela (ExRx, Cable Alternating Front Raise: "Stand with low
# double pulleys behind"; "Stand away from pulley slightly"), o cabo passando entre as pernas (pedido do Weslley); barra
# reta da polia com pegada pronada, cotovelos retos ou levemente dobrados e PARADOS (ExRx, Cable Bar Front Raise: "Grasp
# cable bar with overhand grip with elbows straight or slightly bent"; "Elbows may be kept straight or slightly bent
# throughout movement"); sobe pela frente até os braços passarem um pouco da horizontal ("Raise cable bar forward and
# upward until upper arms are above horizontal"; "height just above horizontal may be considered adequate"; ACE, Front
# Raise: "until your arms are level with your shoulders and approximately parallel with the floor") e desce até a barra
# voltar pra frente das coxas (ACE: "Position the dumbbells lightly touching the fronts of your thighs"); tronco ereto e
# parado, punho reto (ACE: "Maintain an erect torso (no arching of your low back) and neutral wrist position"), pés um
# pouco mais abertos que o quadril (ACE: "position your feet slightly wider than hip-width apart"), no plano sagital
# (Coratella 2020: "Frontal raise was performed on the sagittal plane").
# Montagem: roldana baixa (0,20 m) atrás da pessoa e na linha dela, a 0,22 m do meio do corpo (a chapa da base da torre
# fica a ~5 cm dos calcanhares); o cabo sai da roldana pra frente e pra cima, passa no meio das pernas (abaixo de ~66 cm
# do chão, onde as coxas quase se encostam) e chega no gancho da barra, no meio dela. Pernas na pose de repouso (pés
# chapados, tornozelos a 39 cm um do outro, joelhos quase estendidos). Os 2 braços sobem juntos, como um bloco só girando
# em volta do eixo de lado a lado dos ombros (só flexão do ombro, plano sagital), de 13° a 92° da vertical; braço 3° aberto
# e antebraço ~5° pra dentro (as mãos na barra a 35 cm uma da outra, os ombros a 40 cm; o cotovelo fica um pouco pra fora),
# cotovelo parado a 10°, úmero sem girar no movimento (a dobra do cotovelo pra frente embaixo e pra cima no fim: Coratella
# 2020, "humerus neutrally rotated"); a mão segue o antebraço (punho reto), palma pra trás embaixo e pra baixo em cima,
# com o polegar em volta da barra (o polegar novo).
# Mesmo jeito do Tríceps Pulley (cenas/triceps_pulley.py): mão com o vão na barra (Maos), giro da mão pra linha dos nós
# dos dedos ficar na barra, polia ligada no centro da pegada; o braço inteiro sobe como na elevação lateral
# (cenas/elevacao_lateral_com_halteres.py), mas pela frente.
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
MEIA = 0.175                   # meia distância entre os vãos das mãos (m): 35 cm entre os centros das mãos (ombros a 40 cm);
                               # a mão fica inteira na borracha da barra de 20" (borracha de 4,5 a 23,5 cm do meio)
COTOVELO = 10.0                # flexão do cotovelo, parada o movimento todo (graus): quase estendido
ABRE = 3.0                     # braço aberto pro lado (graus), parado: embaixo o braço passa rente à lateral do tronco sem
                               # entrar nela (com o braço 1° pra dentro, paralelo ao antebraço, entrava 6–9 mm a 18 cm do
                               # ombro); o antebraço fecha pra dentro até a mão cair na largura da pegada (o cotovelo fica
                               # um pouco pra fora, como na pegada pronada de verdade)
ELEVA = (13.0, 92.0)           # braço à frente da vertical do tronco (flexão do ombro), começo → fim (graus): embaixo a
                               # barra fica na frente das coxas, com os dedos a ~6 mm delas (com 12° a mão encostava, −1 mm);
                               # em cima o braço passa ~2° da horizontal
POLIA_Y, POLIA_Z, ALTO = 0.22, 0.20, 2.15   # eixo da roldana baixa (atrás da pessoa) e altura da coluna
LADOS = (("Left", 1), ("Right", -1))
EIXO = Vector((1, 0, 0))
PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")
TRONCO = ("Hips", "Spine", "Spine1", "Spine2")


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
    for lado, _ in LADOS:                        # pés chapados (a pose de repouso já é em pé)
        p3.travar_rotacao(rig, lado + "Foot")
    barra = e3.barra_polia("barra_polia", comprimento=COMPR_BARRA, raio=RAIO_BARRA)
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço

    def mao_sagital(th):
        """Dedos e palma (mundo) com o antebraço a `th` graus da vertical pra baixo, girando pra frente: th = 0 dedos pra
        baixo e palma pra trás (pras coxas), th = 90 dedos pra frente e palma pra baixo (pegada pronada; o punho não
        dobra pra frente nem pra trás)."""
        a = math.radians(th)
        return Vector((0, -math.sin(a), -math.cos(a))), Vector((0, math.cos(a), -math.sin(a)))

    def segmentos(th, s, kf):
        """Braço (ombro → cotovelo) e antebraço (cotovelo → punho), unitários, do lado s (+1 esquerdo), com o braço a `th`
        graus à frente da vertical e ABRE graus aberto pro lado, e o antebraço com a componente de lado kf (pra dentro: a
        mão cai na largura da pegada); o cotovelo fica a COTOVELO graus, dobrando pra frente/cima e um pouco pra dentro
        (a dobra do cotovelo pra frente embaixo e pra cima em cima). O braço inteiro gira em volta do eixo x do ombro (só
        flexão do ombro, plano sagital). Devolve (braço, antebraço, ângulo do antebraço com a vertical visto de lado)."""
        sa, ca = math.sin(math.radians(ABRE)), math.cos(math.radians(ABRE))
        cf = math.sqrt(1 - kf * kf)
        cb = (math.cos(math.radians(COTOVELO)) - s * sa * kf) / (ca * cf)
        b = math.degrees(math.acos(max(-1.0, min(1.0, cb))))
        r1, r2 = math.radians(th), math.radians(th + b)
        return (Vector((s * sa, -math.sin(r1) * ca, -math.cos(r1) * ca)),
                Vector((kf, -math.sin(r2) * cf, -math.cos(r2) * cf)), th + b)

    def polo(lado, Ec, W):
        eixo = (W - S[lado]).normalized()
        fora = (Ec - S[lado]) - eixo * (Ec - S[lado]).dot(eixo)
        return Ec + fora.normalized() * 0.4

    # ── referência (braço a 50°), como no tríceps pulley: (1) giro da mão em volta da palma pra linha dos nós dos dedos
    # ficar paralela à barra (desvio de lado, sem dobrar o punho pra frente/trás); (2) vão da mão em relação ao punho, no
    # referencial da mão (fixo o movimento todo)
    TH_REF = 50.0
    giro, off_local = {}, {}
    for lado, s in LADOS:
        a, f, thf = segmentos(TH_REF, s, 0.0)
        E = S[lado] + a * Lb
        W = E + f * La
        dq, pq = mao_sagital(thf)
        maos.segurar(lado, W + dq * 0.09, dq, pq, polo=polo(lado, E, W))
        nos = pg._base(rig, lado)[1]
        nos_p = (nos - pq * nos.dot(pq)).normalized()
        quer = Vector((1, 0, 0)) if nos_p.x > 0 else Vector((-1, 0, 0))
        giro[lado] = math.atan2(nos_p.cross(quer).dot(pq), nos_p.dot(quer))
        dq2 = Matrix.Rotation(giro[lado], 3, pq) @ dq
        maos.segurar(lado, W + dq2 * 0.09, dq2, pq, polo=polo(lado, E, W))
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

    # a mão fica sempre na mesma largura: o antebraço com a componente de lado kf fixa (o vão da mão cai em ±MEIA na
    # barra); o desvio do vão em x no referencial da mão não depende do ângulo (a mão só gira em volta do x)
    kf = {}
    sa = math.sin(math.radians(ABRE))
    for lado, s in LADOS:
        dq, pq, lat = mao(lado, TH_REF)
        o = off_local[lado]
        ox = (dq * o[0] + pq * o[1] + lat * o[2]).x
        kf[lado] = (s * MEIA - S[lado].x - s * sa * Lb - ox) / La

    def juntas(th):
        """Por lado: cotovelo E, punho W, vão da mão g, dedos e palma, com o braço a `th` graus à frente da vertical."""
        out = {}
        for lado, s in LADOS:
            a, f, thf = segmentos(th, s, kf[lado])
            E = S[lado] + a * Lb
            W = E + f * La
            dq, pq, lat = mao(lado, thf)
            o = off_local[lado]
            out[lado] = (E, W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq)
        return out

    def centro(j):
        g = (j["Left"][2] + j["Right"][2]) / 2
        return Vector((0, g.y, g.z))

    # polia baixa atrás da pessoa (a torre fica atrás, em +Y), virada pra ela: o cabo sai da roldana pra frente e pra cima
    pol = e3.polia("polia", x=0.0, y=POLIA_Y, altura=POLIA_Z, frente=(0, -1, 0), alto=ALTO)

    # pontos do corpo pra medir as folgas (as pernas e o tronco não mexem)
    pernas_pts = _malha(bon, PERNAS)
    tronco_pts = _malha(bon, TRONCO)
    coxas_pts = _malha(bon, ("LeftUpLeg", "RightUpLeg"))

    def folgas_cena(c):
        """Gancho da barra (luva → orelha → mosquetão → bola, ~2 cm de raio) → pele das coxas, cabo reto → pele das pernas
        e cabo → pele do tronco (m)."""
        u = pol.direcao(c)
        A = c + u * e3.ENGATE_BARRA_POLIA
        T = pol.tangente(A)[0]
        gancho = float(_dist_segmento(coxas_pts, c, c + u * (e3.ENGATE_BARRA_POLIA + 0.007)).min()) - 0.020
        cabo_p = float(_dist_segmento(pernas_pts, A, T).min()) - 0.003
        cabo_t = float(_dist_segmento(tronco_pts, A, T).min()) - 0.003
        return gancho, cabo_p, cabo_t

    def pose(t):
        """t=0 braços quase estendidos com a barra na frente das coxas, t=1 braços um pouco acima da horizontal."""
        th = p3.lerp(*ELEVA, t)
        j = juntas(th)
        c = centro(j)
        u = pol.direcao(c)
        e3.por_acessorio(barra, c, EIXO, u)               # gancho virado pro cabo (gira livre na barra)
        pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)          # cabo reto da saída da roldana até o engate
        p3.atualizar()
        for lado, s in LADOS:
            E, W, g, dq, pq = j[lado]
            maos.segurar(lado, Vector((s * MEIA, c.y, c.z)), dq, pq, polo=polo(lado, E, W))
        for lado, _ in LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, EIXO, RAIO_BARRA, polegar_antes=antes)
        pose.desvio = {l: (p3.cabeca(rig, l + "ForeArm") - j[l][0]).length * 1000 for l, _ in LADOS}
        pose.folgas = [x * 1000 for x in folgas_cena(c)]
        pose.cabo = math.degrees(math.asin(max(-1.0, min(1.0, -u.z))))
        pose.barra = c

    pose.dedos = {}
    pose.desvio = {}
    pose.folgas = [0.0, 0.0, 0.0]
    pose.cabo = 0.0
    pose.barra = Vector()

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("FRONTAL t=%.1f | braço %.1f° | antebraço pra dentro E %.1f° D %.1f° | cotovelo E %.0f° D %.0f° | barra (y %.3f z %.3f) | gancho → "
              "coxas %.0f mm | cabo → pernas %.0f mm | cabo → tronco %.0f mm | cabo %.1f° abaixo da horizontal | cotovelo "
              "fora do calculado E %.1f D %.1f mm | técnica %s" % (
                  t, p3.lerp(*ELEVA, t), -math.degrees(math.asin(kf["Left"])), math.degrees(math.asin(kf["Right"])),
                  jt["cotoveloE"], jt["cotoveloD"], pose.barra.y,
                  pose.barra.z, *pose.folgas, pose.cabo, pose.desvio["Left"], pose.desvio["Right"],
                  ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | barra (y %.3f z %.3f) | gancho → coxas "
                              "%.0f mm | cabo → pernas %.0f mm | cabo → tronco %.0f mm | cabo %.1f° abaixo da horizontal | "
                              "cabo %.3f m | polegar %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.barra.y, pose.barra.z, pose.folgas[0],
            pose.folgas[1], pose.folgas[2], pose.cabo, pol.comprimento, pol_)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra] + pol.raizes, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, -0.2, 1.0), camera_video=((3.4, -2.6, 1.3), (0, -0.2, 1.0), 50), info=info)
