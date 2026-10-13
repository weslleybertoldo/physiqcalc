# Remada Alta na Polia — cena da fábrica 3D (lote 13, 12/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos e nenhuma vez como troca equivalente; "fonte_en": "Upright Cable Row", variação vazia no catálogo → "em pé, polia
# baixa", pelo nome e pelo fonte_en, confirmada nas fontes). Sem peça nova: a polia baixa da Rosca Direta na Polia (equip3d.polia) e a
# barra reta curta da polia (equip3d.barra_polia, 20" com a pegada de borracha de 30,5 mm), a do Tríceps Pulley.
# t = 0 em pé, de frente pra polia baixa e perto dela, os braços esticados e a barra da polia segura POR CIMA (pegada pronada: as palmas
# viradas pras coxas), na frente das coxas, quase encostando nelas · t = 1 os cotovelos subiram pelos lados até a altura dos ombros (o
# braço na horizontal), sempre mais altos que os punhos, e a barra subiu RENTE ao corpo até o peito, com os punhos dobrados. O cabo sobe
# da roldana baixa, quase em pé, até o gancho no meio da barra. O app faz a volta (desce devagar até os braços esticarem).
# Técnica (as fontes, com a frase exata, ficam na ficha):
#   • free-exercise-db, Upright Cable Row (o "fonte_en"): "Grasp a straight bar cable attachment that is attached to a low pulley with
#     a pronated (palms facing your thighs) grip that is slightly less than shoulder width. The bar should be resting on top of your
#     thighs." / "The bar should be close to the body as you move it up. Continue to lift it until it nearly touches your chin." /
#     "As you lift the bar, your elbows should always be higher than your forearms. Also, keep your torso stationary";
#   • ExRx, Cable Upright Row: "Grasp cable bar with shoulder width or slightly narrower overhand grip. Stand close to pulley." / "Pull
#     bar to neck with elbows leading. Allow wrists to flex as bar rises." · ExRx, Upright Row Safety: "A shoulder width grip is
#     suggested when performing the upright row." / "An upright posture with chest high and shoulders back, bar kept close to the body";
#   • Catalyst Athletics, Cable Upright Row: "The cable variation allows some adjustment to the exact angle of force—for example,
#     stepping back more from the machine." / "allowing yourself to shrug up and back naturally with the motion";
#   • NSCA (Achievable, curso da prova CSCS), Barbell upright row (não tem a do cabo): "Stand erect with feet shoulder-width apart and
#     knees slightly flexed." / "At the highest bar position, the elbows should be level with or slightly higher than the shoulders and
#     wrists."; Schoenfeld, Kolber & Haimes 2011: "elevate their arms during the upright row to just below 90° (shoulder height)" / "the
#     bar should be pulled as close to the body as possible throughout the movement"; McAllister et al. 2013 (a largura da pegada).
# O CORPO é o da Remada Alta com Barra (cenas/remada_alta_com_barra.py: as fontes de técnica são as mesmas — o ExRx e o free-exercise-db
# repetem no cabo o texto da barra livre): pés na largura dos ombros e joelhos soltos ~7° (a pose de repouso), tronco e cabeça parados,
# o cotovelo sobe pelo lado (PLANO graus à frente do plano do corpo) até a altura do ombro, nem mais nem menos (a NSCA "level with" ∩
# Schoenfeld "just below 90°"), o punho dobra conforme a barra sobe, as escápulas um pouco pra trás e a clavícula subindo junto com o braço.
# O que a POLIA muda: (1) a barra é a reta de 20" da polia, com a borracha de 4,5 a 23,5 cm do meio — a pegada da barra livre (43 cm) não
# cabe nela: as mãos ficam a ±MEIA, a mais aberta em que a mão inteira fica na borracha, "shoulder width or slightly narrower" (ExRx do
# cabo) / "slightly less than shoulder width" (o fonte_en); com as mãos mais pra dentro, o antebraço chega mais deitado na mão e, com o
# cotovelo na mesma altura, a barra para um pouco mais alta no peito; (2) a barra tem o gancho no meio (luva giratória de 40 mm, orelha,
# mosquetão e a bola do cabo, virados pro cabo), e a barra sobe rente ao corpo com a luva também a FOLGA da pele; (3) a força vem do cabo,
# que sai da roldana baixa na frente dos pés e puxa a barra pra baixo e pra frente — a pessoa fica PERTO da torre ("Stand close to
# pulley", ExRx), com as pontas dos pés logo atrás da chapa da base (a roldana a POLIA_Y do meio do corpo), e o cabo fica quase em pé
# (~18° da vertical embaixo, ~10° em cima), entre as pernas e na frente do tronco; o tronco fica parado, sem inclinar pra trás (nenhuma
# fonte manda inclinar; "keep your torso stationary").
# Montagem: a da Remada Alta com Barra — a barra sobe numa reta do meio das coxas ao peito, por fora do corpo: a envoltória (do lado da
# frente) do perfil da pele do tronco e das coxas (sem braços e mãos, só na largura da barra) entre a altura de baixo e a de cima, a FOLGA
# da superfície da barra (borracha, pontas de aço e a luva do meio, cada uma com o raio dela). As mãos fecham na barra com a pegada
# pronada (maos3d.Maos.segurar com zerar, o polegar novo dando a volta, a mão de referência do cilindro de 30,5 mm); a mão é posta em
# relação ao ANTEBRAÇO (dedos_palma): reta embaixo, dobrando FLEXAO1·t pro lado da palma, com o desvio ulnar até DESVIO_MAX e o resto como
# barra oblíqua na palma; o giro que o segurar deixa no punho passa pro antebraço (sem_giro_no_punho). O cotovelo vai pro lado do POLO do
# IK — uma direção fixa a partir do ombro, pro lado e PLANO graus pra frente, na horizontal. Embaixo a barra fica onde o cotovelo dobra
# COTOVELO0 graus; em cima, onde o braço chega a ELEVA1 graus do tronco (bissecções no montar()). A polia é a da Rosca Direta na Polia:
# u = pol.direcao(c), e3.por_acessorio(barra, c, X, u) (o gancho gira livre e fica na linha do cabo) e pol.ligar(c + u * ENGATE).
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

# ── barra da polia (equip3d.barra_polia: 20", borracha de 1,2" de 4,5 a 23,5 cm do meio, pontas de aço e a luva do gancho no meio) ──
RAIO_BARRA = 0.01524       # borracha de 30,5 mm (Synergee, na barra_polia): pegada mais grossa que 29 mm → pg.usar_cilindro
COMPR_BARRA = 0.508        # barra reta de 20"
RAIO_LUVA, MEIA_LUVA = 0.020, 0.035       # luva giratória do gancho no meio (equip3d.barra_polia: raio 20 mm, 7 cm de comprimento)
RAIO_PONTA, PONTA0 = RAIO_BARRA + 0.0012, COMPR_BARRA / 2 - 0.018   # pontas de aço (1,2 mm mais grossas, nos últimos 18 mm)
FIM_BORRACHA = COMPR_BARRA / 2 - 0.019    # a borracha vai até 23,5 cm do meio
FOLGA = 0.006              # pele → superfície da barra (m): rente, sem encostar (a checagem pede ≥ 3 mm), como na barra livre
DEDOS = 0.021              # a mão fechada em volta da barra vista como um cano de RAIO_BARRA + DEDOS (os dedos dão a volta por trás da
                           # barra, do lado do corpo): onde as mãos ficam (|x| de MEIA − MAO_X[0] a MEIA + MAO_X[1]) a pele do corpo fica
MAO_X = (0.050, 0.055)     # a essa distância do eixo — com a barra de 20" as mãos ficam na frente das coxas e do peito, não por fora

# ── pegada ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
MEIA = 0.185               # meio da mão a 18,5 cm do meio da barra (37 cm entre os vãos): a mais aberta que a barra de 20" deixa — a
                           # beirada do mínimo chega no fim da borracha (23,5 cm) embaixo e passa ~9 mm por cima da ponta de aço em cima,
                           # sem encostar nela (a barra fica oblíqua na palma); "shoulder width or slightly narrower" (ExRx, Cable Upright
                           # Row) / "slightly less than shoulder width" (free-exercise-db, o fonte_en). A barra livre usa 43 cm, que não
                           # cabe; com 0,18 a barra subia mais e entrava 7,8 mm na mão esquerda em cima (variante v2d, 12/10)
FLEXAO1 = 45.0             # o punho dobra pro lado da palma de 0° embaixo a FLEXAO1 em cima (ExRx "Allow wrists to flex as bar rises")
DESVIO_MAX = 25.0          # desvio ulnar do punho até DESVIO_MAX (AAOS 30°, limites.py) e o que passar disso vira a barra oblíqua na
OBLIQUA_MAX = 30.0         # palma (até OBLIQUA_MAX). Com as mãos mais fechadas que na barra livre o antebraço chega mais deitado e mais
                           # de lado na mão em cima: com o teto de 25° da barra livre o punho desviava 33–35° (o normal vai até 30°); com
                           # 30° ele fica em 25–28° (variantes v1/v2, 12/10)
COTOVELO0 = 16.0           # flexão do cotovelo embaixo (graus): braço esticado com o cotovelo solto (fedb "Your arms should be extended
                           # with a slight bend at the elbows"). Com as mãos mais fechadas o braço pendurado fica mais junto do tronco: com
                           # os 12° da barra livre ele entrava 5–7 mm na lateral do tronco; com 16° o cotovelo vai um pouco pro lado e
                           # sai (0 mm)

# ── braço ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ELEVA1 = 90.0              # braço × tronco em cima: o cotovelo na altura do ombro (NSCA "level with ... the shoulders"; Schoenfeld)
PLANO = 10.0               # o polo do cotovelo: pro lado, PLANO graus pra frente do plano do corpo (Schoenfeld "slightly anterior to the
                           # coronal plane"; NSCA "Keep the elbows pointed out to the sides")

# ── cintura escapular (a da barra livre) ─────────────────────────────────────────────────────────────────────────────────────
CLAV = (0.0, 10.0)         # elevação da clavícula (graus) embaixo → em cima, junto com o braço (Catalyst "allowing yourself to shrug up
                           # and back naturally with the motion")
EIXO_CLAV = Vector((0.0, 1.0, 0.0))
RETRAI = 3.0               # escápulas um pouco pra trás, paradas (ExRx Safety "Shoulders should be kept back")

# ── polia baixa na frente da pessoa (a da Rosca Direta na Polia, mais perto) ────────────────────────────────────────────────────
POLIA_Y, POLIA_Z, ALTO = -0.40, 0.22, 2.15   # eixo da roldana baixa (na frente da pessoa, na linha dela) e altura da coluna
X = Vector((1.0, 0.0, 0.0))
GANCHO = ("_luva", "_orelha", "_mosquetao", "_ponteira", "_bola")


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


def _menor_com_sinal(pts, bvh, lim=0.25):
    """Menor distância (m) dos pontos até a malha fechada, − = o ponto entrou nela (normal contra e paridade do raio, como na
    checagem3d.folgas e na Rosca Direta na Polia); até `lim`. Só a normal erra perto da quina do cilindro curto (a ponta de aço)."""
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


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


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
    pg.usar_polegar("volta")              # polegar dando a volta na barra (exercícios novos, 05/10/2026)
    pg.usar_cilindro(RAIO_BARRA * 2000)   # mão de referência da pegada de 30,5 mm (antes do Maos), como na Rosca Direta na Polia
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
    pes0 = co0[_grupo(nomes0, dono0, ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))]
    ponta_pes = float(pes0[:, 1].min())                        # a pele mais à frente dos pés (ponta dos dedos), y

    def raio_em(ax):
        """Raio da peça da barra na distância |x| do meio (luva do gancho, borracha/núcleo ou ponta de aço) + a FOLGA; onde a mão
        fecha, o cano da mão (RAIO_BARRA + DEDOS)."""
        r = np.where(ax <= MEIA_LUVA + 0.002, RAIO_LUVA, np.where(ax >= PONTA0 - 0.002, RAIO_PONTA, RAIO_BARRA)) + FOLGA
        mao = (ax >= MEIA - MAO_X[0]) & (ax <= MEIA + MAO_X[1])
        return np.where(mao, np.maximum(r, RAIO_BARRA + DEDOS), r)

    def y_encostada(z):
        """y do eixo da barra (horizontal, ao longo do X) o mais perto do corpo com a pele a FOLGA da superfície dela (o raio de cada
        peça no |x| dela), com o eixo na altura z — nos TRIÂNGULOS da malha (as bordas de cada um amostradas a cada 1/32), só na
        largura da barra (|x| até a ponta)."""
        rm = max(RAIO_LUVA + FOLGA, RAIO_BARRA + DEDOS)
        zs = V0[:, :, 2]
        V = V0[(zs.min(axis=1) < z + rm + 0.01) & (zs.max(axis=1) > z - rm - 0.01)]
        u = np.linspace(0.0, 1.0, 33)[:, None, None]
        P = np.concatenate([(V[:, j] + u * (V[:, (j + 1) % 3] - V[:, j])).reshape(-1, 3) for j in range(3)])
        P = P[np.abs(P[:, 0]) <= COMPR_BARRA / 2 + 0.002]
        r = raio_em(np.abs(P[:, 0]))
        dz = P[:, 2] - z
        perto = np.abs(dz) < r
        return float(np.min(P[perto, 1] - np.sqrt(r[perto] ** 2 - dz[perto] ** 2)))

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
        (flexão e desvio) — no corpo o punho não gira, quem gira é o antebraço. A mão fica no mesmo lugar do mundo."""
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
        """As 2 mãos na barra (o eixo passando por (±MEIA, y, z)); a mão depende da direção do antebraço, que depende de onde o
        punho fica: refaz até a direção parar (< 0,1°). Devolve quanto falta (m, ao longo do braço) pra cada mão chegar no vão (+ =
        falta: o braço já está todo esticado)."""
        falta = {}
        for L, s in LADOS:
            S = c(L + "Arm")
            for _ in range(passos):
                dq, pq = dedos_palma(antebraco[L], t, s)
                g = Vector((s * MEIA, y, z)) - pq * 0.002      # vão 2 mm atrás do eixo (como na barra livre)
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

    # polo certo do cotovelo (o pole_angle do IK de cada braço), com o cotovelo bem dobrado: a barra na altura do alto da barriga
    no_quadro(0.7, 1.15)
    for L, _ in LADOS:
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)

    # embaixo: a altura em que o cotovelo dobra COTOVELO0 (mais baixo = mais esticado)
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

    alt = {}
    z0 = calibrar_baixo()
    z1 = calibrar_cima()
    pior = montar_caminho(z0, z1)
    alt.update(z0=z0, z1=z1)
    print("ALTURAS | barra embaixo z %.4f (y %.4f), em cima z %.4f (y %.4f) | caminho com %d vértices, a maior folga a mais que a "
          "FOLGA %.1f mm em z %.3f" % (z0, y_da_barra(z0), z1, y_da_barra(z1), len(caminho["pts"]), pior[1], pior[0]), flush=True)
    print("CAMINHO | " + " ".join("(%.3f %.4f)" % p for p in caminho["pts"]), flush=True)

    # ── barra da polia e a estação ──────────────────────────────────────────────────────────────────────────────────────────────────
    barra = e3.barra_polia("barra_polia", comprimento=COMPR_BARRA, raio=RAIO_BARRA)
    pol = e3.polia("polia", x=0.0, y=POLIA_Y, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)
    base_frente = POLIA_Y + 0.12                              # borda da chapa da base da torre do lado da pessoa (equip3d.polia)
    print("PÉS | ponta dos dedos y %.4f | roldana y %.3f z %.3f | borda da base da torre y %.3f: %.0f mm na frente das pontas dos "
          "pés | eixo da roldana a %.0f mm das pontas dos pés" % (ponta_pes, POLIA_Y, POLIA_Z, base_frente,
                                                                    (ponta_pes - base_frente) * 1000, (ponta_pes - POLIA_Y) * 1000),
          flush=True)
    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    estado = {}

    def pose(t):
        """t=0 braços esticados com a barra nas coxas, t=1 cotovelos na altura dos ombros com a barra no peito."""
        z = p3.lerp(alt["z0"], alt["z1"], t)
        y, falta = no_quadro(t, z)
        f = max(falta.values())
        centro = Vector((0.0, y, z))
        u = pol.direcao(centro)
        e3.por_acessorio(barra, centro, X, u)               # gancho virado pro cabo (gira livre na barra)
        pol.ligar(centro + u * e3.ENGATE_BARRA_POLIA)       # cabo reto da saída da roldana até o engate
        p3.atualizar()
        estado.update(barra=centro.copy(), falta=f, t=t, u=u.copy())
        for L, _ in LADOS:                                   # dedos fecham até a pele encostar na barra; o polegar novo dá a volta
            antes = pose.dedos.get(L, {}).get("Thumb") if pose.continua else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, centro, X, RAIO_BARRA, polegar_antes=antes)
        pose.continua = True

    pose.dedos = {}
    pose.continua = False
    pose.estado = estado

    # ── medidas à parte (a checagem ignora o que fica DENTRO da mão) ───────────────────────────────────────────────────────────
    pecas = {o.name.replace("barra_polia", ""): o for o in barra.children if o.type == "MESH"}
    M0i = np.array(barra.matrix_world.inverted())

    def _locais(nomes_):
        pts = np.concatenate([ck._amostras(*ck._avaliar_simples(pecas[n]), 0.006) for n in nomes_])
        return pts @ M0i[:3, :3].T + M0i[:3, 3]

    pts_barra = _locais(list(pecas))                         # pontos da barra inteira no referencial dela
    pts_gancho = _locais(GANCHO)                             # luva, orelha, mosquetão, ponteira e bola do cabo
    fora_da_pegada = {n: pecas[n] for n in ("_ponta+1", "_ponta-1") + GANCHO}

    def no_mundo(pl_):
        Mb = np.array(barra.matrix_world)
        return pl_ @ Mb[:3, :3].T + Mb[:3, 3]

    def folgas_extra():
        """Folgas (mm, até 300): barra × coxas, × tronco, × pescoço/cabeça, × braços, × antebraços e × cabelo; gancho × coxas/tronco;
        cabo reto × pernas, × tronco/cabeça e × cabelo; mão × barra fora da pegada (a pele a mais de 3,5 cm do meio da mão, ao longo da
        barra); mãos × pontas de aço e gancho; até onde a mão vai na barra; mãos × coxas/tronco e × pescoço/rosto (− = dentro); pele do
        polegar × barra."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        pb = no_mundo(pts_barra)
        out = {}
        for chave, partes in (("coxas", ("LeftUpLeg", "RightUpLeg")), ("tronco", ("Hips", "Spine", "Spine1", "Spine2")),
                              ("rosto", ("Head", "Neck")), ("bracos", ("LeftArm", "RightArm")),
                              ("antebracos", ("LeftForeArm", "RightForeArm"))):
            m = _grupo(nomes, dono, partes)
            out[chave] = _menor(_bvh(co, tri[m[tri].all(axis=1)]), pb[::2], 0.30) * 1000
        bvh_cabelo = ck._bvh(*ck._avaliar_simples(bon.cabelo))
        out["cabelo"] = _menor(bvh_cabelo, pb[::2], 0.30) * 1000
        m_ct = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "Hips", "Spine", "Spine1", "Spine2"))
        out["gancho"] = _com_sinal(_bvh(co, tri[m_ct[tri].all(axis=1)]), no_mundo(pts_gancho), 0.30) * 1000
        # cabo reto (da saída da roldana até o engate) × pele (sem as mãos: elas ficam a ±MEIA, longe do meio) e × cabelo
        A = np.array(pol.cabo.matrix_world.to_translation())   # o eixo da roldana: o cabo sai a `raio` dele
        T = np.array(pol.saida) if pol.saida is not None else A
        E = np.array(estado["barra"] + estado["u"] * e3.ENGATE_BARRA_POLIA)
        pernas = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase",
                                      "RightToeBase"))
        tronco = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"))
        out["cabo_pernas"] = (float(_dist_segmento(co[pernas], E, T).min()) - 0.003) * 1000
        out["cabo_tronco"] = (float(_dist_segmento(co[tronco], E, T).min()) - 0.003) * 1000
        out["cabo_cabelo"] = (float(_dist_segmento(ck._avaliar_simples(bon.cabelo)[0], E, T).min()) - 0.003) * 1000
        M = barra.matrix_world
        c0, ux = np.array(M.to_translation()), np.array((M.to_3x3() @ X).normalized())
        bvh_corpo = _bvh(co, tri[m_ct[tri].all(axis=1)])
        m_rosto = _grupo(nomes, dono, ("Neck", "Head", "LeftShoulder", "RightShoulder"))
        bvh_rosto = _bvh(co, tri[m_rosto[tri].all(axis=1)])
        bvh_fora = [(n, _bvh(*ck._avaliar_simples(o))) for n, o in fora_da_pegada.items()]
        fora, pecas_mao, ate, corpo, rosto = [], [], [], [], []
        for L, s in LADOS:
            mv = co[np.array([nm.startswith(L + "Hand") for nm in nomes] + [False])[dono]]
            d = mv - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO_BARRA
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else 0.0
            longe = np.abs(a - a_c) > 0.035                # as beiradas da mão (lado do indicador e do mínimo)
            fora.append(float(rad[longe].min()) * 1000 if longe.any() else 9e3)
            pecas_mao.append(min((_menor_com_sinal(mv, b) * 1000, n) for n, b in bvh_fora))
            perto = rad < 0.025
            ate.append(float(np.abs(a[perto]).max()) if perto.any() else 0.0)
            corpo.append(_com_sinal(bvh_corpo, mv[::2]) * 1000)
            rosto.append(_com_sinal(bvh_rosto, mv[::2]) * 1000)
        pol_ = []
        for L, s in LADOS:                                  # pele do polegar × superfície da barra (− = dentro dela)
            mt = np.array([nm.startswith(L + "HandThumb") for nm in nomes] + [False])[dono]
            d = co[mt] - c0
            pol_.append(float((np.linalg.norm(d - np.outer(d @ ux, ux), axis=1) - RAIO_BARRA).min()) * 1000)
        cxc = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
        out["pegada"] = [ck._pegada(co, nomes, dono, L, bk) for L, _ in LADOS]
        out.update(fora=fora, pecas_mao=pecas_mao, ate=ate, corpo_mao=corpo, rosto_mao=rosto, polegar=pol_,
                   ante_braco=(cxc.get("antebracoE×bracoE", 0.0), cxc.get("antebracoD×bracoD", 0.0)),
                   braco_tronco=(cxc.get("bracoE×tronco", 0.0), cxc.get("bracoD×tronco", 0.0)))
        return out

    def info():
        jj = ck.posicoes(rig)
        ck.posicoes_das_juntas(rig)
        juntas = ck.medir_juntas(rig)
        b = estado.get("barra", Vector())
        u = estado.get("u", Vector((0, 0, -1)))
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
                "cabo × vertical %.1f°, %.3f m | barra × coxas %.1f, × tronco %.1f, × rosto/pescoço %.0f, × braços %.0f, × antebraços "
                "%.0f, × cabelo %.0f mm | gancho × coxas/tronco %.1f mm | cabo × pernas %.0f, × tronco/cabeça %.0f, × cabelo %.0f mm | "
                "mão × barra fora da pegada E %.1f D %.1f mm | mão × pontas/gancho E %.1f (%s) D %.1f (%s) mm | mão até |x| E %.3f D "
                "%.3f m (borracha até %.3f) | mão × coxas/tronco E %.1f D %.1f mm, × rosto/ombro E %.0f D %.0f mm | antebraço × braço "
                "E %.1f D %.1f mm, braço × tronco E %.1f D %.1f mm | %s | polegar E %s D %s | polegar × barra E %.1f D %.1f mm | pele "
                "da base do polegar E %.2f× (%d do avesso) D %.2f× (%d do avesso) | giro do antebraço E %.0f D %.0f°, do punho E %.1f "
                "D %.1f°" % (
                    " | ".join(txt), juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in (math.degrees(math.atan2(-(c(L + "Hand") - c(L + "ForeArm")).z, math.hypot(
                        (c(L + "Hand") - c(L + "ForeArm")).x, (c(L + "Hand") - c(L + "ForeArm")).y))) for L, _ in LADOS)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), juntas["punhoE"], juntas["punhoD"],
                    tc.pegada_largura(jj)[0], b.y, b.z, estado.get("falta", 0) * 1000,
                    math.degrees(u.angle(Vector((0, 0, -1)))), pol.comprimento, f["coxas"], f["tronco"], f["rosto"],
                    f["bracos"], f["antebracos"], f["cabelo"], f["gancho"], f["cabo_pernas"], f["cabo_tronco"], f["cabo_cabelo"],
                    *f["fora"], f["pecas_mao"][0][0], f["pecas_mao"][0][1], f["pecas_mao"][1][0], f["pecas_mao"][1][1],
                    *f["ate"], FIM_BORRACHA, *f["corpo_mao"], *f["rosto_mao"],
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

    return Cena(pose, [barra] + pol.raizes, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, -0.15, 1.1),
                camera_video=((3.6, -2.6, 1.35), (0, -0.2, 1.05), 50), info=info)
