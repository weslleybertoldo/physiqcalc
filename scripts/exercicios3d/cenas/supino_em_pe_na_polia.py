# Supino em Pé na Polia — cena da fábrica 3D (lote 15, 13/10/2026; exercício novo do catálogo, PR #190: 0 usos nos treinos
# prontos, 12 vezes como troca equivalente). t = 0 começo: as mãos do lado do peito, na altura do meio do peito, os antebraços
# na horizontal apontando pra frente (paralelos, as mãos na largura dos cotovelos), os cotovelos dobrados (~122°), abertos pros
# lados (~65° do tronco), abaixo dos ombros e um pouco atrás do tronco · t = 1 fim: os braços quase esticados à frente (~10°), na
# altura do peito, as mãos mais perto uma da outra (pegadores a 22 cm), sem se encostar.
# Técnica (ExRx, Cable Isolateral Standing Chest Press — a página CBStandingChestPress do peitoral, porção esternal): de costas pras
# colunas, entre 2 polias ("Stand between two shoulder height pulleys, facing away from cable columns"), os puxadores do lado do
# peito com os cotovelos pros lados ("Position stirrups to sides of chest with elbows out to sides"), os antebraços na horizontal e
# paralelos, as mãos na largura dos cotovelos ("Position forearms horizontally and parallel with hands elbow width"), base em
# afundo com a perna da frente dobrada e o tronco um pouco à frente ("Step forward in lunging posture (one foot in front and other
# foot behind). Lean and step forward with one foot in front, bending forward leg."); empurra até os braços esticarem paralelos
# ("Push stirrups forward until arms are straight and parallel to one another") num leve arco, as mãos se aproximando ("Stirrup
# should follow slight arch pattern as hands travel closer together toward extension"), e volta até o peito alongar um pouco
# ("Return stirrups to original position until slight stretch is felt in chest or shoulders"); as polias mais perto que no
# cross-over ("narrower than width of arms extended out to sides (but not too close), closer than what is typically found on
# standard cable cross over setup"). free-exercise-db (Standing Cable Chest Press, o da migration do catálogo): polias na altura
# do peito ("Position dual pulleys to chest height"), a pessoa um ou dois pés à frente dos cabos ("Stand a foot or two in front of
# the cables"), base escalonada opcional ("You can stagger your stance for better stability"), escápulas juntas ("with the
# shoulder blades together") e o resto do corpo parado, os cotovelos esticando e as mãos se juntando à frente ("Keeping the rest
# of the body stationary, extend through the elbows to press the handles forward, drawing them together in front of you"); nas
# fotos, as palmas pra baixo. ACE (Single-arm Chest Press, nº 338): "Grip the handle in the right hand with the palm facing down"
# e "Press both feet into the floor, squeeze the stomach". ExRx, Bench Press Analyses: o braço a 45–70° do tronco embaixo ("a 45º
# to 70º angle between the shoulder and torso").
# Montagem: as 2 estações de cabo do Cross-over na Polia (equip3d.polia(gira=True), o garfo que gira, + o puxador D de 25 mm), agora
# ATRÁS da pessoa e viradas pra frente, como as 2 colunas da Life Fitness Dual Adjustable Pulley (158 cm de largura: as 2 bases de
# 0,56 m com as roldanas a ±POLIA_X = 0,51 m dão 1,58 m de ponta a ponta; coluna de 2,40 m; carrinho de 17 a 200 cm do chão) —
# bem mais perto que o cross-over (±1,345 m) —, POLIA_Y atrás do meio do corpo (as costas ficam ~25 cm à frente das roldanas). A
# roldana fica na altura da parte de baixo do peito, QUEDA_POLIA abaixo da linha das mãos: com a pegada pronada o aro do puxador
# aponta pro cabo, que sai da mão pra trás junto com o antebraço; com a roldana na linha das mãos (o meio do peito) o cabo e o
# mosquetão entravam no antebraço no começo (medido: −7 a −13 mm); 8 cm abaixo, o aro pende por baixo do punho e o cabo passa por
# baixo do antebraço e do braço. Com a polia no ombro (ExRx, ACE) o aro teria que passar por cima do antebraço, o que só livra com o
# cabo ≥ ~35° acima dele — e no fim, com o braço subindo pro ombro, nem assim.
# Corpo: afundo curto (pé direito à frente, tornozelos 48 cm um à frente do outro, cada pé embaixo do seu quadril, os 2 chapados),
# joelho da frente a 24° e o de trás a 8°, tronco 10° à frente dobrando no quadril (coluna neutra, cabeça na linha do tronco),
# escápulas pra trás e pra baixo — tudo parado. Mãos: o eixo do pegador anda numa curva (Bézier, ARCO) na altura do meio do peito,
# do lado do peito (t=0) até a frente dele (t=1); o cotovelo fica no ponto do círculo que o braço deixa com o antebraço pra frente
# e a inclinação dele indo de 0 (horizontal) a INCL_FIM (seguindo o braço esticado, que desce do ombro até a mão), pro lado de
# fora; a mão com a palma pra baixo e o punho reto. Pernas como no Cross-over na Polia; a conta do braço como no Supino Reto na
# Máquina Sentado.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

RAIO = 0.0125                  # pegador do puxador D de 25 mm (equip3d.puxador_polia)
LADOS = (("Left", 1), ("Right", -1))   # s = +1 é o lado esquerdo (+X); o boneco olha pra −Y
SIGLA = {"Left": "E", "Right": "D"}
X_PE = 0.12                    # tornozelos a ±12 cm do meio do corpo: cada pé embaixo do seu quadril
Y_PE = {"Right": -0.24, "Left": 0.24}   # tornozelos (m): pé direito à frente, esquerdo atrás (afundo curto)
JOELHO = {"Right": 24.0, "Left": 8.0}    # flexão dos joelhos (graus), parada: a perna da frente dobrada, a de trás quase reta
INCLINA = 10.0                 # tronco à frente da vertical (graus), dobrando no quadril (coluna neutra), parado
RETRAI, DESCE = 6.0, 4.0       # escápulas pra trás (retração) e pra baixo (graus de giro da clavícula), paradas
DZ_MAO = 0.0                   # altura do eixo dos pegadores: o meio do peito (o ponto mais saliente do peitoral) + DZ_MAO
FRENTE0 = 0.06                 # começo: o eixo do pegador FRENTE0 à frente da frente do peito (do lado dele)
COTOVELO1 = 10.0               # fim: flexão do cotovelo (graus) — quase esticado, sem travar
VAO_FIM = 0.22                 # fim: distância entre os eixos dos 2 pegadores, de lado a lado (m)
ARCO = 0.5                     # caminho da mão: 0 = reta; 1 = sai reto pra frente e fecha pro meio no fim
PUNHO = 0.0                    # extensão do punho (graus): punho reto
INCL_FIM = 8.0                 # antebraço × horizontal (graus, + = a mão abaixo do cotovelo): 0 no começo (ExRx: "Position forearms
                               # horizontally") → INCL_FIM no fim, quando o antebraço segue o braço, que desce do ombro até a mão
POLIA_X, POLIA_Y, ALTO = 0.51, 0.27, 2.40   # roldanas a ±POLIA_X, em y = POLIA_Y (atrás da pessoa); coluna de 2,40 m
QUEDA_POLIA = 0.08             # eixo da roldana QUEDA_POLIA abaixo da altura dos pegadores (parte de baixo do peito)
MAO = {L: tuple([L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]) for L, _ in LADOS}


def _bissecao(f, lo, hi, alvo, voltas=30):
    flo = f(lo) - alvo
    for _ in range(voltas):
        m = (lo + hi) / 2
        fm = f(m) - alvo
        if (fm > 0) == (flo > 0):
            lo, flo = m, fm
        else:
            hi = m
    return (lo + hi) / 2


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def pernas_e_tronco(bon):
    """Afundo curto (pé direito à frente) com os 2 pés chapados: pernas por IK (alvos nascem no tornozelo de repouso — alvo =
    polo dá NaN —, polos à frente dos joelhos), tronco inclinado INCLINA° no quadril; o quadril vai pra frente/trás e pra
    cima/baixo até o joelho de trás ficar com JOELHO["Left"] e o da frente com JOELHO["Right"]. Devolve (y, z) do quadril."""
    rig = bon.rig
    PB = rig.pose.bones
    pernas, tornozelos = {}, {}
    for lado, s in LADOS:
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo = p3.vazio("polo_joelho_" + lado, (s * (X_PE + 0.03), Y_PE[lado] - 1.0, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polo)
        p3.travar_rotacao(rig, lado + "Foot")              # pés chapados, apontando pra frente
    z_tz = p3.cabeca(rig, "LeftFoot").z
    alvo = {lado: Vector((s * X_PE, Y_PE[lado], z_tz)) for lado, s in LADOS}

    def _pernas(y, z):
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((0, y - pivo.y, z - pivo.z)))
        for lado, _ in LADOS:
            tornozelos[lado].location = alvo[lado]
        p3.atualizar()

    def joelho(lado):
        return ck.medir_juntas(rig)["joelho" + SIGLA[lado]]

    def z_de(y):               # altura do quadril que deixa o joelho de trás com JOELHO["Left"]
        def f(z):
            _pernas(y, z)
            return joelho("Left")
        return _bissecao(f, 0.78, 0.97, JOELHO["Left"], voltas=22)

    def frente(y):             # joelho da frente com o quadril em y (e a altura do joelho de trás)
        _pernas(y, z_de(y))
        return joelho("Right")

    y_q = 0.0
    for _ in range(2):
        _pernas(y_q, z_de(y_q))
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            print("polo joelho", lado, "erro %.3f ang %d" % e)
        y_q = _bissecao(frente, -0.16, 0.12, JOELHO["Right"], voltas=22)
    z_q = z_de(y_q)
    _pernas(y_q, z_q)
    j = ck.medir_juntas(rig)
    print("PERNAS quadril y %.3f z %.3f | joelho E (trás) %.1f° D (frente) %.1f° | tronco %.1f°" % (
        y_q, z_q, j["joelhoE"], j["joelhoD"], ck.angulo_chave(rig, {"medida": "tronco"})[0]), flush=True)
    return y_q, z_q


def eixos_tronco(rig):
    """Referencial do tronco (parado): cima (quadril → pescoço), lado (ombro esquerdo → direito, ⟂ cima) e frente."""
    c = lambda n: p3.cabeca(rig, n)
    cima = (c("Neck") - c("Hips")).normalized()
    lado = c("RightArm") - c("LeftArm")
    lado = (lado - cima * lado.dot(cima)).normalized()
    return cima, lado, cima.cross(lado)


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                 # mão de referência do pegador de 25 mm (antes do Maos), como no Cross-over
    rig = bon.rig
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        return co[_grupo(nomes, dono, partes)]

    pernas_e_tronco(bon)

    # escápulas juntas, paradas o movimento todo (free-exercise-db: "with the shoulder blades together"): cada clavícula gira
    # RETRAI° em volta do eixo do tronco e DESCE° em volta do eixo da frente (como no Supino Reto na Máquina Sentado)
    cima0, lado0, frente0 = eixos_tronco(rig)
    ombro_antes = {L: c(L + "Arm") for L, _ in LADOS}
    for L, s in LADOS:
        if RETRAI:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        if DESCE:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro E andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (c("LeftArm") - ombro_antes["Left"]).dot(-frente0) * 1000,
        -(c("LeftArm") - ombro_antes["Left"]).dot(cima0) * 1000), flush=True)

    # ── meio do peito: a parte mais saliente do peitoral (|x| 9–13 cm), pra frente do PRÓPRIO tronco (inclinado) ────────────
    S = {L: c(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    T = pele(("Spine", "Spine1", "Spine2"))
    rel = T - np.array(S["Left"])
    f = T[(np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (rel @ np.array(cima) > -0.20) & (rel @ np.array(cima) < 0.0)]
    mam = Vector(f[(f @ np.array(frente)).argmax()])
    Z_MAO = mam.z + DZ_MAO

    def frente_peito(z):
        """y da frente do peito (a pele mais à frente do tronco) na altura z."""
        ff = T[(np.abs(T[:, 2] - z) < 0.01) & (np.abs(T[:, 0]) < 0.15)]
        return float(ff[:, 1].min())

    Z_POLIA = Z_MAO - QUEDA_POLIA
    print("PEITO | meio do peito (%.4f %.4f %.4f) = %.0f mm abaixo do ombro | frente do peito y %.4f | ombro E (%.4f %.4f %.4f) | "
          "pegadores a %.3f m do chão | roldanas a %.3f m" % (
              *mam, (S["Left"].z - mam.z) * 1000, frente_peito(Z_MAO), *S["Left"], Z_MAO, Z_POLIA), flush=True)

    # ── mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ─────────────────────────────────────────
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length
    maos = Maos(bon, RAIO, polegar_modo="volta")  # polegar novo: dá a volta no pegador

    def orientacao(D):
        """Dedos e palma com o antebraço na direção D: dedos na linha do antebraço (PUNHO° pra cima, pro lado do dorso), palma
        virada pra baixo (pegada pronada)."""
        D = Vector(D).normalized()
        baixo = Vector((0.0, 0.0, -1.0))
        pq = (baixo - D * baixo.dot(D)).normalized()
        dq = (D * math.cos(math.radians(PUNHO)) - pq * math.sin(math.radians(PUNHO))).normalized()
        pq = (baixo - dq * baixo.dot(dq)).normalized()
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        dq_r, pq_r = orientacao(Vector((0, -1, 0)))
        g_r = S[L] + Vector((s * 0.18, -0.30, -0.10))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.4, 0.4, -0.3)), zerar=True)
        off = g_r - c(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    # ── começo (t=0): antebraço na horizontal pra frente, pegador na altura do peito, FRENTE0 à frente da frente do peito; o
    # cotovelo fica atrás da mão (a mão na largura do cotovelo) e abre pro lado o que o braço deixa ────────────────────────────
    y_peito = frente_peito(Z_MAO)
    D0 = Vector((0.0, -1.0, 0.0))
    G0, E0, W0, G1 = {}, {}, {}, {}
    for L, s in LADOS:
        dq, pq = orientacao(D0)
        o = vao_menos_punho(L, dq, pq)
        W = Vector((0.0, y_peito - FRENTE0 - o.y, Z_MAO - o.z))
        E = W - D0 * La
        dy, dz = E.y - S[L].y, E.z - S[L].z
        dx = math.sqrt(max(Lb ** 2 - dy * dy - dz * dz, 0.0))
        E = Vector((S[L].x + s * dx, E.y, E.z))
        W = E + D0 * La
        G0[L], E0[L], W0[L] = W + o, E, W

    # ── fim (t=1): cotovelo dobrado COTOVELO1°, pegadores a VAO_FIM um do outro, na mesma altura ────────────────────────────
    d1 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO1)))
    for L, s in LADOS:
        g = Vector((s * VAO_FIM / 2, S[L].y - 0.5, Z_MAO))
        for _ in range(10):
            dq, pq = orientacao((g - S[L]).normalized())
            o = vao_menos_punho(L, dq, pq)
            w = g - o - S[L]
            dy = -math.sqrt(max(d1 ** 2 - w.x ** 2 - w.z ** 2, 0.0))
            g = Vector((s * VAO_FIM / 2, S[L].y + dy + o.y, Z_MAO))
        G1[L] = g

    def caminho(L, t):
        """Eixo do pegador no quadro t: curva de Bézier do começo ao fim, na mesma altura, com o arco ARCO (as mãos vão pra
        frente e fecham pro meio no fim: ExRx, "slight arch pattern as hands travel closer together toward extension")."""
        g0, g1 = G0[L], G1[L]
        m = (g0 + g1) / 2
        k = m.lerp(Vector((g0.x, m.y, m.z)), ARCO)
        return g0 * (1 - t) ** 2 + k * (2 * (1 - t) * t) + g1 * t ** 2

    fora = {L: -s * lado for L, s in LADOS}

    def cotovelo(L, W, antes=None, alvo=0.0):
        """Cotovelo no círculo que o braço deixa (ombro e punho dados): o antebraço apontando pra frente com a inclinação mais
        perto de `alvo` (graus, + = a mão abaixo do cotovelo), o cotovelo pro lado de fora e perto do quadro anterior (`antes`,
        direção do cotovelo: sem salto). Devolve o centro do círculo, a direção do cotovelo (a partir do centro) e o raio."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        Cc = S[L] + u * a
        e1 = (fora[L] - u * u.dot(fora[L])).normalized()
        e2 = u.cross(e1)
        melhor = None
        for k in range(-180, 180):
            e = e1 * math.cos(math.radians(k)) + e2 * math.sin(math.radians(k))
            E = Cc + e * rho
            f_ = (W - E).normalized()
            if f_.y > -0.2:                       # o antebraço aponta pra frente
                continue
            custo = abs(-math.degrees(math.asin(max(-1.0, min(1.0, f_.z)))) - alvo)
            custo += 0.15 * max(0.0, 30.0 - math.degrees(math.asin(max(-1.0, min(1.0, e.dot(fora[L]))))))
            if antes is not None:
                custo += 2.0 * max(0.0, math.degrees(e.angle(antes)) - 8.0)
            if melhor is None or custo < melhor[0]:
                melhor = (custo, e)
        return Cc, melhor[1], rho

    # ── as 2 estações de cabo (equip3d.polia(gira=True) + puxador D), atrás da pessoa, viradas pra frente ──────────────────
    pol, pux = {}, {}
    for L, s in LADOS:
        sg = SIGLA[L]
        pol[L] = e3.polia("polia_" + sg, x=s * POLIA_X, y=POLIA_Y, altura=Z_POLIA, frente=(0, -1, 0), alto=ALTO, gira=True)
        pux[L] = e3.puxador_polia("puxador_" + sg, raio=RAIO)

    estado = {}

    def maos_no_pegador(t, acertar=False):
        for L, s in LADOS:
            g = caminho(L, t)
            f_, antes = estado.get(L, (D0, None))
            for _ in range(4):                 # antebraço ↔ cotovelo ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(f_)
                W = g - vao_menos_punho(L, dq, pq)
                Cc, e, rho = cotovelo(L, W, antes, alvo=INCL_FIM * t)
                f_ = (W - (Cc + e * rho)).normalized()
            estado[L] = (f_, e)
            dq, pq = orientacao(f_)
            maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4), zerar=True)
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4), zerar=True)
            eixo = pg._base(rig, L)[1]                 # pegador ao longo dos nós dos dedos (indicador → mínimo)
            eng = pux[L].por(g, eixo, pol[L].direcao)
            pol[L].ligar(eng)
            p3.atualizar()
            antes_p = pose.dedos.get(L, {}).get("Thumb") if t > 0 else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, g, eixo, RAIO, polegar_antes=antes_p)
            pose.desvio[L] = (c(L + "ForeArm") - (Cc + e * rho)).length * 1000
            u = pol[L].direcao(pux[L].ponto_engate)
            pose.cabo[L] = math.degrees(math.asin(max(-1.0, min(1.0, u.z))))
            pose.ante_cabo[L] = math.degrees((Cc + e * rho - W).angle(u))
            pose.alt[L] = g.z

    def pose(t):
        """t=0 mãos do lado do peito, cotovelos dobrados; t=1 braços quase esticados à frente, na altura do peito."""
        if t <= 1e-9:
            estado.clear()                     # o começo não depende do quadro anterior
        maos_no_pegador(t)

    pose.dedos, pose.desvio, pose.cabo, pose.ante_cabo, pose.alt = {}, {}, {}, {}, {}
    maos_no_pegador(0.0, acertar=True)        # polo certo do cotovelo com ele bem dobrado (no começo)
    estado.clear()

    def vao_entre_maos():
        """Menor distância da pele de uma mão até a da outra (m)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        pe = co[_grupo(nomes, dono, MAO["Left"])]
        pd = co[_grupo(nomes, dono, MAO["Right"])]
        arv = KDTree(len(pd))
        for i, v in enumerate(pd):
            arv.insert(Vector(v), i)
        arv.balance()
        return min(arv.find(Vector(v))[2] for v in pe)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g = pux["Left"].pegador.matrix_world.to_translation()
        return ("pegador E (%.3f %.3f %.3f), %.0f mm acima do meio do peito | cotovelo %.0f/%.0f° | abertura %s° | plano %s° | "
                "antebraço × horizontal %s° | punho %.0f/%.0f° (flexão %s) | palma × cima %s° | pegada %.2f | tronco %.1f° | "
                "cabo E %.1f° D %.1f° (acima da horizontal) | garfo E %.1f° D %.1f° | antebraço × cabo E %.0f° D %.0f° | "
                "cabo E %.3f D %.3f m | polegar E %s D %s | %s" % (
                    *g, (g.z - mam.z) * 1000, juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.palma_cima(jj)), tc.pegada_largura(jj)[0],
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], pose.cabo.get("Left", 0), pose.cabo.get("Right", 0),
                    pol["Left"].giro, pol["Right"].giro, pose.ante_cabo.get("Left", 0), pose.ante_cabo.get("Right", 0),
                    pol["Left"].comprimento, pol["Right"].comprimento, pose.dedos.get("Left", {}).get("Thumb"),
                    pose.dedos.get("Right", {}).get("Thumb"), maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("SUPINO t=%.1f | mãos a %.0f mm | %s | técnica %s" % (t, vao_entre_maos() * 1000, info(),
                                                                    tc.texto(tc.medir(ck.posicoes(rig)))), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(pux[L].pegador, raio=RAIO, meio_compr=pux[L].meia)) for L, _ in LADOS]
    equip = []
    for L, _ in LADOS:
        equip += pux[L].raizes + [pol[L].roldana, pol[L].cabo]
    # As 2 torres (paradas, atrás da pessoa) vão em `apoios`, como no Cross-over na Polia: a carenagem da pilha vira ~1 milhão de
    # pontos por torre na checagem do peso × corpo; como apoio, o corpo é medido contra elas só perto delas e com afunda 0 mm.
    return Cena(pose, equip, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.1),
                camera_video=((2.6, -4.4, 1.5), (0, -0.2, 1.05), 50), info=info,
                apoios=[pol[L].torre for L, _ in LADOS], afunda_apoio_mm=0.0)
