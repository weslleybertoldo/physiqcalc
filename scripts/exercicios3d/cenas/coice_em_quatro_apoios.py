# Coice em Quatro Apoios — cena da fábrica 3D (lote 13, 12/10/2026). Peso corporal, no chão (sem equipamento: o apoio é o chão).
# t = 0 em quatro apoios, com os 2 joelhos no chão (a foto parada do app) · t = 1 a perna esquerda em cima: a coxa entre a linha das
# costas e a horizontal, a canela em pé e a sola do pé virada pro teto (o app faz a volta).
# Técnica — ACE, Quadruped Bent-knee Hip Extensions (a página deste exercício): "Kneel on an exercise mat or floor, positioning your
# knees and feet hip-width apart, with your feet plantar-flexed (toes pointing away from your body)"; as mãos "directly under your
# shoulders at shoulder-width with your fingers facing forward"; "so that your knees are directly under your hips and hands are
# directly under your shoulders"; "position your spine in a neutral position, avoid any excessive sagging or arching"; "squeeze
# (contract) the left gluteus maximus (butt) to lift the left leg while maintaining your bent-knee position, allowing movement only
# from the left hip joint"; "Only raise the leg to a height where the low back position can be maintained". free-exercise-db, Glute
# Kickback (o fonte_en do catálogo): "arms extended in front of you (perpendicular to the torso) in order to get into a kneeling
# push-up position but with the arms spaced at shoulder width"; "the bend of the knees should create a 90-degree angle between the
# hamstrings and the calves"; "lift up your right leg until the hamstrings are in line with the back while maintaining the 90-degree
# angle bend"; "Tip: At the end of the movement the upper leg should be parallel to the floor while the calf should be perpendicular
# to it." Boren et al. 2011 (EMG deste exercício, nas mãos): "extends the dominant leg at the hip, while keeping the knee flexed 90
# degrees, to lift the foot toward the ceiling (right) to achieve neutral hip extension". ACE, Bird-dog (o mesmo quatro apoios):
# "Your goal is to keep both hips parallel to the floor"; "Your head should remain aligned with the spine throughout the movement."
# Decisões: no chão, sem colchonete (free-exercise-db: "Kneel on the floor or an exercise mat"; ACE: "on an exercise mat or floor";
# Boren, no carpete); uma perna só no ciclo, a ESQUERDA (ACE: "Perform a number of repetitions with the left leg before switching
# legs"); com os braços e as coxas em pé, as costas sobem ~10° pros ombros (o braço do boneco é mais comprido que a coxa) e o fim fica
# entre a coxa na linha das costas e a coxa paralela ao chão (as 2 frases do free-exercise-db), com a canela em pé.
# Como o rig faz: com o boneco em pé, cada coxa fica em pé (aberta ~2° pro lado: o mínimo pra uma coxa não entrar na outra), a canela
# gira pra trás até quase deitar e o pé estica (canela × pé 30°: ~46° de flexão plantar; o limite é 50°); a pelve (osso Hips) gira à
# frente em volta da linha das articulações do quadril e as coxas giram o contrário (só o quadril dobra); o corpo desce até o joelho
# encostar no chão e cada canela sobe (~4–5°) o que falta pro peito do pé encostar também; os dedos dos pés giram na base até deitar no
# chão. O tronco inclina até os ombros ficarem bem em cima dos punhos com os braços esticados (cotovelo 4°); as mãos ficam espalmadas
# no chão (a palma e cada dedo encostando ~1 mm dentro): o braço vai por IK do ombro até o punho, o antebraço gira até a linha dos nós
# dos dedos ficar de lado e o punho só estende (o jeito da Flexão de Braço). No movimento só a perna esquerda mexe: a coxa gira pra trás
# em volta da articulação do quadril com o joelho parado (a canela, atrás do quadril, sai do chão logo no começo, sem arrastar) e o
# tornozelo sai da flexão plantar pra ~neutro (a sola pro teto). Tronco, pelve, cabeça, braços, mãos e a perna direita ficam PARADOS;
# o centro de massa (tabela de Dempster em Winter 2009) fica dentro da base (mãos + joelho, canela e pé direitos) com folga.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TORNOZELO = 30.0        # canela × pé dos pés no chão (tecnica3d.tornozelo; em pé ~76°): ~46° de flexão plantar, o peito do pé
                        # deitado (ACE #270: "with your feet plantar-flexed (toes pointing away from your body)"); o limite da
                        # flexão plantar é 50° (Alazzawi 2017) = ~26° no boneco
TORNOZELO_CIMA = 78.0   # a perna que sobe termina com a sola pro teto, o tornozelo ~neutro (Boren 2011: "to lift the foot toward the
                        # ceiling"; nas fotos da ACE, de Boren e do free-exercise-db o pé fica assim em cima)
TORN_T = (0.10, 0.90)   # o tornozelo da perna que sobe vai de TORNOZELO a TORNOZELO_CIMA nesse trecho de t (a canela já saiu do chão)
COXAS_MM = 1.0          # as coxas abrem o mínimo pra uma não entrar na outra mais que isso (no boneco musculoso, ~2°): joelhos e pés
                        # na largura do quadril (ACE #270: "positioning your knees and feet hip-width apart")
AFUNDA_PE = 0.001       # peito do pé e dedos apertando o chão
AFUNDA_JOELHO = 0.001   # joelho e canela apertando o chão
AFUNDA_MAO = 0.0008     # palma e dedos apertando o chão (a Flexão de Braço)
COTOVELO = 4.0          # flexão dos cotovelos (graus): braços esticados sem travar (free-exercise-db: "arms extended")
DENTRO = 0.0            # dedos das mãos virados pra dentro (graus): pra frente (ACE #270: "with your fingers facing forward")
COXA_FIM = 2.5          # coxa que sobe no fim, graus abaixo da horizontal: entre as 2 frases do free-exercise-db — "in line with the
                        # back" (as costas sobem ~10,5° pros ombros: a coxa ficaria 10,5° abaixo da horizontal) e "parallel to the
                        # floor" (0°) —, com a canela em pé ("the calf should be perpendicular to it"); dá quadril_sinal ~−8 (8° de
                        # extensão; a normal é 17,0 ± 3,9°, AAOS)
PEGADA_X = 1.0          # punho bem embaixo da cabeça do úmero (ACE #270: "hands are directly under your shoulders"): x do punho = x do
                        # ombro × isso
Y_JOELHO = 0.10         # os joelhos ficam em y = Y_JOELHO
POLO = Vector((0.25, 0.45, -0.25))      # polo do cotovelo a partir do ombro (x vezes o lado): pra trás e pra fora
SEGMENTOS = (           # Winter DA (2009), tabela de Dempster: (de, até, fração da massa, centro de massa a partir do de cima)
    ("Arm", "ForeArm", 0.028, 0.436), ("ForeArm", "Hand", 0.016, 0.430), ("Hand", "HandMiddle1", 0.006, 0.506),
    ("UpLeg", "Leg", 0.100, 0.433), ("Leg", "Foot", 0.0465, 0.433), ("Foot", "ToeBase", 0.0145, 0.50))


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _casca(P):
    """Casca convexa (2D, sentido anti-horário) dos pontos P (N×2)."""
    P = sorted(set(map(tuple, np.round(P, 5))))
    if len(P) < 3:
        return np.array(P)

    def giro(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    baixo, cima = [], []
    for p in P:
        while len(baixo) >= 2 and giro(baixo[-2], baixo[-1], p) <= 0:
            baixo.pop()
        baixo.append(p)
    for p in reversed(P):
        while len(cima) >= 2 and giro(cima[-2], cima[-1], p) <= 0:
            cima.pop()
        cima.append(p)
    return np.array(baixo[:-1] + cima[:-1])


def _dentro_da_casca(q, H):
    """Distância (m) do ponto q à borda da casca H: + = dentro, − = fora."""
    d = []
    for i in range(len(H)):
        a, b = H[i], H[(i + 1) % len(H)]
        e = b - a
        n = np.array((-e[1], e[0])) / max(np.linalg.norm(e), 1e-12)     # normal pra dentro (casca anti-horária)
        d.append(float((q - a) @ n))
    return min(d)


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos (aqui não há pegador: as mãos ficam abertas)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    Ls = (c("LeftFoot") - c("LeftLeg")).length
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length

    # ── pernas (com o corpo em pé): coxas em pé, abertas `abre` pro lado; canelas pra trás subindo beta; pés em flexão plantar ─
    PERNA = tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in ("Hips",) + PERNA}

    def eixo_pe(lado):
        K, A, T = c(lado + "Leg"), c(lado + "Foot"), c(lado + "ToeBase")
        canela, pe = (A - K).normalized(), (T - A).normalized()
        return canela, pe, canela.cross(pe).normalized()

    def por_tornozelo(lado, graus):
        """O pé gira no plano canela-pé até canela × pé = graus (tecnica3d.tornozelo)."""
        canela, pe, eixo = eixo_pe(lado)
        p3.girar_osso(rig, lado + "Foot", Matrix.Rotation(math.radians(graus - math.degrees(canela.angle(pe))), 3, eixo))

    def pernas(beta, abre):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for lado, s in LADOS:
            H, K = c(lado + "UpLeg"), c(lado + "Leg")
            a = math.radians(abre)
            quer = Vector((s * math.sin(a), 0.0, -math.cos(a)))
            p3.girar_osso(rig, lado + "UpLeg", (K - H).rotation_difference(quer).to_matrix())
            K, A = c(lado + "Leg"), c(lado + "Foot")
            b = math.radians(beta[lado])
            quer = Vector((0.0, math.cos(b), math.sin(b)))
            p3.girar_osso(rig, lado + "Leg", (A - K).rotation_difference(quer).to_matrix())
            por_tornozelo(lado, TORNOZELO)

    def inclinar(alfa):
        """Tronco inclinado alfa graus à frente em volta da linha das articulações do quadril; as coxas voltam pra onde estavam
        (em pé, embaixo do quadril): só o quadril dobra."""
        Q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(alfa), pivo=Q)
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(-alfa))

    def no_chao():
        """Corpo descido até o joelho mais baixo encostar no chão, com os joelhos em y = Y_JOELHO."""
        z = min(joelho_chao(lado)[0] for lado, _ in LADOS)
        K = (c("LeftLeg") + c("RightLeg")) / 2
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, Y_JOELHO - K.y, -AFUNDA_JOELHO - z)))

    def dedos_do_pe(lado):
        """Os dedos do pé giram só na base (em volta do eixo de flexão do pé) até a pele mais baixa deles encostar no chão."""
        _, _, eixo = eixo_pe(lado)
        Pd = pele((lado + "ToeBase",))
        h = np.array(c(lado + "ToeBase"))
        z = lambda g: float(pg._rot(Pd, h, eixo, g)[:, 2].min())
        sobe = 1.0 if z(5.0) > z(-5.0) else -1.0                 # sentido que levanta os dedos
        lo, hi = -40.0, 40.0
        for _ in range(30):
            meio = (lo + hi) / 2
            if z(sobe * meio) > -AFUNDA_PE:
                hi = meio
            else:
                lo = meio
        g = sobe * hi
        p3.girar_osso(rig, lado + "ToeBase", Matrix.Rotation(math.radians(g), 3, eixo))
        return g

    def joelho_chao(lado):
        """Pele mais baixa da coxa e da canela perto do joelho (até 12 cm dele, ao longo do chão), de quem ela é e onde."""
        co, _, (nomes, dono) = _malha(bon)
        K = c(lado + "Leg")
        m = _grupo(nomes, dono, (lado + "UpLeg", lado + "Leg")) & (np.abs(co[:, 1] - K.y) < 0.12)
        i = np.where(m)[0][np.argmin(co[m][:, 2])]
        return float(co[i, 2]), nomes[dono[i]], float(co[i, 1] - K.y)

    def ajoelhar(beta, abre, alfa, dedos=True):
        """Pernas prontas, tronco inclinado alfa, corpo no chão e (dedos=True) os dedos dos pés deitados no chão."""
        pernas(beta, abre)
        inclinar(alfa)
        no_chao()
        return {lado: dedos_do_pe(lado) for lado, _ in LADOS} if dedos else {}

    def coxas(beta, abre):
        ajoelhar(beta, abre, 82.0)
        co, tri, (nomes, dono) = _malha(bon)
        return ck.corpo_x_corpo(co, tri, nomes, dono)[0]["coxaE×coxaD"]

    # ── coxas abertas o mínimo pra uma não entrar na outra (o boneco musculoso não amassa a parte de dentro da coxa) ────────
    beta = {L: 4.5 for L, _ in LADOS}
    abre = 0.0
    if coxas(beta, abre) > COXAS_MM:
        lo, hi = 0.0, 12.0
        for _ in range(9):
            meio = (lo + hi) / 2
            if coxas(beta, meio) > COXAS_MM:
                lo = meio
            else:
                hi = meio
        abre = hi
    print("COXAS | abertas %.2f° pro lado | coxa × coxa %.1f mm" % (abre, coxas(beta, abre)))

    # ── ajoelhado: o corpo desce até o joelho encostar no chão; cada canela sobe beta até o peito do pé (com os dedos na
    # direção do pé) encostar também; depois os dedos deitam no chão ─────────────────────────────────────────────────────────
    for volta in range(10):
        ajoelhar(beta, abre, 82.0, dedos=False)
        erros = {}
        for lado, _ in LADOS:
            zp = float(pele((lado + "Foot",))[:, 2].min()) + AFUNDA_PE
            zk = joelho_chao(lado)[0] + AFUNDA_JOELHO
            erros[lado] = (zk, zp)
            # canela subindo dβ: o tornozelo (e o pé) sobe Ls·cos β·dβ em relação ao joelho
            beta[lado] -= math.degrees((zp - zk) / (Ls * math.cos(math.radians(beta[lado]))))
        print("AJOELHAR volta %d | beta E %.2f° D %.2f° | joelho E %+.1f D %+.1f mm | pé E %+.1f D %+.1f mm" % (
            volta, beta["Left"], beta["Right"], erros["Left"][0] * 1000, erros["Right"][0] * 1000,
            erros["Left"][1] * 1000, erros["Right"][1] * 1000))
        if max(abs(e[0] - e[1]) for e in erros.values()) < 0.0002:
            break

    # ── braços: IK do ombro ao punho; a mão vira pela palma e pelos dedos (o jeito da Flexão de Braço) ────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:                 # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, 0.3)))
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

    def esticar_dedos(lado):
        """Dedos esticados no plano da palma e um pouco abertos, polegar deitado do lado do indicador (a mão de apoio da Flexão
        de Braço e da Flexão Nórdica)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.5)
        for d in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, d, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if d == "Thumb":
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def dedos_no_chao(lado):
        """Com a palma no chão: cada dedo (e o polegar) gira só na base, pro lado da palma, até a pele mais baixa dele encostar no
        chão (AFUNDA_MAO); sem passar disso (a Flexão de Braço)."""
        palma, eixo_nos = pg._base(rig, lado)[:2]
        co, _, (nomes, dono) = _malha(bon)
        for d in p3.DEDOS + ("Thumb",):
            ossos = ["%sHand%s%d" % (lado, d, i) for i in ((1, 2, 3) if d != "Thumb" else (2, 3))]
            Pd = co[_grupo(nomes, dono, ossos)]
            h = p3.cabeca(rig, ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            eixo = eixo_nos if d != "Thumb" else f.cross(palma).normalized()
            sinal = 1 if eixo.cross(f).dot(palma) > 0 else -1          # + = gira pro lado da palma (pro chão)
            escolha = None
            z0 = float(Pd[:, 2].min())
            for g in np.arange(-25.0, 60.01, 0.5):                     # do mais esticado pro mais dobrado
                if pg._rot(Pd, np.array(h), eixo, g * sinal)[:, 2].min() <= -AFUNDA_MAO:
                    escolha = float(g)
                    break
            if escolha is None:
                print("  dedo %s %s não chega no chão" % (lado, d))
                continue
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo))
            print("  dedo %s %s: estava a %.1f mm do chão, base gira %+.1f°" % (lado, d, z0 * 1000, escolha))

    def por_mao(lado, W, dedos_q, palma_q, polo):
        """Punho em W, dedos pra `dedos_q` e palma pra `palma_q` (mundo), cotovelo do lado do `polo` (a Flexão de Braço)."""
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
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        # linha dos nós (indicador → mínimo) da mão no fim: de lado (s · dedos × palma); o antebraço gira (pronação) até ela ficar
        # nessa direção e o punho depois só estende, sem torcer (conserto de 11/10/2026 da Flexão de Braço)
        nos_q = dedos_q.cross(palma_q) * (1 if lado == "Left" else -1)
        ax = (f1 - f0).normalized()
        quer = nos_q - ax * nos_q.dot(ax)
        tem = pg._base(rig, lado)[1]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]             # o resto no punho, pela base da PALMA (punho → nós, normal)
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (p3.cabeca(rig, lado + "Hand") - W).length

    DEDOS_Q = {L: Vector((-s * math.sin(math.radians(DENTRO)), -math.cos(math.radians(DENTRO)), 0.0)) for L, s in LADOS}
    PALMA_Q = Vector((0, 0, -1))

    def polo_mundo(lado, s):
        return c(lado + "Arm") + Vector((s * POLO.x, POLO.y, POLO.z))

    # ── tronco inclinado até os ombros ficarem bem em cima dos punhos com os braços estendidos (COTOVELO) ────────────────────
    D = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO)))
    W = {}
    hw = {L: 0.018 for L, _ in LADOS}      # altura do punho com a palma no chão (chute; acertada pela pele da palma)
    g_dedos = {}

    def resolver_alfa():
        lo, hi = 50.0, 100.0
        for _ in range(18):
            meio = (lo + hi) / 2
            ajoelhar(beta, abre, meio, dedos=False)
            if max(c(L + "Arm").z - hw[L] for L, _ in LADOS) > D:
                lo = meio
            else:
                hi = meio
        return hi

    for volta in range(4):
        alfa = resolver_alfa()
        g_dedos = ajoelhar(beta, abre, alfa)
        for lado, _ in LADOS:
            S = c(lado + "Arm")
            W[lado] = Vector((S.x * PEGADA_X, S.y, hw[lado]))
        # a palma assenta com o corpo um pouco mais baixo (o braço dobra e o punho chega no alvo; com o braço no limite o punho
        # parava antes e a conta da altura da palma errava — a Flexão de Braço)
        ajoelhar(beta, abre, alfa + 6.0)
        for lado, s in LADOS:
            if volta == 0:                # dedos esticados (pose local guardada, igual em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
                esticar_dedos(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
            for _ in range(3):            # o punho desce/sobe até a pele da palma (com a tenar) encostar
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
                W[lado].z += -AFUNDA_MAO - float(pele((lado + "Hand", lado + "HandThumb1"))[:, 2].min())
            hw[lado] = W[lado].z
            if volta == 3:                # cada dedo dobra na base até encostar no chão (vale em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
                dedos_no_chao(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        print("TRONCO volta %d | inclina %.2f° | punho E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (
            volta, alfa, *W["Left"], *W["Right"]))
    alfa = resolver_alfa()
    g_dedos = ajoelhar(beta, abre, alfa)
    for lado, s in LADOS:
        S = c(lado + "Arm")
        W[lado] = Vector((S.x * PEGADA_X, S.y, hw[lado]))
        e = por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
        print("MÃO %s | punho a %.1f mm do alvo | palma %.1f mm | dedos %s mm" % (
            lado, e * 1000, float(pele((lado + "Hand",))[:, 2].min()) * 1000,
            "/".join("%.1f" % (float(pele(tuple("%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)))[:, 2].min()) * 1000)
                     for d in p3.DEDOS + ("Thumb",))))
    for lado, _ in LADOS:
        z, quem, dy = joelho_chao(lado)
        print("JOELHO %s | pele mais baixa %.1f mm (%s, %.0f mm atrás do centro) | pé %.1f mm, dedos %.1f mm (giram %.1f°) | canela "
              "sobe %.2f°" % (lado, z * 1000, quem, dy * 1000, float(pele((lado + "Foot",))[:, 2].min()) * 1000,
                             float(pele((lado + "ToeBase",))[:, 2].min()) * 1000, g_dedos[lado], beta[lado]))

    # ── a perna esquerda: o quadril estende com o joelho parado; o tornozelo sai da flexão plantar pra sola virada pro teto ──────
    PERNA_T = ("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase")
    base_t = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA_T}
    v = c("LeftLeg") - c("LeftUpLeg")
    a0 = math.degrees(math.atan2(-v.z, v.y))           # coxa × horizontal no começo (90 = em pé)
    PHI = a0 - COXA_FIM
    j = ck.posicoes(rig)
    print("COMEÇO | coxa E %.1f° abaixo da horizontal | quadril_sinal %s | tronco %.1f° da vertical | quadril estende %.1f°" % (
        a0, "/".join("%.1f" % a for a in tc.quadril_sinal(j)), math.degrees((c("Neck") - c("Hips")).angle(Vector((0, 0, 1)))),
        PHI))

    def pose(t):
        """t=0 em quatro apoios (os 2 joelhos no chão), t=1 a coxa esquerda paralela ao chão, a sola do pé pro teto."""
        for n, M in base_t.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        if t > 0:
            p3.girar_osso(rig, "LeftUpLeg", p3.rot_x(PHI * t))
            w = _suave((t - TORN_T[0]) / (TORN_T[1] - TORN_T[0]))
            if w > 0:
                por_tornozelo("Left", TORNOZELO + (TORNOZELO_CIMA - TORNOZELO) * w)

    # ── centro de massa (tabela de Dempster em Winter 2009) × a base de apoio ──────────────────────────────────────────────────
    def centro_de_massa():
        cm = Vector()
        for L, _ in LADOS:
            for a, b, m, f in SEGMENTOS:
                pa, pb_ = c(L + a), c(L + b)
                cm += (pa + (pb_ - pa) * f) * m
        q, o = (c("LeftUpLeg") + c("RightUpLeg")) / 2, (c("LeftArm") + c("RightArm")) / 2
        cm += (q + (o - q) * 0.5) * 0.497
        cm += (c("Head") + (p3.ponta(rig, "Head") - c("Head")) * 0.3) * 0.081
        return cm

    def base_de_apoio():
        """Pontos da pele a até 1,5 mm do chão (mãos, joelhos, canelas, pés) → casca convexa e a margem do centro de massa (mm)."""
        co, _, (nomes, dono) = _malha(bon)
        P = co[co[:, 2] < 0.0015][:, :2]
        H = _casca(P)
        cm = centro_de_massa()
        return _dentro_da_casca(np.array((cm.x, cm.y)), H) * 1000, cm

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        margem, cm = base_de_apoio()
        perna_e = G(("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"))
        txt = []
        for L, _ in LADOS:
            dedos = "/".join("%+.1f" % (G(tuple("%sHand%s%d" % (L, d, i) for i in (1, 2, 3)))[:, 2].min() * 1000)
                             for d in p3.DEDOS + ("Thumb",))
            txt.append("mão %s: palma %+.1f mm, dedos %s mm" % (L[0], G((L + "Hand",))[:, 2].min() * 1000, dedos))
        return ("quadril_sinal %.1f/%.1f° | coxa E %.1f° abaixo da horizontal | joelho %.1f/%.1f° | tornozelo %.0f/%.0f° | "
                "coluna %.1f° (com sinal %+.1f) | cabeça × tronco %.1f° | pelve %+.1f° | ombros %+.1f° | tronco %.1f° da vertical | "
                "cotovelo %.0f/%.0f° | punho %.0f/%.0f° | joelho D no chão %+.1f mm | canela D %+.1f mm | pé D %+.1f mm | perna E "
                "%+.1f mm do chão | CM (%.3f %.3f) a %.0f mm da borda da base | %s" % (
                    *tc.quadril_sinal(jj), math.degrees(math.atan2(-(jj["LeftLeg"] - jj["LeftUpLeg"])[2],
                                                                   (jj["LeftLeg"] - jj["LeftUpLeg"])[1])),
                    juntas["joelhoE"], juntas["joelhoD"], *tc.tornozelo(jj), tc.coluna(jj)[0], tc.coluna_sinal(jj)[0],
                    tc.cabeca_tronco(jj)[0], tc.pelve_nivel(jj)[0], tc.ombros_nivel(jj)[0],
                    math.degrees(math.acos(max(-1, min(1, float(tc._u(jj["Neck"] - jj["Hips"])[2]))))),
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"],
                    joelho_chao("Right")[0] * 1000, G(("RightLeg",))[:, 2].min() * 1000,
                    G(("RightFoot", "RightToeBase"))[:, 2].min() * 1000, perna_e[:, 2].min() * 1000,
                    cm.x, cm.y, margem, " | ".join(txt)))

    for t in (0.0, 0.05, 0.5, 1.0):
        pose(t)
        co = _malha(bon)[0]
        print("t=%.2f | corpo x %.3f → %.3f, y %.3f → %.3f, z até %.3f | %s" % (
            t, co[:, 0].min(), co[:, 0].max(), co[:, 1].min(), co[:, 1].max(), co[:, 2].max(), info()))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0, 0.35),
                camera_video=((3.4, -1.6, 1.0), (0, 0, 0.35), 50), info=info)
