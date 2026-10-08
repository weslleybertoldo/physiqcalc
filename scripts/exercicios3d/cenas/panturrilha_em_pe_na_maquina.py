# Panturrilha em Pé na Máquina — cena da fábrica 3D (lote 6, 08/10/2026). Máquina nova: equip3d.panturrilha_em_pe (degrau solto
# equip3d.degrau_panturrilha em cima da base, torre da pilha na frente da pessoa, braço de alavanca com as 2 ombreiras e os 2 pegadores).
# t = 0 calcanhares embaixo, abaixo do degrau: tornozelo em 20° de flexão dorsal (panturrilha alongada) · t = 1 na ponta dos pés: 30°
# de flexão plantar. Técnica (ExRx, Lever Standing Calf Raise): "Place shoulders under padded lever. Position toes and balls of feet on
# calf block with arches and heels extending off. Grasp handles or sides of padded lever. Stand erect by extending hips and knees." /
# "Raise heels by extending ankles as high as possible. Lower heels by bending ankles until calves are stretched. Repeat." / "Keep knees
# straight throughout exercise or bend knees slightly only during stretch." Amplitude do tornozelo da panturrilha em pé na máquina com o
# joelho estendido de Kinoshita et al. (Front Physiol 2023, treino na máquina de pé IMH703; a legenda da figura 1 dá as posturas do
# exercício, "Postures of the standing and seated calf-raise exercises [...] during the exercises"): "with the knee joint 0° [...] and
# the ankle joint angle ranging from 20° dorsiflexed to 30° plantarflexed positions". Pés na largura do quadril, pontas pra frente
# (ACE, Calf Raises: "placing both feet approximately hip-width apart [...] with the toes pointed forward").
# Como o rig faz: em pé, os joelhos e o quadril estendidos como no repouso (perna reta), as pernas fechadas FECHA° pro meio (pés na
# largura do quadril) e os pés com a orientação do repouso (pontas pra frente); a ponta do pé fica no degrau: a articulação da base dos
# dedos (MTP, cabeça do osso ToeBase) PARADA e os dedos deitados no degrau. Pra cada ângulo do tornozelo saem 2 giros em volta do X: o
# do pé em volta da base dos dedos (o calcanhar sobe ou desce e leva o tornozelo junto) e o do corpo inteiro (rígido do tornozelo pra
# cima) em volta do tornozelo — o corpo inclina o que for preciso pros ombros ficarem embaixo das ombreiras, que andam num arco em
# volta do eixo da máquina. O eixo fica onde esse arco passa pelos ombros com o corpo SEM inclinar embaixo e em cima (o tornozelo gira
# em volta da base dos dedos e o corpo sobe e vai um pouco pra frente; o arco da alavanca de R_BRACO m acompanha): o corpo sobe e desce
# reto, inclinando só décimos de grau no meio. As ombreiras ficam em cima dos ombros (assentadas no meio do movimento, onde a alavanca
# está no meio do giro), viradas pro lado como a inclinação do ombro; as mãos fecham nos pegadores do braço (pegada neutra, palmas
# pro meio), que andam junto com ele. Tronco, cabeça, joelhos e quadril não mexem.
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

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
X = Vector((1.0, 0.0, 0.0))
Y = Vector((0.0, 1.0, 0.0))
DORSI, PLANTAR = 20.0, 30.0   # tornozelo: 20° de flexão dorsal embaixo → 30° de flexão plantar em cima, a partir do neutro (o pé
                              # chapado em pé; Kinoshita et al. 2023: "from 20° dorsiflexed to 30° plantarflexed")
FECHA = 2.0                   # pernas 2° pro meio (giro no quadril): pés na largura do quadril — com 3° as coxas musculosas já entram
                              # uma na outra (3,7 mm, sonda de 08/10/2026)
Z_DEGRAU = 0.15               # topo do degrau (escolha da fábrica): o calcanhar embaixo fica ~8 cm acima do chão
PROF_DEGRAU, LARG_DEGRAU = 0.152, 0.597   # degrau de 23,5" × 6" (Life Fitness Signature Series Plate-Loaded Standing Calf Raise:
                                          # "Footplate: Non-slip steel (23.5"L x 6"W)")
BORDA = 0.012                 # a borda de trás do degrau fica 1,2 cm atrás da base dos dedos (a cabeça dos metatarsos em cima)
AFUNDA_PE = 0.001             # a pele da ponta do pé afunda na borracha do degrau
OMB_COMP, OMB_LARG, OMB_ESP = 0.305, 0.127, 0.076   # ombreira de 12" × 5" (Hoist RPL-5405: "12" X 5" MOLDED PAD"), 3" de estofado
X_OMB = 0.15                  # meio da ombreira a 15 cm do meio do corpo: em cima do trapézio e do acrômio, longe do pescoço
AFUNDA_OMB = 0.003            # a pele do ombro afunda na ombreira (no meio do movimento, com os braços já nos pegadores)
RAIO = 0.0151                 # pegador de 1,19" = 30,2 mm (Hoist RPL-5405: "GRIP OPEN END 1.19" X 10.00" LG.")
COMP_PEGADOR = 0.254          # 10"
PEG_OFF = Vector((0.02, -0.30, -0.05))   # meio do pegador em relação à articulação do ombro (no meio do movimento): 30 cm à frente e
                                         # 5 cm abaixo dela, um pouco por fora (escolha da fábrica: cotovelo dobrado ~120° embaixo do ombro)
PEG_DIR = Vector((0.0, -0.59, -0.81))    # o pegador desce pra frente, ⟂ ao antebraço (punho reto na pegada neutra)
R_BRACO = 1.0                 # do eixo da máquina até os ombros (escolha da fábrica; o SelectEDGE da Legend tem braço de 53½")
TORRE_PROF, TORRE_LARG = 0.40, 0.50


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


def _orientacao(f, u, s):
    """Pegada neutra no pegador de eixo u: os dedos na direção do antebraço f (⟂ a u), a palma ⟂ aos dois, virada pro meio."""
    dq = (f - u * f.dot(u)).normalized()
    pq = u.cross(dq).normalized()
    if pq.x * s > 0:
        pq = -pq
    return dq, pq


def bracos_nos_alvos(maos, alvos, acertar=False):
    """Cada mão com o vão no centro g do pegador de eixo u (alvos = {s: (g, u)}): IK do braço com o cotovelo embaixo do ombro; 1ª
    volta com o antebraço saindo de um cotovelo chutado, 2ª com os dedos na linha do antebraço que o IK deu."""
    rig = maos.rig
    for L, s in LADOS:
        g, u = alvos[s]
        sh = p3.cabeca(rig, L + "Arm")
        polo = sh + Vector((s * 0.30, 0.25, -0.60))         # cotovelo pra baixo, pra trás e um pouco pra fora
        f = (g - (sh + Vector((s * 0.02, -0.02, -0.25)))).normalized()
        for _ in range(2):
            dq, pq = _orientacao(f, u, s)
            maos.segurar(L, g, dq, pq, polo=polo)
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, g, dq, pq, polo=polo)
            f = (p3.cabeca(rig, L + "Hand") - p3.cabeca(rig, L + "ForeArm")).normalized()


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    pg.usar_cilindro(2000 * RAIO)     # mão de referência de um cilindro de 30,2 mm
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    # ── 1) base: as pernas fecham FECHA° (giro em volta do Y no quadril) e o pé volta pra orientação do repouso (sola chapada, ponta pra
    #    frente); o corpo sobe até a sola embaixo da base dos dedos ficar no topo do degrau ─────────────────────────────────────────────
    PERNA = [L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase")]
    for L, s in LADOS:
        Rf = PB[p3.P + L + "Foot"].matrix.to_3x3().copy()
        p3.girar_osso(rig, L + "UpLeg", Matrix.Rotation(math.radians(s * FECHA), 3, Y))
        Ra = PB[p3.P + L + "Foot"].matrix.to_3x3()
        p3.girar_osso(rig, L + "Foot", Rf @ Ra.inverted())
    P = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    m_y = cab("LeftToeBase").y
    frente = P[P[:, 1] < m_y + BORDA]                       # a parte do pé que fica em cima do degrau
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0.0, 0.0, Z_DEGRAU - AFUNDA_PE - float(frente[:, 2].min()))))
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in ["Hips"] + PERNA}
    jb = ck.posicoes(rig)
    TAU0 = sum(tc.tornozelo(jb)) / 2                        # o tornozelo neutro (pé chapado, em pé), ~76°
    a0, m0, k0 = (np.array(cab("Left" + o)) for o in ("Foot", "ToeBase", "Leg"))
    y_borda = float(m0[1]) + BORDA
    sh0 = np.array(cab("LeftArm"))
    G = pele(("LeftShoulder", "LeftArm", "Spine2", "Neck"))  # o topo do ombro esquerdo na linha da ombreira (a referência do encaixe)
    perto = G[np.abs(G[:, 0] - X_OMB) < 0.008]
    S0 = perto[int(np.argmax(perto[:, 2]))].copy()
    print("BASE | tornozelo neutro %.2f° | tornozelo y %.4f z %.4f | base dos dedos y %.4f z %.4f | borda do degrau y %.4f | topo do "
          "ombro (x %.2f) y %.4f z %.4f | pes_base_lateral %.2f" % (TAU0, a0[1], a0[2], m0[1], m0[2], y_borda, X_OMB, S0[1], S0[2],
                                                                   tc.pes_base_lateral(jb)[0]), flush=True)

    # ── 2) cinemática (conta pura, sem o rig): ψ = corpo inclinado pra frente em volta do tornozelo; φ = pé girado em volta da base dos
    #    dedos (+ = calcanhar subindo). Tornozelo (canela × pé) = ângulo entre Rx(ψ)(tornozelo − joelho) e Rx(φ)(base dos dedos −
    #    tornozelo); o tornozelo vai pra A(φ) = M + Rx(φ)(A0 − M); um ponto do corpo vai pra A(φ) + Rx(ψ)(P0 − A0) ────────────────────
    vs, vf = a0 - k0, m0 - a0

    def tau(psi, phi):
        return _ang(_rx(psi) @ vs, _rx(phi) @ vf)

    def phi_de(psi, alvo):
        return _bissec(lambda f: tau(psi, f) - alvo, -60.0, 75.0)

    def ombro(psi, phi):
        A = m0 + _rx(phi) @ (a0 - m0)
        return A + _rx(psi) @ (S0 - a0)

    def alvo_tau(t):
        return p3.lerp(TAU0 + DORSI, TAU0 - PLANTAR, t)

    # o eixo: na mediatriz da corda entre os ombros embaixo e em cima (corpo sem inclinar), R_BRACO pra frente e pra baixo
    Sb, Sc = ombro(0.0, phi_de(0.0, alvo_tau(0.0))), ombro(0.0, phi_de(0.0, alvo_tau(1.0)))
    corda = (Sc - Sb)[1:]
    meio = (Sb + Sc)[1:] / 2
    nrm = np.array([corda[1], -corda[0]]) / np.linalg.norm(corda)
    if nrm[0] > 0:
        nrm = -nrm                                          # pra frente (−Y)
    EIXO = meio + nrm * math.sqrt(R_BRACO ** 2 - float(corda @ corda) / 4)
    R2 = float(np.sum((Sb[1:] - EIXO) ** 2))

    def cinematica(t):
        """(ψ, φ, β) do quadro t: β = ângulo (graus) do ombro em volta do eixo, a partir do +Y (sobe = aumenta)."""
        alvo = alvo_tau(t)

        def g(psi):
            S = ombro(psi, phi_de(psi, alvo))
            return float(np.sum((S[1:] - EIXO) ** 2)) - R2

        psi = _bissec(g, -6.0, 6.0) if g(-6.0) * g(6.0) < 0 else 0.0
        phi = phi_de(psi, alvo)
        S = ombro(psi, phi)
        return psi, phi, math.degrees(math.atan2(S[2] - EIXO[1], S[1] - EIXO[0]))

    TAB = {k: cinematica(k / 8) for k in range(9)}
    BETA0 = TAB[0][2]
    print("EIXO | y %.4f z %.4f | raio %.3f m | corda dos ombros %.1f mm a %.1f° da vertical | ombros embaixo y %.4f z %.4f, em cima y "
          "%.4f z %.4f" % (EIXO[0], EIXO[1], math.sqrt(R2), np.linalg.norm(corda) * 1000,
                           math.degrees(math.atan2(-corda[0], corda[1])), Sb[1], Sb[2], Sc[1], Sc[2]), flush=True)
    print("CINEMÁTICA | %s" % " ".join("t%.3f ψ%+.2f φ%+.1f braço%+.2f" % (k / 8, v[0], v[1], v[2] - BETA0) for k, v in TAB.items()),
          flush=True)

    def posar(psi, phi):
        """Corpo inclinado ψ graus pra frente em volta do tornozelo e pé girado φ graus (calcanhar subindo) em volta da base dos dedos,
        que fica parada; os dedos ficam deitados no degrau."""
        for n, Mb in base.items():
            PB[p3.P + n].matrix_basis = Mb.copy()
        p3.atualizar()
        A = Vector(m0 + _rx(phi) @ (a0 - m0))
        p3.girar_osso(rig, "Hips", Matrix.Rotation(math.radians(psi), 3, X), pivo=Vector(a0), mover=A - Vector(a0))
        for L, _ in LADOS:
            p3.girar_osso(rig, L + "Foot", Matrix.Rotation(math.radians(phi - psi), 3, X))
            p3.girar_osso(rig, L + "ToeBase", Matrix.Rotation(math.radians(-phi), 3, X))

    # ── 3) pegador e ombreira assentados no MEIO do movimento (a alavanca no meio do giro), levados de volta pra montagem (t = 0). As
    #    mãos vão pro pegador ANTES de assentar a ombreira: o braço posado muda a pele do topo do ombro (com os braços do repouso a
    #    ombreira ficava ~6 mm mais baixa e entrava 8–9 mm no ombro) ──────────────────────────────────────────────────────────────────
    psi_m, phi_m, beta_m = cinematica(0.5)
    posar(psi_m, phi_m)
    g_m = cab("LeftArm") + PEG_OFF
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    alvos_m = {s: (Vector((s * g_m.x, g_m.y, g_m.z)), Vector((s * PEG_DIR.x, PEG_DIR.y, PEG_DIR.z)).normalized()) for _, s in LADOS}
    bracos_nos_alvos(maos, alvos_m, acertar=True)
    G = pele(("LeftShoulder", "LeftArm", "Spine2", "Neck"))
    perto = G[np.abs(G[:, 0] - X_OMB) < 0.008]
    topo = perto[int(np.argmax(perto[:, 2]))]
    c0 = Vector((X_OMB, float(topo[1]), float(topo[2])))
    melhor = None
    for k in range(0, 41):                                  # inclinação da ombreira pro lado (graus): a face assenta nos 2 lados
        a = math.radians(k)
        n = Vector((math.sin(a), 0.0, math.cos(a)))
        w = Y.cross(n)
        rel = G - np.array(c0)
        sw, su, sn = rel @ np.array(w), rel @ np.array(Y), rel @ np.array(n)
        dentro = (np.abs(sw) < OMB_LARG / 2 - 0.012) & (np.abs(su) < OMB_COMP / 2 - 0.012)
        h = float(sn[dentro].max())
        folga = h - sn[dentro]
        lados = [folga[sw[dentro] < -0.02], folga[sw[dentro] > 0.02]]
        if min(len(f) for f in lados) < 5:
            continue
        ruim = max(float(np.percentile(f, 3)) for f in lados)
        if melhor is None or ruim < melhor[0]:
            melhor = (ruim, k, h, n)
    _, k_omb, h, n_m = melhor
    c_m = c0 + n_m * (h - AFUNDA_OMB)
    print("OMBREIRA | inclinada %d° pro lado | face de baixo no meio do movimento (%.4f %.4f %.4f) | folga dos 2 lados %.1f mm | "
          "pegador no meio (%.4f %.4f %.4f)" % (k_omb, *c_m, melhor[0] * 1000, *g_m), flush=True)
    Rv = Matrix.Rotation(math.radians(BETA0 - beta_m), 3, X)          # do meio pra montagem: gira em volta do eixo
    E3 = Vector((0.0, EIXO[0], EIXO[1]))

    def na_montagem(p):
        return E3 + Rv @ (Vector(p) - E3)

    # ── 4) a máquina em volta do corpo (montada no começo, t = 0) ─────────────────────────────────────────────────────────────────
    mq = e3.panturrilha_em_pe("panturrilha_pe", eixo=(EIXO[0], EIXO[1]),
                              ombreiras=(na_montagem(c_m), Rv @ n_m, (OMB_COMP, OMB_LARG, OMB_ESP)),
                              pegadores=(na_montagem(g_m), Rv @ PEG_DIR.normalized(), COMP_PEGADOR, RAIO),
                              degrau=(y_borda, Z_DEGRAU, PROF_DEGRAU, LARG_DEGRAU),
                              torre=(EIXO[0] - TORRE_PROF + 0.06, EIXO[0] + 0.06, TORRE_LARG))

    # ── 5) mãos nos pegadores (pegada neutra: palmas pro meio, os dedos na linha do antebraço, punho reto) — "Grasp handles or sides of
    #    padded lever" (ExRx) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
    def maos_no_pegador(t, acertar=False):
        bracos_nos_alvos(maos, {s: mq.pegada(s) for _, s in LADOS}, acertar=acertar)
        for L, s in LADOS:                                  # dedos e polegar fecham até a pele encostar no pegador
            g, u = mq.pegada(s)
            antes = pose.ultimo[L][0] if (t > 0 and L in pose.ultimo) else None
            angs = pg.fechar_em_volta(bon, L, g, u, RAIO, polegar_antes=antes)
            th = angs.get("Thumb")
            pol = [p3.P + L + "HandThumb%d" % i for i in (1, 2, 3)]
            if isinstance(th, tuple) and th and th[0] == "volta" and th[-1]:
                pose.ultimo[L] = (th, [PB[o].matrix_basis.copy() for o in pol])
            elif L in pose.ultimo:
                for o, M_ in zip(pol, pose.ultimo[L][1]):
                    PB[o].matrix_basis = M_.copy()
                p3.atualizar()
                angs["Thumb"] = pose.ultimo[L][0]
                print("POLEGAR %s t=%.3f: sem postura nova viável, ficou o do último quadro bom" % (L, t), flush=True)
            pose.dedos[L] = angs

    def pose(t):
        """t=0 calcanhares embaixo (alongado), t=1 na ponta dos pés (flexão plantar)."""
        psi, phi, beta = cinematica(t)
        posar(psi, phi)
        mq.girar(beta - BETA0)
        maos_no_pegador(t)
        pose.estado = (psi, phi, beta - BETA0)

    pose.dedos = {}
    pose.ultimo = {}
    pose.estado = (0.0, 0.0, 0.0)
    posar(*TAB[0][:2])
    mq.girar(0.0)
    maos_no_pegador(0.0, acertar=True)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        pes = pele(("LeftFoot", "RightFoot"))
        pol = "/".join("volta" if (isinstance(pose.dedos.get(L, {}).get("Thumb"), tuple)
                                   and pose.dedos[L]["Thumb"][0] == "volta") else "antigo" for L, _ in LADOS)
        return ("tornozelo %s° | ψ %+.2f° φ %+.1f° | braço da máquina %+.2f° | calcanhar (pé mais baixo) z %.3f | joelho %.1f/%.1f° | "
                "quadril %.1f/%.1f° | tronco %.1f° | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | punho_flexao %s | palma pra dentro %s° | "
                "polegar %s | %s" % (
                    "/".join("%.1f" % v for v in tc.tornozelo(jj)), *pose.estado, float(pes[:, 2].min()), juntas["joelhoE"],
                    juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"], ck.angulo_chave(rig, {"medida": "tronco"})[0],
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)), pol,
                    maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yc = float(EIXO[0]) / 2
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yc, 0.9),
                camera_video=((3.3, 2.3, 1.45), (0, -0.2, 0.95), 48), info=info, apoios=mq.apoios, afunda_apoio_mm=15)
