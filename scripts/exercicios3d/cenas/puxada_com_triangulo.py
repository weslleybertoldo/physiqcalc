# Puxada com Triângulo — cena da fábrica 3D (lote 9, 10/10/2026). A MESMA estação das puxadas (equip3d.estacao_puxada: assento, 2 rolos
# das coxas, torre com a pilha na frente e o braço de cima com a roldana alta) e o MESMO triângulo da Remada Baixa na Polia
# (equip3d.triangulo_polia: 2 pegadores paralelos de 30 mm a 14 cm um do outro, hastes, chapa e o mosquetão que gira no furo), sem mudar
# nada nas 2 peças: o triângulo vai no cabo da roldana alta (tri.por + pol.ligar), como o puxador em V da puxada fechada.
# t = 0 sentado de frente pra torre, coxas presas embaixo dos rolos, pés chapados, tronco um pouco inclinado pra trás, braços esticados
# pra cima segurando os 2 pegadores do triângulo com a pegada neutra (palmas uma pra outra) e as escápulas soltas (um pouco subidas) ·
# t = 1 o triângulo na parte de cima do peito, quase encostando, os cotovelos dobrados, embaixo, do lado do tronco e um pouco atrás, e as
# escápulas descidas e pra trás.
# Técnica (o exercício não tem dica no app; as fontes, lidas em 10/10/2026): ExRx, Cable Close Grip Pulldown (cópia do Internet Archive de
# 27/01/2026): "Grasp parallel cable attachment. Sit with thighs under supports." / "Pull down cable attachment to upper chest. Return
# until arms and shoulders are fully extended." / "Exercise can be performed with V-Bar or Multi-exercise Bar." Signorile 2002 (texto
# completo): "The CG pulldown was performed with a V-Bar and, therefore, grip width was fixed." / "All anterior lifts (CG, SG, and WGA)
# were conducted from full arm extension to bar contact with the chest" / "maintain normal postural lordosis of the lumbar region during
# the anterior lifts". Snarr 2015 (Strength Cond J, coluna Exercise Technique da NSCA): "A neutral grip LP (NG) is typically performed
# using a v-bar." / "Instead of primarily adduction, the shoulder is concentrically extending during the NG" / "a slight backward lean,
# approximately 70–80° of flexion at the hips" / "keeping the elbows pointed towards the floor". ACE, Seated Lat Pulldown: "Lean back
# slightly (no more than a 30 degree angle)" / "Maintain your head aligned with your spine" / "initiate the downward pull by first
# depressing (lower) your scapulae, then pulling the bar downward towards the top or mid-section of your chest" / "bringing your elbows
# towards the sides of your torso" / "Continue pulling until the bar nears or touches your chest, or more importantly, you observe your
# elbows no longer moving downward, but now beginning to move backwards" / "allow your scapule to rise slightly"; ACE, Beginner Strength
# Training Workout: "an attachment that positions your hands parallel to one another". O "V-bar" do Sperandei 2009 NÃO é este: "behind-the-
# neck with V-bar", "a wide grip with an adduction movement, whereas in Signorile et al. (22), V-bar is a closed grip with an extension
# movement".
# Como o rig faz: sentado como nas outras puxadas (coxas deitadas e um pouco abertas, canelas em pé, pés chapados) com o tronco TRONCO°
# pra trás, parado; a cabeça na linha do tronco. O meio dos 2 pegadores (c) desce num caminho em pé: de C0 (em cima, na altura em que o
# cotovelo mais esticado fica com COTOVELO0°) até C1 (embaixo, DZ1 em relação à articulação dos ombros, o ponto mais perto do peito em
# que o triângulo fica a GAP_MIN da pele e o cotovelo mais dobrado não passa de COTOVELO1°), com um bojo pra frente se o rosto pedir.
# Quadro a quadro: escápulas (subidas no começo, descem logo no início da puxada e vão pra trás), as 2 mãos nos pegadores (o vão de cada
# mão no meio do pegador, a ±7 cm do meio) pelo IK do braço a partir do braço de repouso, com o polo do cotovelo pra baixo, pra trás e
# pra fora (o braço e o antebraço não encostam nas costelas); os pegadores ⟂ aos antebraços vistos de lado (o punho reto: os 2
# antebraços convergem igual pro triângulo, então os 2 ficam ⟂ ao mesmo eixo), as palmas uma pra outra; o triângulo no lugar (tri.por:
# o furo do lado do cabo, o mosquetão na linha dele) e o cabo ligado. Dedos e polegar fecham UMA vez (mão rígida no pegador).
import math
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree
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
Z = Vector((0.0, 0.0, 1.0))
TRONCO = -15.0            # tronco 15° pra trás da vertical (− = pra trás), parado: "Lean back slightly (no more than a 30 degree
                          # angle)" (ACE); "a slight backward lean, approximately 70–80° of flexion at the hips" (Snarr 2015) — o
                          # quadril fica em ~75° —; o mesmo das outras puxadas, na mesma estação
ABRE_COXA = 8.0           # coxas abertas 8° pra fora: o poste dos rolos sobe entre as pernas
ESP_ASSENTO, LARG_ASSENTO, PROF_ASSENTO = 0.06, 0.38, 0.34   # estofado de 60 mm, como o das remadas
AFUNDA = 0.002            # pele afundando no estofado do assento e dos rolos
RAIO_ROLO, COMP_ROLO, X_ROLO = 0.0635, 0.21, 0.035           # rolo de 5" e 21 cm, de |x| = 3,5 cm pra fora (o poste no meio)
ROLO_JOELHO = 0.09        # eixo dos rolos 9 cm atrás do centro do joelho (em cima da coxa, logo antes do joelho)
RAIO = 0.015              # pegadores do triângulo: 30 mm (Corength: "Handle diameter: 30 mm") — o da Remada Baixa na Polia
COTOVELO0 = 6.0           # começo: cotovelo estendido sem travar ("Return until arms and shoulders are fully extended", ExRx)
DY0 = 0.0                 # começo: o triângulo em cima do ponto do fim (caminho em pé, o cabo quase vertical o movimento todo)
DZ1 = -0.06               # fim: o meio dos pegadores 6 cm abaixo da articulação dos ombros (parte de cima do peito)
COTOVELO1 = 140.0         # fim: o cotovelo mais dobrado dos 2 no máximo isso
GAP_MIN = 0.012           # fim: o triângulo (superfície) nunca mais perto que 12 mm da pele do peito/pescoço (o peso não encosta)
ELEVA0, DESCE1 = 12.0, 4.0    # escápulas subidas no começo (clavícula 12° pra cima) e descidas no fim (4° pra baixo)
RETRAI1 = 16.0            # escápulas pra trás no fim (16° em volta do eixo do tronco: "pull shoulders back and down", ACE)
ESCAPULA_ATE, RETRAI_ATE = 0.35, 0.75     # descem logo no começo da puxada (ACE: "first depressing") e vão pra trás até t = 0,75
POLO = (0.22, 0.17, -0.47)    # polo do cotovelo a partir do ombro, no referencial do tronco (m: pra fora, pra trás, pra cima). Com as
                              # mãos juntas no triângulo os antebraços fecham pro meio: com o polo a 10 cm pra fora o fim do braço e o
                              # começo do antebraço, junto do cotovelo, entravam até 21 mm nas costelas (t = 0,7 a 1); a 22 cm os
                              # cotovelos descem um pouco abertos (~8° no meio, ~17° no fim, "towards the sides of your torso") e
                              # sobram ≥ 10 mm (sonda de 10/10/2026)
TORCE = 0.0               # parte da torção do antebraço que vai pro osso da mão (0 = nada; ver torcer())
FOLGA_ROSTO = 0.025       # triângulo e mãos (superfície) → pele/cabelo da cabeça e do pescoço: mínimo no caminho todo
FOLGA_CABO = 0.035        # cabo → pele/cabelo da cabeça e do pescoço: mínimo no caminho todo
ROLDANA_FRENTE = 0.005    # roldana 5 mm à frente (−Y) do ponto mais à frente do caminho do engate (o cabo nunca vira de lado)
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


def _arvore(P):
    kd = KDTree(len(P))
    for i, p in enumerate(P):
        kd.insert(p, i)
    kd.balance()
    return kd


def _mais_perto(kd, Q):
    """Menor distância (m) dos pontos Q (N×3) à nuvem da árvore kd, e o ponto de Q onde ela acontece."""
    melhor, onde = 1e9, None
    for q in Q:
        co, i, d = kd.find(q)
        if d < melhor:
            melhor, onde = d, q
    return melhor, onde


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)             # mão de referência do pegador de 30 mm (antes do Maos)
    pg.usar_polegar("volta")                  # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado: tronco TRONCO° pra trás, coxas deitadas e um pouco abertas, canelas em pé, pés chapados no chão ──────────────────
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
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    tt = cab("Neck") - cab("Hips")
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    gl = G[np.abs(G[:, 0]) < LARG_ASSENTO / 2]
    y_tras = float(gl[gl[:, 2] < float(gl[:, 2].min()) + 0.06][:, 1].max()) + 0.04
    y_frente = y_tras - PROF_ASSENTO
    Gs = gl[(gl[:, 1] > y_frente) & (gl[:, 1] < y_tras)]
    topo = float(Gs[:, 2].min()) + AFUNDA
    print("SENTADO | tronco %.1f° (− = pra trás; repouso %.1f°) | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f" % (
        math.degrees(math.atan2(-tt.y, tt.z)), frente_rep, *H, topo, y_frente, y_tras), flush=True)

    # rolos das coxas: eixo ROLO_JOELHO atrás do centro do joelho, encostando em cima das coxas (a pele afunda AFUNDA)
    joelho = (cab("LeftLeg") + cab("RightLeg")) / 2
    y_r = joelho.y + ROLO_JOELHO
    C = pele(("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
    C = C[(np.abs(C[:, 0]) > X_ROLO) & (np.abs(C[:, 0]) < X_ROLO + COMP_ROLO) & (np.abs(C[:, 1] - y_r) < RAIO_ROLO)]
    z_r = float((C[:, 2] + np.sqrt(RAIO_ROLO ** 2 - (C[:, 1] - y_r) ** 2)).max()) - AFUNDA
    pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    y_torre = float(pes[:, 1].min()) - TORRE_PES
    print("ROLOS | joelho (%.4f %.4f %.4f) | eixo dos rolos y %.4f z %.4f | ponta dos pés y %.3f → frente da torre y %.3f" % (
        *joelho, y_r, z_r, float(pes[:, 1].min()), y_torre), flush=True)

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

    # ── 3) o triângulo (planejado sem a máquina: a roldana entra depois) e as mãos ───────────────────────────────────────────────
    tri = e3.triangulo_polia("triangulo", raio=RAIO)
    X_VAO = tri.entre / 2                    # vão de cada mão no meio do pegador, a ±7 cm do meio (14 cm entre os eixos)
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    estado, DEDOS = {}, {}
    roldana = [None]                         # eixo da roldana (Vector) quando já se sabe
    pecas_tri = ck._malhas(tri.raiz) + ck._malhas(tri.engate)
    # pontos da superfície do triângulo no referencial de cada raiz (peça rígida): a cada quadro, só a matriz da raiz muda
    p3.atualizar()
    amostra_local = []
    for raiz in (tri.raiz, tri.engate):
        Mi = np.array(raiz.matrix_world.inverted())
        P_ = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.005) for o in ck._malhas(raiz)])
        amostra_local.append((raiz, P_ @ Mi[:3, :3].T + Mi[:3, 3]))

    def tri_pontos():
        out = []
        for raiz, P_ in amostra_local:
            M = np.array(raiz.matrix_world)
            out.append(P_ @ M[:3, :3].T + M[:3, 3])
        return np.concatenate(out)

    def direcao(p):
        """Direção do cabo saindo de p pra roldana (antes dela existir: pra cima)."""
        if roldana[0] is None:
            return Z.copy()
        return e3.Polia(None, None, roldana[0], RAIO_ROLDANA, (0, 1, 0)).direcao(p)

    def eixos_tronco():
        return (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))

    def polo(L, s):
        cima, lado, frente = eixos_tronco()
        return cab(L + "Arm") - lado * (s * POLO[0]) - frente * POLO[1] + cima * POLO[2]

    def eixo_pegador(f):
        """Eixo dos pegadores (pra trás, +Y), no plano vertical do meio, ⟂ ao antebraço f visto de lado (o punho reto: os 2 antebraços
        convergem pro meio igual, então os 2 ficam ⟂ ao mesmo eixo)."""
        fs = Vector((0.0, f.y, f.z)).normalized()
        return Vector((0.0, fs.z, -fs.y))

    def mao_no(u, s, f):
        """Dedos (o antebraço f tirado o que ele tem ao longo do pegador u) e palma (pro meio: pegada neutra) da mão do lado s."""
        dq = (f - u * f.dot(u)).normalized()
        pq = dq.cross(u).normalized()
        if pq.x * s > 0:
            pq = -pq
        return dq, pq

    def maos_no_triangulo(c, voltas=4):
        """As 2 mãos nos pegadores com o meio deles em c: IK a partir do braço de repouso (o polo do cotovelo pra baixo e pra trás),
        os pegadores ⟂ aos antebraços (converge em 2–3 voltas). Devolve o eixo dos pegadores."""
        fs = {L: estado[L] if L in estado else (c + X * (s * X_VAO) - cab(L + "Arm")).normalized() for L, s in LADOS}
        u = eixo_pegador(fs["Left"] + fs["Right"])
        for _ in range(voltas):
            for L, s in LADOS:
                dq, pq = mao_no(u, s, fs[L])
                for n in ("Arm", "ForeArm", "Hand"):   # o IK parte sempre do braço de repouso (cotovelo dobrado pra frente)
                    PB[p3.P + L + n].matrix_basis = Matrix()
                p3.atualizar()
                maos.segurar(L, c + X * (s * X_VAO), dq, pq, polo=polo(L, s))
            novo = {L: (cab(L + "Hand") - cab(L + "ForeArm")).normalized() for L, _ in LADOS}
            pronto = max(novo[L].angle(fs[L]) for L, _ in LADOS) < math.radians(0.3)
            fs = novo
            u = eixo_pegador(fs["Left"] + fs["Right"])
            if pronto:
                break
        estado.update(fs)
        for L, _ in LADOS:
            if L in DEDOS:                          # mão rígida no pegador: os dedos e o polegar fechados no começo, iguais
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
        p3.atualizar()
        return u

    def por_triangulo(c, u, dirf):
        eng = tri.por(c, u, dirf)
        p3.atualizar()
        return eng

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

    def torcao():
        """Torção do antebraço (giro em volta do próprio eixo, graus) [E, D] — só pra informação."""
        out = []
        for L, _ in LADOS:
            q = PB[p3.P + L + "ForeArm"].matrix_basis.to_quaternion()
            tau = 2 * math.atan2(q.y, q.w)
            out.append(math.degrees((tau + math.pi) % (2 * math.pi) - math.pi))
        return out

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
        f_r = Vector((-s * 0.15, 0.0, 1.0)).normalized()
        dq_r, pq_r = mao_no(eixo_pegador(f_r), s, f_r)
        g_r = Vector((s * X_VAO, Sx.y - 0.05, Sx.z + 0.50))
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + L + n].matrix_basis = Matrix()
        p3.atualizar()
        maos.segurar(L, g_r, dq_r, pq_r, polo=polo(L, s))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm | braço %.4f "
              "antebraço %.4f" % (L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000, Lb, La), flush=True)

    def punho_de(L, s, g, f):
        dq, pq = mao_no(eixo_pegador(f), s, f)
        o = OFF[L]
        return g - (dq * o[0] + pq * o[1] + dq.cross(pq) * o[2])

    def alcance(L, s, c):
        """Ombro → punho (m) com a mão no meio do pegador do lado s e o braço quase reto (antebraço ≈ na reta ombro → punho)."""
        g = c + X * (s * X_VAO)
        Sx = cab(L + "Arm")
        f = (g - Sx).normalized()
        for _ in range(4):
            W = punho_de(L, s, g, f)
            f = (W - Sx).normalized()
        return (W - Sx).length

    # começo: o meio dos pegadores DY0 atrás do ponto do fim (C1), na altura que deixa o cotovelo mais esticado dos 2 com COTOVELO0°
    def comeco(C1):
        escapulas(0.0)
        S = S_meio()
        d0 = math.sqrt(Lb * Lb + La * La + 2 * Lb * La * math.cos(math.radians(COTOVELO0)))
        lo, hi = S.z + 0.20, S.z + 0.90
        for _ in range(30):
            meio = (lo + hi) / 2
            if max(alcance(L, s, Vector((0.0, C1.y + DY0, meio))) for L, s in LADOS) < d0:
                lo = meio                          # o braço ainda dobra mais que COTOVELO0: o triângulo sobe
            else:
                hi = meio
        C0 = Vector((0.0, C1.y + DY0, lo))
        print("COMEÇO | meio dos pegadores (%.4f %.4f) | reta ombro → mão %.1f° à frente da vertical (vista de lado)" % (
            C0.y, C0.z, math.degrees(math.atan2(S.y - C0.y, C0.z - S.z))), flush=True)
        return C0

    def corpo_bvh(partes):
        co, tri_, (nomes, dono) = _malha(bon)
        m = _grupo(nomes, dono, partes)
        return ck._bvh(co, tri_[m[tri_].all(axis=1)])

    TRONCO_PARTES = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")

    def folga_bvh(bvh, Q):
        """Menor distância (m) dos pontos Q até a superfície do BVH, com sinal (− = dentro, perto da pele), e o ponto."""
        melhor, onde = 1e9, None
        for q in Q:
            v = Vector(q)
            loc, nor, idx, dist = bvh.find_nearest(v)
            if loc is None:
                continue
            d = -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist
            if d < melhor:
                melhor, onde = d, v
        return melhor, onde

    # fim: o meio dos pegadores DZ1 em relação à articulação dos ombros; o ponto mais perto do peito em que o triângulo fica a GAP_MIN
    # da pele (tronco, pescoço, cabeça) e o cotovelo mais dobrado não passa de COTOVELO1°
    def fim():
        escapulas(1.0)
        S = S_meio()
        z1 = S.z + DZ1
        bvh = corpo_bvh(TRONCO_PARTES)

        def medir(y):
            estado.clear()
            c = Vector((0.0, y, z1))
            u = maos_no_triangulo(c)
            por_triangulo(c, u, direcao)
            gap, onde = folga_bvh(bvh, tri_pontos())
            return gap, max(cotovelos()), onde

        lo, hi = S.y - 0.50, S.y + 0.10
        for _ in range(18):
            meio = (lo + hi) / 2
            gap, cot, _ = medir(meio)
            if gap > GAP_MIN and cot <= COTOVELO1:
                lo = meio                          # longe do peito e o cotovelo ainda pode dobrar: o triângulo vai pra trás (+Y)
            else:
                hi = meio
        gap, cot, onde = medir(lo)
        print("FIM | ombros (%.4f %.4f) | meio dos pegadores z %.4f → y %.4f | triângulo → peito/pescoço %.1f mm em (%.3f %.3f %.3f) | "
              "cotovelo %.1f° (máx %.0f)" % (S.y, S.z, z1, lo, gap * 1000, *(onde or Vector()), cot, COTOVELO1), flush=True)
        return Vector((0.0, lo, z1))

    # o caminho do triângulo: reta de C0 a C1, com um bojo pra frente (−Y) no meio se o rosto pedir
    caminho = {"C0": None, "C1": None, "bojo": 0.0}

    def ponto(t):
        C0, C1 = caminho["C0"], caminho["C1"]
        return Vector((0.0, p3.lerp(C0.y, C1.y, t) - caminho["bojo"] * math.sin(math.pi * t), p3.lerp(C0.z, C1.z, t)))

    extras = [o for o in bpy.data.objects if o.type == "MESH" and o is not bon.corpo and o.parent is rig]
    rosto_kd = {}

    def rosto(t):
        """Árvore dos pontos da pele da cabeça e do pescoço + cabelo, sobrancelhas e olhos, com as escápulas de t."""
        k = round(t, 3)
        if k not in rosto_kd:
            escapulas(t)
            co, _, (nomes, dono) = _malha(bon)
            P_ = np.concatenate([co[_grupo(nomes, dono, ("Neck", "Head"))]] + [ck._avaliar_simples(o)[0] for o in extras])
            rosto_kd[k] = _arvore(P_)
        return rosto_kd[k]

    def rosto_agora():
        """A mesma árvore do rosto, com o corpo como está agora (sem mexer na pose)."""
        co, _, (nomes, dono) = _malha(bon)
        P_ = np.concatenate([co[_grupo(nomes, dono, ("Neck", "Head"))]] + [ck._avaliar_simples(o)[0] for o in extras])
        return _arvore(P_)

    def pontos_maos():
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, tuple(n for n in nomes if n.startswith(("LeftHand", "RightHand"))))]

    def folgas_rosto(kd, c, saida):
        """Triângulo (superfície), mãos e cabo → rosto (m), com o triângulo e as mãos já no lugar."""
        d_tri = _mais_perto(kd, tri_pontos())[0]
        d_mao = _mais_perto(kd, pontos_maos())[0]
        d_cabo = 1e9
        if saida is not None:
            eng = tri.ponto_engate
            n_ = max(2, int((Vector(saida) - eng).length / 0.01))
            seg = [eng.lerp(Vector(saida), i / n_) for i in range(n_ + 1)]
            d_cabo = _mais_perto(kd, seg)[0] - 0.003
        return d_tri, d_mao, d_cabo

    def pose_plano(t):
        """O quadro t do caminho planejado (sem a máquina: a roldana do plano)."""
        escapulas(t)
        c = ponto(t)
        u = maos_no_triangulo(c)
        por_triangulo(c, u, direcao)
        saida = None
        if roldana[0] is not None:
            saida = e3.Polia(None, None, roldana[0], RAIO_ROLDANA, (0, 1, 0)).tangente(tri.ponto_engate)[0]
        return c, saida

    def planejar():
        if caminho["C1"] is None:                   # as mãos no meio dos pegadores, a ±7 cm do meio: o começo e o fim não mudam
            caminho["C1"] = fim()                   # com a roldana (ela só gira o triângulo em volta do eixo dos pegadores)
            caminho["C0"] = comeco(caminho["C1"])
        caminho["bojo"] = 0.0
        ts = [i / 10 for i in range(11)]
        for volta in range(8):
            piores, engs = [], []
            estado.clear()
            for t in ts:
                kd = rosto(t)
                c, saida = pose_plano(t)
                d_tri, d_mao, d_cabo = folgas_rosto(kd, c, saida)
                piores.append((min(d_tri, d_mao, d_cabo + FOLGA_ROSTO - FOLGA_CABO), t, d_tri, d_mao, d_cabo))
                engs.append(tri.ponto_engate.y)
            pf, tp, d_tri, d_mao, d_cabo = min(piores)
            print("PLANO volta %d | bojo %.1f mm | pior folga ao rosto em t=%.1f: triângulo %.1f mm, mãos %.1f mm, cabo %.1f mm" % (
                volta, caminho["bojo"] * 1000, tp, d_tri * 1000, d_mao * 1000, d_cabo * 1000), flush=True)
            if pf >= FOLGA_ROSTO or caminho["bojo"] > 0.15:
                break
            caminho["bojo"] += (FOLGA_ROSTO - pf) / max(math.sin(math.pi * tp), 0.3) + 0.002
        y_min = min(min(engs), min(ponto(t).y for t in ts))
        return y_min, pf, tp

    # polo certo do cotovelo, com ele dobrado, antes de medir o cotovelo no planejamento do fim (o IK muda com o polo)
    escapulas(1.0)
    S1 = S_meio()
    estado.clear()
    maos_no_triangulo(Vector((0.0, S1.y - 0.30, S1.z + DZ1)))
    acertar_polos()
    estado.clear()

    y_min, pf, tp = planejar()
    for volta in range(3):                          # a roldana à frente do caminho; com ela, o triângulo gira e o caminho muda um pouco
        roldana[0] = Vector((0.0, y_min - ROLDANA_FRENTE, Z_ROLDANA))
        y_min, pf, tp = planejar()
        print("CAMINHO volta %d | C0 (%.4f %.4f) C1 (%.4f %.4f) bojo %.1f mm | pior folga ao rosto %.1f mm em t=%.1f | roldana y %.4f, "
              "caminho mais à frente y %.4f" % (
                  volta, caminho["C0"].y, caminho["C0"].z, caminho["C1"].y, caminho["C1"].z, caminho["bojo"] * 1000, pf * 1000, tp,
                  roldana[0].y, y_min), flush=True)
        if y_min - roldana[0].y >= ROLDANA_FRENTE - 0.002:
            break

    # ── 4) a máquina em volta do corpo ───────────────────────────────────────────────────────────────────────────────────────────
    R = roldana[0]
    est = e3.estacao_puxada("puxada", roldana=(R.y, R.z), assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                            rolos=(y_r, z_r, RAIO_ROLO, COMP_ROLO, X_ROLO), torre=y_torre, raio_roldana=RAIO_ROLDANA)
    pol = est.pol

    # ── 5) pose ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    def pose(t):
        """t=0 braços esticados pra cima segurando o triângulo com a pegada neutra, escápulas subidas; t=1 o triângulo na parte de
        cima do peito, cotovelos dobrados, embaixo e um pouco atrás, do lado do tronco, escápulas descidas e pra trás."""
        if t <= 1e-9:
            estado.clear()                           # o começo não depende do quadro anterior
        escapulas(t)
        c = ponto(t)
        u = maos_no_triangulo(c)
        eng = tri.por(c, u, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        torcer()
        if not DEDOS:
            pose.dedos = {}
            for L, s in LADOS:
                g = tri.pegadores[s].matrix_world.to_translation()
                pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
            p3.atualizar()
        pose.c, pose.u = c, u

    pose.c, pose.u, pose.dedos = Vector(), Vector((0, 1, 0)), {}
    # polo certo do cotovelo com ele dobrado (fim) e os dedos fechados UMA vez, no começo
    pose(1.0)
    acertar_polos()
    estado.clear()
    DEDOS.clear()
    pose(0.0)
    for L, s in LADOS:
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)
    estado.clear()

    # ── 6) medidas do quadro (info) ──────────────────────────────────────────────────────────────────────────────────────────────
    PEGA = ("triangulo_pegada+1", "triangulo_pegada-1")

    def maos_fora_da_pegada():
        """Mão × triângulo FORA dos pegadores (hastes, tampas, chapa, mosquetão; a checagem ignora o que fica dentro da mão), mão ×
        cabo e mão × mão (a pele de uma até a da outra), com sinal (− = entrou) — mm."""
        co, tri_, (nomes, dono) = _malha(bon)
        bvh = ck._bvh(co, tri_)
        mao = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith(("LeftHand", "RightHand"))))
        menor_t, onde = 1e9, ""
        for ob in pecas_tri:
            if ob.name in PEGA:
                continue
            eco, etri = ck._avaliar_simples(ob)
            for p in ck._amostras(eco, etri, 0.004):
                v = Vector(p)
                loc, nor, idx, dist = bvh.find_nearest(v)
                if loc is None or not mao[tri_[idx][0]]:
                    continue
                d_ = -dist if (v - loc).dot(nor) < 0 else dist
                if d_ < menor_t:
                    menor_t, onde = d_, ob.name
        cabo_m = float(_dist_segmento(co[mao], pol.saida, tri.ponto_engate).min()) - 0.003
        maoE = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith("LeftHand")))
        maoD = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith("RightHand")))
        bvh_d = ck._bvh(co, tri_[maoD[tri_].all(axis=1)])
        mm = 1e9
        for p in co[maoE]:
            v = Vector(p)
            loc, nor, idx, dist = bvh_d.find_nearest(v)
            if loc is not None:
                mm = min(mm, -dist if (v - loc).dot(nor) < 0 else dist)
        return menor_t * 1000, onde, cabo_m * 1000, mm * 1000

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        d_tri, d_mao, d_cabo = folgas_rosto(rosto_agora(), pose.c, pol.saida)
        gap, onde = folga_bvh(corpo_bvh(("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")), tri_pontos())
        ft, onde_t, fc, mm = maos_fora_da_pegada()
        cabo_v = math.degrees((pol.saida - tri.ponto_engate).angle(Z))
        return ("triângulo (%.3f %.3f) | cabo %.1f° da vertical, %.3f m | triângulo → peito/tronco %.0f mm | triângulo → rosto %.0f mm, "
                "mãos → rosto %.0f mm, cabo → rosto %.0f mm | cotovelo %.0f/%.0f° | elevação %s° | braço à frente %s° | abertura %s° | "
                "cotovelo × tronco %s° | antebraço × vertical %s° | punho %.0f/%.0f° (flexão %s, desvio %s) | palma pro meio %s° | "
                "pegada %.2f | cotovelos %.2f | escápula %s mm, clavícula %s° | tronco %.1f° | coluna %.1f° | cabeça %s° | quadril %.0f/%.0f° | "
                "mão × triângulo fora da pegada %.1f mm (%s) | mão × cabo %.0f mm | mão × mão %.0f mm | torção do antebraço %s° | %s" % (
                    pose.c.y, pose.c.z, cabo_v, pol.comprimento, gap * 1000, d_tri * 1000, d_mao * 1000, d_cabo * 1000,
                    jt["cotoveloE"], jt["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), jt["punhoE"], jt["punhoD"],
                    "/".join("%+.0f" % v for v in tc.punho_flexao(jj)), "/".join("%+.0f" % v for v in tc.punho_desvio(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0], tc.cotovelos_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Shoulder", "Arm"]})),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), jt["quadrilE"], jt["quadrilD"],
                    ft, onde_t, fc, mm, "/".join("%.0f" % v for v in torcao()), maos.info()))

    print("MÁQUINA | roldana (y %.4f z %.4f) | assento topo %.3f | rolos y %.3f z %.3f | torre y %.3f" % (
        R.y, R.z, topo, y_r, z_r, y_torre), flush=True)
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(tri.pegadores[s], tri.raio, tri.meia, eixo=(1, 0, 0))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, tri.raizes + est.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 1.2),
                camera_video=((3.0, yq + 2.9, 1.9), (0, yq - 0.2, 1.15), 45), info=info, apoios=est.apoios, afunda_apoio_mm=20)
