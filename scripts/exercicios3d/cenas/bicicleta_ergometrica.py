# Bicicleta Ergométrica — cena da fábrica 3D (lote 14, 12/10/2026). CARDIO na bicicleta ergométrica VERTICAL de academia (e3.bicicleta,
# peça nova; a reclinada é outro aparelho). O 1º exercício SENTADO num aparelho cíclico.
# CÍCLICO, como a Corrida e a Caminhada na Esteira: t = 0 → 1 é UMA volta do pedivela e a pose em t = 1 é IGUAL à de t = 0 (a ficha tem
# "ciclo": true e o app repete o clipe). t = 0 = pedivela DIREITO em cima (o esquerdo embaixo); t = 0,25 = direito na frente (3 h);
# t = 0,5 = direito embaixo; t = 0,75 = direito atrás. Cadência de 70 rpm: 1 volta = 0,857 s (= ida_s da ficha).
# Técnica (só o que foi lido):
#  · Altura do selim: o joelho a 38° com o pedal embaixo, PEDALANDO (Bini & Hume 2016, Hum Mov 17(1):36-42, Tabela 2, 30 ciclistas: 6 h
#    "Knee angle" 30 parado (S) × 38 pedalando (D); "Differences between static and dynamic angles were large at the 6 o’clock crank
#    position with greater mean hip angle (4.9 ± 3°), smaller knee angle (8.2 ± 5°)" parado). É a regulagem "25-30°" de Bini, Hume &
#    Croft 2011 (Sports Med 41(6):463-476), medida PARADO ("the knee angle flexed when the pedal is at the bottom dead centre and the
#    cyclist is seated on the saddle"), dentro do "33° to 43° at low intensity" de Swart & Holliday 2019 (medida pedalando).
#  · Recuo do selim: o joelho em cima do eixo do pedal com o pedivela na frente (HSS: "imagine there's a straight line from your front
#    knee right down to the middle of the pedal, which should be right in line with the ball of your foot"; Precor UBK 835: "knee over
#    pedal spindle geometry"; Tang 2022: KFOF "the vertical projection distance of the knee joint to the fifth metatarsal head at 90° of
#    the pedaling cycle", 0 mm). O selim fica nivelado (ACSM: "Adjust the saddle so that it is level with the floor").
#  · Pé: a bola do pé (base dos dedos) em cima do eixo do pedal (HSS) e o tornozelo mexendo de 2° de flexão plantar a 22° de dorsiflexão
#    (Ericson, Nisell & Németh 1988, JOSPT 9(8):273-278, ERGÔMETRO: "the ankle ROM was 24 degrees ranging from 2 degrees plantarflexion to
#    22 degrees dorsiflexion"): a dorsiflexão máxima no alto e a flexão plantar máxima embaixo (Bini & Hume 2016: o tornozelo mais em
#    flexão plantar a 6 h do que a 3 h, pedalando) — o pedal gira junto, seguindo a sola.
#  · Tronco um pouco inclinado à frente com a coluna neutra e as mãos no guidão com os cotovelos levemente dobrados (HSS: "hinge forward
#    slightly with your spine neutral"; "Your elbows should be slightly bent"); pegada pronada na barra de cima do guidão ("cruising").
#  · Quadril parado no selim: a pelve não mexe; só as pernas pedalam (o joelho anda no plano da perna, sem bater em nada).
# Como o rig faz: a pelve (osso Hips) inclina INCLINA_PELVE graus à frente em volta das articulações do quadril e o tórax mais um pouco;
# a geometria da perna é resolvida aqui mesmo (montar): onde o quadril fica em relação ao eixo do pedivela pra o joelho dar JOELHO_BDC
# embaixo e ficar em cima do eixo do pedal na frente; em cada quadro a bola do pé fica no pedal (o pé preso nele, o ângulo do pé tal que
# o tornozelo siga a curva de dorsiflexão) e a perna vai por IK até o tornozelo (o joelho no plano quadril–tornozelo–frente). Braços e
# mãos ficam parados no guidão a volta toda (postos uma vez). A bicicleta é montada em volta do corpo: o selim embaixo do glúteo, o
# eixo do pedivela onde os pés alcançam, o guidão onde as mãos ficam.
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

LADOS = (("Left", 1), ("Right", -1))      # s = +1 esquerdo (+X)
CADENCIA = 70.0           # rpm (Marsh & Martin 1997: destreinados de ~80 a 65 rpm; Bini 2011 cita estudos a 70 rpm)
T = 60.0 / CADENCIA       # s por volta (= ida_s)
Z_EIXO = 0.29             # eixo do pedivela acima do chão (escolha da fábrica: o pedal embaixo fica a ~12 cm do chão)
PEDIVELA = 0.165          # Life Fitness Integrity: "Crank size 165mm (6.5")"
Q = 0.175                 # Matrix Performance Upright Cycle: "PEDAL SPACING 17.5 cm / 6.9”" (entre as faces de fora dos pedivelas)
PEDAL = (0.167, 0.140, 0.030)   # Life Fitness: "Pedal size 6.56" x 5.5" (16.7 cm x 14 cm)" (+ 30 mm de espessura, escolha da fábrica)
FOLGA_PEDAL = 0.012       # do pedivela ao corpo do pedal
X_PEDAL = Q / 2 + FOLGA_PEDAL + PEDAL[1] / 2
TOPO_PEDAL = PEDAL[2] / 2
JOELHO_BDC = 38.0         # flexão do joelho com o pedal embaixo, pedalando (Bini & Hume 2016: 38 pedalando)
KFOF = 0.0                # joelho em cima do eixo do pedal com o pedivela na frente (m; + = joelho à frente)
DF_MEIO, DF_AMP = 10.0, 12.0    # dorsiflexão do tornozelo: 10 + 12·cos(θ) → de −2° (flexão plantar, embaixo) a 22° (em cima)
INCLINA_PELVE = 14.0      # pelve inclinada à frente (graus)
INCLINA_TORAX = (2.0, 2.5)      # Spine e Spine1 a mais (graus): tronco ~17° à frente, coluna neutra
CABECA = (-4.0, -6.0)     # Neck e Head pra trás (graus): olhando pra frente e um pouco pra baixo, pro painel
BRACO_DESCE = 40.0        # linha ombro → mão abaixo da horizontal (graus): mãos na altura do fim do peito, guidão perto
COTOVELO = 25.0           # cotovelos levemente dobrados (graus)
X_MAO = 0.225             # mãos a ±22,5 cm do meio (um pouco por fora dos ombros: o braço não encosta no tronco)
RAIO_MANOPLA = 0.016      # manopla de 32 mm (escolha da fábrica)
AFUNDA_SELIM = 0.0015     # a pele do glúteo afunda no estofado do selim (no quadro em que ela fica mais alta)
SELIM_FORMA = (0.20, 0.06, 0.038, 0.012, 0.012)   # largura atrás, do bico, espessura, queda do bico, abaulado (escolha da fábrica): o
                          # estofado de 38 mm — a coxa grossa do boneco, esticada embaixo, passa por baixo do glúteo e entra no estofado
                          # (a espuma de verdade cede); com 38 mm nada da pele fica a mais de 19 mm dentro dele
AFUNDA_PE = 0.0008        # a sola afunda na borracha do pedal
ALCA = dict(y=0.012, largura=0.035, espessura=0.003, folga=0.0015)    # alça do pedal por cima dos metatarsos (logo atrás da bola do pé)


def _ang(a, b):
    c = a.normalized().dot(b.normalized())
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def df_alvo(th):
    """Dorsiflexão do tornozelo (graus, + = dorsiflexão) com o pedivela da perna em `th` graus (0 = em cima)."""
    return DF_MEIO + DF_AMP * math.cos(math.radians(th))


def centro_pedal(s, th_D):
    """Centro do eixo do pedal do lado s com o pedivela direito em th_D (a mesma conta do e3.Bicicleta.pedal)."""
    g = math.radians(th_D)
    k = -1.0 if s > 0 else 1.0
    return Vector((s * X_PEDAL, -k * PEDIVELA * math.sin(g), Z_EIXO + k * PEDIVELA * math.cos(g)))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na manopla (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO_MANOPLA * 2000)   # mão de referência de um cilindro de 32 mm (antes do Maos)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    # ── 1) medidas do boneco em repouso ────────────────────────────────────────────────────────────────────────────────────────────
    L1 = (bon.cabeca_osso("LeftLeg") - bon.cabeca_osso("LeftUpLeg")).length
    L2 = (bon.cabeca_osso("LeftFoot") - bon.cabeca_osso("LeftLeg")).length
    quadris0 = {L: bon.cabeca_osso(L + "UpLeg") for L, _ in LADOS}
    M0 = (quadris0["Left"] + quadris0["Right"]) / 2
    X_H = (quadris0["Left"] - quadris0["Right"]).length / 2
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    A0, T0, mtp_local = {}, {}, {}
    for L, s in LADOS:
        A0[L], T0[L] = bon.cabeca_osso(L + "Foot"), bon.cabeca_osso(L + "ToeBase")
        m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
        P = co0[m]
        fatia = P[np.abs(P[:, 1] - T0[L].y) < 0.006]
        xc = float(fatia[:, 0].min() + fatia[:, 0].max()) / 2           # meio do pé na base dos dedos
        sobre = P[np.abs(P[:, 1] - T0[L].y) < PEDAL[0] / 2]             # o que fica em cima do pedal
        h_sola = T0[L].z - float(sobre[:, 2].min())                      # base dos dedos acima da sola
        mtp_local[L] = Vector((T0[L].x - xc, 0.0, TOPO_PEDAL + h_sola - AFUNDA_PE))   # base dos dedos no referencial do pedal
    K0 = bon.cabeca_osso("LeftLeg")
    TORN0 = _ang(A0["Left"] - K0, T0["Left"] - A0["Left"])              # canela × pé no repouso (~76°: tornozelo neutro)
    print("BONECO coxa %.4f canela %.4f quadris ±%.4f | base dos dedos no pedal %s | tornozelo neutro %.1f°" % (
        L1, L2, X_H, " ".join("%s (%.4f %.4f %.4f)" % (L[0], *mtp_local[L]) for L, _ in LADOS), TORN0), flush=True)

    def pe(L, s, th_D, phi):
        """Pé do lado L no pedal (pedivela direito em th_D, pé girado phi graus com a ponta pra baixo): tornozelo, base dos dedos,
        giro do pé (3x3, no mundo)."""
        R = Matrix.Rotation(math.radians(phi), 3, "X")
        mtp = centro_pedal(s, th_D) + R @ mtp_local[L]
        return mtp + R @ (A0[L] - T0[L]), mtp, R

    def joelho(H, A):
        """Joelho (mundo) da perna com o quadril em H e o tornozelo em A, no plano que contém H, A e a frente (−Y)."""
        d = A - H
        dl = min(d.length, L1 + L2 - 1e-6)
        u = d.normalized()
        f = Vector((0.0, -1.0, 0.0))
        w = (f - u * f.dot(u)).normalized()
        ca = (L1 * L1 + dl * dl - L2 * L2) / (2 * L1 * dl)
        a = math.acos(max(-1.0, min(1.0, ca)))
        return H + (u * math.cos(a) + w * math.sin(a)) * L1

    def perna(H, L, s, th_D, phi):
        A, mtp, R = pe(L, s, th_D, phi)
        K = joelho(H, A)
        return dict(A=A, mtp=mtp, R=R, K=K, flex=_ang(K - H, A - K), df=_ang(A - K, mtp - A) - TORN0)

    def phi_para(H, L, s, th_D):
        """Giro do pé (graus, ponta pra baixo) que dá a dorsiflexão da curva com o pedivela da perna em th_D (+180 no esquerdo)."""
        alvo = df_alvo(th_D if s < 0 else th_D + 180.0)
        lo, hi = -40.0, 75.0                                   # mais ponta pra baixo = menos dorsiflexão
        for _ in range(40):
            m = (lo + hi) / 2
            if perna(H, L, s, th_D, m)["df"] > alvo:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    # ── 2) onde fica o quadril em relação ao eixo do pedivela (perna esquerda; a direita é o espelho) ────────────────────────────────────
    def quadril(yh, zh):
        return Vector((X_H, yh, zh))

    def z_para(yh):
        lo, hi = Z_EIXO + 0.55, Z_EIXO + 0.95                  # mais alto = joelho mais esticado embaixo
        for _ in range(36):
            m = (lo + hi) / 2
            H = quadril(yh, m)
            th = 0.0                                            # esquerdo embaixo com o direito em cima
            if perna(H, "Left", 1, th, phi_para(H, "Left", 1, th))["flex"] > JOELHO_BDC:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    lo, hi = 0.0, 0.40                                         # mais pra trás = joelho mais atrás do eixo do pedal na frente
    for _ in range(36):
        yh = (lo + hi) / 2
        H = quadril(yh, z_para(yh))
        th = 270.0                                             # esquerdo na frente com o direito atrás
        e = perna(H, "Left", 1, th, phi_para(H, "Left", 1, th))
        if centro_pedal(1, th).y - e["K"].y > KFOF:            # joelho à frente do eixo além do KFOF: quadril mais pra trás
            lo = yh
        else:
            hi = yh
    Y_Q = (lo + hi) / 2
    Z_Q = z_para(Y_Q)
    H_mundo = {L: Vector((s * X_H, Y_Q, Z_Q)) for L, s in LADOS}
    print("QUADRIL %.4f m atrás e %.4f m acima do eixo do pedivela (joelho %.0f° embaixo, KFOF %.0f mm)" % (
        Y_Q, Z_Q - Z_EIXO, JOELHO_BDC, KFOF * 1000), flush=True)

    # ── 3) pelve, tronco e cabeça (parados a volta toda) ──────────────────────────────────────────────────────────────────────────────
    M_alvo = Vector((0.0, Y_Q, Z_Q))
    p3.girar_osso(rig, "Hips", Matrix.Rotation(math.radians(INCLINA_PELVE), 3, "X"), pivo=M0, mover=M_alvo - M0)
    for n, g in zip(("Spine", "Spine1"), INCLINA_TORAX):
        p3.girar_osso(rig, n, Matrix.Rotation(math.radians(g), 3, "X"))
    for n, g in zip(("Neck", "Head"), CABECA):
        p3.girar_osso(rig, n, Matrix.Rotation(math.radians(g), 3, "X"))
    for L, s in LADOS:
        print("QUADRIL %s no lugar: (%.4f %.4f %.4f) — queria (%.4f %.4f %.4f)" % (L[0], *c(L + "UpLeg"), *H_mundo[L]), flush=True)

    # ── 4) pernas por IK (alvos nascem no tornozelo de repouso, polos bem à frente), pé e dedos com o giro posto em cada quadro ─────────
    alvos, polos, iks, rot_pe, rot_dedos = {}, {}, {}, {}, {}
    for L, s in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))
        polos[L] = p3.vazio("polo_joelho_" + L, (s * 0.13, -1.6, 0.8))
        iks[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        rot_pe[L] = p3.travar_rotacao(rig, L + "Foot")
        rot_dedos[L] = p3.travar_rotacao(rig, L + "ToeBase")
    M_pe0 = {L: rot_pe[L].matrix_world.copy() for L, _ in LADOS}
    M_dedos0 = {L: rot_dedos[L].matrix_world.copy() for L, _ in LADOS}
    estado = {"t": 0.0, "phi": {1: 0.0, -1: 0.0}, "perna": {}}

    def pernas(t):
        th_D = 360.0 * t
        for L, s in LADOS:
            H = H_mundo[L]
            phi = phi_para(H, L, s, th_D)
            e = perna(H, L, s, th_D, phi)
            alvos[L].location = e["A"]
            rot_pe[L].matrix_world = e["R"].to_4x4() @ M_pe0[L]
            rot_dedos[L].matrix_world = e["R"].to_4x4() @ M_dedos0[L]
            polos[L].location = (H + e["A"]) / 2 + Vector((0.0, -1.5, 0.0))
            estado["phi"][s] = phi
            estado["perna"][L] = e
        p3.atualizar()
        return th_D

    # pole_angle de cada joelho: o que deixa o joelho no plano (quadril, tornozelo, polo), de 5 em 5° e depois de 0,25 em 0,25°
    for L, s in LADOS:
        pernas(0.25 if s < 0 else 0.75)                        # a perna na frente (3 h)
        e = p3.acertar_polo(rig, iks[L], L + "Leg", L + "UpLeg", L + "Foot")
        melhor = None
        for k in range(-20, 21):
            iks[L].pole_angle = math.radians(e[1] + 0.25 * k)
            p3.atualizar()
            d = (c(L + "Leg") - estado["perna"][L]["K"]).length
            if melhor is None or d < melhor[0]:
                melhor = (d, e[1] + 0.25 * k)
        iks[L].pole_angle = math.radians(melhor[1])
        p3.atualizar()
        print("POLO joelho %s: %.2f° (joelho a %.1f mm do da conta)" % (L, melhor[1], melhor[0] * 1000), flush=True)

    # ── 5) mãos no guidão: pegada pronada na barra de cima, cotovelos levemente dobrados (postas uma vez) ────────────────────────────────
    maos = Maos(bon, RAIO_MANOPLA, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    X = Vector((1.0, 0.0, 0.0))
    S = {L: c(L + "Arm") for L, _ in LADOS}
    b = math.radians(BRACO_DESCE)
    alc = {"r": (S["Left"] - c("LeftForeArm")).length + (c("LeftForeArm") - c("LeftHand")).length + maos.palma * 0.92}

    def ponto(L, s):
        """Eixo da manopla do lado L: a ±X_MAO, na linha que desce BRACO_DESCE graus do ombro (alcance alc["r"] no plano YZ)."""
        Sm = (S["Left"] + S["Right"]) / 2
        return Vector((s * X_MAO, Sm.y - alc["r"] * math.cos(b), Sm.z - alc["r"] * math.sin(b)))

    polo_certo = {}

    def pegar():
        for L, s in LADOS:
            for n in (L + "Arm", L + "ForeArm", L + "Hand"):    # braço, antebraço e mão começam do repouso em toda pegada
                PB[p3.P + n].matrix_basis = Matrix.Identity(4)
            p3.atualizar()
            g = ponto(L, s)
            polo = S[L] + Vector((s * 0.55, 0.05, -0.40))     # cotovelo pra fora e pra baixo
            f = (g - (S[L] + Vector((s * 0.04, -0.20, -0.18)))).normalized()   # 1ª volta: antebraço vindo de um cotovelo baixo
            for _ in range(2):
                dq = (f - X * f.dot(X)).normalized()
                pq = X.cross(dq).normalized()
                if pq.z > 0:
                    pq = -pq
                maos.segurar(L, g, dq, pq, polo=polo, alinhar=0.3)
                if L not in polo_certo:                         # pole_angle de cada braço (os ossos dos 2 lados não são espelhados)
                    maos.iks[L].mute = False
                    polo_certo[L] = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                    maos.segurar(L, g, dq, pq, polo=polo, alinhar=0.3)
                f = (c(L + "Hand") - c(L + "ForeArm")).normalized()

    lo_r, hi_r = alc["r"] - 0.12, alc["r"] + 0.005            # mais alcance = cotovelo mais esticado
    for _ in range(14):
        alc["r"] = (lo_r + hi_r) / 2
        pegar()
        cot = ck.medir_juntas(rig)["cotoveloE"]
        if cot > COTOVELO:
            lo_r = alc["r"]
        else:
            hi_r = alc["r"]
    alc["r"] = (lo_r + hi_r) / 2
    pegar()
    dedos = {}
    for L, s in LADOS:                                          # dedos e polegar fecham até a pele encostar na manopla
        dedos[L] = pg.fechar_em_volta(bon, L, ponto(L, s), X, RAIO_MANOPLA)
    G = ponto("Left", 1)
    jj = ck.medir_juntas(rig)
    print("GUIDÃO manoplas em y %.4f z %.4f (±%.3f) | alcance %.4f | cotovelo %.1f/%.1f° | punho %.1f/%.1f° | %s | polegar %s" % (
        G.y, G.z, X_MAO, alc["r"], jj["cotoveloE"], jj["cotoveloD"], jj["punhoE"], jj["punhoD"], maos.info(),
        "/".join(str(dedos[L].get("Thumb", "?"))[:40] for L, _ in LADOS)), flush=True)

    # ── 6) selim embaixo do glúteo: largo atrás (embaixo dos ísquios), topo nivelado e abaulado na altura da pele mais baixa do glúteo;
    #    estofado fino (SELIM_FORMA): a coxa grossa do boneco passa por dentro dele quando estica embaixo ─────────────────────────────
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    mh = np.array([n == "Hips" for n in nomes] + [False])[dono]
    Pq = co[mh & (np.abs(co[:, 0]) < 0.09)]
    baixo = Pq[np.argsort(Pq[:, 2])[:40]]
    y_isq = float(baixo[:, 1].mean())
    y_tras = y_isq + 0.075                                     # o selim largo atrás, embaixo dos ísquios
    y_bico = y_isq - 0.13                                      # bico curto: as coxas (grossas no boneco) cruzam o meio na frente dele
    larg_tras, larg_bico, esp_sel, queda_bico, abaulado = SELIM_FORMA

    def dentro_do_selim(P, folga=0.0):
        f = (P[:, 1] - y_bico) / (y_tras - y_bico)
        w = np.array([e3._selim_largura(x, larg_tras, larg_bico) for x in np.clip(f, 0, 1)])
        return (f >= 0) & (f <= 1) & (np.abs(P[:, 0]) < w / 2 - folga), np.clip(f, 0, 1)

    def topo_desenhado(P, f, z_topo):
        return np.array([e3._selim_topo(x, ff, z_topo, queda_bico, abaulado, larg_tras) for x, ff in zip(P[:, 0], f)])

    quadros_selim = []
    for k in range(24):
        pernas(k / 24)
        co, _, _ = ck._avaliar(bon.corpo, 1)
        quadros_selim.append(co.copy())
    zs = []                                                    # pele do glúteo × topo desenhado, no quadro em que ela fica mais alta
    for co in quadros_selim:
        P = co[mh]
        m, f = dentro_do_selim(P, 0.004)
        zs.append(float((P[m][:, 2] - topo_desenhado(P[m], f[m], 0.0)).min()))
    Z_SELIM = max(zs) + AFUNDA_SELIM                           # o glúteo encosta em todo quadro (afunda de AFUNDA_SELIM a mais)
    print("SELIM: ísquios em y %.4f → selim de y %.4f a %.4f, topo em z %.4f (a pele mais baixa do glúteo sobe e desce %.1f mm na "
          "volta)" % (y_isq, y_bico, y_tras, Z_SELIM, 1000 * (max(zs) - min(zs))), flush=True)

    # ── 7) a bicicleta em volta do corpo ─────────────────────────────────────────────────────────────────────────────────────────────
    bk = e3.bicicleta("bicicleta", eixo=(0.0, Z_EIXO), pedivela=PEDIVELA, q=Q, pedal=PEDAL, folga_pedal=FOLGA_PEDAL,
                      selim=(y_bico, y_tras, Z_SELIM), selim_forma=SELIM_FORMA, guidao=(G.y, G.z, X_MAO),
                      raio_manopla=RAIO_MANOPLA)

    def pose(t):
        """t = 0 pedivela direito em cima; 0,25 na frente; 0,5 embaixo; 0,75 atrás; t = 1 igual a t = 0 (ciclo)."""
        estado["t"] = t
        th_D = pernas(t)
        bk.girar(th_D, estado["phi"][1], estado["phi"][-1])

    # alça de cada pedal na forma do pé: a pele de cima do pé no referencial do pedal, a mais alta na volta toda (o pé fica quase
    # parado no pedal; a pele do peito do pé mexe uns mm com o tornozelo)
    alto_pe = {L: {} for L, _ in LADOS}
    for k in range(12):
        pose(k / 12)
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        for L, s in LADOS:
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes] + [False])[dono]
            Minv = np.array(bk.pedais[s].matrix_world.inverted())
            Pl = co[m] @ Minv[:3, :3].T + Minv[:3, 3]
            Pl = Pl[np.abs(Pl[:, 1] - ALCA["y"]) < ALCA["largura"] / 2 + 0.002]
            for x, z in zip(np.round(Pl[:, 0] / 0.002).astype(int), Pl[:, 2]):
                alto_pe[L][x] = max(alto_pe[L].get(x, -1.0), float(z))
    for L, s in LADOS:
        xs = sorted(alto_pe[L])
        perfil = [(i * 0.002, max(alto_pe[L].get(j, -1.0) for j in (i - 1, i, i + 1))) for i in xs]   # o mais alto dos vizinhos
        bk.alca(s, perfil, y=ALCA["y"], largura=ALCA["largura"], espessura=ALCA["espessura"], folga=ALCA["folga"])
        print("ALÇA %s: pé de x %.4f a %.4f no pedal, alto %.4f" % (L[0], xs[0] * 0.002, xs[-1] * 0.002, max(z for _, z in perfil)),
              flush=True)

    # ── diagnóstico de cada quadro ──────────────────────────────────────────────────────────────────────────────────────────────────
    def info():
        t = estado["t"]
        j = ck.medir_juntas(rig)
        jj = ck.posicoes(rig)
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        partes = []
        for L, s in LADOS:
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes] + [False])[dono]
            Minv = np.array(bk.pedais[s].matrix_world.inverted())
            z_loc = (co[m] @ Minv[:3, :3].T + Minv[:3, 3])
            sob = z_loc[(np.abs(z_loc[:, 0]) < PEDAL[1] / 2) & (np.abs(z_loc[:, 1]) < PEDAL[0] / 2)]
            sola = (float(sob[:, 2].min()) - TOPO_PEDAL) * 1000 if len(sob) else float("nan")
            kfof = (bk.pedal(s).y - c(L + "Leg").y) * 1000
            erro = (c(L + "Foot") - alvos[L].location).length * 1000
            partes.append("%s joelho %.1f° tornozelo %.0f (DF %+.1f) pé %+.1f° KFOF %+.0f mm sola×pedal %+.1f mm IK %.1f mm" % (
                L[0], j["joelho" + L[0].replace("L", "E").replace("R", "D")], tc.tornozelo(jj)[0 if s > 0 else 1],
                tc.tornozelo(jj)[0 if s > 0 else 1] - TORN0, estado["phi"][s], kfof, sola, erro))
        tron = ck.angulo_chave(rig, {"medida": "tronco"})[0]
        return " | ".join(partes) + " | tronco %.1f° | pedivela D %.0f°" % (tron, 360.0 * t % 360.0)

    for t in (0.0, 0.25, 0.5, 0.75):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(bk.manoplas[s], RAIO_MANOPLA, bk.meia_manopla, eixo=(0, 0, 1))) for L, s in LADOS]
    return Cena(pose, bk.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.15, 0.9),
                camera_video=((3.3, -1.6, 1.3), (0, -0.15, 0.85), 50), info=info, apoios=bk.apoios, afunda_apoio_mm=20)
