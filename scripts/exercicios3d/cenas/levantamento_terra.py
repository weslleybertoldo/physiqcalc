# Levantamento Terra — cena da fábrica 3D (lote 7, 08/10/2026; exercício dos treinos prontos do app).
# t = 0 barra no chão, com as anilhas apoiadas (o terra começa do chão) · t = 1 em pé, barra nas coxas. O app faz a volta.
# Terra convencional (barbell deadlift) DO CHÃO. Técnica conferida em:
#   ExRx, Barbell Deadlift: "With feet flat beneath bar squat down and grasp bar with shoulder width or slightly wider overhand or
#     mixed grip." / "Lift bar by extending hips and knees to full extension. Pull shoulders back at top of lift if rounded." /
#     "Throughout lift, keep hips low, shoulders high, arms and back straight. Knees should point same direction as feet throughout
#     movement. Keep bar close to body to improve mechanical leverage." ("mixed grip" entra entre as ajudas da pegada: "Gym chalk,
#     wrist straps, grip work, and mixed grip can be used to enhance grip.")
#   ExRx, Deadlift Analysis: "The hips begin in a nearly full flexion whereas the knees may start in a 75% flexed position (90
#     degree flexion / 120 degree full-range)." / "the majority of knee extension actually occurs early in the lift (allowing the
#     bar to clear the knees)" / "When the bar clears the knees, the knees and hip flexion are approximately 30-40 degrees (25-33%
#     flexed) and 70 degrees (60%) respectively." / "The Soleus Planter Flexes the ankle allowing the shin to become upright from
#     the forward angled position at the bottom of the deadlift."
#   NSCA, Basics of Strength and Conditioning Manual (2012), Barbell Clean Deadlift (o terra do chão do manual): "Approach the bar
#     resting on the floor or platform so the shins make contact" / "Place feet hip-width apart with toes pointed straight ahead" /
#     "Grasp the bar with a pronated grip slightly wider than shoulder-width with arms straight and elbows pointed out" / "Head
#     remains in a neutral position looking forward throughout the entire lift" / "the hips should be slightly higher than the
#     knees" / "Maintain a constant back angle during the initial lift-off (the shoulders, hips, knees, and bar should all move
#     together as one unit)" / "Lift the bar smoothly off the floor to just above the knees by slowly extending the hips and knees
#     (keep the bar in contact with the shins)" / "As the bar passes over the knees, the shoulders remain in front of the bar, arms
#     straight with elbows pointed out, hips flexed, and knees slightly bent" / "Extend hips forward and engage the core to
#     establish erect position" / "As a fully erect body position is established, shoulders, hips, knees, and ankles should be in
#     alignment".
#   ACE, Deadlift: "Stand behind the barbell with the feet about shoulder-width apart, the toes slightly rotated out, and the shins
#     almost touching the bar." / "Keeping the back flat, push the hips forward to move to standing position. Finish standing in a
#     tall position with the shoulders pulled back and the legs straight." (o ACE usa a pegada alternada: "over-under grip").
#   Escamilla et al., Med Sci Sports Exerc 2000;32(7):1265-75 (terra convencional em competição): "employed a wider stance (70 +/- 11
#     cm vs 32 +/- 8 cm), turned their feet out more (42 +/- 8 vs 14 +/- 6 degrees). and gripped the bar with their hands closer
#     together (47 +/- 4 cm vs 55 +/- 10 cm)" (sumô × convencional).
#   IPF Technical Rules (2026), Deadlift: "On completion of the lift the knees shall be locked in a straight position." / "Failure to
#     stand erect with the shoulders back."
# Pegada: PRONADA nas 2 mãos (a 1ª que o ExRx dá e a do manual da NSCA; a alternada fica como ajuda pra carga pesada).
# Barra: e3.barra (eixo de 29 mm, 1,32 m entre as travas: IPF "Distance between the collar faces is not to exceed 1.32 m or be less
# than 1.31 m", "Diameter of the bar is not to exceed 29 mm or be less than 28 mm") com anilhas de 45 cm (IWF: "The diameter of the
# largest discs: 450 mm with a tolerance of ± 1 mm"; IPF: "The diameter of the largest discs shall not be more than 45 cm") — em t = 0
# o eixo fica a 22,5 cm do chão e as anilhas encostam nele.
# Montagem: tornozelos parados no chão, a X_TORNOZELO do meio, pés girados PONTA graus pra fora (sola chapada); a pelve e o tronco
# giram juntos em volta das articulações do quadril (coluna neutra) e a cabeça volta um pouco pra olhar à frente; cada joelho fica em
# cima do pé (no plano vertical dele, JOELHO_FORA). A pose sai de 3 ângulos no tempo — canela (joelho à frente do tornozelo), joelho e
# tronco —: o joelho estende cedo (a canela fica em pé até a barra passar dos joelhos), o tronco fica quase no mesmo ângulo nessa 1ª
# parte e depois o quadril estende até ficar em pé, com as escápulas indo um pouco pra trás no fim (RETRAI). A barra fica encostada
# nas pernas (a FOLGA da pele, medida na malha posada a cada quadro) e pendurada nos braços esticados (o alcance ombro → vão da mão é
# medido no montar() com o braço todo esticado; quando a mão muda de ângulo e não chega, a barra sobe o que falta); em t = 0 o joelho
# é o que deixa a barra exatamente no chão (busca no montar()).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))

# ── barra ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (IPF: 28–29 mm)
R_ANILHA = 0.225           # anilha de 45 cm (IWF 450 ± 1 mm; IPF ≤ 45 cm): eixo a 22,5 cm do chão com as anilhas apoiadas
FOLGA = 0.006              # pele das pernas → superfície da barra (m): rente, sem encostar (a checagem pede ≥ 3 mm)

# ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.12         # tornozelo a 12 cm do meio: 24 cm entre os tornozelos, os pés na largura do quadril (NSCA: "hip-width
                           # apart"; Escamilla 2000: 32 ± 8 cm no convencional) — com mais, o antebraço encostava no joelho embaixo
PONTA = 10.0               # ponta do pé pra fora (graus; Escamilla 2000: 14 ± 6°; ACE: "toes slightly rotated out")
JOELHO_FORA = 0.005        # centro do joelho 5 mm pra fora do plano vertical do pé (ExRx: "Knees should point same direction as
                           # feet throughout movement")

# ── pegada ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
GRIP_X = 0.28              # meio da mão a 28 cm do meio: 56 cm entre as mãos (Escamilla 2000: 55 ± 10 cm), por fora dos joelhos
PALMA_Q = Vector((0, 1, 0))      # pegada pronada: palma virada pro corpo
DEDOS_Q = Vector((0, 0, -1))
FOLGA_BRACO = 0.0003       # o alcance dos braços (ombro → vão da mão) é medido no começo com o braço todo esticado; a barra fica
                           # 0,3 mm mais perto que isso (cotovelo quase reto: "arms straight"); quando a mão não chega (a mão
                           # muda de ângulo no movimento), a barra sobe o que faltar

# ── movimento (graus) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
CANELA = (15.0, 2.0)       # canela à frente da vertical: começo (joelho à frente da barra) → em pé
T_CANELA = 0.60            # até aqui a canela fica em pé (a barra passa dos joelhos em t ≈ 0,5)
P_CANELA = 1.8             # (1 − t/T)^P: a canela volta mais no começo — a barra sobe rente a ela sem ir pra frente (com a canela
                           # inclinada parada, a barra "subia a rampa" 2 cm pra frente)
JOELHO_FIM = 3.5           # flexão do joelho em pé (joelho travado; o começo sai da busca: barra no chão)
P_JOELHO = 1.3             # 1 − (1 − t)^P: o joelho estende cedo (ExRx: "the majority of knee extension actually occurs early")
                           # e chega a ~35° quando a barra passa dos joelhos (ExRx: "approximately 30-40 degrees")
TRONCO = (64.0, 0.0)       # tronco à frente da vertical: começo → em pé (sem inclinar pra trás)
P_TRONCO = 2.5             # t^P: o tronco muda pouco até a barra passar dos joelhos (NSCA: "constant back angle") e o ombro fica
                           # à frente da barra ("the shoulders remain in front of the bar")
PESCOCO = 0.3              # a cabeça volta essa fração da inclinação do tronco (olhar à frente, cabeça neutra)
RETRAI = 8.0               # escápulas pra trás no fim (graus em volta do eixo do tronco; ACE: "shoulders pulled back"; IPF: "stand
                           # erect with the shoulders back")
T_RETRAI = 0.75            # a retração começa aqui


def _suave(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def angulos(t, joelho0):
    """(canela, joelho, tronco) em graus no instante t, com a flexão do joelho do começo joelho0."""
    canela = CANELA[1] + (CANELA[0] - CANELA[1]) * max(0.0, 1.0 - t / T_CANELA) ** P_CANELA
    joelho = JOELHO_FIM + (joelho0 - JOELHO_FIM) * (1.0 - t) ** P_JOELHO
    tronco = TRONCO[0] + (TRONCO[1] - TRONCO[0]) * t ** P_TRONCO
    return canela, joelho, tronco


def joelho_no_plano_do_pe(H, A, f, n, lt, ls, alvo_d=0.0):
    """Joelho da perna quadril H → tornozelo A (coxa lt, canela ls) no círculo de joelhos possíveis, a `alvo_d` m (com sinal, − =
    pra dentro) do plano vertical do pé (passa por A, direção f da ponta do pé, normal n pra fora) — o joelho à frente, em cima
    do pé, das 2 soluções —; quando o círculo não chega lá, o ponto dele mais perto disso. Devolve (joelho, centro do círculo,
    distância ao plano em m). A mesma conta do agachamento sumô (cenas/agachamento_sumo_com_halteres.py, lote 7)."""
    d = (A - H).length
    u = (A - H) / d
    x = (d * d + lt * lt - ls * ls) / (2 * d)
    r = math.sqrt(max(lt * lt - x * x, 0.0))
    C = H + u * x
    e1 = u.cross(Vector((0.0, 0.0, 1.0)))
    if e1.length < 1e-6:
        e1 = u.cross(Vector((0.0, 1.0, 0.0)))
    e1.normalize()
    e2 = u.cross(e1).normalized()
    d0 = n.dot(C - A)
    a1, a2 = n.dot(e1), n.dot(e2)
    m = math.hypot(a1, a2)
    psi0 = math.atan2(a2, a1)                               # o ponto do círculo mais pra fora
    K = lambda ps: C + (e1 * math.cos(ps) + e2 * math.sin(ps)) * r
    q = None if (alvo_d is None or r * m < 1e-9) else (alvo_d - d0) / (r * m)
    if q is not None and abs(q) <= 1.0:
        da = math.acos(q)
        Kj = max([K(psi0 + da), K(psi0 - da)], key=lambda k: (k - A).dot(f))   # o joelho à frente, em cima do pé
    else:
        Kj = K(psi0 if (q is None or q > 1.0) else psi0 + math.pi)
    return Kj, C, n.dot(Kj - A)


def montar(bon):
    pg.usar_polegar("volta")
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2              # meio das articulações do quadril no repouso
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")                                         # tornozelo no repouso (altura e y)

    # ── pés: tornozelos no lugar, sola chapada e ponta virada PONTA graus pra fora (em volta da vertical) ─────────────────────
    pes, pernas, polos, tornozelos = {}, {}, {}, {}
    for lado, s in LADOS:
        th = math.radians(PONTA)
        f = Vector((s * math.sin(th), -math.cos(th), 0.0))
        n = Vector((s * math.cos(th), math.sin(th), 0.0))
        A = Vector((s * X_TORNOZELO, tz0.y, tz0.z))
        pes[lado] = dict(A=A, f=f, n=n)
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))   # nasce no tornozelo (alvo ≠ polo)
        polos[lado] = p3.vazio("polo_joelho_" + lado, A + f * 1.2 + Vector((0.0, 0.0, 0.45)))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos[lado])
        b = rig.data.bones[p3.P + lado + "Foot"]
        rot = p3.vazio("rot_" + lado + "Foot")
        rot.matrix_world = Matrix.Rotation(s * th, 4, "Z") @ (rig.matrix_world @ b.matrix_local)
        cn = PB[p3.P + lado + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = rot
        tornozelos[lado].location = A
    p3.atualizar()
    ya, za = tz0.y, tz0.z
    dx = X_TORNOZELO - meia_quadril                              # quadril → tornozelo, de lado (a perna não fica no plano sagital)

    def quadril(canela, joelho):
        """Meio das articulações do quadril (y, z) com a canela `canela` graus à frente da vertical e o joelho dobrado `joelho`
        graus, no plano sagital; z corrigido pra a distância de verdade quadril → tornozelo (com o afastamento de lado)."""
        a, k = math.radians(canela), math.radians(joelho)
        y = ya - ls * math.sin(a) + lt * math.sin(k - a)
        d = math.sqrt(ls * ls + lt * lt + 2 * ls * lt * math.cos(k))
        z = za + math.sqrt(max(d * d - dx * dx - (y - ya) ** 2, 1e-6))
        return y, z

    estado = {}

    def corpo(t, joelho0):
        """Pelve e tronco (giram juntos: coluna neutra), joelhos na direção dos pés (IK com o polo no lugar do joelho), cabeça e
        escápulas."""
        for nome in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        canela, joelho, tronco = angulos(t, joelho0)
        y, z = quadril(canela, joelho)
        p3.girar_osso(rig, "Hips", p3.rot_x(tronco), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        K = {}
        for lado, s in LADOS:
            H = Vector((s * meia_quadril, y, z))
            Kj, C, _ = joelho_no_plano_do_pe(H, pes[lado]["A"], pes[lado]["f"], pes[lado]["n"], lt, ls, JOELHO_FORA)
            v = Kj - C
            polos[lado].location = Kj + (v.normalized() if v.length > 1e-6 else pes[lado]["f"]) * 0.6
            K[lado] = Kj
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-tronco * PESCOCO))
        g = RETRAI * _suave((t - T_RETRAI) / (1.0 - T_RETRAI)) if RETRAI else 0.0
        if g:
            cima = (c("Neck") - c("Hips")).normalized()
            for lado, s in LADOS:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * g), 3, cima))
        estado.update(canela=canela, joelho=joelho, tronco=tronco, K=K)

    def y_encostada(z):
        """y do eixo da barra o mais perto do corpo (fora as mãos, como na checagem) com a pele a RAIO_BARRA + FOLGA dele, com o
        eixo na altura z. Medido nos TRIÂNGULOS da malha posada (as bordas de cada um amostradas a cada 1 mm), não só nos vértices:
        os vértices da canela ficam a 1–2 cm um do outro na vertical e a barra "encaixava" entre 2 deles (6 mm dos vértices, 2,1 mm
        da pele: a checagem pegou no checar 24 de 09/10/2026)."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        mao = np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes] + [False])[dono]
        r = RAIO_BARRA + FOLGA
        T = tri[~mao[tri].any(axis=1)]
        zs = co[T][:, :, 2]
        T = T[(zs.min(axis=1) < z + r) & (zs.max(axis=1) > z - r)]
        V = co[T]                                               # (n, 3 vértices, xyz)
        u = np.linspace(0.0, 1.0, 33)[:, None, None]
        P = np.concatenate([(V[:, k] + u * (V[:, (k + 1) % 3] - V[:, k])).reshape(-1, 3) for k in range(3)])
        dz = P[:, 2] - z
        perto = np.abs(dz) < r
        return float(np.min(P[perto, 1] - np.sqrt(r * r - dz[perto] ** 2)))

    braco = (c("LeftForeArm") - c("LeftArm")).length
    antebraco = (c("LeftHand") - c("LeftForeArm")).length
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    alc = {"v": braco + antebraco + maos.palma * 0.92}         # 1º palpite: braço e mão em linha reta (longo demais: a mão
                                                               # fica um pouco de lado da linha; o montar() mede o de verdade)

    def lugar_da_barra():
        """Eixo da barra (y, z): encostado nas pernas e pendurado nos ombros pelo alcance dos braços (o vão de cada mão a GRIP_X
        do meio)."""
        S = c("LeftArm")
        z = S.z - alc["v"]
        y = None
        for _ in range(6):
            y_novo = y_encostada(z)
            z = S.z - math.sqrt(max(alc["v"] ** 2 - (GRIP_X - S.x) ** 2 - (y_novo - S.y) ** 2, 1e-4))
            if y is not None and abs(y_novo - y) < 1e-5:
                y = y_novo
                break
            y = y_novo
        return y, z

    def pegar(centro):
        """As 2 mãos na barra com o eixo em `centro`; devolve quanto falta (m, ao longo do braço) pra mão que menos alcança chegar
        no vão (+ = falta: o braço já está todo esticado)."""
        falta = -1.0
        for lado, s in LADOS:
            S = c(lado + "Arm")
            g = centro + Vector((s * GRIP_X, 0.0, 0.0)) - PALMA_Q * 0.002   # vão 2 mm atrás do eixo (como no stiff)
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S + Vector((s * 0.25, 0.5, 0.2)), alinhar=0.5)
            vao = p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]
            falta = max(falta, (g - vao).dot((g - S).normalized()))
        return falta

    # ── começo: o joelho que deixa a barra no chão (as anilhas encostando) ──────────────────────────────────────────────────────
    def z_da_barra(joelho0):
        corpo(0.0, joelho0)
        return lugar_da_barra()[1]

    def polo_dos_joelhos(joelho0):
        """pole_angle do IK de cada perna (o joelho no plano quadril–tornozelo–polo, do lado do polo), em 0,5°, com a perna
        dobrada do começo."""
        corpo(0.0, joelho0)
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            melhor = (1e9, None)
            for k in range(-10, 11):
                ang = e[1] + k * 0.5
                pernas[lado].pole_angle = math.radians(ang)
                p3.atualizar()
                melhor = min(melhor, ((c(lado + "Leg") - estado["K"][lado]).length, ang))
            pernas[lado].pole_angle = math.radians(melhor[1])
            p3.atualizar()
            print("polo joelho %s %.1f° | joelho a %.1f mm do alvo" % (lado, melhor[1], melhor[0] * 1000), flush=True)

    def busca():
        lo, hi = 40.0, 110.0                                   # mais joelho = quadril mais baixo = barra mais baixa
        for _ in range(16):
            m = (lo + hi) / 2
            if z_da_barra(m) > R_ANILHA:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    polo_dos_joelhos(80.0)
    joelho0 = busca()
    corpo(0.0, joelho0)                                        # alcance de verdade dos braços (todo esticado) no começo
    y, z = lugar_da_barra()
    falta = pegar(Vector((0.0, y, z)))
    alc["v"] -= falta + FOLGA_BRACO
    print("TERRA alcance ombro → vão %.4f m (faltavam %.1f mm com o braço e a mão em linha reta)" % (alc["v"], falta * 1000),
          flush=True)
    polo_dos_joelhos(joelho0)
    joelho0 = busca()
    print("TERRA joelho no começo %.2f° | barra z %.4f" % (joelho0, z_da_barra(joelho0)), flush=True)

    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=1.32)
    barra.rotation_mode = "XYZ"
    barra.rotation_euler = (0, 0, 0)

    def pose(t):
        """t=0 barra no chão, t=1 em pé (barra nas coxas)."""
        corpo(t, joelho0)
        y, z = lugar_da_barra()
        subiu = 0.0
        for _ in range(4):
            z = max(z, R_ANILHA)                                # as anilhas nunca entram no chão
            centro = Vector((0.0, y, z))
            falta = pegar(centro)
            if falta < 0.0002:
                break
            S = c("LeftArm")                                   # a mão não chega: a barra sobe o que falta, encostada nas pernas
            dz = falta / max(0.5, (S.z - z) / alc["v"])
            z += dz
            subiu += dz
            y = y_encostada(z)
        barra.location = centro
        p3.atualizar()
        estado.update(barra=centro.copy(), subiu=subiu, falta=falta)
        for lado, _ in LADOS:                         # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, centro, Vector((1, 0, 0)), RAIO_BARRA, polegar_antes=antes)

    pose.dedos = {}
    pose.estado = estado
    pose.joelho0 = joelho0

    pose(0.5)                                         # polo certo do cotovelo no meio do movimento
    for lado in ("Left", "Right"):
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)

    def info():
        b = estado.get("barra", Vector())
        return "%s | barra y %+.3f z %.3f (subiu %.1f mm, falta %.1f mm) | canela %.1f° joelho %.1f° tronco %.1f°" % (
            maos.info(), b.y, b.z, estado.get("subiu", 0) * 1000, estado.get("falta", 0) * 1000, estado.get("canela", 0),
            estado.get("joelho", 0), estado.get("tronco", 0))

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.0, 0.6),
                camera_video=((3.4, -2.6, 1.1), (0, 0.0, 0.62), 50), info=info)
