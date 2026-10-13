# Rosca Direta na Polia — cena da fábrica 3D (lote 10, 10/10/2026; um dos 61 novos do banco: 0 usos nos treinos prontos, 6 como troca
# equivalente). Sem peça nova: a polia baixa da Rosca Martelo na Polia (equip3d.polia) e a barra reta curta da polia
# (equip3d.barra_polia, a do Tríceps Pulley e da Elevação Frontal na Polia).
# t = 0 em pé, de frente pra polia baixa e perto dela, os braços quase esticados e a barra na frente das coxas, segura por baixo (palmas
# pra frente) · t = 1 cotovelos dobrados, a barra na altura dos ombros, na frente deles, com as palmas viradas pros ombros. O app faz a
# volta (desce até quase esticar de novo).
# Técnica (as frases e os links ficam na ficha):
#   • free-exercise-db, Standing Biceps Cable Curl (o nome em inglês do catálogo): "Stand up with your torso upright while holding a
#     cable curl bar that is attached to a low pulley. Grab the cable bar at shoulder width and keep the elbows close to the torso. The
#     palm of your hands should be facing up (supinated grip)." / "While holding the upper arms stationary, curl the weights [...] Only
#     the forearms should move. Continue the movement until your biceps are fully contracted and the bar is at shoulder level.";
#   • ExRx, Cable Curl: "Grasp low pulley cable bar with shoulder width underhand grip. Stand close to pulley." / "With elbows to side,
#     raise bar until forearms are vertical. Lower until arms are fully extended." / "When elbows are fully flexed, they can travel
#     forward slightly, allowing forearms to be no more than vertical.";
#   • Catalyst Athletics, Cable Curl: a barra RETA na polia baixa ("Hold a straight bar with the palms up attached to a low cable") e a
#     tensão mais contínua que a da barra livre ou do halter ("keeps a more continuous level of tension on the biceps than a dumbbell or
#     barbell curl");
#   • NSCA (CSCS), Barbell biceps curl: "Stand with your feet shoulder-width apart and your knees slightly flexed." / "Keep your torso
#     and upper arms stationary."; ACE, Bicep Curl: "Keep chest still, using just the arms for the movement."
# Montagem: a estação da Rosca Martelo na Polia — roldana baixa (0,22 m) na frente da pessoa e na linha dela, a 0,62 m do meio do corpo
# (perto: as pontas dos pés a ~41 cm do eixo dela) — e as pernas de lá (joelhos 15°, pés chapados na largura dos ombros, tronco ereto,
# tudo parado). O cabo sobe da roldana até o gancho no meio da barra, na frente das pernas e do tronco. Cada braço fica junto da
# lateral do tronco (ABRE° aberto, FRENTE[0]° à frente) e PARADO até o antebraço passar de VOLTA° da vertical; só no fim o cotovelo vai
# um pouco à frente (até FRENTE[1]°, como na Rosca Direta com Halteres). Os 2 antebraços, as 2 mãos fechadas na barra e a barra giram
# juntos em volta da reta dos 2 cotovelos (a barra é rígida: a mão não escorrega nela), do antebraço a TETA[0]° da vertical pra baixo
# até TETA[1]°; a mão fica reta no antebraço (punho reto) com a palma pro lado em que o antebraço sobe (supinada: pra frente embaixo,
# pra cima no meio, pro ombro em cima) e o vão de cada mão a ±MEIA do meio da barra (o antebraço com a parte de lado fixa pra isso).
# Mão e barra como no Tríceps Pulley (cenas/triceps_pulley.py), com a palma do outro lado (supinada) e o polegar novo em volta da barra.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.01524           # pegada de borracha de 1,2" (equip3d.barra_polia)
COMPR_BARRA = 0.508            # barra reta de 20"
MEIA = 0.175                   # meia distância entre os vãos das mãos (m): 35 cm entre os centros das mãos (os ombros a ~40 cm) — na
                               # largura dos ombros, o mais aberto que a barra de 20" deixa: na pegada supinada o polegar dá a volta
                               # do lado de fora e a mão ocupa até ~6 cm além do vão; com 0,175 a mão inteira fica na borracha (de
                               # 4,5 a 23,5 cm do meio), a ~5–8 mm da ponta de aço (com 0,185–0,195 o polegar chegava na ponta e
                               # entrava 1–2 mm nela)
JOELHO = 15.0                  # joelhos levemente dobrados (graus), parados o movimento todo
ABRE = 1.5                     # braço aberto pro lado (graus), parado: o cotovelo junto da lateral do tronco sem entrar nela (como
                               # na Rosca Martelo na Polia); mais aberto, o antebraço fecha mais pra dentro até a barra e o punho desvia
FRENTE = (13.0, 18.0)          # braço à frente da vertical (graus): parado em FRENTE[0] até o antebraço passar de VOLTA graus da
                               # vertical e só então vai até FRENTE[1] em cima (ExRx: "they can travel forward slightly"); embaixo as
                               # mãos e os antebraços passam a ~5 mm da cintura e das coxas (com 10° e o antebraço a 24°, a ~1 mm)
VOLTA = 95.0
TETA = (26.0, 148.0)           # antebraço (cotovelo → punho) × vertical pra baixo, graus: embaixo → em cima. Cotovelo de ~20°
                               # (quase esticado) a ~131°: em cima o antebraço fica a ~32° da vertical e a barra na altura dos ombros,
                               # na frente deles (como na Rosca Direta com Halteres)
POLIA_Y, POLIA_Z, ALTO = -0.62, 0.22, 2.15   # eixo da roldana baixa (na frente da pessoa) e altura da coluna
TH_REF = 60.0                  # antebraço da referência da mão (graus da vertical pra baixo)
ALINHA = 0.6                   # quanto os dedos seguem o antebraço em vez da linha da barra (Maos.segurar(alinhar)): com a barra
                               # curta o antebraço fecha ~9° pra dentro até a mão, e com a linha dos nós dos dedos na barra o punho
                               # desviava 24° pro lado do polegar (o normal vai até 20°: limites.py); com 0,6 ele fica em ~14° e a
                               # barra fica ~10° oblíqua na palma (com 0,7 o polegar trocava de postura no meio da subida e
                               # chegava na ponta de aço)
LADOS = (("Left", 1), ("Right", -1))
EIXO = Vector((1, 0, 0))
PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")
COXAS = ("LeftUpLeg", "RightUpLeg")
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")


def _malha(bon, partes):
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    return co[np.array([n in partes for n in nomes] + [False])[dono]]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _bvh_de(ob):
    co, tri = ck._avaliar_simples(ob)
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in tri], all_triangles=True)


def _menor_com_sinal(pts, bvh, lim=0.25):
    """Menor distância (m) dos pontos até a malha fechada, − = o ponto entrou nela (normal contra e paridade do raio, como na
    checagem3d.folgas); até `lim` (mais longe = lim)."""
    menor = lim
    for p in pts:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is None:
            continue
        if d < 0.03 and (v - loc).dot(nor) < 0 and ck._dentro(bvh, v):
            d = -d
        menor = min(menor, d)
    return menor


def pernas(bon):
    """Joelhos levemente dobrados com os pés chapados (como na Rosca Martelo na Polia): tornozelos fixos, o quadril desce o que
    precisar pra flexão pedida."""
    rig = bon.rig
    iks = {}
    for lado, s in LADOS:
        alvo = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo_j = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        iks[lado] = p3.ik(rig, lado + "Leg", alvo, polo_j)
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
        e = p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    j = ck.medir_juntas(rig)
    print("JOELHOS quadril desceu %.1f mm | joelho E %.0f° D %.0f°" % (-desce * 1000, j["joelhoE"], j["joelhoD"]))


def montar(bon):
    pg.usar_cilindro(RAIO_BARRA * 2000)          # mão de referência da pegada de 30,5 mm (antes do Maos)
    rig = bon.rig
    pernas(bon)
    cab = lambda n: p3.cabeca(rig, n)
    barra = e3.barra_polia("barra_polia", comprimento=COMPR_BARRA, raio=RAIO_BARRA)
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    S = {l: cab(l + "Arm") for l, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço
    sa, ca = math.sin(math.radians(ABRE)), math.cos(math.radians(ABRE))

    def braco(s, f):
        """Braço (ombro → cotovelo, unitário) do lado s (+1 esquerdo), ABRE° aberto e `f`° à frente da vertical."""
        r = math.radians(f)
        return Vector((s * sa, -math.sin(r) * ca, -math.cos(r) * ca))

    def topo(th):
        """0 até o antebraço passar de VOLTA° da vertical, 1 em cima (suave nas 2 pontas)."""
        x = max(0.0, min(1.0, (th - VOLTA) / (TETA[1] - VOLTA)))
        return x * x * (3 - 2 * x)

    def frente(th):
        return p3.lerp(FRENTE[0], FRENTE[1], topo(th))

    def mao_supinada(th):
        """Dedos e palma (mundo) com o antebraço a `th` graus da vertical pra baixo, girando pra frente: th = 0 dedos pra baixo e
        palma pra frente, th = 90 dedos pra frente e palma pra cima, th = 180 dedos pra cima e palma pra trás (pro ombro) — a pegada
        supinada, com o punho reto (a mão não dobra pra frente nem pra trás)."""
        a = math.radians(th)
        return Vector((0, -math.sin(a), -math.cos(a))), Vector((0, -math.cos(a), math.sin(a)))

    def polo(lado, Ec, W):
        eixo = (W - S[lado]).normalized()
        fora = (Ec - S[lado]) - eixo * (Ec - S[lado]).dot(eixo)
        return Ec + fora.normalized() * 0.4

    # ── referência (antebraço a TH_REF° da vertical), como no tríceps pulley: (1) giro da mão em volta da palma pra linha dos nós
    # dos dedos ficar paralela à barra (desvio de lado, sem dobrar o punho pra frente/trás); (2) vão da mão em relação ao punho, no
    # referencial da mão (fixo o movimento todo)
    giro, off_local = {}, {}
    for lado, s in LADOS:
        E = S[lado] + braco(s, FRENTE[0]) * Lb
        dq, pq = mao_supinada(TH_REF)
        W = E + dq * La
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
        print("REF %s: giro da mão %.1f° | nós × barra antes %.1f° depois %.1f° | vão−punho no referencial da mão (%.3f %.3f %.3f) "
              "| erro do vão %.1f mm" % (lado, math.degrees(giro[lado]), math.degrees(min(nos.angle(quer), nos.angle(-quer))),
                                        math.degrees(min(nos2.angle(quer), nos2.angle(-quer))), *off_local[lado],
                                        maos.erro[lado] * 1000))

    def mao(lado, th):
        dq, pq = mao_supinada(th)
        dq = Matrix.Rotation(giro[lado], 3, pq) @ dq
        return dq, pq, dq.cross(pq)

    # o vão de cada mão fica sempre a ±MEIA do meio da barra: o antebraço com a parte de lado fx fixa (o cotovelo não sai do x dele,
    # e o desvio do vão em x no referencial da mão não depende do ângulo: a mão só gira em volta do x)
    fx = {}
    for lado, s in LADOS:
        dq, pq, lat = mao(lado, TH_REF)
        o = off_local[lado]
        k = (dq * o[0] + pq * o[1] + lat * o[2]).x
        fx[lado] = (s * MEIA - (S[lado].x + s * sa * Lb) - k) / La

    def juntas(th):
        """Por lado: cotovelo E, punho W, vão da mão g, dedos e palma, com o antebraço a `th` graus da vertical pra baixo."""
        f = frente(th)
        a = math.radians(th)
        out = {}
        for lado, s in LADOS:
            E = S[lado] + braco(s, f) * Lb
            cc = math.sqrt(1 - fx[lado] ** 2)
            W = E + Vector((fx[lado], -cc * math.sin(a), -cc * math.cos(a))) * La
            dq, pq, lat = mao(lado, th)
            o = off_local[lado]
            out[lado] = (E, W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq)
        return out

    def centro(j):
        g = (j["Left"][2] + j["Right"][2]) / 2
        return Vector((0, g.y, g.z))

    pol = e3.polia("polia", x=0.0, y=POLIA_Y, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)

    # pontos do corpo pras folgas (pernas e tronco não mexem); peças da barra fora da pegada (pontas de aço, luva, orelha)
    pernas_pts = _malha(bon, PERNAS)
    coxas_pts = _malha(bon, COXAS)
    tronco_pts = _malha(bon, TRONCO)
    cabelo = ck._avaliar_simples(bon.cabelo)[0]
    fora_da_pegada = [o for o in barra.children if o.type == "MESH" and any(
        o.name.endswith(x) for x in ("_ponta+1", "_ponta-1", "_luva", "_orelha", "_mosquetao"))]

    def braco_alavanca(j, c, u):
        """Braço de alavanca no cotovelo (m, no plano sagital, média dos 2 lados): da força do cabo (a reta do cabo, que passa pelo
        meio da barra) e do peso de uma barra livre no mesmo lugar (vertical: a distância de frente entre o cotovelo e a barra)."""
        cabo_, livre = [], []
        for lado, _ in LADOS:
            E = j[lado][0]
            d = Vector((0, E.y - c.y, E.z - c.z))
            uu = Vector((0, u.y, u.z)).normalized()
            cabo_.append((d - uu * d.dot(uu)).length)
            livre.append(abs(E.y - c.y))
        return sum(cabo_) / 2, sum(livre) / 2

    def folgas_cena(c, u):
        """Barra (superfície) → coxas e → tronco/cabeça; gancho (luva → bola, ~2 cm de raio) → coxas; cabo reto → pernas, → tronco
        e → cabelo (m)."""
        A = c + u * e3.ENGATE_BARRA_POLIA
        T = pol.tangente(A)[0]
        P = coxas_pts[np.abs(coxas_pts[:, 0]) < COMPR_BARRA / 2]
        barra_coxa = float(np.hypot(P[:, 1] - c.y, P[:, 2] - c.z).min()) - RAIO_BARRA
        Q = tronco_pts[np.abs(tronco_pts[:, 0]) < COMPR_BARRA / 2]
        barra_tronco = float(np.hypot(Q[:, 1] - c.y, Q[:, 2] - c.z).min()) - RAIO_BARRA
        gancho = float(_dist_segmento(coxas_pts, c, c + u * (e3.ENGATE_BARRA_POLIA + 0.007)).min()) - 0.020
        cabo_p = float(_dist_segmento(pernas_pts, A, T).min()) - 0.003
        cabo_t = float(_dist_segmento(tronco_pts, A, T).min()) - 0.003
        cabo_c = float(_dist_segmento(cabelo, A, T).min()) - 0.003
        return barra_coxa, barra_tronco, gancho, cabo_p, cabo_t, cabo_c

    def maos_fora(c, u):
        """Pele de cada mão → peças da barra fora da pegada (pontas de aço, luva, orelha, mosquetão; m, − = entrou, e o nome da
        mais perto), → cabo (m) e até onde a mão vai na barra (|x| da pele a menos de 2,5 cm da borracha, m: a borracha vai até
        COMPR_BARRA/2 − 0,019)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        A = c + u * e3.ENGATE_BARRA_POLIA
        T = pol.saida if pol.saida is not None else pol.tangente(A)[0]
        bvhs = [(o.name.replace("barra_polia_", ""), _bvh_de(o)) for o in fora_da_pegada]
        out = {}
        for lado, _ in LADOS:
            H = co[np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]]
            pecas = min((_menor_com_sinal(H, b), nome) for nome, b in bvhs)
            cabo_ = float(_dist_segmento(H, A, T).min()) - 0.003
            perto = H[np.hypot(H[:, 1] - c.y, H[:, 2] - c.z) < RAIO_BARRA + 0.025]
            ate = float(np.abs(perto[:, 0]).max()) if len(perto) else 0.0
            out[lado] = (pecas[0], cabo_, pecas[1], ate)
        return out

    def pose(t):
        """t=0 braços quase esticados com a barra na frente das coxas, t=1 cotovelos dobrados com a barra na altura dos ombros."""
        th = p3.lerp(*TETA, t)
        j = juntas(th)
        c = centro(j)
        u = pol.direcao(c)
        e3.por_acessorio(barra, c, EIXO, u)               # gancho virado pro cabo (gira livre na barra)
        pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)          # cabo reto da saída da roldana até o engate
        p3.atualizar()
        for lado, s in LADOS:
            E, W, g, dq, pq = j[lado]
            maos.segurar(lado, Vector((s * MEIA, c.y, c.z)), dq, pq, polo=polo(lado, E, W), alinhar=ALINHA)
        for lado, _ in LADOS:                  # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, EIXO, RAIO_BARRA, polegar_antes=antes)
        pose.desvio = {l: (cab(l + "ForeArm") - j[l][0]).length * 1000 for l, _ in LADOS}
        pose.folgas = [x * 1000 for x in folgas_cena(c, u)]
        pose.alavanca = [x * 100 for x in braco_alavanca(j, c, u)]
        pose.fora = {l: (a * 1000, b * 1000, n, x) for l, (a, b, n, x) in maos_fora(c, u).items()}
        pose.cabo = math.degrees(u.angle(Vector((0, 0, -1))))
        pose.barra = c
        pose.th, pose.frente = th, frente(th)

    pose.dedos = {}
    pose.desvio = {}
    pose.folgas = [0.0] * 6
    pose.alavanca = [0.0, 0.0]
    pose.fora = {}
    pose.cabo = pose.th = pose.frente = 0.0
    pose.barra = Vector()

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("ROSCA DIRETA NA POLIA t=%.1f | antebraço %.1f° da vertical, braço %.1f° à frente | cotovelo E %.0f° D %.0f° | barra (y %.3f "
              "z %.3f) | barra → coxas %.0f mm, → tronco/cabeça %.0f mm | gancho → coxas %.0f mm | cabo → pernas %.0f, → tronco %.0f, → "
              "cabelo %.0f mm | cabo × vertical %.1f° | braço de alavanca no cotovelo: cabo %.1f cm, barra livre %.1f cm | mão × peças fora "
              "da pegada E %.1f (%s) D %.1f (%s) mm, × cabo E %.0f D %.0f mm | mão até |x| E %.3f D %.3f m | cotovelo fora do calculado "
              "E %.1f D %.1f mm | antebraço pra dentro E %.1f° D %.1f° | técnica %s" % (
                  t, pose.th, pose.frente, jt["cotoveloE"], jt["cotoveloD"], pose.barra.y, pose.barra.z, *pose.folgas,
                  pose.cabo, *pose.alavanca, pose.fora["Left"][0], pose.fora["Left"][2], pose.fora["Right"][0],
                  pose.fora["Right"][2], pose.fora["Left"][1], pose.fora["Right"][1], pose.fora["Left"][3],
                  pose.fora["Right"][3], pose.desvio["Left"], pose.desvio["Right"], -math.degrees(math.asin(fx["Left"])),
                  math.degrees(math.asin(fx["Right"])), ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))
    print("BRAÇO ombro E (%.3f %.3f %.3f) | braço %.3f antebraço %.3f m | roldana (y %.3f z %.3f)" % (
        *S["Left"], Lb, La, pol.centro.y, pol.centro.z))

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | antebraço %.1f° braço %.1f° | cotovelo fora do calculado E %.1f D %.1f mm | barra (y %.3f z %.3f) | "
                              "barra → coxas %.0f mm, → tronco/cabeça %.0f mm | gancho → coxas %.0f mm | cabo → pernas %.0f, → tronco "
                              "%.0f, → cabelo %.0f mm | cabo × vertical %.1f° | alavanca cabo %.1f cm, barra livre %.1f cm | mão × "
                              "peças fora da pegada E %.1f D %.1f mm, × cabo E %.0f D %.0f mm | cabo %.3f m | polegar %s") % (
            pose.th, pose.frente, pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.barra.y, pose.barra.z,
            *pose.folgas, pose.cabo, *pose.alavanca, pose.fora.get("Left", (0, 0))[0], pose.fora.get("Right", (0, 0))[0],
            pose.fora.get("Left", (0, 0))[1], pose.fora.get("Right", (0, 0))[1], pol.comprimento, pol_)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra] + pol.raizes, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, -0.2, 1.0), camera_video=((3.6, -2.6, 1.3), (0, -0.25, 1.0), 50), info=info)
