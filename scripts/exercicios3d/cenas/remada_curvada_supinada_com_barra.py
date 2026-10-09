# Remada Curvada Supinada com Barra — cena da fábrica 3D (lote 8, 09/10/2026; um dos 61 novos: 0 usos nos treinos prontos, 16 como
# troca equivalente). O jeito da Remada Curvada com Barra (lote 1), com a pegada SUPINADA e a técnica conferida de novo nas fontes.
# t = 0 em pé, joelhos levemente dobrados e o tronco inclinado à frente, parados (coluna neutra); a barra pendurada nos braços
#       esticados embaixo dos ombros, segura por baixo (palmas pra frente), e as escápulas soltas (os ombros descem pro chão)
# t = 1 a barra na cintura, os cotovelos pra trás, junto do corpo, passando da linha do tronco, e as escápulas pra trás. O app faz
#       a volta.
# Técnica conferida em:
#   ExRx, Barbell Underhand Bent-over Row: "Bend knees slightly and bend over bar with back straight. Grasp bar with underhand grip." /
#     "Pull bar to waist. Return until arms are extended and shoulders are stretched downward. Repeat." / "Torso may be kept
#     horizontal for strict execution. Knees are bent in effort to keep low back straight" (a Barbell Bent-over Row, pronada, tem o
#     mesmo comentário e "Pull bar to upper waist") / "A shoulder width or underhand grip can increase lat involvement by emphasizing
#     shoulder extension over transverse extension." (Barbell Bent-over Row).
#   ExRx, Questions/Rows (Pendlay Row): "The Pendlay Row is a strict Barbell Bent-over Row with the torso positioned horizontally." /
#     "It's common to see compromised form when attempting to handle too much weight on this movement, by either popping the torso
#     upward each rep or positioning the torso more upright by bending over only part way. Much more weight can be used when you're
#     not bent over all the way where the range of motion is significantly compromised particularly with an underhand grip" / (Dorian
#     Yates) "he was already pre-stretched in his 45º torso position".
#   Catalyst Athletics, Reverse-Grip Bent Row ("Supinated bent row, underhand bent-over row, underhand barbell row"): "Hold the bar
#     with a clean-width grip with the palms facing forward, brace your trunk, and hinge forward at the hips while bending the knees to
#     bring your trunk just above horizontal, letting the bar hang at arms’ length close to the legs." / "Pull the bar to the abdomen,
#     squeezing your shoulder blades back together and forcefully extending the upper back at the top of each rep. Lower the bar to
#     full elbow extension and allow the shoulder blades to protract without losing your braced back position." / "The angle of the
#     trunk can also be varied depending on the desired effect, from horizontal to closer to 45-degrees—the higher the angle, the more
#     heavily it can be loaded, but the smaller the range of motion." / "The supinated grip emphasizes the biceps more than the
#     conventional pronated grip."
#   NSCA, Basics of Strength and Conditioning Manual (2012), Bent-Over Row (pronada): "place feet hip-width apart with toes pointed
#     straight ahead" / "Keeping the back flat and knees slightly flexed, push hips backward and lower torso until it is parallel with
#     the floor" / "squeeze shoulder blades together, and flex elbows to pull them up and slightly outward" / "Pull the bar upward
#     until it touches the upper abdomen" / "Weight should remain on the heels of the feet with knees slightly flexed" / "Maintain a
#     flat back position throughout the entire lift".
#   ACE, Bent-over Row (barra, pronada): "bend forward at the hips, and keep the back straight with a slight bend in the knees" /
#     "Lower the bar towards the floor until the elbows are completely straight, and keep the back flat as the bar is pulled towards
#     the belly button".
#   University of Sussex Sport, Bent Over Barbell Row (pronada, a 45°): "Have the arms extend directly below the shoulders" / "The body
#     should stay in the same position throughout the movement" / "Look out for: ... spinal alignment, head looking up, elbows coming
#     out to the side".
#   Fenwick, Brown e McGill, JSCR 2009 (remada curvada com barra): "flexed the trunk over the hips, and were instructed to keep a
#     neutral spine while they pulled the bar to their chest, bending their arms at the elbows".
#   Lehman et al., Dyn Med 2004 (puxada, não remada): "a supinated grip does not appear to preferentially activate the biceps", mas a
#     razão latíssimo:bíceps caiu com a pegada supinada (tabela 1: 175 → 111).
# Decisões: o TRONCO fica a 60° da vertical (30° acima da horizontal), parado — a pegada supinada não pede o tronco mais em pé: o ExRx
# dá o mesmo "Torso may be kept horizontal for strict execution" nas 2 pegadas e chama o tronco mais em pé de forma comprometida,
# "particularly with an underhand grip"; a Catalyst vai da horizontal até perto de 45° (o tronco da Yates). 60° fica no meio da
# faixa; deitar o tronco até a horizontal, com o joelho só levemente dobrado, pede ~50° de joelho pra equilibrar o tronco à frente.
# Joelhos 30° com a canela quase em pé: o quadril vai pra trás (~20 cm atrás dos tornozelos) e equilibra o tronco e a barra em cima do
# pé. A barra fica embaixo dos ombros no começo e vai em linha reta até a cintura (a 17 cm do meio dos quadris, ao longo do tronco,
# a 1 cm da pele: mais embaixo a coxa, com o quadril dobrado ~90°, fica na frente da barriga). Escápulas: a clavícula gira em volta do
# eixo do tronco (pra frente no começo, pra trás no fim). Cotovelos junto do corpo: o polo do cotovelo atrás do ombro, 6 cm pra fora.
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

LADOS = (("Left", 1), ("Right", -1))
X = Vector((1.0, 0.0, 0.0))

# ── barra ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (a e3.barra)
R_ANILHA = 0.225           # anilha de 45 cm (a do Levantamento Terra: IWF "450 mm with a tolerance of ± 1 mm")

# ── base e tronco (parados o movimento todo) ──────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.12         # tornozelo a 12 cm do meio: os pés na largura do quadril (NSCA)
PONTA = 0.0                # ponta do pé pra frente (NSCA: "toes pointed straight ahead")
JOELHO_FORA = 0.005        # centro do joelho 5 mm pra fora do plano vertical do pé (joelho na direção do pé)
CANELA = 1.0               # canela à frente da vertical (graus): quase em pé, o quadril vai pra trás
JOELHO = 30.0              # flexão do joelho (graus): levemente dobrado
TRONCO = 60.0              # tronco à frente da vertical (graus)
PESCOCO = 0.30             # a cabeça volta essa fração da inclinação do tronco (cabeça na linha da coluna, olhando o chão à frente)

# ── pegada e braços ─────────────────────────────────────────────────────────────────────────────────────────────────────────
GRIP_X = 0.24              # meio de cada mão a 24 cm do meio da barra (48 cm entre as mãos)
PALMA_Q = Vector((0.0, -1.0, 0.0))   # pegada supinada: palma virada pra frente (pro lado contrário das pernas)
DEDOS_Q = Vector((0.0, 0.0, -1.0))   # braço pendurado: dedos pro chão
ALINHAR = 0.6              # quanto os dedos seguem o antebraço (punho menos dobrado em cima)
POLO = (0.06, 0.60, 0.0)   # polo do cotovelo a partir do ombro, no referencial do tronco (m: pra fora, pra trás, pra cima)
COTOVELO0 = 6.0            # começo: a média dos 2 cotovelos com isso (braço esticado, sem travar; um braço alcança ~1 mm mais
                           # que o outro e, com o cotovelo quase reto, isso dá uns 6° de diferença entre os 2)
DY0 = 0.02                 # começo: a barra 2 cm atrás da vertical dos ombros (+ = pra trás, pras pernas)
CINTURA = 0.17             # fim: a barra na cintura — 17 cm do meio dos quadris, ao longo do tronco (mais embaixo, com o quadril
                           # dobrado ~90°, a coxa sobe até ~13 cm na frente da barriga e a barra não cabe entre as duas)
FOLGA_BARRIGA = 0.010      # fim: superfície da barra → pele da barriga/coxas
PROTRAI, RETRAI = 8.0, 12.0          # escápulas: pra frente no começo, pra trás no fim (graus da clavícula em volta do tronco)


def _suave(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def joelho_no_plano_do_pe(H, A, f, n, lt, ls, alvo_d=0.0):
    """Joelho da perna quadril H → tornozelo A (coxa lt, canela ls) no círculo de joelhos possíveis, a `alvo_d` m (com sinal, − =
    pra dentro) do plano vertical do pé (passa por A, direção f da ponta do pé, normal n pra fora) — o joelho à frente, em cima
    do pé, das 2 soluções —; quando o círculo não chega lá, o ponto dele mais perto disso. Devolve (joelho, centro do círculo,
    distância ao plano em m). A mesma conta do Levantamento Terra (lote 7)."""
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
    psi0 = math.atan2(a2, a1)
    K = lambda ps: C + (e1 * math.cos(ps) + e2 * math.sin(ps)) * r
    q = None if (alvo_d is None or r * m < 1e-9) else (alvo_d - d0) / (r * m)
    if q is not None and abs(q) <= 1.0:
        da = math.acos(q)
        Kj = max([K(psi0 + da), K(psi0 - da)], key=lambda k: (k - A).dot(f))
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
    tz0 = c("LeftFoot")

    # ── pés: tornozelos no lugar, sola chapada, ponta PONTA graus pra fora ────────────────────────────────────────────────────
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
    dx = X_TORNOZELO - meia_quadril

    a_, k_ = math.radians(CANELA), math.radians(JOELHO)
    y_q = ya - ls * math.sin(a_) + lt * math.sin(k_ - a_)
    d_q = math.sqrt(ls * ls + lt * lt + 2 * ls * lt * math.cos(k_))
    z_q = za + math.sqrt(max(d_q * d_q - dx * dx - (y_q - ya) ** 2, 1e-6))
    H0 = Vector((0.0, y_q, z_q))                               # meio das articulações do quadril (parado)
    estado = {}

    def corpo(t):
        """Pelve e tronco inclinados juntos (coluna neutra), joelhos na direção dos pés, cabeça na linha da coluna e as escápulas
        (pra frente no começo, pra trás no fim)."""
        for nome in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(TRONCO), pivo=meio0, mover=H0 - meio0)
        K = {}
        for lado, s in LADOS:
            H = Vector((s * meia_quadril, H0.y, H0.z))
            Kj, C, _ = joelho_no_plano_do_pe(H, pes[lado]["A"], pes[lado]["f"], pes[lado]["n"], lt, ls, JOELHO_FORA)
            v = Kj - C
            polos[lado].location = Kj + (v.normalized() if v.length > 1e-6 else pes[lado]["f"]) * 0.6
            K[lado] = Kj
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-TRONCO * PESCOCO))
        g = -PROTRAI + (PROTRAI + RETRAI) * _suave(t)
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * g), 3, cima))
        estado.update(escapula=g, K=K)

    def polo_dos_joelhos():
        corpo(0.0)
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

    polo_dos_joelhos()

    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")

    def eixos():
        return [Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig))]

    def polo(L, s):
        cima, lado, frente = eixos()
        return c(L + "Arm") - lado * (s * POLO[0]) - frente * POLO[1] + cima * POLO[2]

    def pegar(centro):
        """As 2 mãos na barra com o eixo em `centro` (o IK parte sempre do braço de repouso)."""
        for L, s in LADOS:
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + L + n].matrix_basis = Matrix()
            p3.atualizar()
            g = centro + Vector((s * GRIP_X, 0.0, 0.0))
            maos.segurar(L, g, DEDOS_Q, PALMA_Q, polo=polo(L, s), alinhar=ALINHAR)

    def cotovelo_medio():
        j = ck.medir_juntas(rig)
        return (j["cotoveloE"] + j["cotoveloD"]) / 2

    def ombros():
        return (c("LeftArm") + c("RightArm")) / 2

    # ── fim: a barra na altura do umbigo, a FOLGA_BARRIGA da pele (tronco e coxas, fora braços e mãos) ─────────────────────────────
    corpo(1.0)
    cima, lado, frente = eixos()
    alvo = H0 + cima * CINTURA
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    pele = np.array([n in ("Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg") for n in nomes] + [False])[dono]
    P = co[pele & (np.abs(co[:, 0]) < 0.62)]

    def folga(v):
        e = alvo + frente * v
        return float((np.hypot(P[:, 1] - e.y, P[:, 2] - e.z) - RAIO_BARRA).min())

    hi = 0.0                                     # da pele pra fora: o 1º ponto com a folga (a coxa embaixo também conta)
    while folga(hi) < FOLGA_BARRIGA and hi < 0.40:
        hi += 0.0005
    C1 = alvo + frente * hi
    C1.x = 0.0
    print("REMADA fim: barra y %.4f z %.4f | %.1f mm à frente do eixo do tronco (folga %.1f mm)" % (
        C1.y, C1.z, hi * 1000, folga(hi) * 1000), flush=True)

    def comeco():
        """A barra embaixo dos ombros, na altura em que a média dos 2 cotovelos fica com COTOVELO0°."""
        corpo(0.0)
        S0 = ombros()
        lo, hi = S0.z - 0.80, S0.z - 0.40
        for _ in range(22):
            m = (lo + hi) / 2
            pegar(Vector((0.0, S0.y + DY0, m)))
            if cotovelo_medio() > COTOVELO0:
                hi = m                               # cotovelo dobrado demais: a barra desce
            else:
                lo = m
        print("REMADA começo: barra y %.4f z %.4f | ombros y %.4f z %.4f" % (S0.y + DY0, hi, S0.y, S0.z), flush=True)
        return Vector((0.0, S0.y + DY0, hi))

    # polo certo do cotovelo no meio do movimento (com um começo aproximado), depois o começo de verdade
    corpo(0.5)
    S0 = ombros()
    pegar(Vector((0.0, S0.y + DY0, S0.z - 0.60)).lerp(C1, 0.5))
    for L, _ in LADOS:
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)
    C0 = comeco()

    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=1.32)
    barra.rotation_mode = "XYZ"
    barra.rotation_euler = (0, 0, 0)

    def pose(t):
        """t=0 braços esticados com a barra pendurada, t=1 barra na cintura."""
        corpo(t)
        centro = C0.lerp(C1, t)
        barra.location = centro
        p3.atualizar()
        pegar(centro)
        estado.update(barra=centro.copy())
        for L, _ in LADOS:                         # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(L, {}).get("Thumb") if t > 0 else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, centro, X, RAIO_BARRA, polegar_antes=antes)

    pose.dedos = {}
    pose.estado = estado
    pose.C0, pose.C1, pose.H0 = C0, C1, H0

    def info():
        b = estado.get("barra", Vector())
        return "%s | barra y %+.3f z %.3f | escápula %+.1f°" % (maos.info(), b.y, b.z, estado.get("escapula", 0.0))

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, -0.1, 0.8),
                camera_video=((3.6, 2.6, 1.3), (0, -0.05, 0.75), 50), info=info)
