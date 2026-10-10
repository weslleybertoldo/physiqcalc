# Pulldown com Braços Estendidos — cena da fábrica 3D (lote 8, 09/10/2026; treinos prontos do app).
# t = 0 começo: em pé de frente pra polia ALTA, o tronco inclinado à frente e parado, os braços quase esticados lá em cima, na
# frente da cabeça, segurando a barra reta da polia · t = 1 fim: os braços desceram em arco pela frente do corpo, girando SÓ no
# ombro, com os cotovelos levemente dobrados e parados, até as mãos e a barra chegarem nas coxas.
# Técnica (o que foi lido): ExRx, Cable Bent-over Pullover ("Also known as Straight Arm Pulldown"): "Face high pulley and grasp
# revolving cable attachment with arm slightly bent. Place one foot slightly back and bend over at hip until shoulder is fully
# flexed (upper arms at sides of head)." / "With elbows fixed approximately 30°, pull cable attachment down until upper arms are
# to sides. Return attachment overhead." (na animação do ExRx a barra para na frente das coxas). ACE, artigo "4 Moves to Help You
# Master the Pull-up" (Crockford 2015), Straight-arm Pull-downs: "place the hands shoulder-width apart on the bar. Back up and hinge
# forward at the hips, while also bending the knees slightly. Keeping the arms straight, engage the lats and press the bar down to
# the thighs." ACE, Exercise Library, Straight Arm Pressdown: "Stand with the feet hip-width apart, the hips straight, the back
# tall, and the knees slightly bent. Place the cable pulley at the highest position, use a straight bar attachment" / "Keep the arms
# straight while bringing the hands down to the front of the waist. Slowly lift the hands back to the starting position".
# Teixeira 2022 (pulldown de braços estendidos, isométrico): "the pronated handgrip with elbows fully extended"; "a grip of 100% of
# the bi-acromial distance". Muyor 2022: "keeping their elbows extended, had to lower the bar until it reached the level of the
# navel" / "the bar had to be raised to the height of the earlobe". Dica do app: "Braços quase estendidos, puxe a barra de cima
# até as coxas em arco, sem dobrar os cotovelos. Volte devagar até acima da cabeça."
# Como o rig faz: pés paralelos na largura do quadril, chapados; joelhos dobrados JOELHO° e o tronco INCLINA° à frente da
# vertical (dobra no quadril, coluna neutra, cabeça na linha do tronco), tudo parado; o quadril vai RECUA pra trás. Os 2 braços
# descem juntos como um bloco só girando em volta do eixo de lado a lado dos ombros (só extensão do ombro, plano sagital), de
# PHI0° de flexão do ombro (medida no tronco) até a barra chegar nas coxas; braço ABRE° aberto e antebraço um pouco pra dentro (as
# mãos na barra a 2 × MEIA uma da outra), cotovelo parado a COTOVELO°, dobrando pro lado do cabo (o tríceps segura), úmero sem
# girar; a mão segue o antebraço (punho reto), palma pra frente em cima e pras coxas embaixo (pegada pronada), polegar em volta da
# barra (o polegar novo). As escápulas sobem um pouco com o braço lá em cima e descem com ele (ELEVA0° na clavícula com o braço em
# PHI0°, nada abaixo de 90°). A polia alta fica na frente da pessoa, na linha dela: o cabo vai da roldana até o gancho no meio da
# barra, na frente do rosto e do peito.
# Mesmo jeito da Elevação Frontal na Polia (cenas/elevacao_frontal_na_polia.py), com o arco ao contrário e o tronco inclinado do
# Crucifixo Invertido com Halteres (cenas/crucifixo_invertido_com_halteres.py); a polia é a mesma peça do Tríceps Pulley (polia()
# com a roldana alta e a barra_polia()), com o carrinho mais alto na coluna.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.01524           # pegada de borracha de 1,2" (equip3d.barra_polia)
COMPR_BARRA = 0.508            # barra reta de 20"
MEIA = 0.19                    # meia distância entre os vãos das mãos (m): ~37 cm entre os centros das mãos (ombros a 40 cm) — a
                               # mão fica inteira na borracha da barra de 20" (borracha de 4,5 a 23,5 cm do meio)
COTOVELO = 12.0                # flexão do cotovelo, parada o movimento todo (graus): quase estendido
ABRE = 3.0                     # braço aberto pro lado (graus), parado
INCLINA = 20.0                 # tronco à frente da vertical (graus), parado: dobra no quadril
JOELHO = 15.0                  # flexão dos joelhos (graus), parada
RECUA = 0.06                   # quadril pra trás (m) com o tronco inclinado
PES_X = 0.14                   # tornozelos a ±PES_X do meio (m): pés na largura do quadril
PHI0 = 155.0                   # começo: flexão do ombro medida no tronco (graus) — braços lá em cima, na frente da cabeça
TH1 = -1.5                     # fim: braço a TH1 graus da vertical do MUNDO (+ = à frente, − = pra trás): as mãos encostam de
                               # leve nas coxas (medido: −2,0° = −0,9 mm, mão entrando; +2,0° = 38 mm) e a barra fica ~2 cm
                               # na frente delas (os dedos passam entre a barra e as coxas)
ELEVA0 = 10.0                  # clavícula subida (graus) com o braço em PHI0 (escápulas soltas lá em cima); nada abaixo de 90°
POLIA_Z, ALTO = 2.20, 2.45     # eixo da roldana alta (carrinho no alto da coluna) e altura da coluna: com a do Tríceps Pulley
                               # (2,05 m) a barra lá em cima ficava a 16 cm da roldana
POLIA_DY = 0.18                # roldana POLIA_DY à frente (−Y) do gancho da barra no começo: o cabo sobe mais em pé que o braço
                               # (55° × 45° da horizontal) e já puxa a barra pra cima e pra frente lá em cima
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
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    coxa = (cab("LeftLeg") - cab("LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - cab("LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q0 = cab("LeftUpLeg")
    pivo = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    t_rep = cab("Neck") - cab("Hips")
    frente_rep = math.degrees(math.atan2(-t_rep.y, t_rep.z))   # o tronco do boneco em pé, no repouso, já inclina isso

    # ── pernas por IK: tornozelos parados a ±PES_X do meio (altura e y do repouso), joelhos pra frente, pés chapados ──────────────
    pernas = {}
    for lado, s in LADOS:
        tz = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * PES_X, tz.y, tz.z)))
        polo_j = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo_j)
        p3.travar_rotacao(rig, lado + "Foot")

    # ── tronco inclinado INCLINA° em volta das articulações do quadril, que vão RECUA pra trás e descem o que for preciso pros
    # joelhos dobrarem JOELHO° com os tornozelos parados (a conta do Crucifixo Invertido) ─────────────────────────────────────────
    th = math.radians(JOELHO)
    d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))      # quadril → tornozelo
    dx, dy = q0.x - PES_X, q0.y + RECUA - tornoz.y
    desce = tornoz.z + math.sqrt(max(d ** 2 - dx ** 2 - dy ** 2, 0.01)) - q0.z
    p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA - frente_rep), pivo=pivo, mover=Vector((0, RECUA, desce)))
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    jt = ck.medir_juntas(rig)
    tt = cab("Neck") - cab("Hips")
    lam = math.degrees(math.atan2(-tt.y, tt.z))                    # inclinação do tronco que ficou (graus, + = à frente)
    print("CORPO | tronco %.1f° à frente (repouso %.1f°) | joelho E %.0f° D %.0f° | quadril (%.3f %.3f %.3f) desceu %.1f mm" % (
        lam, frente_rep, jt["joelhoE"], jt["joelhoD"], *pivo, -desce * 1000), flush=True)

    # ── escápulas: a clavícula sobe ELEVA0° com o braço em PHI0 (soltas lá em cima) e desce junto com ele até 90° ────────────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def sobe_de(th_):
        phi = th_ + lam                                            # flexão do ombro medida no tronco
        return ELEVA0 * max(0.0, min(1.0, (phi - 90.0) / (PHI0 - 90.0)))

    def escapulas(th_):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        g = sobe_de(th_)
        if g:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * g), 3, frente0))

    S_rep = {L: cab(L + "Arm") for L, _ in LADOS}
    escapulas(PHI0 - lam)
    print("ESCÁPULAS em cima | ombro E %+.1f mm pra cima, %+.1f mm pra frente, %+.1f mm pra fora" % (
        (cab("LeftArm") - S_rep["Left"]).dot(cima0) * 1000, (cab("LeftArm") - S_rep["Left"]).dot(frente0) * 1000,
        (cab("LeftArm") - S_rep["Left"]).dot(-lado0) * 1000), flush=True)
    escapulas(0.0)

    barra = e3.barra_polia("barra_polia", comprimento=COMPR_BARRA, raio=RAIO_BARRA)
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço

    def mao_sagital(th_):
        """Dedos e palma (mundo) com o antebraço a `th_` graus da vertical pra baixo, girando pra frente: th_ = 0 dedos pra baixo e
        palma pra trás (pras coxas), 90 dedos pra frente e palma pra baixo, 180 dedos pra cima e palma pra frente (pegada pronada;
        o punho não dobra pra frente nem pra trás)."""
        a = math.radians(th_)
        return Vector((0, -math.sin(a), -math.cos(a))), Vector((0, math.cos(a), -math.sin(a)))

    def segmentos(th_, s, kf):
        """Braço (ombro → cotovelo) e antebraço (cotovelo → punho), unitários, do lado s (+1 esquerdo), com o braço a `th_` graus
        da vertical do mundo (à frente) e ABRE graus aberto pro lado, e o antebraço com a componente de lado kf (pra dentro: a mão
        cai na largura da pegada); o cotovelo fica a COTOVELO graus, dobrando pro lado do cabo (pra frente embaixo, pra cima e pra
        trás em cima). O braço inteiro gira em volta do eixo x do ombro (só extensão do ombro, plano sagital). Devolve (braço,
        antebraço, ângulo do antebraço com a vertical visto de lado)."""
        sa, ca = math.sin(math.radians(ABRE)), math.cos(math.radians(ABRE))
        cf = math.sqrt(1 - kf * kf)
        cb = (math.cos(math.radians(COTOVELO)) - s * sa * kf) / (ca * cf)
        b = math.degrees(math.acos(max(-1.0, min(1.0, cb))))
        r1, r2 = math.radians(th_), math.radians(th_ + b)
        return (Vector((s * sa, -math.sin(r1) * ca, -math.cos(r1) * ca)),
                Vector((kf, -math.sin(r2) * cf, -math.cos(r2) * cf)), th_ + b)

    def polo(lado, Ec, W):
        S = cab(lado + "Arm")
        eixo = (W - S).normalized()
        fora = (Ec - S) - eixo * (Ec - S).dot(eixo)
        return Ec + fora.normalized() * 0.4

    # ── referência (braço a 60° da vertical), como na elevação frontal: (1) giro da mão em volta da palma pra linha dos nós dos
    # dedos ficar paralela à barra; (2) vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo) ──────────────
    TH_REF = 60.0
    giro, off_local = {}, {}
    for lado, s in LADOS:
        a, f, thf = segmentos(TH_REF, s, 0.0)
        S = cab(lado + "Arm")
        E = S + a * Lb
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
        off = g - cab(lado + "Hand")
        lat = dq2.cross(pq)
        off_local[lado] = (off.dot(dq2), off.dot(pq), off.dot(lat))
        nos2 = pg._base(rig, lado)[1]
        print("REF %s: giro da mão %.1f° | nós × barra antes %.1f° depois %.1f° | vão−punho no referencial da mão "
              "(%.3f %.3f %.3f)" % (lado, math.degrees(giro[lado]), math.degrees(min(nos.angle(quer), nos.angle(-quer))),
                                    math.degrees(min(nos2.angle(quer), nos2.angle(-quer))), *off_local[lado]))

    def mao(lado, th_):
        dq, pq = mao_sagital(th_)
        dq = Matrix.Rotation(giro[lado], 3, pq) @ dq
        return dq, pq, dq.cross(pq)

    sa = math.sin(math.radians(ABRE))
    ox = {}
    for lado, s in LADOS:          # desvio do vão em x no referencial da mão: não depende do ângulo (a mão só gira em volta do x)
        dq, pq, lat = mao(lado, TH_REF)
        o = off_local[lado]
        ox[lado] = (dq * o[0] + pq * o[1] + lat * o[2]).x

    def juntas(th_):
        """Escápulas no lugar e, por lado: cotovelo E, punho W, vão da mão g, dedos e palma, com o braço a `th_` graus da vertical
        do mundo. A mão fica sempre na mesma largura: o antebraço com a componente de lado kf (o vão cai em ±MEIA na barra)."""
        escapulas(th_)
        out = {}
        for lado, s in LADOS:
            S = cab(lado + "Arm")
            kf = (s * MEIA - S.x - s * sa * Lb - ox[lado]) / La
            a, f, thf = segmentos(th_, s, kf)
            E = S + a * Lb
            W = E + f * La
            dq, pq, lat = mao(lado, thf)
            o = off_local[lado]
            out[lado] = (E, W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq, kf)
        return out

    def centro(j):
        g = (j["Left"][2] + j["Right"][2]) / 2
        return Vector((0, g.y, g.z))

    th0, th1 = PHI0 - lam, TH1
    j0 = juntas(th0)
    c0 = centro(j0)

    # polia alta na frente da pessoa (a torre fica em −Y), virada pra ela: a saída do cabo fica POLIA_DY à frente do gancho da
    # barra no começo (o cabo sobe mais em pé que o braço: puxa a barra pra cima e pra frente já no começo)
    raio_rold = 0.045
    u_braco = (c0 - cab("LeftArm") * 0.5 - cab("RightArm") * 0.5)
    u_braco = Vector((0, u_braco.y, u_braco.z)).normalized()
    gancho0 = c0 + u_braco * e3.ENGATE_BARRA_POLIA
    pol = e3.polia("polia", x=0.0, y=gancho0.y - POLIA_DY + raio_rold, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)

    # pontos do corpo pra medir as folgas (o corpo, fora os braços, não mexe)
    tronco_pts = _malha(bon, TRONCO)
    coxas_pts = _malha(bon, PERNAS)
    cabelo = ck._avaliar_simples(bon.cabelo)[0]

    def folgas_cena(c):
        """Barra (superfície) → pele da frente das coxas, cabo → pele do tronco/cabeça e cabo → cabelo (m)."""
        P = coxas_pts[np.abs(coxas_pts[:, 0]) < MEIA + 0.05]
        coxa_ = float(np.hypot(P[:, 1] - c.y, P[:, 2] - c.z).min()) - RAIO_BARRA
        u = pol.direcao(c)
        A = c + u * e3.ENGATE_BARRA_POLIA
        T = pol.tangente(A)[0]
        cabo = float(_dist_segmento(tronco_pts, A, T).min()) - 0.003
        cab_ = float(_dist_segmento(cabelo, A, T).min()) - 0.003
        return coxa_, cabo, cab_

    def pose(t):
        """t=0 braços lá em cima, na frente da cabeça; t=1 braços embaixo, a barra nas coxas."""
        th_ = p3.lerp(th0, th1, t)
        j = juntas(th_)
        c = centro(j)
        u = pol.direcao(c)
        e3.por_acessorio(barra, c, EIXO, u)               # gancho virado pro cabo (gira livre na barra)
        pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)          # cabo reto da saída da roldana até o engate
        p3.atualizar()
        for lado, s in LADOS:
            E, W, g, dq, pq, kf = j[lado]
            maos.segurar(lado, Vector((s * MEIA, c.y, c.z)), dq, pq, polo=polo(lado, E, W))
        for lado, _ in LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, EIXO, RAIO_BARRA, polegar_antes=antes)
        pose.desvio = {l: (cab(l + "ForeArm") - j[l][0]).length * 1000 for l, _ in LADOS}
        pose.folgas = [x * 1000 for x in folgas_cena(c)]
        pose.cabo = math.degrees(math.asin(max(-1.0, min(1.0, u.z))))
        pose.barra = c
        pose.th = th_

    pose.dedos = {}
    pose.desvio = {}
    pose.folgas = [0.0, 0.0, 0.0]
    pose.cabo = 0.0
    pose.barra = Vector()
    pose.th = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("PULLDOWN t=%.1f | braço %.1f° do mundo (%.1f° no tronco) | cotovelo E %.0f° D %.0f° | barra (y %.3f z %.3f) | barra → "
              "coxas %.0f mm | cabo → tronco/cabeça %.0f mm | cabo → cabelo %.0f mm | cabo %.1f° acima da horizontal | cotovelo fora "
              "do calculado E %.1f D %.1f mm | técnica %s" % (
                  t, pose.th, pose.th + lam, jt["cotoveloE"], jt["cotoveloD"], pose.barra.y, pose.barra.z, *pose.folgas,
                  pose.cabo, pose.desvio["Left"], pose.desvio["Right"], tc.texto(tc.medir(ck.posicoes(rig)))), flush=True)
    print("POLIA | roldana y %.3f z %.3f | gancho no começo y %.3f z %.3f | pés: ponta y %.3f" % (
        pol.centro.y, pol.centro.z, gancho0.y, gancho0.z, min(cab("LeftToeBase").y, cab("RightToeBase").y)), flush=True)

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | braço %.1f° (no tronco %.1f°) | cotovelo fora do calculado E %.1f D %.1f mm | barra (y %.3f z %.3f) | "
                              "barra → coxas %.0f mm | cabo → tronco/cabeça %.0f mm | cabo → cabelo %.0f mm | cabo %.1f° acima da "
                              "horizontal | cabo %.3f m | polegar %s") % (
            pose.th, pose.th + lam, pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.barra.y, pose.barra.z,
            pose.folgas[0], pose.folgas[1], pose.folgas[2], pose.cabo, pol.comprimento, pol_)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra] + pol.raizes, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, -0.3, 1.1), camera_video=((3.6, -2.4, 1.4), (0, -0.35, 1.05), 50), info=info)
