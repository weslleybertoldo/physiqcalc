# Mergulho no Banco — cena da fábrica 3D (lote 12, 11/10/2026; 0 usos nos treinos prontos e 2 como troca equivalente). Peso
# corporal, com as mãos no banco reto (o e3.banco dos supinos, atravessado atrás da pessoa, a borda comprida virada pra ela).
# t = 0 em cima: braços estendidos sem travar, mãos paradas na borda do banco, glúteo fora do banco, à frente da borda, pernas
#       esticadas pra frente com os calcanhares no chão e os pés juntos
# t = 1 embaixo: cotovelos a ~90° apontando pra trás, braço ~paralelo ao chão, antebraço quase em pé, tronco em pé, a lombar
#       passando rente à quina do banco sem encostar e o glúteo longe do chão. O app faz a volta.
# Técnica (fontes na ficha, com as frases):
#   • ACE (Boehler et al., 2011 — o estudo de EMG da ACE é do mergulho NO BANCO): "Begin by placing your hands on either side of
#     your hips so your palms are resting on the bench and your fingers are hanging over the edge. With your feet together, extend
#     your legs out in front of you." / "Carefully move your buttocks off the bench, while leaving your hands in place. Lower your
#     hips toward the floor until your upper arms are parallel to the floor."
#   • ExRx, Bench Dip (heels on floor): "Straighten arms, slide rear end off of edge of bench, and rest heels on floor with legs
#     straight." · free-exercise-db, Bench Dips (o fonte_en): "separated at shoulder width"; "an angle slightly smaller than 90
#     degrees between the upper arm and the forearm"; "Keep the elbows as close as possible throughout the movement. Forearms
#     should always be pointing down." · NASM, Bench Dips: "descending until your elbows bend to approximately 90 degrees";
#     "avoid locking out your elbows at the top"; erros "Allowing the shoulders to shrug", "Excessive forward lean", "Excessive
#     elbow flare" · McKenzie (tese/SCJ 2021): "Engage core, depress shoulder blades and maintain a neutral head position".
# Como o rig faz (quem desce é o CORPO: mãos paradas no banco, calcanhares parados no chão):
#   • corpo rígido (tronco, pelve, cabeça e clavículas como no repouso) girado em volta do X no meio dos quadris (TRONCO: + = pra
#     frente) e levado até o lugar em que os 2 vínculos fecham: o ombro (cabeça do úmero) à distância punho → ombro que dá a flexão
#     do cotovelo COTOVELO(t) e o quadril à distância de uma perna esticada (joelho a JOELHO°) do tornozelo parado — interseção de
#     2 círculos no plano sagital, exata (o tronco é rígido);
#   • pernas: a coxa gira em volta do quadril até o tornozelo cair no alvo parado; o pé tem a rotação travada no mundo (calcanhar
#     no chão, ponta pra cima, PE_GIRO°) — o tornozelo é o pivô e não anda; o tornozelo fica a PES_X do meio (pés juntos até onde
#     uma coxa não entra na outra);
#   • braços: IK do ombro ao punho parado com o cotovelo pra trás, congela, o antebraço gira no próprio eixo (pronação) até a linha
#     dos nós da mão ficar de lado, como no fim (assim o punho só estende e não torce), e o punho põe a mão espalmada no estofado, com os dedos pra frente pendurados na borda (a Flexão de Braço, lote 7, e a mão de apoio da Remada
#     Unilateral, lote 2): a palma encosta no estofado e cada dedo dobra nas 3 juntas até a pele encostar na quina arredondada e na
#     frente do estofado; o polegar fica deitado em cima, do lado do indicador (sem pegador, sem o polegar novo);
#   • o tornozelo (lugar dos pés) é escolhido pra a menor folga das costas/glúteo pro estofado no caminho ser FOLGA_BANCO: o
#     corpo desce rente ao banco sem encostar.
# Pernas esticadas + calcanhar parado: o quadril anda ~6 cm PRA TRÁS quando desce (a perna gira no calcanhar). Por isso em cima o
# glúteo fica uns 10 cm à frente da borda e o tronco reclinado (com o tronco em pé e o braço esticado o antebraço deitaria ~30°
# pra trás e o punho, com a palma chapada, passaria de 115°); embaixo o tronco fica em pé, com a lombar rente à quina.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TOPO = 0.44             # topo do estofado (m): o banco reto dos supinos (ACE: "a low bench"; ExRx: "Bench height should allow for
                        # full range of motion")
LARGURA = 0.30          # largura do estofado (fica ao longo do Y: o banco está atravessado)
COMPR = 1.20            # comprimento do banco (ao longo do X)
ESPESSURA = 0.06        # espessura do estofado (equip3d.banco)
CHANFRO = 0.015         # quina arredondada do estofado (equip3d.banco: chanfro de 15 mm, 3 segmentos)
BORDA_Y = 0.30          # y da borda da frente do estofado (a virada pra pessoa); o estofado vai de BORDA_Y a BORDA_Y + LARGURA
MAO_X = 0.235           # base do dedo médio a ±MAO_X: as mãos por fora do quadril (ACE: "on either side of your hips") e na
                        # largura dos ombros (free-exercise-db: "separated at shoulder width"); o quadril/glúteo vai a ±0,175
NOS_Y = -0.004          # base do dedo médio (cabeça do osso HandMiddle1) em relação à borda (m, − = à frente): a palma fica em
                        # cima do estofado e os dedos dobram na base pra ficar pendurados na frente dele (ACE: "your fingers are
                        # hanging over the edge")
PALMA_INCLINA = 6       # palma inclinada pra frente (graus): a parte da frente da palma desce na quina arredondada
AFUNDA_MAO = 0.0015     # palma apertando o estofado (m)
AFUNDA_DEDO = 0.0012    # dedos apertando a quina/frente do estofado (m)
AFUNDA_PE = 0.001       # calcanhar apertando o chão (m)
DOBRA_MAX = (100, 70, 60)   # cada junta do dedo (base, meio, ponta) dobra no máximo isso procurando o estofado (graus)
DOBRA_SOLTA = (92, 0, 0)    # se não encostar: a base fica pendurada em pé (a palma inclina PALMA_INCLINA) e o resto reto
JOELHO = 2.0            # flexão do joelho (graus): pernas esticadas (ExRx: "rest heels on floor with legs straight"); em pé 7,5°
PES_X = 0.07            # tornozelos a ±PES_X do meio (pés juntos — ACE: "With your feet together"), se uma coxa não entrar na
COXAS_MM = 1.6          # outra mais que isso (a checagem aceita 2 mm); senão os pés afastam o mínimo que precisar
ROT_EXT = 15            # pernas giradas pra fora em volta do eixo quadril → tornozelo (rotação externa do quadril, graus): as
                        # coxas do boneco musculoso se afastam por dentro e os pés chegam mais perto (a ponta dos pés abre um pouco,
                        # como nas pernas soltas esticadas no chão); o pé travado gira junto
PE_GIRO = 66            # pé girado com a ponta pra cima (graus, a partir do pé chapado do repouso), parado no mundo: só o
                        # calcanhar encosta no chão; o tornozelo fica entre ~3° de flexão dorsal em cima e ~11° de flexão
                        # plantar embaixo (a canela deita ~14° no caminho)
COTOVELO = (15, 90)     # flexão do cotovelo (graus): em cima esticado sem travar (NASM: "avoid locking out your elbows at the
                        # top") → embaixo ~90° (NASM: "approximately 90 degrees"; free-exercise-db: "slightly smaller than 90
                        # degrees between the upper arm and the forearm"; ACE: "until your upper arms are parallel to the floor")
TRONCO = (-15, 4)       # tronco (quadril → pescoço) × vertical, no plano sagital (graus, + = pra frente): em cima reclinado ~15° →
                        # embaixo quase em pé (NASM: "Minimize forward lean and maintain upright torso positioning"); o
                        # reclinado de cima é o que deixa o punho dentro da amplitude com o braço esticado (ver o cabeçalho)
CABECA = 0.5            # a cabeça compensa essa fração do tronco reclinado (dobra o pescoço pra frente): o olhar fica mais perto
                        # da horizontal, como nas fotos do free-exercise-db (com o tronco em pé, a cabeça fica neutra)
FOLGA_BANCO = 0.012     # menor folga das costas/glúteo pro estofado no caminho (m): rente, sem encostar
PARTES_BANCO = ("Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg")   # o que passa rente ao banco
T_FOLGA = (0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.0)                             # onde a folga é medida pra escolher os pés


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def sdf_estofado(P):
    """Distância com sinal (m) dos pontos P (N×3, mundo) até o estofado do banco atravessado — caixa com as quinas arredondadas de
    CHANFRO (o chanfro de 3 segmentos da malha fica até 0,5 mm pra dentro do arco) —, − = dentro."""
    c = np.array([0.0, BORDA_Y + LARGURA / 2, TOPO - ESPESSURA / 2])
    h = np.array([COMPR / 2, LARGURA / 2, ESPESSURA / 2]) - CHANFRO
    q = np.abs(np.asarray(P) - c) - h
    return np.linalg.norm(np.maximum(q, 0.0), axis=1) + np.minimum(q.max(axis=1), 0.0) - CHANFRO


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── medidas do repouso (o corpo é rígido: ombro e quadril ficam no mesmo lugar em relação ao meio dos quadris) ────────────
    H0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    S_rel = {L: p3.cabeca(rig, L + "Arm") - H0 for L, _ in LADOS}
    Q_rel = {L: p3.cabeca(rig, L + "UpLeg") - H0 for L, _ in LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length

    # ── banco reto atravessado atrás da pessoa (gira a raiz, sem mexer na peça — a Elevação Pélvica com Barra) ────────────────
    banco = e3.banco("banco", -COMPR / 2, COMPR / 2, topo=TOPO, largura=LARGURA)
    banco.rotation_euler = (0, 0, math.radians(90))
    banco.location = (0, BORDA_Y + LARGURA / 2, 0)
    p3.atualizar()

    # ── pernas esticadas (joelho a JOELHO°) e o pé com a rotação travada no mundo: calcanhar no chão, ponta pra cima ─────────────
    for lado, _ in LADOS:
        Hq, K, A = (p3.cabeca(rig, lado + n) for n in ("UpLeg", "Leg", "Foot"))
        coxa, canela = (K - Hq).normalized(), (A - K).normalized()
        flex = math.degrees(coxa.angle(canela))
        quer = coxa.slerp(canela, JOELHO / flex) if flex > JOELHO else canela
        p3.girar_osso(rig, lado + "Leg", canela.rotation_difference(quer).to_matrix())
    PERNA = {L: (p3.cabeca(rig, L + "Foot") - p3.cabeca(rig, L + "UpLeg")).length for L, _ in LADOS}
    pe_rot = {}
    EIXO_PERNA = Vector((0.0, -math.cos(math.radians(22)), -math.sin(math.radians(22))))   # perna no meio do movimento
    for lado, s in LADOS:
        alvo = p3.travar_rotacao(rig, lado + "Foot")
        R_pe = Matrix.Rotation(math.radians(-s * ROT_EXT), 4, EIXO_PERNA) @ p3.rot_x(-PE_GIRO).to_4x4()
        alvo.matrix_world = R_pe @ alvo.matrix_world      # − no X = a ponta sobe; o giro externo abre a ponta pra fora
        pe_rot[lado] = alvo
    p3.atualizar()
    # calcanhar no chão: o ponto mais baixo do pé em relação ao tornozelo não muda (a rotação do pé é fixa no mundo)
    pes = pele(("LeftFoot", "LeftToeBase"))
    TORNOZELO_Z = p3.cabeca(rig, "LeftFoot").z - float(pes[:, 2].min()) - AFUNDA_PE
    print("PERNAS | perna (quadril → tornozelo, joelho %.1f°) E %.4f D %.4f | tornozelo a %.4f do chão com o pé girado %d°" % (
        ck.medir_juntas(rig)["joelhoE"], PERNA["Left"], PERNA["Right"], TORNOZELO_Z, PE_GIRO))

    # ── braços: IK do ombro ao punho; a mão vira pela palma e pelos dedos (o jeito da Flexão de Braço) ─────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:                 # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.1, 0.5, 0.2)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
        iks[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    MAO = {L: tuple(n for n in BRACO[L] if n.startswith(L + "Hand")) for L in BRACO}
    dedos_pose = {}
    polo_ok = {}
    a = math.radians(PALMA_INCLINA)
    DEDOS_Q = Vector((0.0, -math.cos(a), -math.sin(a)))       # dedos (punho → base dos dedos) pra frente, descendo um pouco
    PALMA_Q = Vector((0.0, math.sin(a), -math.cos(a)))        # palma pro estofado
    # linha dos nós (pg._base[1], indicador → mínimo) da mão no fim: de lado, ±X (s · DEDOS_Q × PALMA_Q). O antebraço gira no
    # próprio eixo até ela ficar nessa direção — perpendicular ao antebraço em pé, então a conta é estável. Antes (até 11/10 19:40)
    # o giro alinhava a NORMAL DA PALMA, que com o punho estendido ~90° fica quase paralela ao antebraço: a projeção virava de lado
    # quando o antebraço passava pela vertical, o antebraço girava ~117° no próprio eixo do alto pra baixo e o punho torcia junto
    # (a pele do punho andava 32 mm com a mão parada; sonda exp/medir_mao.py do rascunho).
    NOS_Q = {L: DEDOS_Q.cross(PALMA_Q) * s for L, s in LADOS}

    def por_mao(lado, W, polo):
        """Punho em W, mão espalmada com os dedos pra DEDOS_Q e a palma pra PALMA_Q (mundo), cotovelo do lado do `polo` (a Flexão
        de Braço): devolve o quanto o punho ficou longe do alvo."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        iks[lado].mute = False
        punhos[lado].location = W
        polos[lado].location = polo
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()                       # 1) antebraço gira (pronação/supinação) até a linha dos nós
        quer = NOS_Q[lado] - ax * NOS_Q[lado].dot(ax)     # (indicador → mínimo) ficar na direção que ela tem no fim
        tem = pg._base(rig, lado)[1]                      # (de lado): o punho depois só estende, sem torcer (ver NOS_Q)
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]             # 2) o resto no punho, pela base da PALMA (punho → nós, normal)
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (PALMA_Q - DEDOS_Q * PALMA_Q.dot(DEDOS_Q)).normalized()
        F_quer = Matrix((DEDOS_Q, pq, DEDOS_Q.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (p3.cabeca(rig, lado + "Hand") - W).length

    # ── corpo no quadro: tronco girado λ em volta do X no meio dos quadris, levado até o meio dos quadris ficar em H ────────────
    def por_corpo(lam, H):
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        PB[p3.P + "Neck"].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(lam), pivo=H0, mover=H - H0)
        if lam < 0 and CABECA:                     # pescoço dobra pra frente (+X = o queixo vai pro peito)
            p3.girar_osso(rig, "Neck", p3.rot_x(-lam * CABECA))

    def por_pernas(A):
        """Cada coxa gira em volta do quadril até o tornozelo cair no alvo A[lado] (a perna fica esticada, o pé travado)."""
        for lado, _ in LADOS:
            PB[p3.P + lado + "UpLeg"].matrix_basis = Matrix()
        p3.atualizar()
        for lado, s in LADOS:
            Hq, Ak = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Foot")
            p3.girar_osso(rig, lado + "UpLeg", (Ak - Hq).rotation_difference(A[lado] - Hq).to_matrix())
            if ROT_EXT:                   # rotação externa: gira em volta do eixo quadril → tornozelo (o tornozelo não sai do lugar)
                p3.girar_osso(rig, lado + "UpLeg", Matrix.Rotation(math.radians(-s * ROT_EXT), 3, (A[lado] - Hq).normalized()))

    def resolver(th, lam, W, A, px):
        """Meio dos quadris H com o ombro esquerdo à distância punho → ombro da flexão `th` do cotovelo e o quadril esquerdo à
        distância de uma perna do tornozelo (plano sagital; o tronco é rígido, então é a interseção de 2 círculos)."""
        u = p3.rot_x(lam) @ S_rel["Left"]
        Dd = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(th)))
        r1 = math.sqrt(max(Dd ** 2 - (u.x - W["Left"].x) ** 2, 1e-9))
        c1 = Vector((W["Left"].y - u.y, W["Left"].z - u.z))
        r2 = math.sqrt(max(PERNA["Left"] ** 2 - (Q_rel["Left"].x - px) ** 2, 1e-9))
        c2 = Vector((A["Left"].y, A["Left"].z))
        d = (c2 - c1).length
        if d > r1 + r2 or d < abs(r1 - r2):
            raise RuntimeError("sem posição: cotovelo %.1f°, tronco %.1f° (círculos a %.3f m, raios %.3f e %.3f)" % (th, lam, d, r1, r2))
        aa = (r1 ** 2 - r2 ** 2 + d ** 2) / (2 * d)
        hh = math.sqrt(max(r1 ** 2 - aa ** 2, 0.0))
        m = c1 + (c2 - c1) * (aa / d)
        perp = Vector((-(c2 - c1).y, (c2 - c1).x)) / d
        p = max((m + perp * hh, m - perp * hh), key=lambda v: v.y)      # a de cima (v.y aqui é o z)
        return Vector((0.0, p.x, p.y))

    def polo_de(lado, W):
        """Polo do cotovelo: atrás e um pouco acima do meio ombro → punho (cotovelo pra trás, sem abrir pro lado)."""
        S = p3.cabeca(rig, lado + "Arm")
        return (S + W) / 2 + Vector((0.0, 0.5, 0.25))

    estado = {}

    def colocar(t, W, A, px, bracos=True):
        th = p3.lerp(*COTOVELO, t)
        lam = p3.lerp(*TRONCO, t)
        H = resolver(th, lam, W, A, px)
        por_corpo(lam, H)
        por_pernas(A)
        if bracos:
            for lado, _ in LADOS:
                estado["erro_" + lado] = por_mao(lado, W[lado], polo_de(lado, W[lado]))
        estado.update(th=th, lam=lam, H=H)
        return H

    def folga_banco():
        """Menor distância (m) da pele das costas, do glúteo e das coxas até o estofado (− = dentro) e onde."""
        co, _, (nomes, dono) = _malha(bon)
        m = _grupo(nomes, dono, PARTES_BANCO)
        f = sdf_estofado(co[m])
        i = int(np.argmin(f))
        return float(f[i]), co[m][i], nomes[dono[np.where(m)[0][i]]]

    # ── lugar provisório dos pés e das mãos (a mão no mundo não depende do corpo: só precisa o braço alcançar o punho) ───────────
    px = PES_X
    A = {L: Vector((s * px, BORDA_Y - 0.905, TORNOZELO_Z)) for L, s in LADOS}
    W = {L: Vector((s * MAO_X, BORDA_Y + 0.11 + NOS_Y, TOPO + 0.025)) for L, s in LADOS}
    for volta in range(5):
        colocar(0.5, W, A, px, bracos=False)
        for lado, s in LADOS:
            if volta == 0:                # dedos esticados (pose local guardada, igual em todo quadro)
                por_mao(lado, W[lado], polo_de(lado, W[lado]))
                p3.soltar_dedos(rig, lado)
                pg.juntar_dedos(rig, lado, 0.5)
                for d in p3.DEDOS + ("Thumb",):
                    for i in (1, 2, 3):
                        palma = pg._base(rig, lado)[0]
                        o = "%sHand%s%d" % (lado, d, i)
                        f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                        plano = f - palma * f.dot(palma)
                        if d == "Thumb":          # polegar deitado do lado do indicador, encostando de leve
                            plano = plano - palma * 0.10 * f.length
                        if plano.length > 1e-6:
                            p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
            por_mao(lado, W[lado], polo_de(lado, W[lado]))
            nos = p3.cabeca(rig, lado + "HandMiddle1")
            f_palma = float(sdf_estofado(pele((lado + "Hand",))).min())       # a palma encosta no estofado (topo ou quina)
            W[lado] += Vector((s * MAO_X - nos.x, BORDA_Y + NOS_Y - nos.y, -AFUNDA_MAO - f_palma))
        print("MÃO volta %d | punho E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (volta, *W["Left"], *W["Right"]))

    # ── dedos pendurados na borda: cada junta dobra (da base pra ponta) até a pele daquela falange encostar no estofado ─────────
    def dedos_na_borda(lado):
        palma, eixo_nos = pg._base(rig, lado)[:2]
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
            f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1          # + = dobra pro lado da palma (dedo esticado)
            angs = []
            for k, o in enumerate(ossos):
                co, _, (nomes, dono) = _malha(bon)
                P = co[_grupo(nomes, dono, (o,))]
                h = np.array(p3.cabeca(rig, o))
                escolha = None
                f0 = float(sdf_estofado(P).min())
                if f0 <= -AFUNDA_DEDO:                                       # já entrou: estica até sair
                    for g in np.arange(0.0, -40.01, -0.5):
                        if sdf_estofado(pg._rot(P, h, eixo_nos, g * sinal)).min() > -AFUNDA_DEDO:
                            escolha = float(g)
                            break
                else:
                    g_max = DOBRA_MAX[k] - (PALMA_INCLINA if k == 0 else 0)
                    for g in np.arange(0.0, g_max + 0.01, 0.5):
                        if sdf_estofado(pg._rot(P, h, eixo_nos, g * sinal)).min() <= -AFUNDA_DEDO:
                            escolha = float(g)
                            break
                    if escolha is None:            # não encostou: a base fica pendurada (em pé) e a próxima falange encosta
                        escolha = float(DOBRA_SOLTA[k] - (PALMA_INCLINA if k == 0 else 0))
                if escolha is None:
                    escolha = -40.0
                if escolha:
                    p3.girar_osso(rig, o, p3.rot_eixo(escolha * sinal, eixo_nos))
                angs.append(escolha)
            P = pele(tuple(ossos))
            print("  dedo %s %s: base %+.1f mm da borda | dobra %s° | pele mais perto do estofado %+.1f mm" % (
                lado, d, (p3.cabeca(rig, ossos[0]).y - BORDA_Y) * 1000, "/".join("%.1f" % g for g in angs),
                float(sdf_estofado(P).min()) * 1000))
        # polegar deitado em cima do estofado: gira na base (Thumb2, com o Thumb3 junto) pro lado da palma até encostar
        ossos = (lado + "HandThumb2", lado + "HandThumb3")
        co, _, (nomes, dono) = _malha(bon)
        P = co[_grupo(nomes, dono, ossos)]
        h = p3.cabeca(rig, ossos[0])
        f = (p3.ponta(rig, ossos[0]) - h).normalized()
        eixo = f.cross(palma).normalized()
        sinal = 1 if eixo.cross(f).dot(palma) > 0 else -1
        escolha = None
        for g in np.arange(-25.0, 60.01, 0.5):
            if sdf_estofado(pg._rot(P, np.array(h), eixo, g * sinal)).min() <= -AFUNDA_DEDO:
                escolha = float(g)
                break
        if escolha:
            p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo))
        print("  polegar %s: base gira %s° | pele mais perto do estofado %+.1f mm" % (
            lado, "%.1f" % escolha if escolha is not None else "—", float(sdf_estofado(pele(ossos + (lado + "HandThumb1",))).min()) * 1000))

    colocar(0.5, W, A, px)
    for lado, _ in LADOS:
        por_mao(lado, W[lado], polo_de(lado, W[lado]))
        dedos_na_borda(lado)
        dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        palma = pele((lado + "Hand",))
        print("PALMA %s | pele mais perto do estofado %+.1f mm | mais baixa z %.4f" % (
            lado, float(sdf_estofado(palma).min()) * 1000, float(palma[:, 2].min())))

    # ── pés juntos até onde uma coxa não entra na outra (medido em cima e embaixo, com o lugar provisório dos pés) ──────────────
    def coxas(px_):
        A_ = {L: Vector((s * px_, A["Left"].y, TORNOZELO_Z)) for L, s in LADOS}
        pior = 0.0
        for t in (0.0, 1.0):
            colocar(t, W, A_, px_, bracos=False)
            co, tri, (nomes, dono) = _malha(bon)
            ck.posicoes_das_juntas(rig)
            med = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
            pior = max(pior, med.get("coxaE×coxaD", 0.0), med.get("pernaE×pernaD", 0.0))
            print("  pés ±%.3f t=%g: coxa × coxa %.1f mm, perna × perna %.1f mm" % (px_, t, med.get("coxaE×coxaD", 0.0),
                                                                                med.get("pernaE×pernaD", 0.0)))
        return pior

    if coxas(px) > COXAS_MM:
        lo, hi = px, 0.20
        for _ in range(9):
            meio = (lo + hi) / 2
            if coxas(meio) > COXAS_MM:
                lo = meio
            else:
                hi = meio
        px = hi
    print("PÉS | tornozelos a ±%.3f m do meio (o mais junto sem uma coxa entrar na outra) | coxa × coxa / perna × perna %.1f mm" % (
        px, coxas(px)))

    # ── lugar dos pés: a menor folga das costas/glúteo pro estofado no caminho fica em FOLGA_BANCO (rente, sem encostar) ─────────
    def menor_folga(ay):
        A_ = {L: Vector((s * px, ay, TORNOZELO_Z)) for L, s in LADOS}
        pior = (1e9, None, "")
        for t in T_FOLGA:
            try:
                colocar(t, W, A_, px, bracos=False)
            except RuntimeError:
                return (-1.0, None, "sem posição")
            f = folga_banco()
            if f[0] < pior[0]:
                pior = (f[0], t, f[2])
        return pior

    lo, hi = BORDA_Y - 0.98, BORDA_Y - 0.80          # mais longe → mais folga
    if menor_folga(lo)[0] <= FOLGA_BANCO:
        raise RuntimeError("com os pés a %.2f m da borda as costas ainda encostam no banco: %s" % (BORDA_Y - lo, menor_folga(lo)))
    for _ in range(14):
        meio = (lo + hi) / 2
        if menor_folga(meio)[0] > FOLGA_BANCO:
            lo = meio
        else:
            hi = meio
    A = {L: Vector((s * px, lo, TORNOZELO_Z)) for L, s in LADOS}
    f_min = menor_folga(lo)
    print("PÉS | tornozelo y %.4f (%.3f m à frente da borda) | menor folga pro estofado %.1f mm em t=%.2f (%s)" % (
        lo, BORDA_Y - lo, f_min[0] * 1000, f_min[1], f_min[2]))

    # ── polo do cotovelo acertado no meio do movimento ─────────────────────────────────────────────────────────────────────
    polo_ok.clear()
    colocar(0.5, W, A, px)
    for lado, s in LADOS:                 # rotação externa: a ponta do pé vira pra fora (+ = pra fora)
        pe = p3.cabeca(rig, lado + "ToeBase") - p3.cabeca(rig, lado + "Foot")
        print("PERNA %s | ponta do pé %.0f° pra fora" % (lado, math.degrees(math.atan2(s * pe.x, math.hypot(pe.y, pe.z)))))

    def medidas():
        j = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        cima = j["Neck"] - j["Hips"]
        tronco = math.degrees(math.atan2(-float(cima[1]), float(cima[2])))     # + = pra frente (−Y)
        bra = [math.degrees(math.atan2(float(j[L + "Arm"][2] - j[L + "ForeArm"][2]),
                                       math.hypot(*(j[L + "Arm"][:2] - j[L + "ForeArm"][:2])))) for L, _ in LADOS]
        ante = [math.degrees(math.atan2(float(j[L + "ForeArm"][1] - j[L + "Hand"][1]), float(j[L + "ForeArm"][2] - j[L + "Hand"][2])))
                for L, _ in LADOS]
        return j, jt, tronco, bra, ante

    def info():
        j, jt, tronco, bra, ante = medidas()
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        m = _grupo(nomes, dono, PARTES_BANCO)
        fb = sdf_estofado(co[m])
        i = int(np.argmin(fb))
        txt = []
        for L, s in LADOS:
            dd = {d: float(sdf_estofado(G(tuple("%sHand%s%d" % (L, d, k) for k in (1, 2, 3)))).min()) * 1000
                  for d in p3.DEDOS + ("Thumb",)}
            mao = G(MAO[L])[::3]
            gl = G(("Hips", "LeftUpLeg", "RightUpLeg"))
            gl = gl[np.linalg.norm(gl - mao.mean(axis=0), axis=1) < 0.35]
            dmao = (float(np.min(np.linalg.norm(mao[:, None, :] - gl[None, :, :], axis=2))) * 1000) if len(gl) else 999.0
            txt.append("mão %s: punho a %.1f mm do alvo, palma %+.1f mm, dedos %s mm do estofado, mão × quadril %.0f mm" % (
                L[0], estado.get("erro_" + L, 0) * 1000, float(sdf_estofado(G((L + "Hand",))).min()) * 1000,
                "/".join("%+.1f" % dd[d] for d in p3.DEDOS + ("Thumb",)), dmao))
        pes_ = {L: G((L + "Foot", L + "ToeBase")) for L, _ in LADOS}
        pernas_z = float(G(("LeftLeg", "RightLeg", "LeftUpLeg", "RightUpLeg"))[:, 2].min()) * 1000
        gl_z = float(G(("Hips", "LeftUpLeg", "RightUpLeg"))[np.linalg.norm(G(("Hips", "LeftUpLeg", "RightUpLeg")) -
                                                                          np.array(estado["H"]), axis=1) < 0.18][:, 2].min()) * 1000
        return ("cotovelo %.0f/%.0f° | punho %.0f/%.0f° | braço %+.0f/%+.0f° abaixo da horizontal (cotovelo mais baixo que o ombro) | antebraço "
                "%+.0f/%+.0f° da vertical (+ = cotovelo atrás do punho) | extensão do ombro %.0f/%.0f° | cotovelo × tronco %s° | tronco %+.1f° (+ = à frente) | "
                "quadril %.0f/%.0f° | joelho %.1f/%.1f° | tornozelo %s° | costas/glúteo × estofado %+.1f mm (%s, z %.3f) | glúteo a %.0f mm "
                "do chão | pernas a %.0f mm | calcanhar E %+.1f D %+.1f mm | %s" % (
                    jt["cotoveloE"], jt["cotoveloD"], jt["punhoE"], jt["punhoD"], bra[0], bra[1], ante[0], ante[1],
                    -tc.braco_frente(j)[0], -tc.braco_frente(j)[1], "/".join("%.0f" % v for v in tc.cotovelo_tronco(j)), tronco,
                    jt["quadrilE"], jt["quadrilD"], jt["joelhoE"], jt["joelhoD"], "/".join("%.0f" % v for v in tc.tornozelo(j)),
                    fb[i] * 1000, nomes[dono[np.where(m)[0][i]]], co[m][i][2], gl_z, pernas_z,
                    float(pes_["Left"][:, 2].min()) * 1000, float(pes_["Right"][:, 2].min()) * 1000, " | ".join(txt)))

    def pose(t):
        """t=0 em cima (braços estendidos), t=1 embaixo (cotovelos a ~90°)."""
        colocar(t, W, A, px)

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | cotovelo-alvo %.1f° tronco-alvo %+.1f° | quadril (%.3f %.3f) | %s" % (
            t, estado["th"], estado["lam"], estado["H"].y, estado["H"].z, info()), flush=True)

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, BORDA_Y - 0.35, 0.5),
                camera_video=((3.3, -2.2, 1.2), (0, BORDA_Y - 0.35, 0.45), 50), info=info, apoios=[banco],
                afunda_apoio_mm=4.0)
