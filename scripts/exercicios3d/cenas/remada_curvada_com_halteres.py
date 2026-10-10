# Remada Curvada com Halteres — cena da fábrica 3D (lote 8, 09/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos
# nos treinos prontos e 16 como troca equivalente; a variação está vazia no catálogo — "em pé, tronco inclinado", pelo nome e pelo
# fonte_en "Bent Over Two-Dumbbell Row").
# t = 0 em pé, pés na largura do quadril, joelhos levemente dobrados e o tronco inclinado à frente, quase paralelo ao chão, com a
#       coluna neutra; um halter em cada mão com a pegada pronada (palmas viradas pro corpo: pras pernas), os braços esticados
#       pendurados embaixo dos ombros e as escápulas soltas (os ombros descem um pouco pro chão)
# t = 1 os 2 halteres embaixo da parte de cima do abdômen, perto da cintura, os cotovelos pra trás, junto do corpo, passando da
#       linha do tronco, e as escápulas aproximadas. Tronco, pernas e cabeça parados o movimento todo. O app faz a volta.
# Técnica (fontes na ficha, com as frases):
#   fonte_en do catálogo (free-exercise-db, domínio público — a lista de onde veio o nome): "With a dumbbell in each hand (palms
#     facing your torso), bend your knees slightly and bring your torso forward by bending at the waist; as you bend make sure to
#     keep your back straight until it is almost parallel to the floor." / "The weights should hang directly in front of you as your
#     arms hang perpendicular to the floor and your torso." / "While keeping the torso stationary, lift the dumbbells to your side
#     (as you breathe out), keeping the elbows close to the body" / "On the top contracted position, squeeze the back muscles". A
#     pegada com as palmas uma pra outra é OUTRO exercício da lista ("Bent Over Two-Dumbbell Row With Palms In": "palms facing each
#     other"): a padrão desta é a pronada.
#   ExRx, Dumbbell Bent-over Row (a de 1 braço, com joelho e mão no banco): "Pull dumbbell to up to side until it makes contact with
#     ribs or until upper arm is just beyond horizontal. Return until arm is extended and shoulder is stretched downward." / "Allow
#     scapula to articulate but do not rotate torso in effort to throw weight up. Torso should be close to horizontal."
#   ExRx, Barbell Bent-over Row: "Bend knees slightly and bend over bar with back straight." / "Pull bar to upper waist." / "Torso
#     may be kept horizontal for strict execution. Knees are bent in effort to keep low back straight" / "A shoulder width or
#     underhand grip can increase lat involvement by emphasizing shoulder extension over transverse extension."
#   NSCA, Basics of Strength and Conditioning Manual (2012), Bent-Over Row (barra): "place feet hip-width apart with toes pointed
#     straight ahead" / "Keeping the back flat and knees slightly flexed, push hips backward and lower torso until it is parallel
#     with the floor" / "Pull the bar upward until it touches the upper abdomen" / "Maintain a flat back position throughout the
#     entire lift". NSCA PTQ 9.4 (remada com 2 halteres/kettlebells, quadril dobrado): "hinge at the hip with a slight bend in the
#     knees" / "neutral spine position (not rounded over) with their chin tucked in looking straight at the floor" / "keep the elbow
#     close to the ribs as they row".
#   ACE, Bent-over Row (barra): "bend forward at the hips, and keep the back straight with a slight bend in the knees. Lower the bar
#     towards the floor until the elbows are completely straight"; ACE, Single-arm Row (halter): "Your back should be flat and head
#     aligned with your spine" / "Keep your arm close to the side of your body".
# Montagem: o tronco inteiro (pelve, coluna e cabeça juntos, coluna neutra) gira INCLINA graus em volta das articulações do quadril;
# os joelhos dobram JOELHO graus com os tornozelos parados e a canela quase em pé (CANELA), o que leva o quadril pra trás e equilibra
# o tronco em cima do pé (a conta do Crucifixo Invertido com Halteres, com o recuo do quadril saindo do ângulo da canela); a cabeça
# volta PESCOCO graus pra ficar na linha da coluna. As escápulas giram em volta do eixo do tronco: soltas (pra frente, pro chão)
# embaixo e aproximadas em cima. Cada halter anda em linha reta: começa embaixo do ombro, na altura em que o cotovelo fica com
# COTOVELO0 graus (braço esticado, sem travar), e termina embaixo da barriga, perto da cintura, a CINTURA do meio dos quadris ao
# longo do tronco, com FOLGA até a pele da barriga — o 1º ponto saindo do eixo do tronco pra baixo com essa folga, medido na pele (a
# coxa, embaixo, fica com folga parecida: o montar() imprime as 2). Com o tronco mais deitado (70°) e a pegada pronada, a anilha de
# dentro não cabia entre a barriga e as coxas perto da cintura, e embaixo da parte de cima do abdômen o cotovelo passava de 130°
# (prévias de 09/10/2026): por isso 65°, no meio entre a horizontal das fontes e os 45° das fotos do free-exercise-db. O braço vai por
# IK (maos3d, como nas remadas com barra) com o polo do cotovelo atrás do ombro, um pouco pra fora (cotovelo pra trás, junto do
# corpo); a palma fica virada pra trás (pras pernas: pegada pronada) e o halter vai no vão da mão, na linha dos nós dos dedos, com o
# polegar novo dando a volta no pegador.
import math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

INCLINA = 65.0        # tronco à frente da vertical (graus): quase paralelo ao chão
JOELHO = 30.0         # flexão dos joelhos (graus), parada: levemente dobrados
CANELA = 1.0          # canela à frente da vertical (graus): quase em pé — o quadril vai pra trás e equilibra o tronco em cima do pé
PES_X = 0.14          # tornozelos a ±PES_X do meio (m): pés na largura do quadril
PESCOCO = 10.0        # extensão do pescoço (graus): a cabeça na linha da coluna
ESCAPULA = (8.0, -10.0)   # escápulas em volta do eixo do tronco (graus): + soltas pra frente (pro chão) → − aproximadas
GX = (0.215, 0.235)   # meio da mão (centro do halter) a ±GX do meio do corpo (m), começo → fim
DY0 = 0.0             # começo: halter DY0 m atrás da vertical do ombro
COTOVELO0 = 8.0       # começo: flexão do cotovelo (graus) — braço esticado, sem travar
CINTURA = 0.20        # fim: halter embaixo da barriga, perto da cintura, a CINTURA m do meio dos quadris ao longo do tronco
FOLGA = 0.012         # fim: folga entre o halter e a pele da barriga (m)
POLO = (0.06, 0.60, 0.0)  # polo do cotovelo a partir do ombro, no referencial do tronco (m: pra fora, pras costas, pra cabeça)
ALINHAR = 0.5         # quanto os dedos seguem o antebraço em vez de apontar pro chão (punho menos dobrado em cima)
RAIO = 0.0145         # pegada do halter: 29 mm, o cilindro da mão de referência (como nas outras cenas com halter)
PEGADA_H = 0.13       # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05
DEDOS_Q = Vector((0.0, 0.0, -1.0))   # halter pendurado: dedos pro chão
PALMA_Q = Vector((0.0, 1.0, 0.0))    # pegada pronada: palma virada pra trás (pras pernas, "palms facing your torso")
LADOS = (("Left", 1), ("Right", -1))


def montar(bon):
    pg.usar_polegar("volta")                       # polegar dando a volta no halter (jeito novo, lote 3)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    coxa = (c("LeftLeg") - c("LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - c("LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q0 = c("LeftUpLeg")
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    a_, k_ = math.radians(CANELA), math.radians(JOELHO)
    recua = tornoz.y - canela * math.sin(a_) + coxa * math.sin(k_ - a_) - q0.y    # quadril pra trás: canela a CANELA graus

    # ── pernas por IK: tornozelos parados a ±PES_X do meio (altura e y do repouso), joelhos pra frente, pés chapados ──────────
    pernas = {}
    for lado, s in LADOS:
        tz = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * PES_X, tz.y, tz.z)))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    estado = {}

    def corpo(t):
        """Tronco inclinado INCLINA graus em volta das articulações do quadril, que vão pra trás (canela a CANELA graus) e descem o
        que for preciso pros joelhos dobrarem JOELHO graus com os tornozelos parados; a cabeça volta PESCOCO graus; as escápulas
        giram em volta do eixo do tronco (soltas pra frente no começo, aproximadas no fim)."""
        for n in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(k_))   # quadril → tornozelo
        dx, dy = q0.x - PES_X, q0.y + recua - tornoz.y
        desce = tornoz.z + math.sqrt(max(d ** 2 - dx ** 2 - dy ** 2, 0.01)) - q0.z
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((0, recua, desce)))
        if PESCOCO:
            p3.girar_osso(rig, "Neck", p3.rot_x(-PESCOCO))
        g = p3.lerp(*ESCAPULA, t)
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))
        estado.update(escapula=g, desce=desce)

    corpo(0.0)
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)

    maos = Maos(bon, RAIO, polegar_modo="volta")
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA, larg_anilha=LARG_ANILHA)
                for l, _ in LADOS}

    def eixos():
        """Referencial do tronco: cima (quadril → pescoço), lado (ombro esquerdo → direito) e frente (pra barriga)."""
        cima = (c("Neck") - c("Hips")).normalized()
        lado = c("RightArm") - c("LeftArm")
        lado = (lado - cima * lado.dot(cima)).normalized()
        return cima, lado, cima.cross(lado)

    def polo(L, s):
        cima, lado, frente = eixos()
        return c(L + "Arm") - lado * (s * POLO[0]) - frente * POLO[1] + cima * POLO[2]

    def pegar(L, s, g):
        """Mão L com o vão em g (o IK parte sempre do braço de repouso)."""
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + L + n].matrix_basis = Matrix()
        p3.atualizar()
        maos.segurar(L, g, DEDOS_Q, PALMA_Q, polo=polo(L, s), alinhar=ALINHAR)

    # ── pele que o halter não pode tocar no fim: tronco e coxas ───────────────────────────────────────────────────────────────
    def _pele(partes):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    def _dist_halter(P, centro):
        """Menor distância (m, − = dentro) dos pontos P até o halter de eixo X centrado em `centro`: as 2 anilhas e o eixo."""
        d = P - np.array(centro)
        a, rho = d[:, 0], np.hypot(d[:, 1], d[:, 2])
        menor = 1e9
        meio = PEGADA_H / 2
        for lo, hi, r in ((-meio - LARG_ANILHA, -meio, RAIO_ANILHA), (meio, meio + LARG_ANILHA, RAIO_ANILHA),
                          (-meio - LARG_ANILHA - 0.01, meio + LARG_ANILHA + 0.01, RAIO)):
            fora = np.hypot(np.maximum(np.maximum(lo - a, a - hi), 0.0), np.maximum(rho - r, 0.0))
            dentro = (a > lo) & (a < hi) & (rho < r)
            prof = np.minimum(np.minimum(a - lo, hi - a), r - rho)
            menor = min(menor, float(np.where(dentro, -prof, fora).min()))
        return menor

    # ── fim: o halter embaixo do abdômen, a CINTURA do meio dos quadris ao longo do tronco, com FOLGA até a pele ────────────────
    corpo(1.0)
    cima, lado, frente = eixos()
    H = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    tronco = _pele(("Hips", "Spine", "Spine1", "Spine2"))
    coxas = _pele(("LeftUpLeg", "RightUpLeg"))
    G1 = {}
    for L, s in LADOS:
        base = H + cima * CINTURA
        base.x = s * GX[1]
        d = 0.0                                    # do eixo do tronco pra baixo: o 1º ponto com a folga até a barriga
        while _dist_halter(tronco, base + frente * d) < FOLGA and d < 0.40:
            d += 0.001
        G1[L] = base + frente * d
        print("REMADA fim %s: halter (%.3f %.3f %.3f) | %.0f mm à frente do eixo do tronco | folga %.1f mm da barriga, %.1f mm "
              "das coxas" % (L, *G1[L], d * 1000, _dist_halter(tronco, G1[L]) * 1000, _dist_halter(coxas, G1[L]) * 1000),
              flush=True)

    def cotovelo(L):
        j = ck.medir_juntas(rig)
        return j["cotovelo" + ("E" if L == "Left" else "D")]

    # ── começo: embaixo do ombro, na altura em que o cotovelo fica com COTOVELO0 graus ───────────────────────────────────────────
    corpo(0.0)
    G0 = {}
    for L, s in LADOS:
        S0 = c(L + "Arm")
        lo, hi = S0.z - 0.80, S0.z - 0.40
        for _ in range(22):
            m = (lo + hi) / 2
            pegar(L, s, Vector((s * GX[0], S0.y + DY0, m)))
            if cotovelo(L) > COTOVELO0:
                hi = m                               # cotovelo dobrado demais: o halter desce
            else:
                lo = m
        G0[L] = Vector((s * GX[0], S0.y + DY0, hi))
        print("REMADA começo %s: halter (%.3f %.3f %.3f) | ombro (%.3f %.3f %.3f)" % (L, *G0[L], *S0), flush=True)

    # polo certo do cotovelo no meio do movimento
    corpo(0.5)
    for L, s in LADOS:
        pegar(L, s, G0[L].lerp(G1[L], 0.5))
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)
    print("GEOMETRIA quadril %.1f mm pra trás, desce %.1f mm" % (recua * 1000, estado["desce"] * 1000), flush=True)

    def pose(t):
        """t=0 braços esticados com os halteres pendurados embaixo dos ombros, t=1 halteres embaixo do abdômen."""
        corpo(t)
        for L, s in LADOS:
            pegar(L, s, G0[L].lerp(G1[L], t))
            g, _ = pg.ponto_na_mao(bon, L, RAIO)
            eixo = pg._base(rig, L)[1]                     # o halter fica na linha dos nós dos dedos
            h = halteres[L]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            # polegar perto do quadro anterior (sem salto); t=0 recomeça do zero (checagem e captura saem iguais)
            antes = pose.dedos.get(L, {}).get("Thumb") if t > 0 else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    def _cilindros(lado):
        """Centro e eixo (mundo) do halter do lado."""
        M = halteres[lado].matrix_world
        return np.array(M.to_translation()), np.array((M.to_3x3() @ Vector((1, 0, 0))).normalized())

    def mao_x_anilhas(co, nomes, dono, lado):
        """Menor distância (mm, − = dentro) da pele da mão (palma, dedos e polegar) até as 2 anilhas do halter do mesmo lado: a
        checagem de peso × corpo não olha a mão (o que fica dentro dela é assunto da pegada)."""
        m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
        cc, u = _cilindros(lado)
        d = co[m] - cc
        a = d @ u
        rho = np.linalg.norm(d - np.outer(a, u), axis=1)
        pior = 1e9
        for s in (-1, 1):
            lo, hi = sorted((s * PEGADA_H / 2, s * (PEGADA_H / 2 + LARG_ANILHA)))
            fora = np.hypot(np.maximum(np.maximum(lo - a, a - hi), 0.0), np.maximum(rho - RAIO_ANILHA, 0.0))
            dentro = (a > lo) & (a < hi) & (rho < RAIO_ANILHA)
            prof = np.minimum(np.minimum(a - lo, hi - a), RAIO_ANILHA - rho)
            pior = min(pior, float(np.where(dentro, -prof, fora).min()))
        return pior * 1000

    def halter_x_halter():
        """Menor distância (mm) entre as superfícies dos 2 halteres (vértices de um × superfície do outro)."""
        def malha(lado):
            cos, tris, n = [], [], 0
            for o in [halteres[lado]] + list(halteres[lado].children_recursive):
                if o.type != "MESH":
                    continue
                eco, etri = ck._avaliar_simples(o)
                cos.append(eco)
                tris.append(etri + n)
                n += len(eco)
            return np.concatenate(cos), np.concatenate(tris)
        coE, _ = malha("Left")
        coD, triD = malha("Right")
        bvh = BVHTree.FromPolygons([tuple(p) for p in coD], [tuple(t) for t in triD], all_triangles=True)
        return min(bvh.find_nearest(Vector(p))[3] for p in coE) * 1000

    def info():
        """Braço × tronco (frente/trás e pro lado), cotovelo e punho, halteres (centro), mão × anilhas, halter × halter, o
        polegar e o vão da mão (maos3d)."""
        jt = ck.medir_juntas(rig)
        j = ck.posicoes(rig)
        bf = ck.tc.braco_frente(j)
        ct = ck.tc.cotovelo_tronco(j)
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        txt = []
        for i, (lado, _) in enumerate(LADOS):
            ld = "E" if lado == "Left" else "D"
            h = halteres[lado].matrix_world.to_translation()
            txt.append("%s: braço %+.0f° frente, %.0f° pro lado | cotovelo %.0f° punho %.0f° | halter (x %+.3f y %+.3f z %.3f) | "
                       "mão × anilhas %+.1f mm | polegar %s" % (
                           ld, bf[i], ct[i], jt["cotovelo" + ld], jt["punho" + ld], h.x, h.y, h.z,
                           mao_x_anilhas(co, nomes, dono, lado), pose.dedos.get(lado, {}).get("Thumb")))
        return " | ".join(txt) + " | halter × halter %.0f mm | escápula %+.1f° | %s" % (
            halter_x_halter(), estado.get("escapula", 0.0), maos.info())

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 0.75),
                camera_video=((3.0, 2.6, 1.6), (0, -0.15, 0.7), 50), info=info)
