# Remada Alta com Barra — cena da fábrica 3D (lote 13, 12/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos e nenhuma vez como troca equivalente; "fonte_en": "Upright Barbell Row"). Sem peça nova: a barra olímpica LONGA do
# Levantamento Terra e do Encolhimento com Barra (e3.barra, eixo de 29 mm, 1,32 m entre as travas, anilhas de 45 cm), a das fotos do
# free-exercise-db (o fonte_en).
# t = 0 em pé, os braços esticados e a barra segura POR CIMA (pegada pronada: as palmas viradas pras coxas), com as mãos na largura dos
# ombros, na frente das coxas, quase encostando nelas · t = 1 os cotovelos subiram pelos lados até a altura dos ombros (o braço na
# horizontal), sempre mais altos que os punhos, e a barra subiu RENTE ao corpo até o peito, com os punhos dobrados. O app faz a volta
# (desce devagar até os braços esticarem).
# Técnica (as fontes, com a frase exata, ficam na ficha):
#   • free-exercise-db, Upright Barbell Row (o "fonte_en"): "Grasp a barbell with an overhand grip that is slightly less than shoulder
#     width. The bar should be resting on the top of your thighs with your arms extended and a slight bend in your elbows." / "use the
#     sides of your shoulders to lift the bar, raising your elbows up and to the side. Keep the bar close to your body as you raise it."
#     / "Your elbows should drive the motion, and should always be higher than your forearms. Remember to keep your torso stationary".
#   • ExRx, Barbell Upright Row: "Grasp bar with shoulder width or slightly narrower overhand grip." / "Pull bar to neck with elbows
#     leading. Allow wrists to flex as bar rises." · ExRx, Upright Row Safety: "A shoulder width grip is suggested when performing the
#     upright row." / "An upright posture with chest high and shoulders back, bar kept close to the body, and a medium to slightly wide
#     grip can facilitate a more ideal shoulder posture."
#   • NSCA (Achievable, curso da prova CSCS), Barbell upright row: "Grasp the bar with a closed, pronated grip approximately
#     shoulder-width apart or slightly wider." / "Stand erect with feet shoulder-width apart and knees slightly flexed." / "Pull the
#     bar up along the abdomen and chest toward the chin." / "Keep the elbows pointed out to the sides as the bar brushes against the
#     body." / "At the highest bar position, the elbows should be level with or slightly higher than the shoulders and wrists."
#   • Schoenfeld, Kolber & Haimes 2011 (Strength Cond J 33(5):25-28): "the authors recommend that asymptomatic individuals elevate
#     their arms during the upright row to just below 90° (shoulder height)" / "the bar should be pulled as close to the body as
#     possible throughout the movement" / "elevation of the arm at an angle that is slightly anterior to the coronal plane".
#   • McAllister et al. 2013 (J Strength Cond Res 27(1):181-7): pegada a 50, 100 e 200% da largura biacromial; "increased deltoid and
#     trapezius activity with increasing grip width, and correspondingly less BB activity".
#   • Catalyst Athletics, Clean-Grip Upright Row: "lift the elbows as high as possible, allowing yourself to shrug up and back
#     naturally with the motion".
# Decisões (as divergências estão no relatório e na ficha): pegada na largura dos ombros (o ponto em que o ExRx, o ExRx Safety, a NSCA
# e o McAllister se encontram); o cotovelo sobe até a altura do ombro, nem mais nem menos (a NSCA "level with" ∩ Schoenfeld "just below
# 90°"); a barra para no peito, onde a geometria do braço deixa com o cotovelo nessa altura (o "nearly touches your chin" do fonte_en
# pede o cotovelo bem acima do ombro, a técnica "tradicional" que Schoenfeld desaconselha).
# Montagem: o corpo fica na pose de repouso (em pé, pés na largura dos ombros e paralelos, joelhos soltos ~7°, tronco e cabeça parados).
# A cintura escapular é a do Encolhimento com Halteres (lote 2) com um ângulo bem menor: as escápulas um pouco pra trás o tempo todo
# (RETRAI) e a clavícula subindo CLAV graus junto com o braço, com o ombro subindo reto. A barra sobe numa reta do meio das coxas ao
# peito, por fora do corpo: a envoltória (do lado da frente) do perfil da pele do tronco e das coxas (sem braços e mãos) entre a
# altura de baixo e a de cima, a FOLGA da superfície da barra — rente às coxas embaixo e ao peito em cima, sem entrar nas dobras do
# quadril e do umbigo. As mãos fecham na barra com a pegada pronada (maos3d.Maos.segurar com zerar, o polegar novo dando a volta); a
# mão é posta em relação ao ANTEBRAÇO (dedos_palma): reta embaixo, dobrando FLEXAO1·t pro lado da palma (ExRx "Allow wrists to flex as
# bar rises"), com o desvio ulnar até DESVIO_MAX e o resto como barra oblíqua na palma, a palma sempre de frente pra barra; o giro que o
# segurar deixa no punho passa pro antebraço (sem_giro_no_punho: o punho só dobra, quem gira é o antebraço). O cotovelo vai pro lado do
# POLO do IK — uma direção fixa a partir do ombro, pro lado e PLANO graus pra frente, na horizontal —, então ele sobe "up and to the
# side" e chega no fim na horizontal. Embaixo a barra fica onde o cotovelo dobra COTOVELO0 graus (braço esticado); em cima, onde o braço
# chega a ELEVA1 graus do tronco (as 2 alturas saem de bissecções no montar()). Com o cotovelo na altura do ombro e o punho dentro da
# amplitude normal, a barra para na parte de baixo do peito (z ≈ 1,18 m, ~26 cm abaixo do queixo).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X); o boneco olha pra −Y

# ── barra ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (IPF: 28–29 mm): a mão de referência padrão (sem usar_cilindro)
R_ANILHA = 0.225           # anilha de 45 cm (IWF 450 ± 1 mm; IPF ≤ 45 cm), a do Levantamento Terra e do Encolhimento com Barra
FOLGA = 0.006              # pele → superfície da barra (m): rente, sem encostar (a checagem pede ≥ 3 mm; NSCA "as the bar brushes
                           # against the body")

# ── pegada ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
GRIP_X = 0.215             # meio da mão a 21,5 cm do meio: 43 cm entre as mãos, as mãos embaixo das articulações do ombro do esqueleto
                           # (±20 cm) — "shoulder width" (ExRx; ExRx Safety; NSCA "approximately shoulder-width apart"), ~100–110% da
                           # largura biacromial do boneco (o centro do ombro do MakeHuman, "joint-l-shoulder", fica a ±16,8 cm e o
                           # acrômio ~2 cm por fora), a pegada de referência (100%) do McAllister. Mais fechada (o "slightly less than
                           # shoulder width" do fonte_en) o antebraço chega na mão quase deitado e o punho passa do desvio normal em cima
# pegada pronada (as palmas viradas pro corpo embaixo). A mão é posta em relação ao ANTEBRAÇO, sempre com a palma de frente pra
# barra (a mão não rola em volta dos dedos — rolando, a beirada da mão entrava 12–14 mm na barra, checar de 12/10 15:56):
FLEXAO1 = 45.0             # o punho dobra pro lado da palma (flexão) de 0° embaixo (mão na linha do antebraço) a FLEXAO1 em cima,
                           # conforme a barra sobe (ExRx "Allow wrists to flex as bar rises")
DESVIO_MAX = 25.0          # o antebraço chega na mão vindo do cotovelo aberto, de lado: o punho desvia pro lado do mínimo (ulnar) até
                           # DESVIO_MAX (a amplitude normal do desvio ulnar é 30°, Norkin & White/AAOS, limites.py) e o que passar
OBLIQUA_MAX = 25.0         # disso vira a barra oblíqua na palma (até OBLIQUA_MAX: a mão gira no plano da palma, os dedos pro lado do
                           # antebraço — na pegada de força a barra atravessa a palma na diagonal)
COTOVELO0 = 12.0           # flexão do cotovelo embaixo (graus): braço esticado com o cotovelo solto (fedb "arms extended and a slight
                           # bend in your elbows"; NSCA "elbows fully extended")

# ── braço ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ELEVA1 = 90.0              # braço × tronco em cima (graus): o cotovelo na altura do ombro (NSCA "level with ... the shoulders";
                           # Schoenfeld "just below 90° (shoulder height)")
PLANO = 10.0               # o polo do cotovelo: pro lado, PLANO graus pra frente do plano do corpo (Schoenfeld "slightly anterior to
                           # the coronal plane (bringing the arm straight out to the side)"; NSCA "Keep the elbows pointed out to the
                           # sides"; ExRx Safety "keep the elbow pointing directly to the side, instead of angling it slightly to the
                           # front")

# ── cintura escapular ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CLAV = (0.0, 10.0)         # elevação da clavícula (graus) embaixo → em cima, junto com o braço (Catalyst "allowing yourself to shrug up
                           # and back naturally with the motion"; o encolhimento inteiro é 25°, Peeters 2023)
EIXO_CLAV = Vector((0.0, 1.0, 0.0))   # frente-trás do corpo: girar aqui só sobe/desce o ombro (o do Encolhimento com Halteres)
RETRAI = 3.0               # escápulas um pouco pra trás, paradas (ExRx Safety "Shoulders should be kept back since scapula protraction
                           # can decrease width of subacromical space")
X = Vector((1.0, 0.0, 0.0))


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _bvh(vs, ts):
    return BVHTree.FromPolygons([tuple(p) for p in vs], [tuple(t_) for t_ in ts], all_triangles=True)


def _menor(bvh, pts_, lim):
    m = lim
    for p in pts_:
        r = bvh.find_nearest(Vector(p), lim)
        if r[0] is not None and r[3] < m:
            m = r[3]
    return m


def _com_sinal(bvh, pts_, lim=0.5):
    menor = lim
    for p in pts_:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is not None:
            menor = min(menor, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
    return menor


def _casco_frente(zs, ys):
    """Envoltória do lado da frente (−Y) dos pontos (z, y): a menor função côncava em −y que fica na frente de todos — a barra
    passa reta por cima das dobras e encosta nos pontos mais salientes (corda esticada). Devolve os vértices (z, y) do casco."""
    pts = sorted(zip(zs, ys))
    casco = []
    for z, y in pts:                    # cadeia monótona (Andrew) do casco "de cima" de g = −y
        g = -y
        while len(casco) >= 2:
            (z1, g1), (z2, g2) = casco[-2], casco[-1]
            if (g2 - g1) * (z - z1) <= (g - g1) * (z2 - z1):
                casco.pop()
            else:
                break
        casco.append((z, g))
    return [(z, -g) for z, g in casco]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (exercícios novos, 05/10/2026); barra de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones

    def c(n):
        return p3.cabeca(rig, n)

    for L, _ in LADOS:                 # pés chapados (a pose de repouso já é em pé, pés na largura dos ombros, joelhos soltos)
        p3.travar_rotacao(rig, L + "Foot")

    # ── pele do tronco e das coxas (paradas o movimento todo): os triângulos sem mãos e braços ─────────────────────────────────────
    co0, tri0, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    sem = np.array([n.startswith(("LeftHand", "RightHand")) or n in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")
                    for n in nomes0] + [False])[dono0]
    V0 = co0[tri0[~sem[tri0].any(axis=1)]]                     # (n, 3 vértices, xyz)

    def y_encostada(z):
        """y do eixo da barra (horizontal, ao longo do X) o mais perto do corpo com a pele a RAIO_BARRA + FOLGA dele, com o eixo na
        altura z — nos TRIÂNGULOS da malha (as bordas de cada um amostradas a cada 1/32), como o Levantamento Terra."""
        r = RAIO_BARRA + FOLGA
        zs = V0[:, :, 2]
        V = V0[(zs.min(axis=1) < z + r + 0.01) & (zs.max(axis=1) > z - r - 0.01)]
        u = np.linspace(0.0, 1.0, 33)[:, None, None]
        P = np.concatenate([(V[:, j] + u * (V[:, (j + 1) % 3] - V[:, j])).reshape(-1, 3) for j in range(3)])
        dz = P[:, 2] - z
        perto = np.abs(dz) < r
        return float(np.min(P[perto, 1] - np.sqrt(r * r - dz[perto] ** 2)))

    # ── cintura escapular: escápulas um pouco pra trás (paradas) e a clavícula subindo junto com o braço ───────────────────────────
    cima0 = (c("Neck") - c("Hips")).normalized()

    def _retrair():
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = Matrix.Identity(4)
        p3.atualizar()
        for L, s in LADOS:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))

    ombro_rep = {L: c(L + "Arm") for L, _ in LADOS}
    _retrair()
    ombro0 = {L: c(L + "Arm") for L, _ in LADOS}             # articulação do ombro com as escápulas pra trás, embaixo
    print("ESCÁPULAS | retração %.0f° | ombro E andou %.1f mm pra trás, D %.1f mm" % (
        RETRAI, (ombro0["Left"] - ombro_rep["Left"]).y * 1000, (ombro0["Right"] - ombro_rep["Right"]).y * 1000), flush=True)

    def _ombros(t):
        """Escápulas pra trás (RETRAI) e a clavícula sobe CLAV graus em volta do eixo frente-trás, com o ombro subindo RETO (o que
        sobra de lado vira deslize da base do osso, o jeito do Encolhimento com Halteres)."""
        _retrair()
        g = p3.lerp(*CLAV, t)
        for L, s in LADOS:
            if g:
                R = Matrix.Rotation(math.radians(-s * g), 3, EIXO_CLAV)
                H = c(L + "Shoulder")
                girado = H + R @ (ombro0[L] - H)
                p3.girar_osso(rig, L + "Shoulder", R, mover=Vector((ombro0[L].x - girado.x, 0, 0)))

    # ── mãos na barra ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    pl = math.radians(PLANO)
    dir_polo = {L: Vector((s * math.cos(pl), -math.sin(pl), 0.0)) for L, s in LADOS}

    def dedos_palma(a, t, s):
        """Dedos e palma da mão do lado s no quadro t, com o antebraço na direção a (cotovelo → punho). Vista de lado (no plano ⟂ à
        barra), a mão segue o antebraço e dobra FLEXAO1·t pro lado da palma (pra trás, pro corpo); de frente, o antebraço vem de lado
        (μ graus fora do plano ⟂ à barra): o punho desvia até DESVIO_MAX e o resto vira barra oblíqua na palma (a mão gira no plano
        da palma, os dedos pro meio do corpo). A palma fica sempre ⟂ à barra (sem rolar)."""
        beta = math.atan2(-a.y, -a.z) - math.radians(FLEXAO1 * t)   # dedos: ângulo da vertical pra baixo, + = pra frente
        d = Vector((0.0, -math.sin(beta), -math.cos(beta)))
        p = Vector((0.0, math.cos(beta), -math.sin(beta)))
        mu = math.degrees(math.asin(max(0.0, min(1.0, -s * a.x))))   # antebraço vindo de fora pro meio (a.x pro meio do corpo)
        o = math.radians(min(OBLIQUA_MAX, max(0.0, mu - DESVIO_MAX)))
        if o:
            R = Matrix.Rotation(o, 3, p)
            if (R @ d).x * s > 0:                        # o sentido que leva os dedos pro meio do corpo
                R = Matrix.Rotation(-o, 3, p)
            d = R @ d
        return d, p

    def sem_giro_no_punho(L):
        """O giro da mão em volta do próprio eixo que o segurar deixa no punho passa pro antebraço (pronação): o punho só dobra
        (flexão e desvio) — no corpo o punho não gira, quem gira é o antebraço. A mão fica no mesmo lugar do mundo (o antebraço gira
        em volta do próprio eixo, que passa pelo punho)."""
        hand = PB[p3.P + L + "Hand"]
        sinal = 1.0
        for _ in range(6):
            tw = hand.matrix_basis.to_quaternion().to_swing_twist("Y")[1]
            if abs(tw) < math.radians(0.2):
                break
            Mh = hand.matrix.copy()
            ax = (c(L + "Hand") - c(L + "ForeArm")).normalized()
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(sinal * tw, 3, ax))
            hand.matrix = Mh
            p3.atualizar()
            if abs(hand.matrix_basis.to_quaternion().to_swing_twist("Y")[1]) > abs(tw):
                sinal = -sinal                   # piorou: o sentido é o outro (a volta seguinte desfaz e corrige)

    antebraco = {L: Vector((0.0, -0.3, -0.95)).normalized() for L, _ in LADOS}   # última direção do antebraço (ponto de partida)

    def pegar(y, z, t, passos=4):
        """As 2 mãos na barra (o eixo passando por (±GRIP_X, y, z)); a mão depende da direção do antebraço, que depende de onde o
        punho fica: refaz até a direção parar (< 0,1°). Devolve quanto falta (m, ao longo do braço) pra cada mão chegar no vão (+ =
        falta: o braço já está todo esticado)."""
        falta = {}
        for L, s in LADOS:
            S = c(L + "Arm")
            for _ in range(passos):
                dq, pq = dedos_palma(antebraco[L], t, s)
                g = Vector((s * GRIP_X, y, z)) - pq * 0.002    # vão 2 mm atrás do eixo (como no terra e no encolhimento)
                maos.segurar(L, g, dq, pq, polo=S + dir_polo[L] * 0.6, zerar=True)
                a = (c(L + "Hand") - c(L + "ForeArm")).normalized()
                parou = a.angle(antebraco[L]) < math.radians(0.1)
                antebraco[L] = a
                if parou:
                    break
            sem_giro_no_punho(L)
            vao = p3.mundo_osso(rig, L + "Hand") @ maos.furo[L]
            falta[L] = (g - vao).dot((g - S).normalized())
        return falta

    caminho = {"pts": None}

    def y_da_barra(z):
        """y do eixo no caminho (o casco), interpolado; fora dele, a pele rente."""
        pts = caminho["pts"]
        if not pts or z <= pts[0][0] or z >= pts[-1][0]:
            return y_encostada(z)
        for (z1, y1), (z2, y2) in zip(pts, pts[1:]):
            if z1 <= z <= z2:
                return y1 + (y2 - y1) * (z - z1) / max(z2 - z1, 1e-9)
        return y_encostada(z)

    def montar_caminho(z0, z1):
        zs = list(np.arange(z0, z1 + 1e-6, 0.005)) + [z1]
        ys = [y_encostada(z) for z in zs]
        caminho["pts"] = _casco_frente(zs, ys)
        folgas = [(z, (y_da_barra(z) - y) * -1000) for z, y in zip(zs, ys)]
        return max(folgas, key=lambda f: f[1])

    def no_quadro(t, z, passos=4):
        _ombros(t)
        y = y_da_barra(z)
        falta = pegar(y, z, t, passos)
        return y, falta

    # polo certo do cotovelo (o pole_angle do IK de cada braço, que depende do giro do osso no repouso), com o cotovelo bem dobrado:
    # a barra na altura do alto da barriga
    no_quadro(0.7, 1.15)
    for L, _ in LADOS:
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)

    # embaixo: a altura em que o cotovelo dobra COTOVELO0 (mais baixo = mais esticado; o braço que não chega fica todo esticado, a 0°)
    def cotovelo_medio():
        j = ck.medir_juntas(rig)
        return (j["cotoveloE"] + j["cotoveloD"]) / 2

    def calibrar_baixo():
        lo, hi = 0.60, 0.95
        for _ in range(11):                 # 0,35 m / 2^11 = 0,2 mm
            m = (lo + hi) / 2
            no_quadro(0.0, m, 2)
            if cotovelo_medio() < COTOVELO0:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    # em cima: a altura em que o braço chega a ELEVA1 graus do tronco
    def elevacao_media():
        e = tc.braco_elevacao(ck.posicoes(rig))
        return (e[0] + e[1]) / 2

    def calibrar_cima():
        lo, hi = 0.95, 1.45
        for _ in range(12):                 # 0,5 m / 2^12 = 0,1 mm
            m = (lo + hi) / 2
            no_quadro(1.0, m, 2)
            if elevacao_media() < ELEVA1:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    # as 2 alturas com a barra rente à pele naquela altura (o casco passa pelas 2 pontas, então elas não mudam com ele)
    alt = {}
    z0 = calibrar_baixo()
    z1 = calibrar_cima()
    pior = montar_caminho(z0, z1)
    alt.update(z0=z0, z1=z1)
    print("ALTURAS | barra embaixo z %.4f (y %.4f), em cima z %.4f (y %.4f) | caminho com %d vértices, a maior folga a mais que a "
          "FOLGA %.1f mm em z %.3f" % (z0, y_da_barra(z0), z1, y_da_barra(z1), len(caminho["pts"]), pior[1], pior[0]), flush=True)
    print("CAMINHO | " + " ".join("(%.3f %.4f)" % p for p in caminho["pts"]), flush=True)

    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=1.32)
    barra.rotation_mode = "QUATERNION"
    for o in barra.children:           # o eixo de 2 m em anéis (mesma forma e nomes): a checagem espalhava pontos demais nos
        if o.name == "barra_eixo":     # triângulos compridos dele (como na Rosca Inversa e no Encolhimento com Barra)
            e3._em_aneis(o)
    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    estado = {}

    def pose(t):
        """t=0 braços esticados com a barra nas coxas, t=1 cotovelos na altura dos ombros com a barra no peito."""
        z = p3.lerp(alt["z0"], alt["z1"], t)
        y, falta = no_quadro(t, z)
        f = max(falta.values())
        centro = Vector((0.0, y, z))
        barra.rotation_quaternion = (1, 0, 0, 0)
        barra.location = centro
        p3.atualizar()
        estado.update(barra=centro.copy(), falta=f, t=t)
        for L, _ in LADOS:                                   # dedos fecham até a pele encostar na barra; o polegar novo dá a volta
            antes = pose.dedos.get(L, {}).get("Thumb") if pose.continua else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, centro, X, RAIO_BARRA, polegar_antes=antes)
        pose.continua = True

    pose.dedos = {}
    pose.continua = False
    pose.estado = estado

    # ── medidas à parte (a checagem ignora o que fica DENTRO da mão) ───────────────────────────────────────────────────────────
    pecas = {o.name: o for o in barra.children if o.type == "MESH"}
    M0i = np.array(barra.matrix_world.inverted())
    pts = np.concatenate([ck._amostras(*ck._avaliar_simples(pecas["barra_eixo"]), 0.01)] + [
        ck._avaliar_simples(o)[0] for nm, o in pecas.items() if nm != "barra_eixo"])
    pts_loc = pts @ M0i[:3, :3].T + M0i[:3, 3]           # pontos da barra no referencial dela

    def folgas_extra():
        """Folgas (mm, até 300): barra × coxas, × tronco (quadril, barriga, peito), × pescoço/cabeça (queixo, rosto), × braços, ×
        antebraços e × cabelo; mão × eixo da barra fora da pegada (a pele a mais de 3,5 cm do meio da mão, ao longo da barra); mãos ×
        travas, miolos e anilhas; mãos × coxas/tronco e × pescoço/rosto (− = dentro); pele do polegar × barra."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        Mb = np.array(barra.matrix_world)
        pb = pts_loc @ Mb[:3, :3].T + Mb[:3, 3]
        out = {}
        for chave, partes in (("coxas", ("LeftUpLeg", "RightUpLeg")), ("tronco", ("Hips", "Spine", "Spine1", "Spine2")),
                              ("rosto", ("Head", "Neck")), ("bracos", ("LeftArm", "RightArm")),
                              ("antebracos", ("LeftForeArm", "RightForeArm"))):
            m = _grupo(nomes, dono, partes)
            out[chave] = _menor(_bvh(co, tri[m[tri].all(axis=1)]), pb[::2], 0.30) * 1000
        bvh_cabelo = ck._bvh(*ck._avaliar_simples(bon.cabelo))
        out["cabelo"] = _menor(bvh_cabelo, pb[::2], 0.30) * 1000
        M = barra.matrix_world
        c0, ux = np.array(M.to_translation()), np.array((M.to_3x3() @ X).normalized())
        m_corpo = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "Hips", "Spine", "Spine1", "Spine2"))
        bvh_corpo = _bvh(co, tri[m_corpo[tri].all(axis=1)])
        m_rosto = _grupo(nomes, dono, ("Neck", "Head", "LeftShoulder", "RightShoulder"))
        bvh_rosto = _bvh(co, tri[m_rosto[tri].all(axis=1)])
        fora, travas, corpo, rosto = [], [], [], []
        for L, s in LADOS:
            mv = co[np.array([nm.startswith(L + "Hand") for nm in nomes] + [False])[dono]]
            d = mv - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO_BARRA
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else 0.0
            longe = np.abs(a - a_c) > 0.035                # as beiradas da mão (lado do indicador e do mínimo)
            fora.append(float(rad[longe].min()) * 1000 if longe.any() else 9e3)
            tv = [ck._avaliar_simples(pecas["barra_%s%+d" % (k, s)]) for k in ("trava", "anilha", "miolo")]
            travas.append(min(_com_sinal(_bvh(*t_), mv[::2]) for t_ in tv) * 1000)
            corpo.append(_com_sinal(bvh_corpo, mv[::2]) * 1000)
            rosto.append(_com_sinal(bvh_rosto, mv[::2]) * 1000)
        pol = []
        for L, s in LADOS:                                  # pele do polegar × superfície da barra (− = dentro dela)
            mt = np.array([nm.startswith(L + "HandThumb") for nm in nomes] + [False])[dono]
            d = co[mt] - c0
            pol.append(float((np.linalg.norm(d - np.outer(d @ ux, ux), axis=1) - RAIO_BARRA).min()) * 1000)
        cxc = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
        out["pegada"] = [ck._pegada(co, nomes, dono, L, bk) for L, _ in LADOS]
        out.update(fora=fora, travas=travas, corpo_mao=corpo, rosto_mao=rosto, polegar=pol,
                   ante_braco=(cxc.get("antebracoE×bracoE", 0.0), cxc.get("antebracoD×bracoD", 0.0)),
                   braco_tronco=(cxc.get("bracoE×tronco", 0.0), cxc.get("bracoD×tronco", 0.0)))
        return out

    def info():
        jj = ck.posicoes(rig)
        ck.posicoes_das_juntas(rig)
        juntas = ck.medir_juntas(rig)
        b = estado.get("barra", Vector())
        f = folgas_extra()
        pb = {L: pg.pele_do_polegar(bon, L) for L, _ in LADOS}
        giro = {L: (math.degrees(PB[p3.P + L + "ForeArm"].matrix_basis.to_quaternion().to_swing_twist("Y")[1]),
                    math.degrees(PB[p3.P + L + "Hand"].matrix_basis.to_quaternion().to_swing_twist("Y")[1])) for L, _ in LADOS}
        txt = []
        for L, nome in (("Left", "E"), ("Right", "D")):
            S = c(L + "Arm")
            E = c(L + "ForeArm")
            W = c(L + "Hand")
            txt.append("ombro %s sobe %+.0f mm (frente %+.1f mm) | cotovelo %s %+.0f mm do ombro, %.0f mm acima do punho | ombro (%.3f %.3f "
                       "%.3f) cotovelo (%.3f %.3f %.3f) punho (%.3f %.3f %.3f)" % (
                           nome, (S.z - ombro0[L].z) * 1000, -(S.y - ombro0[L].y) * 1000, nome, (E.z - S.z) * 1000,
                           (E.z - W.z) * 1000, *S, *E, *W))
        return ("mão na barra E encosto %+.1f mm envolve %.0f° D encosto %+.1f mm envolve %.0f° | " % (
            f["pegada"][0]["encosto"], f["pegada"][0]["envolve"], f["pegada"][1]["encosto"], f["pegada"][1]["envolve"]) +
                "%s | cotovelo %.1f/%.1f° | braço elevação %s° plano %s° à frente %s° abertura %s° | antebraço inclinação %s° | palma × "
                "frente %s° | punho flexão %s° desvio %s° (junta %.0f/%.0f°) | pegada %.2f | barra y %+.4f z %.4f (falta %.1f mm) | "
                "barra × coxas %.1f, × tronco %.1f, × rosto/pescoço %.0f, × braços %.0f, × antebraços %.0f, × cabelo %.0f mm | mão × "
                "barra fora da pegada E %.1f D %.1f mm | mão × travas/anilhas E %.0f D %.0f mm | mão × coxas/tronco E %.1f D %.1f mm, × "
                "rosto/ombro E %.0f D %.0f mm | antebraço × braço E %.1f D %.1f mm, braço × tronco E %.1f D %.1f mm | %s | polegar E "
                "%s D %s | polegar × barra E %.1f D %.1f mm | pele da base do polegar E %.2f× (%d do avesso) D %.2f× (%d do avesso) | "
                "giro do antebraço E %.0f D %.0f°, do punho E %.1f D %.1f°" % (
                    " | ".join(txt), juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in (math.degrees(math.atan2(-(c(L + "Hand") - c(L + "ForeArm")).z, math.hypot(
                        (c(L + "Hand") - c(L + "ForeArm")).x, (c(L + "Hand") - c(L + "ForeArm")).y))) for L, _ in LADOS)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), juntas["punhoE"], juntas["punhoD"],
                    tc.pegada_largura(jj)[0], b.y, b.z, estado.get("falta", 0) * 1000, f["coxas"], f["tronco"], f["rosto"],
                    f["bracos"], f["antebracos"], f["cabelo"], *f["fora"], *f["travas"], *f["corpo_mao"], *f["rosto_mao"],
                    *f["ante_braco"], *f["braco_tronco"], maos.info(), pose.dedos.get("Left", {}).get("Thumb"),
                    pose.dedos.get("Right", {}).get("Thumb"), *f["polegar"], pb["Left"]["alonga_max"], pb["Left"]["viradas"],
                    pb["Right"]["alonga_max"], pb["Right"]["viradas"], giro["Left"][0], giro["Right"][0], giro["Left"][1],
                    giro["Right"][1]))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose.dedos = {}
    pose.continua = False
    pose(0.0)
    pose.continua = False

    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0, 1.1),
                camera_video=((2.5, -3.5, 1.45), (0, 0, 1.1), 50), info=info)
