# Panturrilha em Pé no Smith — cena da fábrica 3D (lote 14, 12/10/2026; 0 usos nos treinos prontos e 8 como troca equivalente).
# Em pé embaixo da barra do SMITH (equip3d.smith, a barra presa em 2 trilhos verticais), com a barra apoiada no trapézio e as 2 mãos
# fechadas nela (o corpo de cima e a pegada do Agachamento no Smith), e a ponta dos pés no STEP solto no chão (equip3d.step, a peça
# da Panturrilha no Step: o Reebok na altura mais baixa, 15 cm), embaixo da barra, com os calcanhares pra fora dele.
# t = 0 calcanhares embaixo, abaixo do step: tornozelo em 20° de flexão dorsal (panturrilha alongada) · t = 1 na ponta dos pés: 30°
# de flexão plantar (Kinoshita et al. 2023: "the ankle joint angle ranging from 20° dorsiflexed to 30° plantarflexed positions").
# O app faz a volta.
# Técnica (as frases e as fontes ficam na ficha): ExRx, Smith Standing Leg Calf Raise — "Position bar on upper chest height and place
# calf block under bar. Position back of shoulders under bar and grasp bar to sides. Position toes and balls of feet on calf block with
# arches and heels extending off. Disengage bar by rotating bar back. Stand erect by extending knees and hips." / "Raise heels by
# extending ankles as high as possible. Lower heels by bending ankles until calves are stretched." / "Keep knees straight throughout
# exercise or bend knees slightly only during stretch."; free-exercise-db, Smith Machine Calf Raise — "Place a block or weight plate
# below the bar on the Smith machine." / "Take the bar with both hands facing forward." / "Your knees should remain extended.".
# Como o rig faz:
#   • base (a mesma da Panturrilha em Pé na Máquina e da Panturrilha no Step): as pernas fecham FECHA° pro meio (pés na largura do
#     quadril), os pés ficam na orientação do repouso (pontas pra frente) e a articulação da base dos dedos (MTP, cabeça do osso
#     ToeBase) fica PARADA, BORDA à frente da borda de trás do step, com os dedos deitados nele. Pra cada quadro saem 2 giros em volta
#     do X: o do pé em volta da base dos dedos (φ, + = calcanhar subindo; leva o tornozelo junto) e o do corpo inteiro, rígido do
#     tornozelo pra cima (joelhos e quadril estendidos como no repouso, tronco, cabeça e braços parados em relação a ele), em volta do
#     tornozelo (ψ, + = pra frente).
#   • o que muda: na máquina ψ seguia as ombreiras de uma alavanca (o arco acompanha os ombros: o corpo sobe e desce reto) e no step ψ
#     é o do equilíbrio em cima da ponta dos pés (sem carga, as mãos só encostam na parede). Aqui a barra no trapézio é rígida com o
#     tronco e só anda na VERTICAL, presa nos trilhos (Cotterman et al. 2005: "vertical motion of bar on fixed path"): em cada quadro ψ é
#     o que deixa o eixo da barra na linha dos trilhos (Y_BARRA), e φ o que dá o tornozelo do quadro. A linha fica em cima do step,
#     LINHA m atrás da base dos dedos ("place calf block under bar", ExRx; "Axis: Ball of Foot", ExRx, Calf Exercise Analyses): com o
#     corpo em pé a barra no trapézio fica ~22 cm atrás da base dos dedos, então o corpo inclina pra frente no tornozelo até ela chegar
#     na linha; quando o calcanhar sobe o tornozelo anda pra frente embaixo da barra parada e o corpo endireita uns graus.
#   • a barra do Smith anda junto (sm.mover), só na vertical; as mãos fecham nela como no Agachamento no Smith (mesma pegada, mesmo
#     polegar novo fixo, zerar=True no Maos.segurar: o braço parte do repouso em todo quadro e o antebraço não gira no próprio eixo).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
X = Vector((1.0, 0.0, 0.0))
Y = Vector((0.0, 1.0, 0.0))
DORSI, PLANTAR = 20.0, 30.0   # tornozelo: 20° de flexão dorsal embaixo → 30° de flexão plantar em cima, a partir do neutro (o pé
                              # chapado em pé; Kinoshita et al. 2023: "from 20° dorsiflexed to 30° plantarflexed")
FECHA = 2.0                   # pernas 2° pro meio (giro no quadril): pés na largura do quadril (o das 2 panturrilhas em pé prontas)
Z_STEP = 0.15                 # topo do step: o Reebok na altura mais baixa (o mesmo da Panturrilha no Step)
BORDA = 0.012                 # a borda de trás do step fica 1,2 cm atrás da base dos dedos (a cabeça dos metatarsos em cima dele)
AFUNDA_PE = 0.001             # a pele da ponta do pé afunda na borracha do step
FUNDO_MAX = 0.0048            # a pele embaixo dos dedos afunda no máximo isso no topo do step (m): em cima, com a base dos dedos
                              # dobrada ~35°, a malha do pé ESQUERDO dobra pra baixo embaixo dos dedos (a mesma dobra da Panturrilha
                              # no Step e da Panturrilha em Pé na Máquina) — o corpo (com a barra) sobe o que passar disso
LINHA = 0.0                   # linha da barra (eixo) em relação à base dos dedos (m, + = atrás): ver o montar()
RAIO = 0.015                  # barra de 30 mm na pegada (Titan Smith Machine: "Barbell Shaft Diameter 30mm")
GRIP_X = 0.43                 # meia pegada, do meio da barra ao meio da mão (a do Agachamento no Smith)
BARRA_OFF = Vector((0, 0.075, -0.039))    # eixo da barra em relação à base do pescoço, no referencial do tronco: apoiada no
                                          # trapézio (a do Agachamento no Smith e do Agachamento Livre com Barra aprovado)
ALINHA = 0.15                 # quanto os dedos seguem o antebraço (maos3d.Maos.segurar, alinhar): o do Agachamento no Smith
PALMA_INCL = 0.12             # palma de frente pra barra, inclinada um pouco pra cima (a do Agachamento no Smith)
POLEGAR_VOLTA = (-10.0, 28.0, 1.0, 28.0, -8.3, 35.0)
                              # polegar NOVO dando a volta na barra, FIXO nas 2 mãos e em todos os quadros: a postura anatômica (CMC
                              # flexão, abdução, rotação, MCP flexão, abdução, IP flexão, graus) do Agachamento no Smith, a mesma
                              # pegada (a mão atrás da barra, rígida com o tronco)
AFUNDA_APOIO = 6.0            # a pele pode afundar isso no step e na barra (mm): o coxim da ponta do pé na borda (máquina: −6 mm)
CARGAS = (0.0, 0.5, 1.0)      # carga (barra + anilhas) em frações da massa do corpo, só pra MEDIR o centro de massa corpo + barra
LINHAS_SONDA = (-0.02, -0.01, 0.0, 0.01, 0.02, 0.03, 0.05)   # linhas medidas na tabela do montar() (m atrás da base dos dedos)
SEGMENTOS = (                 # Winter DA, Biomechanics and Motor Control of Human Movement (2009), tabela de Dempster: (de, até,
                              # fração da massa, centro de massa a partir do de cima) — a mesma da Panturrilha no Step
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


def _tipo_polegar(dedos):
    th = (dedos or {}).get("Thumb")
    return th[0] if isinstance(th, tuple) and th and isinstance(th[0], str) else "de hoje"


def _polegar_nos_angulos(bon, lado, q):
    """Polegar da mão `lado` na postura anatômica q = (cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex), em graus — a
    mesma conta do pg.polegar_em_volta quando ele acha a postura (a do Agachamento no Smith)."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, np.array(p3.ponta(rig, ossos[2])))
    for o, R in zip(ossos, P3.rotacoes(eixos, q)):
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)     # mão de referência da barra de 30 mm — antes do Maos
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def malha():
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        return co, tri, nomes, dono

    def grupo(m, partes):
        co, _, nomes, dono = m
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    def pele(partes):
        return grupo(malha(), partes)

    # ── 1) base: as pernas fecham FECHA° (giro em volta do Y no quadril) e o pé volta pra orientação do repouso (sola chapada, ponta pra
    #    frente); o corpo sobe até a sola embaixo da base dos dedos ficar no topo do step ─────────────────────────────────────────────
    PERNA = [L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase")]
    for L, s in LADOS:
        Rf = PB[p3.P + L + "Foot"].matrix.to_3x3().copy()
        p3.girar_osso(rig, L + "UpLeg", Matrix.Rotation(math.radians(s * FECHA), 3, Y))
        Ra = PB[p3.P + L + "Foot"].matrix.to_3x3()
        p3.girar_osso(rig, L + "Foot", Rf @ Ra.inverted())
    PES = ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase")
    P = pele(PES)
    m_y = cab("LeftToeBase").y
    frente = P[P[:, 1] < m_y + BORDA]                       # a parte do pé que fica em cima do step
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0.0, 0.0, Z_STEP - AFUNDA_PE - float(frente[:, 2].min()))))
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in ["Hips"] + PERNA}
    jb = ck.posicoes(rig)
    TAU0 = sum(tc.tornozelo(jb)) / 2                        # o tornozelo neutro (pé chapado, em pé), ~76°
    a0, m0, k0 = (np.array(cab("Left" + o)) for o in ("Foot", "ToeBase", "Leg"))
    y_borda = float(m0[1]) + BORDA
    P = pele(PES)
    y_dedos = float(P[:, 1].min())                          # ponta dos dedos (a pele mais à frente do pé)
    st = e3.step("step", y_borda=y_borda, topo=Z_STEP)
    N0 = np.array(cab("Neck"))                              # base do pescoço no repouso (o corpo é rígido do tornozelo pra cima)
    B0 = N0 + np.array(BARRA_OFF)                           # eixo da barra no trapézio, com o corpo em pé
    print("BASE | tornozelo neutro %.2f° | tornozelo y %.4f z %.4f | base dos dedos y %.4f z %.4f | borda do step y %.4f | ponta dos "
          "dedos y %.4f | barra no trapézio (corpo em pé) y %.4f z %.4f: %.0f mm atrás da base dos dedos | pes_base_lateral %.2f" % (
              TAU0, a0[1], a0[2], m0[1], m0[2], y_borda, y_dedos, B0[1], B0[2], (B0[1] - m0[1]) * 1000,
              tc.pes_base_lateral(jb)[0]), flush=True)

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

    def na_linha(t, y_linha):
        """(ψ, φ) do quadro t com o eixo da barra (rígido com o tronco) na linha vertical y = y_linha."""
        alvo = alvo_tau(t)
        psi = _bissec(lambda ps: no_corpo(ps, phi_de(ps, alvo))(B0)[1] - y_linha, -15.0, 30.0)
        return psi, phi_de(psi, alvo)

    Y_BARRA = float(m0[1]) + LINHA

    def cinematica(t):
        return na_linha(t, Y_BARRA)

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

    def fundo_dos_pes(m=None):
        """Quanto a pele de cada pé em cima do step (à frente da borda) fica abaixo do topo dele (m; + = afundou)."""
        m = m or malha()
        out = {}
        for L, _ in LADOS:
            P_ = grupo(m, (L + "Foot", L + "ToeBase"))
            out[L] = Z_STEP - float(P_[P_[:, 1] < y_borda - 0.002][:, 2].min())
        return out

    def posar_quadro(t):
        """O corpo do quadro t (sem os braços): ψ, φ e o quanto ele sobe pra dobra da malha embaixo dos dedos não passar de
        FUNDO_MAX. Devolve (ψ, φ, sobe)."""
        psi, phi = cinematica(t)
        posar(psi, phi)
        sobe = max(0.0, max(fundo_dos_pes().values()) - FUNDO_MAX)
        if sobe:
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0.0, 0.0, sobe)))
        return psi, phi, sobe

    def eixo_da_barra(psi):
        """Eixo da barra no trapézio no quadro posado (o tronco inclinado ψ): base do pescoço + Rx(ψ)·BARRA_OFF."""
        return cab("Neck") + p3.rot_x(psi) @ BARRA_OFF

    # ── 3) mãos fechadas na barra (como no Agachamento no Smith): atrás da barra, dedos pra cima, palma pra frente, linha dos nós ao
    #    longo da barra; tudo gira com o tronco (ψ) ──────────────────────────────────────────────────────────────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    eixo_barra = Vector((1, 0, 0))
    dedos_info = {}

    def maos_na_barra(psi, c):
        R = p3.rot_x(psi)
        dedos_q = R @ Vector((0, PALMA_INCL, 1)).normalized()
        palma_q = R @ Vector((0, -1, PALMA_INCL))
        for lado, s in LADOS:
            polo = cab(lado + "Arm") + R @ Vector((s * 0.30, 0.35, -0.40))
            # zerar (12/10/2026, conserto do giro do antebraço): o braço parte do repouso em todo quadro
            maos.segurar(lado, c + eixo_barra * (s * GRIP_X), dedos_q, palma_q, polo=polo, alinhar=ALINHA, zerar=True)
        for lado, _ in LADOS:          # os 4 dedos fecham até a pele encostar na barra (o polegar do fechar_em_volta é trocado
            dedos_info[lado] = pg.fechar_em_volta(bon, lado, c, eixo_barra, RAIO, polegar_modo="busca")   # pelo novo, fixo)
            _polegar_nos_angulos(bon, lado, POLEGAR_VOLTA)
            dedos_info[lado]["Thumb"] = ("volta fixo",) + POLEGAR_VOLTA

    # polos dos cotovelos acertados no meio do movimento
    psi_m, phi_m, sobe_m = posar_quadro(0.5)
    c_m = eixo_da_barra(psi_m)
    maos_na_barra(psi_m, c_m)
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)
    maos_na_barra(psi_m, c_m)

    # ── 4) centro de massa (Dempster/Winter 2009, a tabela da Panturrilha no Step): tudo acima do tornozelo é rígido (os braços na
    #    barra também), então o centro dessa parte vira um ponto do corpo no repouso; os pés giram com φ. A carga (barra + anilhas) fica
    #    no eixo da barra, em frações da massa do corpo (CARGAS: nenhuma fonte dá a carga — só medida) ───────────────────────────────
    def cm_do_rig():
        """(centro de massa do corpo inteiro, de tudo acima do tornozelo e a massa dessa parte) pelo rig, no quadro posado."""
        cima, m_cima, pes = Vector(), 0.0, Vector()
        for L, _ in LADOS:
            for a_, b_, m_, f_ in SEGMENTOS:
                pa_, pb_ = cab(L + a_), cab(L + b_)
                p = (pa_ + (pb_ - pa_) * f_) * m_
                if a_ == "Foot":
                    pes += p
                else:
                    cima += p
                    m_cima += m_
        q, o = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2, (cab("LeftArm") + cab("RightArm")) / 2
        cima += (q + (o - q) * 0.5) * 0.497
        cima += (cab("Head") + (p3.ponta(rig, "Head") - cab("Head")) * 0.3) * 0.081
        m_cima += 0.497 + 0.081
        return (cima + pes), cima / m_cima, m_cima

    _, cima_m, M_CIMA = cm_do_rig()
    A_m = m0 + _rx(phi_m) @ (a0 - m0)
    C0 = a0 + _rx(-psi_m) @ (np.array(cima_m) - A_m - np.array((0.0, 0.0, sobe_m)))   # centro de cima no repouso

    def centro(psi, phi, carga=0.0):
        """Centro de massa (corpo + carga no eixo da barra, carga em frações da massa do corpo) no quadro (ψ, φ), pela conta."""
        T = no_corpo(psi, phi)
        A = m0 + _rx(phi) @ (a0 - m0)
        pes = (A + (m0 - A) * 0.50)
        pes = np.array((0.0, pes[1], pes[2]))
        return (T(C0) * M_CIMA + pes * (1.0 - M_CIMA) + T(B0) * carga) / (1.0 + carga)

    print("CENTRO DE MASSA | parte de cima (%.3f da massa) no repouso y %.4f z %.4f: %.0f mm atrás da base dos dedos" % (
        M_CIMA, C0[1], C0[2], (C0[1] - m0[1]) * 1000), flush=True)
    print("LINHAS | linha da barra (mm atrás da base dos dedos) → ψ em t=0/0,5/1 (graus) | barra sobe (mm) | centro de massa à frente "
          "da base dos dedos (mm; + = à frente; a borda do step fica %.0f mm atrás e a ponta dos dedos %.0f mm à frente) em t=0/0,5/1 "
          "com a carga %s × o corpo" % (BORDA * 1000, (m0[1] - y_dedos) * 1000, "/".join("%g" % c_ for c_ in CARGAS)), flush=True)
    for lin in LINHAS_SONDA:
        q = [na_linha(t, float(m0[1]) + lin) for t in (0.0, 0.5, 1.0)]
        zb = [no_corpo(*v)(B0)[2] for v in q]
        cms = " | ".join("carga %g: %s" % (c_, "/".join("%+.0f" % ((m0[1] - centro(*v, carga=c_)[1]) * 1000) for v in q))
                         for c_ in CARGAS)
        print("   linha %+4.0f mm | ψ %s | barra sobe %.0f mm | %s" % (lin * 1000, "/".join("%+.2f" % v[0] for v in q),
                                                                     (zb[2] - zb[0]) * 1000, cms), flush=True)

    # ── 5) o Smith em volta do corpo: trilhos na linha da barra, curso de embaixo até em cima ────────────────────────────────────────
    psi0, phi0, sobe0 = posar_quadro(0.0)
    z_baixo = eixo_da_barra(psi0).z
    psi1, phi1, sobe1 = posar_quadro(1.0)
    z_cima = eixo_da_barra(psi1).z
    sm = e3.smith("smith", y=Y_BARRA, z=z_baixo, curso=(z_baixo - 0.002, z_cima + 0.002))
    print("SMITH | linha da barra y %.4f (%.0f mm atrás da base dos dedos, %.0f mm à frente da borda do step) | barra embaixo z %.4f, "
          "em cima z %.4f (curso %.0f mm) | ψ %.2f° → %.2f° | corpo sobe em cima %.1f mm" % (
              Y_BARRA, LINHA * 1000, (y_borda - Y_BARRA) * 1000, z_baixo, z_cima, (z_cima - z_baixo) * 1000, psi0, psi1,
              sobe1 * 1000), flush=True)

    # malhas do step (pro calcanhar × step)
    malhas_step = []
    for ob in ck._malhas(st):
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

    def pose(t):
        """t=0 calcanhares embaixo (alongado), t=1 na ponta dos pés (flexão plantar)."""
        psi, phi, sobe = posar_quadro(t)
        c = eixo_da_barra(psi)
        sm.mover(c.z)                  # a barra do Smith anda junto, só na vertical
        maos_na_barra(psi, Vector((0.0, Y_BARRA, c.z)))
        pose.estado = (psi, phi, sobe * 1000, (c.y - Y_BARRA) * 1000)

    pose.estado = (0.0, 0.0, 0.0, 0.0)
    pose.dedos = dedos_info

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        cm, _, _ = cm_do_rig()
        b = sm.barra.matrix_world.to_translation()
        m = malha()
        pes = grupo(m, ("LeftFoot", "RightFoot"))
        fundo = {L: v * 1000 for L, v in fundo_dos_pes(m).items()}
        com = "/".join("%+.0f" % ((m0[1] - (cm.y + b.y * c_) / (1 + c_)) * 1000) for c_ in CARGAS)
        return ("tornozelo %s° | ψ %+.2f° φ %+.1f° (corpo sobe %.1f mm) | barra z %.4f, fora da linha %.2f mm | centro de massa à frente "
                "da base dos dedos (carga %s × o corpo) %s mm, x %+.0f mm | calcanhar (pé mais baixo) z %.3f | pé atrás da borda → step "
                "%.1f mm | ponta do pé abaixo do topo do step E %.1f D %.1f mm | joelho %.1f/%.1f° | quadril %.1f/%.1f° | tronco %.1f° | "
                "cotovelo %.0f/%.0f° | punho %.0f/%.0f° | ombro %.0f/%.0f° | polegar E %s D %s | %s" % (
                    "/".join("%.1f" % v for v in tc.tornozelo(jj)), *pose.estado[:3], b.z, pose.estado[3],
                    "/".join("%g" % c_ for c_ in CARGAS), com, cm.x * 1000, float(pes[:, 2].min()), calcanhar_no_step(pes),
                    fundo["Left"], fundo["Right"], juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"],
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"],
                    juntas["punhoD"], juntas["ombroE"], juntas["ombroD"], _tipo_polegar(dedos_info.get("Left")),
                    _tipo_polegar(dedos_info.get("Right")), maos.info()))

    # ── folgas que a checagem não mede (ela ignora o que fica DENTRO da mão e não mede peça × peça) ─────────────────────────────
    pecas_smith = [o for raiz in (sm.raizes["estrutura"], sm.raizes["barra"]) for o in ck._malhas(raiz)]

    def barra_na_cabeca(m):
        """Superfície da barra → pele da cabeça, do pescoço ACIMA da barra (a base do pescoço é o trapézio onde ela apoia) e o cabelo
        (só |x| < 0,25), em mm."""
        z = sm.barra.matrix_world.to_translation().z
        out = {}
        for nome, ossos, acima in (("cabeça", ("Head",), False), ("pescoço acima da barra", ("Neck",), True),
                                   ("trapézio/pescoço (apoio)", ("Neck", "Spine2", "LeftShoulder", "RightShoulder"), False)):
            P_ = grupo(m, ossos)
            P_ = P_[np.abs(P_[:, 0]) < 0.25]
            if acima:
                P_ = P_[P_[:, 2] > z + RAIO]
            out[nome] = float((np.hypot(P_[:, 1] - Y_BARRA, P_[:, 2] - z) - RAIO).min()) * 1000
        cab_co = ck._avaliar_simples(bon.cabelo)[0]
        cab_co = cab_co[np.abs(cab_co[:, 0]) < 0.25]
        out["cabelo"] = float((np.hypot(cab_co[:, 1] - Y_BARRA, cab_co[:, 2] - z) - RAIO).min()) * 1000
        return out

    def maos_na_barra_medidas(m):
        """Por mão: borda de dentro do carrinho − pele da mão (pelo X); pele da mão mais funda na barra (− = entrou); pele da mão a
        mais de 3,5 cm do meio da mão, ao longo da barra, mais perto dela; pele da mão → pele do ombro, pescoço e cabeça. Em mm."""
        co, _, nomes, dono = m
        z = sm.barra.matrix_world.to_translation().z
        out = {}
        resto = grupo(m, ("LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "Neck", "Head"))
        for L, s in LADOS:
            H = co[np.array([n.startswith(L + "Hand") for n in nomes] + [False])[dono]]
            rad = np.hypot(H[:, 1] - Y_BARRA, H[:, 2] - z) - RAIO
            longe = np.abs(H[:, 0] - s * GRIP_X) > 0.035
            perto_resto = resto[np.abs(resto[:, 0] - s * GRIP_X) < 0.20]
            d_resto = (float(np.min(np.linalg.norm(H[:, None, :] - perto_resto[None, ::7, :], axis=2)))
                       if len(perto_resto) else 9.0)
            out[L] = ((sm.meia - float((s * H[:, 0]).max())) * 1000, float(rad.min()) * 1000,
                      float(rad[longe].min()) * 1000 if longe.any() else 9e3, d_resto * 1000)
        return out

    def pecas_perto(m):
        """Mãos, corpo (fora as mãos) e o step × cada peça do Smith fora a barra da pegada (carrinho, tampa, gancho, luva, colar,
        anilha, presilha, trilho, trava, pino, coluna, base): a menor distância de verdade (BVH; − = dentro), em mm, e de que peça."""
        co, _, nomes, dono = m
        eh_mao = np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes] + [False])[dono]
        H, C = co[eh_mao], co[~eh_mao]
        S = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in ck._malhas(st)])
        melhor = {"mãos": (1e9, ""), "corpo": (1e9, ""), "step": (1e9, "")}
        for o in pecas_smith:
            if o.name == "smith_barra_pegada":
                continue
            eco, etri = ck._avaliar_simples(o)
            lo, hi = eco.min(axis=0), eco.max(axis=0)
            bvh = None
            for chave, P_ in (("mãos", H), ("corpo", C), ("step", S)):
                Pn = P_[((P_ >= lo - 0.05) & (P_ <= hi + 0.05)).all(axis=1)]
                if not len(Pn):             # longe (> 5 cm da caixa da peça): a distância até a caixa basta (é ≤ a de verdade)
                    gap = float(np.linalg.norm(np.maximum(0.0, np.maximum(lo[None] - P_, P_ - hi[None])), axis=1).min())
                    if gap < melhor[chave][0]:
                        melhor[chave] = (gap, o.name + " (caixa)")
                    continue
                if bvh is None:
                    bvh = BVHTree.FromPolygons([tuple(p) for p in eco], [tuple(t) for t in etri], all_triangles=True)
                for v in Pn:
                    loc, nor, idx, d = bvh.find_nearest(Vector(v))
                    if loc is None:
                        continue
                    if d < 0.01 and (Vector(v) - loc).dot(nor) < 0 and ck._dentro(bvh, Vector(v)):
                        d = -d
                    if d < melhor[chave][0]:
                        melhor[chave] = (d, o.name)
        return {k: (v[0] * 1000, v[1]) for k, v in melhor.items()}

    def travas_e_estrutura():
        """Topo das travas (z) × fundo do carrinho com a barra embaixo, e o ponto mais baixo das anilhas."""
        tr = [o for o in pecas_smith if o.name.startswith("smith_trava")]
        z_tr = max(float(ck._avaliar_simples(o)[0][:, 2].max()) for o in tr)
        car = [o for o in pecas_smith if o.name.startswith("smith_carrinho")]
        z_car = min(float(ck._avaliar_simples(o)[0][:, 2].min()) for o in car)
        an = [o for o in pecas_smith if "anilha" in o.name]
        z_an = min(float(ck._avaliar_simples(o)[0][:, 2].min()) for o in an)
        return z_tr, z_car, z_an

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
        m = malha()
        bc = barra_na_cabeca(m)
        mb = maos_na_barra_medidas(m)
        pp = pecas_perto(m)
        z_tr, z_car, z_an = travas_e_estrutura()
        print("      barra → %s | mãos E/D: → carrinho %s mm, mais funda na barra %s mm, fora da pegada %s mm, → ombro/pescoço/cabeça "
              "%s mm | peças do Smith (fora a barra da pegada): → mãos %.0f mm (%s) | → corpo %.0f mm (%s) | → step %.0f mm (%s) | "
              "travas: topo z %.4f, fundo do carrinho z %.4f (folga %.0f mm) | anilha mais baixa z %.3f" % (
                  " | ".join("%s %.1f mm" % kv for kv in bc.items()),
                  "/".join("%.0f" % mb[L][0] for L, _ in LADOS), "/".join("%+.1f" % mb[L][1] for L, _ in LADOS),
                  "/".join("%+.1f" % mb[L][2] for L, _ in LADOS), "/".join("%.0f" % mb[L][3] for L, _ in LADOS),
                  pp["mãos"][0], pp["mãos"][1], pp["corpo"][0], pp["corpo"][1], pp["step"][0], pp["step"][1],
                  z_tr, z_car, (z_car - z_tr) * 1000, z_an), flush=True)
    pose(0.0)

    bk = ck.Barra(sm.barra, raio=RAIO, meio_compr=sm.meia)
    return Cena(pose, sm.equipamentos, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, Y_BARRA, 1.0),
                camera_video=((3.3, 2.3, 1.45), (0, Y_BARRA - 0.05, 0.95), 48), info=info, apoios=sm.apoios + [st],
                afunda_apoio_mm=AFUNDA_APOIO)
