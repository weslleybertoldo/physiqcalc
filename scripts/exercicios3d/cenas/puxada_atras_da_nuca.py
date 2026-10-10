# Puxada Atrás da Nuca — cena da fábrica 3D (lote 9, 10/10/2026). A MESMA estação e a MESMA barra das outras puxadas (Aberta, lote 6;
# Fechada e Supinada, lote 7; Puxada Frontal, lote 9), sem mudar nada nelas: equip3d.estacao_puxada (assento, 2 rolos das coxas, torre
# com a pilha na frente e o braço de cima com a roldana alta) + equip3d.barra_puxada (barra longa de 48" com as pontas dobradas a 25°)
# no cabo da polia (por_acessorio + pol.ligar). A pegada é a aberta da Aberta (as mãos nas pontas dobradas); muda o caminho da barra (por
# TRÁS da cabeça, até a nuca), a cabeça (um pouco dobrada pra frente, pra barra passar), o tronco (em pé, um pouco pra frente, em vez de
# inclinado pra trás) e a roldana, que fica ATRÁS do caminho da barra: o cabo sobe da barra um pouco pra trás, longe da cabeça.
# t = 0 sentado de frente pra torre, coxas presas embaixo dos rolos, pés chapados, tronco em pé um pouco pra frente, cabeça um pouco
# dobrada pra frente, braços esticados pra cima segurando a barra com a pegada pronada aberta, a barra em cima da linha da nuca, e as
# escápulas soltas (um pouco subidas) · t = 1 a barra atrás do pescoço, na nuca, quase encostando, os cotovelos dobrados, descidos
# pelos lados e apontando pro chão, embaixo das mãos, e as escápulas descidas e pra trás.
# Técnica — ExRx, Cable Rear Pulldown (https://exrx.net/WeightExercises/LatissimusDorsi/CBRearPulldown, cópia do Internet Archive de
# 30/06/2022; o site responde 403): "Grasp cable bar with wide grip. Sit with thighs under supports." / "Pull cable bar down behind
# neck. Return until arms and shoulders are fully extended." / "Range of motion will be compromised if grip is too wide." O nome do
# catálogo (fonte_en) é o do Bodybuilding.com, Wide-Grip Pulldown Behind The Neck (cópia do Internet Archive de 10/06/2017): "Make sure
# that you adjust the knee pad of the machine to fit your height." / "Grab the bar with the palms facing forward" / "As you have both
# arms extended in front of you holding the bar at the chosen grip width, bring your torso and head forward. Think of an imaginary line
# from the center of the bar down to the back of your neck. This is your starting position." / "bring the bar down until it touches
# the back of your neck by drawing the shoulders and the upper arms down and back" / "The upper torso should remain stationary and only
# the arms should move." / "slowly raise the bar back to the starting position when your arms are fully extended". Largura: Signorile
# 2002 (a WGP, "wide grip posterior": "Both WGA and WGP were performed with a pronated handgrip, and the distance between the hands was
# equal to the distance from the outside of a closed fist to the seventh cervical vertebra (C7)") — no boneco dá ~0,84 m, e o meio
# das mãos fica a 0,89 m (a pegada da Aberta).
# CUIDADO COM O OMBRO (pedido do Weslley, na ficha com as fontes): com a barra atrás da cabeça o ombro fica aberto pro lado e girado pra
# fora, a posição "high five" — Ronai 2019 (ACSM's Health & Fitness Journal): "The “high five” position occurs when the bar is pulled
# down behind the head"; Kolber 2010: "behind the neck pull-downs ... may predispose the RT population to anterior shoulder
# instability"; Sperandei 2009: "This situation is worsened by horizontal abduction, which is needed to avoid the contact between the
# exercise bar and the head of the practitioner". O 3D faz o mínimo disso: a barra para na nuca (não desce pras costas), os cotovelos
# ficam embaixo das mãos (sem jogar pra trás além do que a cabeça pede) e o ombro não passa da "high five" (rotação externa ≤ ~90°).
# Como o rig faz: sentado como nas outras puxadas (coxas deitadas e um pouco abertas, canelas em pé, pés chapados) com o tronco TRONCO°
# pra frente, parado; o pescoço PESCOCO° e a cabeça CABECA° dobrados pra frente, parados (a barra passa atrás da cabeça com folga). A
# barra desce num caminho em pé (a "linha imaginária" do Bodybuilding.com): de B0 (em cima, na altura em que o cotovelo mais esticado
# fica com COTOVELO0°) até B1 (embaixo, atrás da nuca: o eixo da barra DZ_NUCA acima da base do osso do pescoço e a superfície a
# GAP_NUCA da pele), com um bojo pra TRÁS no meio se a cabeça pedir. A roldana fica ROLDANA_TRAS atrás (+Y) do ponto mais de trás do
# caminho: o engate fica sempre na frente dela e o cabo sobe da barra um pouco pra trás (o tangente() da polia escolhe o lado da
# roldana sozinho; com o engate sempre do mesmo lado, o cabo nunca troca de lado). Quadro a quadro: escápulas (subidas no começo,
# descem logo no início da puxada e vão pra trás), a barra no lugar (o engate virado pro cabo), o cabo ligado e as 2 mãos no meio da
# pegada de cada lado (na ponta dobrada): IK do braço a partir do braço de repouso, polo do cotovelo pra fora, pra baixo e um pouco pra
# trás; os dedos ⟂ à barra, na direção do antebraço, e a palma pra frente (pegada pronada); metade da torção do antebraço passa pro osso
# da mão, que fica no mesmo lugar (TORCE, como na Puxada Frontal). Dedos e polegar fecham UMA vez (mão rígida na borracha).
import math
import numpy as np
from mathutils import Matrix, Quaternion, Vector
import bpy
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
X = Vector((1.0, 0.0, 0.0))
TRONCO = 5.0              # tronco 5° pra frente da vertical (+ = pra frente), parado: "bring your torso and head forward" e "The upper
                          # torso should remain stationary" (Bodybuilding.com) — sem inclinar pra trás (com a barra atrás da cabeça
                          # o tronco pra trás jogaria a cabeça no caminho dela)
PESCOCO, CABECA = 15.0, 5.0   # pescoço dobrado 15° pra frente na base e a cabeça mais 5° no alto, parados ("bring your torso and head
                              # forward", Bodybuilding.com): a cabeça fica ~15° mais dobrada que no repouso (cabeca_tronco ~−26°, o
                              # repouso mede ~−11°; o rosto ~20° mais baixo, contando os 5° do alto), menos da metade da flexão normal do
                              # pescoço (45°, AAOS/limites.py) — sem forçar. Com 8° no alto o rosto olhava muito pro chão e a folga da
                              # barra pra cabeça no fim era a mesma (28,8 × 28,5 mm: quem abre o caminho é o pescoço)
ABRE_COXA = 8.0           # coxas abertas 8° pra fora: o poste dos rolos sobe entre as pernas
ESP_ASSENTO, LARG_ASSENTO, PROF_ASSENTO = 0.06, 0.38, 0.34   # estofado de 60 mm, como o das remadas
AFUNDA = 0.002            # pele afundando no estofado do assento e dos rolos
RAIO_ROLO, COMP_ROLO, X_ROLO = 0.0635, 0.21, 0.035           # rolo de 5" e 21 cm, de |x| = 3,5 cm pra fora (o poste no meio)
ROLO_JOELHO = 0.09        # eixo dos rolos 9 cm atrás do centro do joelho (em cima da coxa, logo antes do joelho)
COMPR_BARRA, RETO, DOBRA = 1.219, 0.74, 25.0                  # barra de 48", reto de 74 cm, pontas dobradas a 25° (a da Aberta)
RAIO_BARRA = 0.01524      # borracha de 1,2" (30,5 mm) onde a mão fecha
PEGADA = 0.45             # meio de cada mão a 45 cm do meio da barra, ao longo dela (8 cm depois da dobra): a pegada aberta da Aberta
COTOVELO0 = 6.0           # começo: cotovelo estendido sem travar ("Return until arms and shoulders are fully extended", ExRx)
DY0 = 0.0                 # começo: a barra em cima do ponto do fim (a "imaginary line from the center of the bar down to the back of
                          # your neck", Bodybuilding.com: o cabo quase vertical o movimento todo)
DZ_NUCA = 0.02            # fim: eixo da barra 2 cm acima da base do osso do pescoço (o meio da nuca, entre o trapézio e a base do
                          # crânio): "Pull cable bar down behind neck" (ExRx) — sem descer às costas
GAP_NUCA = 0.012          # fim: a barra (superfície) a 12 mm da pele da nuca ("until it touches the back of your neck", Bodybuilding.com;
                          # o peso não entra no corpo)
COTOVELO1 = 145.0         # fim: o cotovelo mais dobrado dos 2 no máximo isso (só aviso)
ELEVA0, DESCE1 = 12.0, 4.0    # escápulas subidas no começo (clavícula 12° pra cima) e descidas no fim (4° pra baixo)
RETRAI1 = 16.0            # escápulas pra trás no fim (16° em volta do eixo do tronco: "drawing the shoulders and the upper arms down and
                          # back", "squeezing your shoulder blades together", Bodybuilding.com)
ESCAPULA_ATE, RETRAI_ATE = 0.35, 0.75     # descem logo no começo da puxada e vão pra trás até t = 0,75
POLO = (0.50, 0.12, -0.50)    # polo do cotovelo a partir do ombro, no referencial do tronco (m: pra fora, pra trás, pra cima): os
                              # cotovelos descem pelos lados, embaixo das mãos, um pouco pra trás
POLO_MEIO = 0.08          # no meio da puxada o polo vai mais isso pra trás (perfil seno, 0 no começo e no fim): com o braço aberto ~90°
                          # o cotovelo fica embaixo da mão e o ombro não passa da "high five" (rotação externa 94° → ~91°, sonda de
                          # 10/10); no fim os cotovelos ficam do lado do corpo (com o polo 0,08 mais atrás o tempo todo, o braço ia
                          # 30° pra trás do tronco no fim, contra 15°)
TORCE = 0.5               # parte da torção do antebraço (pronação) que vai pro osso da mão — a mão fica onde está (como na Puxada
                          # Frontal: o rig tem UM osso no antebraço)
FOLGA_CABECA = 0.020      # barra e engate (superfície) → pele da cabeça e cabelo: mínimo no caminho todo
ROLDANA_TRAS = 0.005      # roldana 5 mm atrás (+Y) do ponto mais de trás do caminho da barra (o cabo nunca troca de lado)
Z_ROLDANA = 2.10          # eixo da roldana alta a 2,10 m (máquina de 2,26 m: Titan 87", Legend 90")
RAIO_ROLDANA = 0.045
TORRE_PES = 0.12          # frente da torre 12 cm à frente da ponta dos pés


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def rotacao_externa(j):
    """Rotação externa de cada ombro (graus [E, D]) pela medida da ficha (tecnica3d.ombro_rotacao_externa); sem ela (o tecnica3d de
    outro commit), None."""
    f = getattr(tc, "ombro_rotacao_externa", None)
    return f(j) if f else None


def montar(bon):
    pg.usar_cilindro(RAIO_BARRA * 2000)       # mão de referência da borracha de 30,5 mm (antes do Maos)
    pg.usar_polegar("volta")                  # polegar dando a volta na barra (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 0) a largura do Signorile 2002 no boneco (em pé, antes de sentar): do C7 até o lado de fora do punho fechado, com o braço
    # aberto reto na altura do ombro — C7 ≈ a base do osso do pescoço na horizontal, punho fechado ≈ base do dedo médio + 2 cm ─────────
    c7_ombro = math.hypot(cab("LeftArm").x - cab("Neck").x, cab("LeftArm").y - cab("Neck").y)
    signorile = (c7_ombro + (cab("LeftForeArm") - cab("LeftArm")).length + (cab("LeftHand") - cab("LeftForeArm")).length
                 + (cab("LeftHandMiddle1") - cab("LeftHand")).length + 0.02)
    print("PEGADA | Signorile 2002 no boneco: C7 → fora do punho fechado ≈ %.3f m | meio das mãos na barra (pegada %.2f m do meio, "
          "ao longo dela): ~%.3f m entre os meios | entre as articulações dos ombros %.3f m" % (
              signorile, PEGADA, 2 * (RETO / 2 + (PEGADA - RETO / 2) * math.cos(math.radians(DOBRA))),
              (cab("LeftArm") - cab("RightArm")).length), flush=True)

    # ── 1) sentado: tronco TRONCO° pra frente, coxas deitadas e um pouco abertas, canelas em pé, pés chapados no chão ─────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    t_rep = cab("Neck") - cab("Hips")
    frente_rep = math.degrees(math.atan2(-t_rep.y, t_rep.z))   # o tronco do boneco em pé, no repouso, já inclina isso pra frente

    def sentar(inclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina - frente_rep), pivo=pivo0)
        for L, s in LADOS:
            h, k = cab(L + "UpLeg"), cab(L + "Leg")
            alvo = Vector((s * math.sin(math.radians(ABRE_COXA)), -math.cos(math.radians(ABRE_COXA)), 0.0))
            p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(alvo).to_matrix())
            k, a = cab(L + "Leg"), cab(L + "Foot")
            p3.girar_osso(rig, L + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
            f = cab(L + "ToeBase") - cab(L + "Foot")       # a canela gira em volta dela mesma até o pé apontar como no repouso
            giro = math.atan2(f_rep[L].x, -f_rep[L].y) - math.atan2(f.x, -f.y)
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation(giro, 3, (cab(L + "Foot") - cab(L + "Leg")).normalized()))
            F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
            p3.girar_osso(rig, L + "Foot", pe_rep[L] @ F.inverted())    # sola chapada, como em pé
        pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, -0.0005 - float(pes[:, 2].min()))))

    sentar(TRONCO)
    # a cabeça um pouco pra frente (parada o movimento todo): o pescoço dobra na base e a cabeça no alto
    p3.girar_osso(rig, "Neck", p3.rot_x(PESCOCO))
    p3.girar_osso(rig, "Head", p3.rot_x(CABECA))
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    tt = cab("Neck") - cab("Hips")
    jj0 = ck.posicoes(rig)
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    gl = G[np.abs(G[:, 0]) < LARG_ASSENTO / 2]
    y_tras = float(gl[gl[:, 2] < float(gl[:, 2].min()) + 0.06][:, 1].max()) + 0.04
    y_frente = y_tras - PROF_ASSENTO
    Gs = gl[(gl[:, 1] > y_frente) & (gl[:, 1] < y_tras)]
    topo = float(Gs[:, 2].min()) + AFUNDA
    print("SENTADO | tronco %.1f° (+ = pra frente; repouso %.1f°) | cabeça × tronco %.1f° (repouso ~−11°), pescoço (junta) %.1f° | "
          "quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f" % (
              math.degrees(math.atan2(-tt.y, tt.z)), frente_rep, tc.cabeca_tronco(jj0)[0], ck.medir_juntas(rig)["pescoco"], *H, topo,
              y_frente, y_tras), flush=True)

    # rolos das coxas: eixo ROLO_JOELHO atrás do centro do joelho, encostando em cima das coxas (a pele afunda AFUNDA)
    joelho = (cab("LeftLeg") + cab("RightLeg")) / 2
    y_r = joelho.y + ROLO_JOELHO
    C = pele(("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
    C = C[(np.abs(C[:, 0]) > X_ROLO) & (np.abs(C[:, 0]) < X_ROLO + COMP_ROLO) & (np.abs(C[:, 1] - y_r) < RAIO_ROLO)]
    z_r = float((C[:, 2] + np.sqrt(RAIO_ROLO ** 2 - (C[:, 1] - y_r) ** 2)).max()) - AFUNDA
    pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    y_torre = float(pes[:, 1].min()) - TORRE_PES
    coxa_dentro = pele(("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
    perto = coxa_dentro[np.abs(coxa_dentro[:, 1] - y_r) < 0.06]
    print("ROLOS | joelho (%.4f %.4f %.4f) | eixo dos rolos y %.4f z %.4f | coxa mais perto do meio na altura dos rolos |x| %.3f | "
          "ponta dos pés y %.3f → frente da torre y %.3f" % (*joelho, y_r, z_r, float(np.abs(perto[:, 0]).min()),
                                                              float(pes[:, 1].min()), y_torre), flush=True)

    # ── 2) escápulas: sobem no começo, descem logo no início da puxada e vão pra trás (giro da clavícula em volta dos eixos do tronco) ─
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def perfil(t):
        return p3.lerp(ELEVA0, -DESCE1, _suave(t / ESCAPULA_ATE)), p3.lerp(0.0, RETRAI1, _suave(t / RETRAI_ATE))

    def escapulas(t):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        sobe, ret = perfil(t)
        for L, s in LADOS:
            if ret:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * ret), 3, cima0))
            if sobe:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * sobe), 3, frente0))

    S_rep = {L: cab(L + "Arm") for L, _ in LADOS}
    for t in (0.0, 1.0):
        escapulas(t)
        jj = ck.posicoes(rig)
        print("ESCÁPULAS t=%.0f | ombro E andou %+.1f mm pra frente, %+.1f mm pra cima, %+.1f mm pra fora | escapula_frente %s mm | "
              "clavícula %s°" % (
                  t, (cab("LeftArm") - S_rep["Left"]).dot(frente0) * 1000, (cab("LeftArm") - S_rep["Left"]).dot(cima0) * 1000,
                  (cab("LeftArm") - S_rep["Left"]).dot(-lado0) * 1000, "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                  "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Shoulder", "Arm"]}))),
              flush=True)

    # ── 3) a barra (planejada sem a máquina: a roldana entra depois) e as mãos ─────────────────────────────────────────────────────
    barra = e3.barra_puxada("barra_puxada", comprimento=COMPR_BARRA, reto=RETO, dobra=DOBRA, raio=RAIO_BARRA, pegada=PEGADA)
    maos = Maos(bon, RAIO_BARRA, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    estado, DEDOS = {}, {}
    roldana = [None]                                         # eixo da roldana (Vector) quando já se sabe

    def direcao(B):
        """Direção do cabo saindo do meio da barra B pra roldana (antes dela existir: pra cima)."""
        if roldana[0] is None:
            return Vector((0.0, 0.0, 1.0))
        return e3.Polia(None, None, roldana[0], RAIO_ROLDANA, (0, 1, 0)).direcao(B)

    def por_barra(B):
        u = direcao(B)
        e3.por_acessorio(barra.raiz, B, X, u)
        p3.atualizar()
        return u

    def eixos_tronco():
        return (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))

    def polo(L, s):
        cima, lado, frente = eixos_tronco()
        tras = POLO[1] + POLO_MEIO * math.sin(math.pi * max(0.0, min(1.0, polo.t)))
        return cab(L + "Arm") - lado * (s * POLO[0]) - frente * tras + cima * POLO[2]

    polo.t = 1.0                                             # o t do quadro (o planejamento usa o começo e o fim: perfil 0)

    def orientacao(a, f):
        """Dedos ⟂ à barra (eixo a), na direção do antebraço f (o punho não dobra pra frente nem pra trás); palma pra frente (pegada
        pronada: o dorso da mão virado pra trás, pro lado de quem olha de costas)."""
        dq = (f - a * f.dot(a)).normalized()
        pq = a.cross(dq).normalized()
        if pq.y > 0:
            pq = -pq
        return dq, pq

    def maos_na_barra(voltas=4):
        for L, s in LADOS:
            g, a = barra.mundo(s)
            f = estado[L] if L in estado else (g - cab(L + "Arm")).normalized()
            for _ in range(voltas):                # antebraço ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(a, f)
                for n in ("Arm", "ForeArm", "Hand"):   # o IK parte sempre do braço de repouso (cotovelo dobrado pra frente)
                    PB[p3.P + L + n].matrix_basis = Matrix()
                p3.atualizar()
                maos.segurar(L, g, dq, pq, polo=polo(L, s))
                f2 = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
                pronto = f2.angle(f) < math.radians(0.3)
                f = f2
                if pronto:
                    break
            estado[L] = f
            if L in DEDOS:                          # mão rígida na borracha: os dedos e o polegar fechados no começo, iguais
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    def torcer():
        """Passa TORCE da torção do antebraço (giro em volta do próprio eixo, o Y do osso) pro osso da mão: o antebraço aponta igual
        e gira menos; a mão fica no mesmo lugar e virada igual (os dedos vão junto com ela)."""
        if not TORCE:
            return
        for L, _ in LADOS:
            pb_f = PB[p3.P + L + "ForeArm"]
            loc, q, esc = pb_f.matrix_basis.decompose()
            tau = 2 * math.atan2(q.y, q.w)                 # torção (swing-twist: q = swing @ twist em volta do Y)
            tau = (tau + math.pi) % (2 * math.pi) - math.pi
            q_sw = q @ Quaternion((math.cos(tau / 2), 0.0, math.sin(tau / 2), 0.0)).inverted()
            fica = tau * (1 - TORCE)
            Mh = PB[p3.P + L + "Hand"].matrix.copy()
            pb_f.matrix_basis = Matrix.LocRotScale(loc, q_sw @ Quaternion((math.cos(fica / 2), 0.0, math.sin(fica / 2), 0.0)), esc)
            p3.atualizar()
            PB[p3.P + L + "Hand"].matrix = Mh
            p3.atualizar()
            torcer.tau[L] = (math.degrees(tau), math.degrees(fica))

    torcer.tau = {}

    def cotovelos():
        j = ck.medir_juntas(rig)
        return j["cotoveloE"], j["cotoveloD"]

    def S_meio():
        return (cab("LeftArm") + cab("RightArm")) / 2

    def acertar_polos():
        for L, _ in LADOS:
            maos.iks[L].mute = False
            e_ = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
            print("polo cotovelo %s erro %.3f ang %d" % (L, *e_), flush=True)

    # vão da mão − punho no referencial da mão (dedos, palma, lado): medido uma vez, com a mão de referência (o Maos põe sempre a
    # mesma), pra conta do braço sem IK no planejamento
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    OFF = {}
    escapulas(0.0)
    for L, s in LADOS:
        Sx = cab(L + "Arm")
        dq_r, pq_r = orientacao(Vector((s, 0.0, 0.0)), Vector((s * 0.3, 0.0, 1.0)).normalized())
        g_r = Sx + Vector((s * 0.20, 0.0, 0.50))
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + L + n].matrix_basis = Matrix()
        p3.atualizar()
        maos.segurar(L, g_r, dq_r, pq_r, polo=polo(L, s))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm | braço %.4f "
              "antebraço %.4f" % (L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000, Lb, La), flush=True)

    def punho_de(L, g, a, f):
        dq, pq = orientacao(a, f)
        o = OFF[L]
        return g - (dq * o[0] + pq * o[1] + dq.cross(pq) * o[2])

    def alcance(L, s):
        """Ombro → punho (m) com a mão no meio da pegada do lado s e o braço quase reto (antebraço ≈ na reta ombro → punho)."""
        g, a = barra.mundo(s)
        Sx = cab(L + "Arm")
        f = (g - Sx).normalized()
        for _ in range(4):
            W = punho_de(L, g, a, f)
            f = (W - Sx).normalized()
        return (W - Sx).length

    # começo: a barra DY0 atrás do ponto do fim (B1), na altura que deixa o cotovelo mais esticado dos 2 com COTOVELO0° (conta do braço)
    def comeco(B1):
        escapulas(0.0)
        S = S_meio()
        d0 = math.sqrt(Lb * Lb + La * La + 2 * Lb * La * math.cos(math.radians(COTOVELO0)))
        lo, hi = S.z + 0.20, S.z + 0.90
        for _ in range(30):
            meio = (lo + hi) / 2
            por_barra(Vector((0.0, B1.y + DY0, meio)))
            if max(alcance(L, s) for L, s in LADOS) < d0:
                lo = meio                          # o braço ainda dobra mais que COTOVELO0: a barra sobe
            else:
                hi = meio
        B = Vector((0.0, B1.y + DY0, lo))
        por_barra(B)
        g = (barra.mundo(1)[0] + barra.mundo(-1)[0]) / 2
        print("COMEÇO | barra (%.4f %.4f) | reta ombro → mão %.1f° atrás da vertical (vista de lado; − = à frente)" % (
            B.y, B.z, math.degrees(math.atan2(g.y - S.y, g.z - S.z))), flush=True)
        return B

    extras = [o for o in bpy.data.objects if o.type == "MESH" and o is not bon.corpo and o.parent is rig]

    def pontos(t, partes, com_extras):
        """Pele das partes (+ cabelo, sobrancelhas e olhos) com as escápulas de t, só a faixa do reto da barra (N×3)."""
        escapulas(t)
        co, _, (nomes, dono) = _malha(bon)
        P = [co[_grupo(nomes, dono, partes)]]
        if com_extras:
            P += [ck._avaliar_simples(o)[0] for o in extras]
        P = np.concatenate(P)
        return P[np.abs(P[:, 0]) < RETO / 2 + 0.01]

    NUCA = ("Neck", "Head", "Spine2", "LeftShoulder", "RightShoulder")   # costas do pescoço, trapézio de cima, nuca e cabeça
    cache_cab = {}

    def cabeca_pts(t):
        """Pele da cabeça + cabelo, sobrancelhas e olhos com as escápulas de t (a cabeça não mexe; as escápulas mexem pouco nela)."""
        k = round(t, 3)
        if k not in cache_cab:
            cache_cab[k] = pontos(t, ("Head",), True)
        return cache_cab[k]

    def folga_barra(P, y, z):
        """Barra (superfície, a luva do engate no meio) com o eixo em (y, z) → os pontos P (m)."""
        raio_x = np.where(np.abs(P[:, 0]) < 0.036, 0.020, RAIO_BARRA + 0.0012)
        return float((np.hypot(P[:, 1] - y, P[:, 2] - z) - raio_x).min())

    # fim: o eixo da barra DZ_NUCA acima da base do osso do pescoço e a superfície GAP_NUCA longe da pele da nuca (vindo de trás)
    def fim():
        escapulas(1.0)
        S = S_meio()
        z1 = cab("Neck").z + DZ_NUCA
        T = pontos(1.0, NUCA, True)
        lo, hi = S.y - 0.30, S.y + 0.40           # lo: dentro da nuca; hi: bem atrás
        for _ in range(30):
            meio = (lo + hi) / 2
            if folga_barra(T, meio, z1) > GAP_NUCA:
                hi = meio                          # longe da nuca: a barra vem pra frente (−Y)
            else:
                lo = meio
        y1 = hi
        por_barra(Vector((0.0, y1, z1)))
        maos_na_barra()
        c1 = max(cotovelos())
        Tp = pontos(1.0, ("Neck", "Spine2", "LeftShoulder", "RightShoulder"), False)
        print("FIM | ombros (%.4f %.4f) | base do pescoço z %.4f → barra z %.4f, y %.4f | barra → pele da nuca/trapézio %.1f mm, → "
              "cabeça e cabelo %.1f mm | cotovelo %.1f° (aviso acima de %.0f°)" % (
                  S.y, S.z, cab("Neck").z, z1, y1, folga_barra(Tp, y1, z1) * 1000, folga_barra(cabeca_pts(1.0), y1, z1) * 1000,
                  c1, COTOVELO1), flush=True)
        return Vector((0.0, y1, z1))

    # o caminho da barra: reta de B0 a B1 em z, com um bojo pra trás (+Y) no meio se a cabeça pedir
    caminho = {"B0": None, "B1": None, "bojo": 0.0}

    def ponto(t):
        B0, B1 = caminho["B0"], caminho["B1"]
        return Vector((0.0, p3.lerp(B0.y, B1.y, t) + caminho["bojo"] * math.sin(math.pi * t), p3.lerp(B0.z, B1.z, t)))

    def folgas(P, B, u, saida):
        """Barra, engate e cabo (superfície) → os pontos P (m): a barra como um cilindro ao longo do X (a luva do engate no meio), o
        engate como um tubo de 2 cm de raio do eixo até o começo do cabo e o cabo até a saída da roldana (None: sem cabo)."""
        d_barra = folga_barra(P, B.y, B.z)
        d_eng = float(_dist_segmento(P, B + u * 0.02, B + u * (barra.engate + 0.02)).min()) - 0.020
        d_cabo = 1e9 if saida is None else float(_dist_segmento(P, B + u * barra.engate, saida).min()) - 0.003
        return d_barra, d_eng, d_cabo

    def folga_cabeca(t):
        """Barra, engate e cabo → cabeça e cabelo (m) com a barra em ponto(t)."""
        B = ponto(t)
        u = direcao(B)
        saida = None
        if roldana[0] is not None:
            saida = e3.Polia(None, None, roldana[0], RAIO_ROLDANA, (0, 1, 0)).tangente(B + u * barra.engate)[0]
        return folgas(cabeca_pts(t), B, u, saida)

    def planejar():
        caminho["B1"] = fim()                       # as mãos ficam nas pontas dobradas: girar a barra em volta do eixo (o engate
        caminho["B0"] = comeco(caminho["B1"])       # seguindo o cabo, que muda com a roldana) mexe nelas — replaneja a cada volta
        caminho["bojo"] = 0.0
        ts = [i / 10 for i in range(11)]
        for _ in range(12):
            piores = [(min(folga_cabeca(t)[:2]), t) for t in ts]
            pf, tp = min(piores)
            if pf >= FOLGA_CABECA or caminho["bojo"] > 0.15:
                break
            caminho["bojo"] += (FOLGA_CABECA - pf) / max(math.sin(math.pi * tp), 0.3) + 0.002
        pts = [ponto(t) for t in [i / 40 for i in range(41)]]
        return max(p.y for p in pts), pf, tp

    # polo certo do cotovelo, com ele dobrado, antes de medir o cotovelo no planejamento do fim (o IK muda com o polo)
    escapulas(1.0)
    S1 = S_meio()
    por_barra(Vector((0.0, S1.y + 0.05, cab("Neck").z + DZ_NUCA)))
    maos_na_barra()
    acertar_polos()
    estado.clear()

    y_max, pf, tp = planejar()
    for volta in range(4):                          # a roldana atrás do caminho; com ela, a barra gira e o caminho muda um pouco
        roldana[0] = Vector((0.0, y_max + ROLDANA_TRAS, Z_ROLDANA))
        y_max, pf, tp = planejar()
        print("CAMINHO volta %d | B0 (%.4f %.4f) B1 (%.4f %.4f) bojo %.1f mm | pior folga barra/engate → cabeça %.1f mm em t=%.1f | "
              "roldana y %.4f, caminho mais atrás y %.4f" % (
                  volta, caminho["B0"].y, caminho["B0"].z, caminho["B1"].y, caminho["B1"].z, caminho["bojo"] * 1000, pf * 1000,
                  tp, roldana[0].y, y_max), flush=True)
        if roldana[0].y - y_max >= ROLDANA_TRAS - 0.002:
            break

    # ── 4) a máquina em volta do corpo ───────────────────────────────────────────────────────────────────────────────────────────
    R = roldana[0]
    est = e3.estacao_puxada("puxada", roldana=(R.y, R.z), assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                            rolos=(y_r, z_r, RAIO_ROLO, COMP_ROLO, X_ROLO), torre=y_torre, raio_roldana=RAIO_ROLDANA)
    pol = est.pol

    # ── 5) pose ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    def pose(t):
        """t=0 braços esticados pra cima segurando a barra em cima da linha da nuca, escápulas subidas; t=1 barra atrás da nuca,
        cotovelos dobrados descendo pelos lados, embaixo das mãos, escápulas descidas e pra trás."""
        if t <= 1e-9:
            estado.clear()                           # o começo não depende do quadro anterior
        polo.t = t
        escapulas(t)
        B = ponto(t)
        u = pol.direcao(B)
        e3.por_acessorio(barra.raiz, B, X, u)
        pol.ligar(B + u * barra.engate)
        p3.atualizar()
        maos_na_barra()
        torcer()
        pose.B, pose.u = B, u

    pose.B, pose.u = Vector(), Vector((0, 0, 1))
    # polo certo do cotovelo com ele dobrado (fim) e os dedos fechados UMA vez, no começo
    pose(1.0)
    acertar_polos()
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:
        g, a = barra.mundo(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, a, RAIO_BARRA)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)
    estado.clear()

    # ── 6) medidas do quadro (info) ──────────────────────────────────────────────────────────────────────────────────────────────
    pecas_barra = [o for o in [barra.raiz] + list(barra.raiz.children_recursive) if o.type == "MESH"]

    def maos_fora_da_pegada():
        """Mão × barra FORA da pegada (a checagem ignora o que fica dentro da mão): a menor distância com sinal (− = entrou) da
        superfície da barra, fora de um cilindro de 7 cm de cada lado do meio da mão e 6 mm por fora da borracha, até a pele da mão
        do mesmo lado; mão × cabo (o segmento do engate à saída da roldana) e mão × cabeça (pele da cabeça e do pescoço + cabelo) —
        mm, [E, D]."""
        from mathutils.kdtree import KDTree
        co, tri, (nomes, dono) = _malha(bon)
        out = []
        P_cab = np.concatenate([co[_grupo(nomes, dono, ("Head", "Neck"))]] + [ck._avaliar_simples(o)[0] for o in extras])
        kd = KDTree(len(P_cab))
        for i, p in enumerate(P_cab):
            kd.insert(Vector(p), i)
        kd.balance()
        for L, s in LADOS:
            g, a = barra.mundo(s)
            mao = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith(L + "Hand")))
            bvh = ck._bvh(co, tri[mao[tri].all(axis=1)])
            menor = 1e9
            for o in pecas_barra:
                pts = ck._amostras(*ck._avaliar_simples(o), 0.006)
                d = pts - np.array(g)
                ax = d @ np.array(a)
                rad = np.linalg.norm(d - np.outer(ax, np.array(a)), axis=1)
                pts = pts[~((np.abs(ax) < 0.07) & (rad < RAIO_BARRA + 0.006))]
                lo_, hi_ = co[mao].min(axis=0) - 0.03, co[mao].max(axis=0) + 0.03
                pts = pts[((pts >= lo_) & (pts <= hi_)).all(axis=1)]
                for p in pts:
                    v = Vector(p)
                    loc, nor, idx, dist = bvh.find_nearest(v)
                    if loc is not None:
                        menor = min(menor, -dist if (v - loc).dot(nor) < 0 else dist)
            cabo = float(_dist_segmento(co[mao], pose.B + pose.u * barra.engate, pol.saida).min()) - 0.003
            d_cab = min(kd.find(Vector(p))[2] for p in co[mao])       # mão × cabeça/pescoço/cabelo (vértice a vértice)
            out.append((menor * 1000, cabo * 1000, d_cab * 1000))
        return out

    def folga_agora():
        """Barra, engate e cabo → cabeça e cabelo, e barra → pele da nuca/trapézio, no quadro atual (sem mexer na pose)."""
        co, _, (nomes, dono) = _malha(bon)
        P = np.concatenate([co[_grupo(nomes, dono, ("Head",))]] + [ck._avaliar_simples(o)[0] for o in extras])
        P = P[np.abs(P[:, 0]) < RETO / 2 + 0.01]
        N = co[_grupo(nomes, dono, ("Neck", "Spine2", "LeftShoulder", "RightShoulder"))]
        N = N[np.abs(N[:, 0]) < RETO / 2 + 0.01]
        return folgas(P, pose.B, pose.u, pol.saida), folga_barra(N, pose.B.y, pose.B.z)

    def antebraco_tras(jj):
        """Antebraço (cotovelo → punho) inclinado pra trás (+) ou pra frente (−) no plano sagital do tronco, graus [E, D]: 0 = o
        cotovelo bem embaixo da mão, visto de lado."""
        cima, lado, frente = (np.array(v) for v in tc.eixos_tronco(jj))
        out = []
        for L, _ in LADOS:
            f = jj[L + "Hand"] - jj[L + "ForeArm"]
            out.append(math.degrees(math.atan2(float(f @ -frente), float(f @ cima))))
        return out

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        (fb, fe, fc), fn = folga_agora()
        fm = maos_fora_da_pegada()
        cabo_v = math.degrees(math.atan2(pose.u.y, pose.u.z))
        re_ = rotacao_externa(jj)
        return ("barra (%.3f %.3f) | cabo %+.1f° da vertical (+ = sobe pra trás), %.3f m | barra → nuca/trapézio %.0f mm | barra → "
                "cabeça/cabelo %.0f mm, engate %.0f mm, cabo %.0f mm | cotovelo %.0f/%.0f° | elevação %s° | braço à frente %s° | "
                "plano do braço %s° | abertura %s° | cotovelo × tronco %s° | rot. externa %s° | antebraço pra trás %s° | cotovelo y %s | "
                "antebraço × vertical %s° | punho %.0f/%.0f° "
                "(flexão %s, desvio %s) | palma × frente %s° | pegada %.2f | cotovelos %.2f | escápula %s mm, clavícula %s° | tronco "
                "%.1f° | coluna %.1f° | cabeça %s° | pescoço %.0f° | mão × barra fora da pegada E %.1f D %.1f mm | mão × cabo E %.0f D %.0f "
                "mm | mão × cabeça E %.0f D %.0f mm | torção do antebraço E %.0f→%.0f° D %.0f→%.0f° | %s" % (
                    pose.B.y, pose.B.z, cabo_v, pol.comprimento, fn * 1000, fb * 1000, fe * 1000, fc * 1000,
                    jt["cotoveloE"], jt["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in re_) if re_ else "-", "/".join("%+.0f" % v for v in antebraco_tras(jj)),
                    "/".join("%+.3f" % jj[L + "ForeArm"][1] for L, _ in LADOS),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), jt["punhoE"], jt["punhoD"],
                    "/".join("%+.0f" % v for v in tc.punho_flexao(jj)), "/".join("%+.0f" % v for v in tc.punho_desvio(jj)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), tc.pegada_largura(jj)[0], tc.cotovelos_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Shoulder", "Arm"]})),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), jt["pescoco"], fm[0][0], fm[1][0],
                    fm[0][1], fm[1][1], fm[0][2], fm[1][2], *torcer.tau.get("Left", (0, 0)), *torcer.tau.get("Right", (0, 0)),
                    maos.info()))

    print("MÁQUINA | roldana (y %.4f z %.4f) | assento topo %.3f | rolos y %.3f z %.3f | torre y %.3f | pegada a %.2f m do meio "
          "(%.0f mm depois da dobra)" % (R.y, R.z, topo, y_r, z_r, y_torre, PEGADA, (PEGADA - RETO / 2) * 1000), flush=True)
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(barra.pegadores[s], RAIO_BARRA, barra.meia)) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, est.equipamentos + [barra.raiz], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 1.2),
                camera_video=((3.0, yq + 2.9, 1.9), (0, yq - 0.1, 1.15), 45), info=info, apoios=est.apoios, afunda_apoio_mm=20)
