# Panturrilha no Step — cena da fábrica 3D (lote 14, 12/10/2026; 0 usos nos treinos prontos e 8 como troca equivalente). Peso
# corporal, em pé num STEP de academia solto no chão (equip3d.step, peça nova: o Reebok Step de 102 × 38,5 cm na altura mais baixa,
# 15 cm), com as 2 palmas apoiadas de leve numa parede à frente.
# t = 0 calcanhares embaixo, abaixo do step: tornozelo em 20° de flexão dorsal (panturrilha alongada) · t = 1 na ponta dos pés: 30°
# de flexão plantar (Kinoshita et al. 2023, as posturas do exercício: "the ankle joint angle ranging from 20° dorsiflexed to 30°
# plantarflexed positions"). O app faz a volta.
# Técnica (as frases e as fontes ficam na ficha): ExRx, Standing Calf Raise com o peso do corpo — ponta dos pés no step com o arco e o
# calcanhar pra fora ("Position toes and balls of feet on calf block with arches and heels extending off."), a mão num apoio só pra
# equilibrar ("Place hand on support for balance."), sobe o máximo e desce até alongar ("Raise heels by extending ankles as high as
# possible. Lower heels by bending ankles until calves are stretched."), step que não vira serve de degrau e joelhos retos ("Exercise
# step that will not overturn can be used as calf block. Keep knees straight throughout exercise [...]"); ACE, Standing Calf Raises -
# Wall — pés na largura do quadril e pra frente, as palmas na parede na altura do peito ou dos ombros, com os braços estendidos ("Stand
# 6 -12" away from a wall with your feet hip-width apart and facing forward. Extend your arms to place your palms on the wall, level
# with your chest or shoulders."), joelhos estendidos e pés sem girar ("keeping your knees extended and without rotating your feet");
# NSCA (Achievable CSCS, calf raise em pé): "Keep your knees fully extended (not locked)", "Keep your knees extended and your body
# upright.".
# Como o rig faz:
#   • base (a mesma da Panturrilha em Pé na Máquina): as pernas fecham FECHA° pro meio (pés na largura do quadril), os pés ficam na
#     orientação do repouso (pontas pra frente) e a articulação da base dos dedos (MTP, cabeça do osso ToeBase) fica PARADA, BORDA
#     à frente da borda de trás do step, com os dedos deitados nele. Pra cada quadro saem 2 giros em volta do X: o do pé em volta da
#     base dos dedos (φ, + = calcanhar subindo; leva o tornozelo junto) e o do corpo inteiro, rígido do tornozelo pra cima (joelhos e
#     quadril estendidos como no repouso, tronco e cabeça parados), em volta do tornozelo (ψ, + = pra frente).
#   • o que muda da máquina: lá ψ seguia as ombreiras de uma alavanca; aqui não há carga nem ombreira e o corpo se EQUILIBRA sozinho em
#     cima da ponta dos pés ("Axis: Ball of Foot", ExRx, Calf Exercise Analyses): em cada quadro ψ é o que deixa o centro de massa do
#     corpo (tabela de Dempster em Winter 2009, como a Abdução de Quadril na Polia; braços na posição do quadro) CM_FRENTE à frente da
#     base dos dedos, e φ é o que dá o tornozelo do quadro. Embaixo o tornozelo fica longe, atrás da base dos dedos, e o corpo inclina
#     mais pra frente; em cima quase nada. As mãos só encostam na parede (não seguram peso: "for balance").
#   • mãos: espalmadas na parede (uma caixa criada aqui, como o colchonete dos abdominais), na largura dos ombros e na altura deles
#     (o punho PUNHO_DZ do meio do caminho que o ombro faz subindo e descendo), os dedos juntos pra cima (DEDOS_FORA° pra fora), o
#     polegar junto do indicador. A mão é montada uma vez (a receita da mão na torre da Elevação Lateral na Polia: IK até o punho, o
#     antebraço gira pra palma, o resto no punho, a palma encosta e cada dedo dobra até a pele encostar) e fica PARADA na parede: em
#     cada quadro o braço vai por IK até o mesmo punho (cotovelo pra baixo e um pouco pra fora, pro lado do polo), o antebraço gira no
#     próprio eixo e a mão volta pra matriz guardada (os dedos vão junto). A parede fica onde o braço chega com o cotovelo dobrado
#     COTOVELO_MIN° no quadro em que o ombro fica mais longe dela (braço quase estendido, "Extend your arms").
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
X = Vector((1.0, 0.0, 0.0))
Y = Vector((0.0, 1.0, 0.0))
DORSI, PLANTAR = 20.0, 30.0   # tornozelo: 20° de flexão dorsal embaixo → 30° de flexão plantar em cima, a partir do neutro (o pé
                              # chapado em pé; Kinoshita et al. 2023: "from 20° dorsiflexed to 30° plantarflexed")
FECHA = 2.0                   # pernas 2° pro meio (giro no quadril): pés na largura do quadril (o da Panturrilha em Pé na Máquina)
Z_STEP = 0.15                 # topo do step: o Reebok na altura mais baixa ("3 adjustable heights - 15, 20 and 25 cm")
BORDA = 0.012                 # a borda de trás do step fica 1,2 cm atrás da base dos dedos (a cabeça dos metatarsos em cima dele)
AFUNDA_PE = 0.001             # a pele da ponta do pé afunda na borracha do step
FUNDO_MAX = 0.0048            # a pele embaixo dos dedos afunda no máximo isso no topo do step (m): em cima, com a base dos dedos
                              # dobrada ~35°, a malha do pé ESQUERDO dobra pra baixo embaixo dos dedos (2 cm à frente da base deles) e
                              # entrava 7,5 mm no step (o direito, 1 mm; a Panturrilha em Pé na Máquina tem a mesma dobra: pé esquerdo
                              # a 143 mm com o degrau a 150) — o corpo sobe o que passar disso (até ~2,7 mm, só perto do topo; o pé
                              # direito fica a ≤ 2 mm do step)
CM_FRENTE = 0.010             # centro de massa 1 cm à frente da base dos dedos (em cima da ponta dos pés: entre a borda do step,
                              # 1,2 cm atrás, e a ponta dos dedos, ~6 cm à frente)
PUNHO_DZ = -0.04              # punho 4 cm abaixo do meio do caminho que a articulação do ombro faz subindo e descendo: o centro da
                              # palma fica ~7 cm acima dela embaixo e ~4 cm abaixo em cima, na altura dos ombros (ACE: "level with
                              # your chest or shoulders"). Mais baixo, o punho passa de 90° em cima (o antebraço desce até a parede):
                              # com a palma 5 cm abaixo do ombro no meio do movimento ele ia a 101° (sonda de 12/10/2026)
PALMA_FORA = 0.03             # centro da palma 3 cm por fora da articulação do ombro: mãos na largura dos ombros
COTOVELO_MIN = 18.0           # flexão do cotovelo no quadro em que o ombro fica mais longe da parede (graus): braço quase estendido.
                              # A mão fica parada e o ombro sobe 11 cm e vai 2 cm pra trás (o corpo endireita em cima): o cotovelo
                              # vai de ~18° em cima a ~43° embaixo
DEDOS_FORA = 10.0             # dedos juntos pra cima e isso pra fora (graus), no plano da parede
INCLINA_PALMA = 3.0           # palma inclinada isso (graus): o pé da mão sai um pouco da parede e a pele do punho não entra nela
APERTA = 0.001                # a palma afunda isso na parede (m): só encosta
POLEGAR_JUNTO = 12.0          # polegar a isso do indicador, no plano da palma (graus)
LAMBDA_MAX = 1.0              # dedo dobra até perfil × isso pra encostar na parede
POLO = (0.12, 0.0, -0.45)     # polo do cotovelo em relação ao meio ombro → punho (m: pra fora, pra trás, pra baixo): o cotovelo
                              # aponta pra baixo e um pouco pra fora, e o antebraço sobe até a parede (o punho dobra menos)
PAREDE = (1.30, 0.10, 2.30)   # parede (largura, espessura, altura), m: um pedaço de parede à frente do step
AFUNDA_APOIO = 6.0            # a pele pode afundar isso no step/parede (mm): o coxim da ponta do pé na borda (máquina: −6 mm)
SEGMENTOS = (                 # Winter DA, Biomechanics and Motor Control of Human Movement (2009), tabela de Dempster: (de, até,
                              # fração da massa, centro de massa a partir do de cima) — a mesma da Abdução de Quadril na Polia
    ("Arm", "ForeArm", 0.028, 0.436), ("ForeArm", "Hand", 0.016, 0.430), ("Hand", "HandMiddle1", 0.006, 0.506),
    ("UpLeg", "Leg", 0.100, 0.433), ("Leg", "Foot", 0.0465, 0.433), ("Foot", "ToeBase", 0.0145, 0.50))
MAO = lambda L: [L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]


def _rx(graus):
    a = math.radians(graus)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def _ang(a, b):
    c = float(a @ b) / max(float(np.linalg.norm(a) * np.linalg.norm(b)), 1e-12)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _bissec(f, lo, hi, n=60):
    flo = f(lo)
    for _ in range(n):
        m = (lo + hi) / 2
        fm = f(m)
        if (fm > 0) == (flo > 0):
            lo, flo = m, fm
        else:
            hi = m
    return (lo + hi) / 2


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    # ── 1) base: as pernas fecham FECHA° (giro em volta do Y no quadril) e o pé volta pra orientação do repouso (sola chapada, ponta pra
    #    frente); o corpo sobe até a sola embaixo da base dos dedos ficar no topo do step ─────────────────────────────────────────────
    PERNA = [L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase")]
    for L, s in LADOS:
        Rf = PB[p3.P + L + "Foot"].matrix.to_3x3().copy()
        p3.girar_osso(rig, L + "UpLeg", Matrix.Rotation(math.radians(s * FECHA), 3, Y))
        Ra = PB[p3.P + L + "Foot"].matrix.to_3x3()
        p3.girar_osso(rig, L + "Foot", Rf @ Ra.inverted())
    P = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    m_y = cab("LeftToeBase").y
    frente = P[P[:, 1] < m_y + BORDA]                       # a parte do pé que fica em cima do step
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0.0, 0.0, Z_STEP - AFUNDA_PE - float(frente[:, 2].min()))))
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in ["Hips"] + PERNA}
    jb = ck.posicoes(rig)
    TAU0 = sum(tc.tornozelo(jb)) / 2                        # o tornozelo neutro (pé chapado, em pé), ~76°
    a0, m0, k0 = (np.array(cab("Left" + o)) for o in ("Foot", "ToeBase", "Leg"))
    y_borda = float(m0[1]) + BORDA
    P = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    y_dedos = float(P[:, 1].min())                          # ponta dos dedos (a pele mais à frente do pé)
    print("PÉS | de lado a lado x %.3f a %.3f (%.0f mm) | comprimento do pé y %.3f a %.3f" % (
        float(P[:, 0].min()), float(P[:, 0].max()), (P[:, 0].max() - P[:, 0].min()) * 1000, y_dedos, float(P[:, 1].max())),
        flush=True)
    st = e3.step("step", y_borda=y_borda, topo=Z_STEP)
    # pontos do corpo no repouso (pro centro de massa: o corpo é rígido do tornozelo pra cima)
    J0 = {L + o: np.array(cab(L + o)) for L, _ in LADOS for o in ("Arm", "UpLeg", "Leg", "Foot", "ToeBase")}
    CAB0 = np.array(cab("Head") + (p3.ponta(rig, "Head") - cab("Head")) * 0.3)
    LB = (cab("LeftForeArm") - cab("LeftArm")).length       # braço (ombro → cotovelo)
    LA = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço (cotovelo → punho)
    print("BASE | tornozelo neutro %.2f° | tornozelo y %.4f z %.4f | base dos dedos y %.4f z %.4f | borda do step y %.4f | ponta dos "
          "dedos y %.4f | braço %.3f antebraço %.3f m | pes_base_lateral %.2f" % (TAU0, a0[1], a0[2], m0[1], m0[2], y_borda, y_dedos,
                                                                              LB, LA, tc.pes_base_lateral(jb)[0]), flush=True)

    # ── 2) cinemática (conta pura, sem o rig): ψ = corpo inclinado pra frente em volta do tornozelo; φ = pé girado em volta da base dos
    #    dedos (+ = calcanhar subindo). Tornozelo (canela × pé) = ângulo entre Rx(ψ)(tornozelo − joelho) e Rx(φ)(base dos dedos −
    #    tornozelo); o tornozelo vai pra A(φ) = M + Rx(φ)(A0 − M); um ponto do corpo vai pra A(φ) + Rx(ψ)(P0 − A0) ────────────────────
    vs, vf = a0 - k0, m0 - a0

    def tau(psi, phi):
        return _ang(_rx(psi) @ vs, _rx(phi) @ vf)

    def phi_de(psi, alvo):
        return _bissec(lambda f: tau(psi, f) - alvo, -60.0, 75.0)

    def alvo_tau(t):
        return p3.lerp(TAU0 + DORSI, TAU0 - PLANTAR, t)

    def no_corpo(psi, phi):
        """Leva um ponto do corpo rígido (do tornozelo pra cima, no repouso) pro quadro (ψ, φ)."""
        A, R = m0 + _rx(phi) @ (a0 - m0), _rx(psi)
        return lambda p: A + R @ (np.asarray(p) - a0)

    def polo_de(S, W, s):
        return (np.asarray(S) + np.asarray(W)) / 2 + np.array((s * POLO[0], POLO[1], POLO[2]))

    def cotovelo(S, W, s):
        """Cotovelo do braço de 2 segmentos (LB, LA) do ombro S ao punho W, no plano do polo (o mesmo que o IK do rig usa)."""
        S, W = np.asarray(S), np.asarray(W)
        d = W - S
        n = float(np.linalg.norm(d))
        u = d / n
        n = min(n, LB + LA - 1e-6)
        x = (LB ** 2 - LA ** 2 + n ** 2) / (2 * n)
        h = math.sqrt(max(LB ** 2 - x ** 2, 0.0))
        v = polo_de(S, W, s) - S
        v = v - u * (v @ u)
        return S + u * x + v / np.linalg.norm(v) * h

    def flexao_cotovelo(S, W):
        n = min(float(np.linalg.norm(np.asarray(W) - np.asarray(S))), LB + LA)
        return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, (LB ** 2 + LA ** 2 - n ** 2) / (2 * LB * LA)))))

    def centro(psi, phi, W, mao_cm):
        """Centro de massa (Dempster) no quadro (ψ, φ) com os punhos em W e o centro de massa de cada mão em mao_cm (paradas)."""
        T = no_corpo(psi, phi)
        Rf = _rx(phi)
        q = (T(J0["LeftUpLeg"]) + T(J0["RightUpLeg"])) / 2
        o = (T(J0["LeftArm"]) + T(J0["RightArm"])) / 2
        soma = (q + (o - q) * 0.5) * 0.497 + T(CAB0) * 0.081
        for L, s in LADOS:
            for a_, b_, m_, f_ in (("UpLeg", "Leg", 0.100, 0.433), ("Leg", "Foot", 0.0465, 0.433)):
                pa, pb = T(J0[L + a_]), T(J0[L + b_])
                soma = soma + (pa + (pb - pa) * f_) * m_
            M = J0[L + "ToeBase"]
            A = M + Rf @ (J0[L + "Foot"] - M)
            soma = soma + (A + (M - A) * 0.50) * 0.0145
            S = T(J0[L + "Arm"])
            E = cotovelo(S, W[L], s)
            soma = soma + (S + (E - S) * 0.436) * 0.028 + (E + (W[L] - E) * 0.430) * 0.016 + np.asarray(mao_cm[L]) * 0.006
        return soma

    Y_CM = float(m0[1]) - CM_FRENTE

    def cinematica(t, W, mao_cm):
        """(ψ, φ) do quadro t: o tornozelo no alvo e o centro de massa CM_FRENTE à frente da base dos dedos."""
        alvo = alvo_tau(t)
        psi = _bissec(lambda ps: centro(ps, phi_de(ps, alvo), W, mao_cm)[1] - Y_CM, -10.0, 25.0)
        return psi, phi_de(psi, alvo)

    def posar(psi, phi):
        """Corpo inclinado ψ graus pra frente em volta do tornozelo e pé girado φ graus (calcanhar subindo) em volta da base dos dedos,
        que fica parada; os dedos ficam deitados no step."""
        for n, Mb in base.items():
            PB[p3.P + n].matrix_basis = Mb.copy()
        p3.atualizar()
        A = Vector(m0 + _rx(phi) @ (a0 - m0))
        p3.girar_osso(rig, "Hips", Matrix.Rotation(math.radians(psi), 3, X), pivo=Vector(a0), mover=A - Vector(a0))
        for L, _ in LADOS:
            p3.girar_osso(rig, L + "Foot", Matrix.Rotation(math.radians(phi - psi), 3, X))
            p3.girar_osso(rig, L + "ToeBase", Matrix.Rotation(math.radians(-phi), 3, X))

    # ── 3) braços: IK do ombro até o punho (cotovelo pro lado do polo) e congela em FK ───────────────────────────────────────────────
    punho_alvo, polo_alvo, iks = {}, {}, {}
    for L, s in LADOS:                                      # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punho_alvo[L] = p3.vazio("punho_" + L, p3.ponta(rig, L + "ForeArm"))
        polo_alvo[L] = p3.vazio("polo_cotovelo_" + L, cab(L + "ForeArm") + Vector((s * 0.3, 0.3, -0.3)))
        iks[L] = p3.ik(rig, L + "ForeArm", punho_alvo[L], polo_alvo[L])
        iks[L].mute = True

    def braco_no_punho(L, s, W, acertar=False):
        """Braço do zero (repouso) até o punho W por IK, cotovelo no plano do polo; o resultado vira FK."""
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + L + n].matrix_basis = Matrix.Identity(4)
        p3.atualizar()
        W = Vector(W)
        alvo = W.copy()
        for _ in range(3):
            punho_alvo[L].location = alvo
            polo_alvo[L].location = Vector(polo_de(cab(L + "Arm"), W, s))
            iks[L].mute = False
            p3.atualizar()
            if acertar:
                p3.acertar_polo(rig, iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                acertar = False
            nomes = (L + "Arm", L + "ForeArm")
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[L].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            erro = W - cab(L + "Hand")
            if erro.length < 0.0003:
                break
            alvo = alvo + erro
            for n in ("Arm", "ForeArm"):
                PB[p3.P + L + n].matrix_basis = Matrix.Identity(4)
            p3.atualizar()
        return (W - cab(L + "Hand")).length

    def girar_antebraco(L, palma_q):
        """O antebraço gira no próprio eixo (pronação/supinação) até a palma ficar virada pra palma_q (o punho não torce)."""
        f0, f1 = cab(L + "ForeArm"), cab(L + "Hand")
        ax = (f1 - f0).normalized()
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, L)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))

    def mao_no_rumo(L, dedos_q, palma_q):
        """A mão com os dedos pra dedos_q e a palma pra palma_q (giro no punho)."""
        h0 = cab(L + "Hand")
        y_m = (p3.ponta(rig, L + "Hand") - h0).normalized()
        n_m = pg._base(rig, L)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, L + "Hand", F_quer @ F_tem.transposed())

    # ── 4) mãos espalmadas na parede (montadas uma vez, no meio do movimento) ─────────────────────────────────────────────────────────
    parede = {"y": 0.0}                                    # y da face da parede virada pra pessoa (a pessoa olha pra −Y, pra ela)
    PALMA_N = Vector((0.0, -1.0, 0.0))                     # da palma pra dentro da parede

    def dist_parede(P_):
        """Menor distância com sinal (m) dos pontos até a face da parede (− = dentro dela)."""
        P_ = np.asarray(P_)
        return float((P_[:, 1] - parede["y"]).min()) if len(P_) else 1e9

    def esticar_dedos(L):
        """Dedos juntos, esticados e deitados no plano da palma; o polegar também, encostado no indicador."""
        p3.soltar_dedos(rig, L)
        pg.juntar_dedos(rig, L, 1.0)
        for d_ in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, L)[0]
                o = "%sHand%s%d" % (L, d_, i)
                f = p3.ponta(rig, o) - cab(o)
                plano = f - palma * f.dot(palma)
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def dobrar_ate_encostar(ossos, eixos, perfil, lam_min=-0.5):
        """Dobra a cadeia (falange 1 → 3) pra parede com os ângulos perfil × λ até a pele encostar nela (≤ 0,5 mm): a partir de
        λ = 0 (dedo no plano da palma); se já entra (< −1 mm), estica até sair (λ até lam_min)."""
        co_, _, (nomes_, dono_) = ck._avaliar(bon.corpo, 1)
        pos = {n: i for i, n in enumerate(nomes_)}
        pts = {o: co_[dono_ == pos[o]] for o in ossos}
        cabs = {o: np.array(cab(o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))

        def dist(lam):
            pp = pg._cadeia_pts(pts, cabs, ponta, ossos, eixos, [lam * a for a in perfil])
            return dist_parede(np.concatenate([pp[o] for o in ossos]))

        escolha = 0.0
        if dist(0.0) < -0.001:
            for lam in np.arange(-0.02, lam_min - 0.0001, -0.02):
                escolha = float(lam)
                if dist(lam) >= -0.0005:
                    break
        else:
            for lam in np.arange(0.0, LAMBDA_MAX + 0.0001, 0.02):
                escolha = float(lam)
                if dist(lam) <= 0.0005:
                    break
        for k, o in enumerate(ossos):
            if escolha * perfil[k]:
                p3.girar_osso(rig, o, Matrix.Rotation(math.radians(escolha * perfil[k]), 3, Vector(eixos[k])))
        return escolha

    def polegar_junto(L):
        palma = pg._base(rig, L)[0]
        o = L + "HandThumb1"
        t_ = p3.ponta(rig, L + "HandThumb3") - cab(o)
        i_ = p3.ponta(rig, L + "HandIndex3") - cab(L + "HandIndex1")
        t_ -= palma * t_.dot(palma)
        i_ -= palma * i_.dot(palma)
        ang = math.atan2(t_.cross(i_).dot(palma), t_.dot(i_))
        falta = ang - math.copysign(math.radians(POLEGAR_JUNTO), ang)
        if ang * falta > 0:
            p3.girar_osso(rig, o, Matrix.Rotation(falta, 3, palma))

    def dedos_na_parede(L):
        palma, eixo_nos = pg._base(rig, L)[:2]
        lams = {}
        for d_ in p3.DEDOS:
            ossos = ["%sHand%s%d" % (L, d_, i) for i in (1, 2, 3)]
            f = (p3.ponta(rig, ossos[0]) - cab(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1     # + = dobra pro lado da palma (pra parede)
            lams[d_] = dobrar_ate_encostar(ossos, [np.array(eixo_nos * sinal)] * 3, (30.0, 25.0, 15.0))
        polegar_junto(L)
        ossos = ["%sHand%s%d" % (L, "Thumb", i) for i in (1, 2, 3)]
        eixos = []
        for o in ossos:
            f = (p3.ponta(rig, o) - cab(o)).normalized()
            eixos.append(np.array(f.cross(palma).normalized()))
        lams["Thumb"] = dobrar_ate_encostar(ossos, eixos, (20.0, 10.0, 10.0), lam_min=-1.0)   # a base sai da parede
        return lams

    def rumo_da_mao(s):
        up = Vector((s * math.sin(math.radians(DEDOS_FORA)), 0.0, math.cos(math.radians(DEDOS_FORA))))
        b = math.radians(INCLINA_PALMA)
        return (up * math.cos(b) + PALMA_N * math.sin(b)).normalized(), (PALMA_N * math.cos(b) - up * math.sin(b)).normalized()

    def assentar_mao(L, s, alvo_palma):
        """Mão L espalmada na parede com o centro da palma em alvo_palma (no plano da parede), afundando APERTA; os dedos e o polegar
        encostam nela. Devolve o punho, a matriz da mão e o texto das medidas."""
        dedos_q, palma_q = rumo_da_mao(s)
        W = alvo_palma - dedos_q * 0.055 - PALMA_N * 0.02     # chute: punho abaixo do centro da palma, fora da parede
        for volta in range(12):
            braco_no_punho(L, s, W, acertar=(volta == 0))
            girar_antebraco(L, palma_q)
            mao_no_rumo(L, dedos_q, palma_q)
            esticar_dedos(L)
            palma_pts = pele((L + "Hand", L + "HandThumb1"))  # palma + eminência tenar (base do polegar)
            palma_mao = pg._base(rig, L)[0]
            centro_mao = np.array(palma_pts.mean(axis=0))
            lado_palma = palma_pts[(palma_pts - centro_mao) @ np.array(palma_mao) > 0.004]
            centro_palma = Vector(lado_palma.mean(axis=0))
            dist = dist_parede(lado_palma)
            erro_alvo = alvo_palma - centro_palma
            erro_alvo -= PALMA_N * erro_alvo.dot(PALMA_N)    # no plano da parede: centro da palma no alvo
            W = W + erro_alvo + PALMA_N * (dist + APERTA)   # e a palma encostando (afundando APERTA)
            if abs(dist + APERTA) < 0.0004 and erro_alvo.length < 0.003:
                break
        braco_no_punho(L, s, W)
        girar_antebraco(L, palma_q)
        mao_no_rumo(L, dedos_q, palma_q)
        esticar_dedos(L)
        lams = dedos_na_parede(L)
        mao_pts = pele(tuple(MAO(L)))
        jt = ck.medir_juntas(rig)
        lado = "E" if L == "Left" else "D"
        txt = ("MÃO %s | voltas %d | palma → parede %.1f mm | centro da palma fora do alvo %.1f mm | mão → parede %.1f mm | punho %.0f° "
               "cotovelo %.0f° ombro %.0f° | dedos λ %s" % (L, volta + 1, dist * 1000, erro_alvo.length * 1000,
                                                           dist_parede(mao_pts) * 1000, jt["punho" + lado], jt["cotovelo" + lado],
                                                           jt["ombro" + lado], " ".join("%s %.2f" % (k[0], v)
                                                                                       for k, v in lams.items())))
        return W, PB[p3.P + L + "Hand"].matrix.copy(), palma_q, txt

    # ── 5) onde ficam a parede e as mãos: o centro de massa depende dos braços, os braços da parede e a parede do ombro — 1ª volta com
    #    os punhos chutados e a mão assentada numa parede provisória; depois a mão anda no plano da parede (sobe ou desce, sem mudar
    #    nada da pegada) até o punho ficar PUNHO_DZ do meio do caminho do ombro, e a parede vai junto com as mãos pra onde o braço
    #    fica com COTOVELO_MIN° no quadro em que o ombro fica mais longe ──────────────────────────────────────────────────────────────
    S0 = {L: J0[L + "Arm"] for L, _ in LADOS}
    W = {L: S0[L] + np.array((s * PALMA_FORA, -0.48, 0.0)) for L, s in LADOS}
    mao_cm = {L: W[L] + np.array((0.0, -0.02, 0.06)) for L, _ in LADOS}
    psi_m, phi_m = cinematica(0.5, W, mao_cm)
    Sm = {L: no_corpo(psi_m, phi_m)(S0[L]) for L, _ in LADOS}
    parede["y"] = float(Sm["Left"][1]) - 0.50
    posar(psi_m, phi_m)
    MH, PALMA_Q, txt_mao = {}, {}, {}
    for L, s in LADOS:
        alvo_palma = Vector((s * (abs(float(Sm[L][0])) + PALMA_FORA), parede["y"], float(Sm[L][2]) + 0.05))
        Wl, MH[L], PALMA_Q[L], txt_mao[L] = assentar_mao(L, s, alvo_palma)
        W[L] = np.array(Wl)
        mao_cm[L] = np.array(cab(L + "Hand") + (cab(L + "HandMiddle1") - cab(L + "Hand")) * 0.506)
        print(txt_mao[L], flush=True)
    TS = [k / 8 for k in range(9)]
    d = np.zeros(3)                                         # quanto as mãos (e a parede, no y) andam
    for volta in range(6):
        Wv = {L: W[L] + d for L, _ in LADOS}
        Cv = {L: mao_cm[L] + d for L, _ in LADOS}
        tab = {t: cinematica(t, Wv, Cv) for t in TS}
        ombros = {t: no_corpo(*tab[t])(S0["Left"]) for t in TS}
        zs = [float(o[2]) for o in ombros.values()]
        dz = (min(zs) + max(zs)) / 2 + PUNHO_DZ - float(W["Left"][2])

        def menor_flexao(dy):
            Wd = W["Left"] + np.array((0.0, dy, dz))
            return min(flexao_cotovelo(ombros[t], Wd) for t in TS)

        novo = np.array((0.0, _bissec(lambda dy: menor_flexao(dy) - COTOVELO_MIN, d[1] - 0.25, d[1] + 0.25), dz))
        print("PAREDE volta %d | mãos andam y %+.4f z %+.4f m | ombro de z %.4f a %.4f | cotovelo mínimo %.1f°" % (
            volta, novo[1], novo[2], min(zs), max(zs), menor_flexao(novo[1])), flush=True)
        if np.linalg.norm(novo - d) < 0.0005:
            d = novo
            break
        d = novo
    parede["y"] += float(d[1])
    for L, _ in LADOS:
        W[L] = W[L] + d
        mao_cm[L] = mao_cm[L] + d
        MH[L] = Matrix.Translation(Vector(d)) @ MH[L]
    TAB = {t: cinematica(t, W, mao_cm) for t in TS}
    pa = e3.caixa("parede", (0.0, parede["y"] - PAREDE[1] / 2, PAREDE[2] / 2), PAREDE, e3.mat_carenagem(), chanfro=0.004)
    print("PAREDE | face em y %.4f (%.3f m à frente da ponta dos dedos, %.3f m da frente do step) | punhos E (%.4f %.4f %.4f) D (%.4f "
          "%.4f %.4f)" % (parede["y"], y_dedos - parede["y"], (y_borda - 0.385 + 0.02) - parede["y"], *W["Left"], *W["Right"]),
          flush=True)
    print("CINEMÁTICA | %s" % " ".join("t%.3f ψ%+.2f φ%+.1f" % (t, *v) for t, v in TAB.items()), flush=True)
    print("OMBRO E | %s" % " ".join("t%.3f y %.4f z %.4f cotovelo %.1f°" % (t, *no_corpo(*v)(S0["Left"])[1:],
                                                                         flexao_cotovelo(no_corpo(*v)(S0["Left"]), W["Left"]))
                                    for t, v in TAB.items()), flush=True)

    def maos_na_parede():
        """Braço por IK até o punho guardado, o antebraço gira pra palma e a mão volta pra matriz guardada (dedos junto)."""
        for L, s in LADOS:
            braco_no_punho(L, s, W[L])
            girar_antebraco(L, PALMA_Q[L])
            R = MH[L].to_3x3() @ PB[p3.P + L + "Hand"].matrix.to_3x3().inverted()
            p3.girar_osso(rig, L + "Hand", R)

    def cm_do_rig():
        """Centro de massa pelo rig no quadro (Dempster): pra conferir a conta."""
        soma = Vector()
        for L, _ in LADOS:
            for a_, b_, m_, f_ in SEGMENTOS:
                pa_, pb_ = cab(L + a_), cab(L + b_)
                soma += (pa_ + (pb_ - pa_) * f_) * m_
        q, o = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2, (cab("LeftArm") + cab("RightArm")) / 2
        soma += (q + (o - q) * 0.5) * 0.497
        soma += (cab("Head") + (p3.ponta(rig, "Head") - cab("Head")) * 0.3) * 0.081
        return soma

    # malhas do step (pro calcanhar × step)
    malhas_step = []
    for ob in [o for o in st.children_recursive if o.type == "MESH"]:
        eco, etri = ck._avaliar_simples(ob)
        malhas_step.append(BVHTree.FromPolygons([tuple(p) for p in eco], [tuple(t) for t in etri], all_triangles=True))

    def calcanhar_no_step(P_):
        """Menor distância (mm) da pele do pé (P_) atrás da borda do step (arco e calcanhar) até o step."""
        P_ = P_[P_[:, 1] > y_borda + 0.015]
        menor = 1e9
        for bvh in malhas_step:
            for p in P_:
                loc, nor, idx, dist = bvh.find_nearest(Vector(p))
                if loc is not None:
                    menor = min(menor, -dist if (Vector(p) - loc).dot(nor) < 0 else dist)
        return menor * 1000

    def fundo_dos_pes():
        """Quanto a pele de cada pé em cima do step (à frente da borda) fica abaixo do topo dele (m; + = afundou)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        out = {}
        for L, _ in LADOS:
            P_ = co[np.array([n in (L + "Foot", L + "ToeBase") for n in nomes] + [False])[dono]]
            out[L] = Z_STEP - float(P_[P_[:, 1] < y_borda - 0.002][:, 2].min())
        return out

    def pose(t):
        """t=0 calcanhares embaixo (alongado), t=1 na ponta dos pés (flexão plantar)."""
        psi, phi = cinematica(t, W, mao_cm)
        posar(psi, phi)
        sobe = max(0.0, max(fundo_dos_pes().values()) - FUNDO_MAX)
        if sobe:                                            # a dobra da malha embaixo dos dedos não entra mais que FUNDO_MAX
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0.0, 0.0, sobe)))
        maos_na_parede()
        pose.estado = (psi, phi, sobe * 1000)

    pose.estado = (0.0, 0.0, 0.0)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        cm = cm_do_rig()
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)

        def grupo(partes):
            return co[np.array([n in partes for n in nomes] + [False])[dono]]

        maos = {L: grupo(tuple(MAO(L))) for L, _ in LADOS}
        palmas = {L: grupo((L + "Hand",)) for L, _ in LADOS}
        dedos = {L: grupo(tuple(o for o in MAO(L) if o != L + "Hand")) for L, _ in LADOS}
        pes = grupo(("LeftFoot", "RightFoot"))
        fundo = {L: v * 1000 for L, v in fundo_dos_pes().items()}
        return ("tornozelo %s° | ψ %+.2f° φ %+.1f° (corpo sobe %.1f mm) | centro de massa %.0f mm à frente da borda do step, %.0f mm "
                "atrás da ponta dos dedos, x %+.0f mm | calcanhar (pé mais baixo) z %.3f | pé atrás da borda → step %.1f mm | ponta do pé "
                "abaixo do topo do step E %.1f D %.1f mm | palma → parede E %.1f D %.1f mm | dedos → parede E %.1f D %.1f mm | mão → parede "
                "E %.1f D %.1f mm | joelho %.1f/%.1f° | quadril %.1f/%.1f° | tronco %.1f° | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | ombro "
                "%.0f/%.0f° | meio da palma − ombro z %+.0f/%+.0f mm | meio do pé z %.3f" % (
                    "/".join("%.1f" % v for v in tc.tornozelo(jj)), *pose.estado, (y_borda - cm.y) * 1000, (cm.y - y_dedos) * 1000,
                    cm.x * 1000, float(pes[:, 2].min()), calcanhar_no_step(pes), fundo["Left"], fundo["Right"],
                    dist_parede(palmas["Left"]) * 1000, dist_parede(palmas["Right"]) * 1000,
                    dist_parede(dedos["Left"]) * 1000, dist_parede(dedos["Right"]) * 1000,
                    dist_parede(maos["Left"]) * 1000, dist_parede(maos["Right"]) * 1000,
                    juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"],
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"],
                    juntas["punhoD"], juntas["ombroE"], juntas["ombroD"],
                    *(((cab(L + "Hand") + cab(L + "HandMiddle1")) / 2 - cab(L + "Arm")).z * 1000 for L, _ in LADOS),
                    ((cab("LeftFoot") + cab("LeftToeBase")) / 2).z))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    y_meio = (y_borda + parede["y"]) / 2
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, y_meio, 0.9),
                camera_video=((3.4, 2.0, 1.35), (0, y_meio, 0.95), 48), info=info, apoios=[st, pa],
                afunda_apoio_mm=AFUNDA_APOIO)
