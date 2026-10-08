# Corrida na Esteira — cena da fábrica 3D (lote 6, 07/10/2026). CARDIO na esteira (e3.esteira).
# CÍCLICO (o único até aqui): t = 0 → 1 é UM ciclo inteiro da corrida — 2 passos, o direito e o esquerdo — e a pose em t = 1 é
# IGUAL à de t = 0. A ficha tem "ciclo": true e o app repete o clipe (LoopRepeat) em vez de ir e voltar (ida e volta faria a corrida
# andar pra trás). t = 0 = contato do calcanhar DIREITO na lona; t = 0,5 = contato do esquerdo. O export amostra o ciclo com o tempo
# em passo constante (sem o ease seno das idas e voltas, que frearia a corrida na emenda) e com mais quadros por segundo (ficha
# "fps": 70, 50 quadros no ciclo: a ponta do pé que balança chega a ~4,7 m/s e, a 50 quadros/s, passava do salto de 80 mm).
# A corrida (corrida leve/moderada, 9 km/h): a lona anda 2,5 m/s pra trás e o pé de apoio vai junto com ela, sem escorregar (o pé é
# montado preso na lona: calcanhar → pé chapado → rola na base dos dedos); a passada é de 1,75 m por ciclo (171 passos/min) e o pé
# passa 0,245 s no chão e 0,105 s no ar a cada passo (voo curto).
# Referências (só o que foi lido):
#  · RBDS, Fukuchi RK, Fukuchi CA, Duarte M. "A public dataset of running biomechanics and the effects of running speed on lower
#    extremity kinematics and kinetics." PeerJ 2017;5:e3298 — 28 corredores numa esteira instrumentada a 2,5, 3,5 e 4,5 m/s ("the
#    subjects ran at 2.5 m/s, 3.5 m/s, and 4.5 m/s"); dados CC BY 4.0 (figshare 10.6084/m9.figshare.4543435). Tabela 4, 2,5 m/s:
#    "Cadence (strides per minute)" 80.82 ± 4.63, "Stride length (m)" 1.86 ± 0.11, "Max hip flx angle (°)" 43.75 ± 6.06, "Max hip ext
#    angle (°)" −3.58 ± 4.85, "Max knee flx angle (°)" 93.52 ± 10.36, "Max ankle DF angle (°)" 26.36 ± 2.93, "Max ankle PF angle (°)"
#    −16.62 ± 5.50. As curvas médias dos 28 (2 lados, a cada 5% do ciclo, das planilhas "RBDSxxxprocessed.txt") estão em RBDS_* abaixo
#    e o apoio médio é 38,7% do ciclo (força vertical > 2% do pico).
#  · Heiderscheit BC et al. "Effects of step rate manipulation on joint mechanics during running." Med Sci Sports Exerc
#    2011;43(2):296–302 (45 corredores na esteira, passo preferido): "step rate (172.6 ± 8.8 steps/min)", Tabela 1 "IC COM - Heel
#    Distance (cm)" 9.2(4.0), "COM Vertical Excursion (cm)" 8.7(1.3), "IC Foot Inclination (°)" 5.5(7.6); Tabela 3 joelho "IC Flexion
#    Angle (°)" 17.8(4.0), "Peak Flexion Angle(°)" 46.3(4.5); quadril "Peak Flexion Angle (°)" 26.7(5.5) (na absorção do impacto).
#  · Souza RB. "An Evidence-Based Videotaped Running Biomechanics Analysis." Phys Med Rehabil Clin N Am 2016;27:217–236:
#    "Overstriding is a description of a running pattern in which the foot lands in front of the person's center of mass"; na
#    absorção do impacto, a vertical do maléolo "Ideally, the vertical line will fall within the runner's pelvis"; "A vertical or
#    flexed tibia allows the runner to dissipate impact more readily though knee flexion"; "normal peak knee flexion approaches
#    approximately 45° at midstance"; "a small increase in trunk lean (~7°)" (Teng e Powers); "the left and right feet should not
#    overlap in their ground contact location" e "there should be some space".
#  · Van Hooren B et al. "Is Motorized Treadmill Running Biomechanically Comparable to Overground Running?" Sports Med
#    2020;50:785–813: esteira × chão "largely comparable", com "sagittal foot–ground angle at footstrike (mean difference (MD) − 9.8°"
#    (pé mais chapado no contato na esteira), "knee flexion at footstrike (MD − 2.3°" (joelho mais dobrado), "contact time (MD 5.0 ms"
#    e "vertical displacement center of mass/pelvis (MD − 1.5 cm" (o corpo sobe e desce menos).
#  · Braços (ACE, via HealthDay): "Bend your elbows at a 90-degree angle and keep them close to your body, with your hands relaxed";
#    HSS (Hospital for Special Surgery): "Look ahead to the horizon, not down toward your feet".
# Como o rig faz: a pelve (osso Hips) sobe e desce numa curva lisa — 2 Hermites no apoio, até o ponto mais baixo no meio dele, e a
# parábola de queda livre no voo (sobe na saída do pé e desce no contato, sem quina) —, gira em volta da vertical (o quadril do lado
# que balança vai à frente) e cai um pouco do lado que balança; o tórax gira ao contrário da pelve e a cabeça fica olhando pra frente,
# na horizontal. Pernas por IK: no apoio o tornozelo é posto pelo pé preso na lona (o joelho sai da geometria); no balanço o quadril, o
# joelho e o tornozelo seguem as curvas médias do RBDS, com a diferença pras pontas do apoio (só no valor) espalhada de leve pelo
# balanço — a perna passa do apoio pro balanço sem salto. Braços por IK → FK (cotovelo ~90°, balanço oposto às pernas), mãos soltas
# semifechadas (sem pegada), iguais nos 2 lados.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

# ── ritmo, velocidade e passada ────────────────────────────────────────────────────────────────────────────────────────────────────
V = 2.5                  # m/s (9 km/h): a velocidade do RBDS (2,5 m/s) dentro do "9–10 km/h" do treino
T = 0.70                 # s por ciclo (= ida_s da ficha): 2 passos → 171 passos/min (Heiderscheit: 172,6 ± 8,8; RBDS: 161,6 ± 9,3)
PASSADA = V * T          # 1,75 m: o que a lona anda num ciclo (= espaçamento das faixas da esteira)
BETA = 0.35              # pé no chão (fração do ciclo): contato 0,245 s e voo 0,105 s por passo — o pé embaixo do quadril (abaixo)
                         # pede um apoio um pouco mais curto que o 38,7% do RBDS (com 37% o pé já não alcançava a lona na saída)
BETA_RBDS = 0.387        # apoio médio do RBDS a 2,5 m/s: as curvas dele são esticadas pra caber no BETA no balanço
Z0 = 0.203               # topo da lona (Life Fitness Integrity: "Step Up Height" 8" (20.3 cm))
# ── pé no apoio (preso na lona) ─────────────────────────────────────────────────────────────────────────────────────────────────────
Y_CALC = -0.115          # calcanhar no contato, 12 cm à frente do meio da pelve (~10 cm à frente do centro de massa: Heiderscheit,
                         # 9,2 ± 4,0 cm); na absorção do impacto (3% do ciclo depois) o tornozelo já está em cima da pelve (Souza)
X_PE = 0.08              # tornozelo a ±8 cm do meio: base de 16 cm, pés sem se sobrepor e com espaço entre eles (Souza)
ABRE_BALANCO = 0.02      # no meio do balanço o pé passa 2 cm mais por fora (a coxa que balança não esfrega na de apoio)
GIRO_PE = 5.0            # ponta do pé um pouco pra fora (graus)
PE_IC = 7.0              # sola × lona no contato (graus, dedos pra cima; Heiderscheit 5,5 ± 7,6° na esteira)
FF = 0.05                # pé chapado (fração do ciclo)
HO = 0.13                # calcanhar sai da lona (37% do apoio): tornozelo até ~27° de dorsiflexão (RBDS: máx. 26,4 ± 2,9°)
PE_TO = -46.0            # sola × lona na saída (calcanhar pra cima), girando na base dos dedos, que ficam deitados na lona
EXP_TO = 1.3             # o calcanhar sobe acelerando (ângulo ∝ u^1,3)
DEDOS_VOLTAM = 0.08      # no começo do balanço os dedos voltam pra linha do pé (fração do ciclo)
# ── pelve (altura da articulação do quadril do lado de apoio, acima da lona) ───────────────────────────────────────────────────────
Z_IC, Z_TO, Z_MIN, PSI_MIN = 0.916, 0.927, 0.868, 0.16   # no contato, na saída, no ponto mais baixo e quando (fração do ciclo)
G = 9.81
GIRO_PELVE = 6.0         # graus: o quadril do lado que balança vai à frente (máx. no contato dele)
QUEDA_PELVE = 4.0        # graus: o lado que balança cai um pouco no meio do apoio do outro
INCLINA_PELVE = 4.0      # graus: anteversão da pelve (o tronco vai junto)
INCLINA_TRONCO = 4.5     # graus a mais no tórax: tronco ~7° à frente da vertical (Souza/Teng e Powers, "~7°")
GIRO_TORAX = 5.0         # graus: o tórax gira ao contrário da pelve (o ombro do braço que vai à frente vai junto)
BALANCO_X = 0.008        # m: a pelve vai um pouco pro lado do pé de apoio
# ── braços (no referencial do tórax) ────────────────────────────────────────────────────────────────────────────────────────────────
BRACO_MEIO, BRACO_AMP, BRACO_FASE = -8.0, 30.0, 0.38   # braço à frente (+) / atrás (−) do tronco: −38° a +22°, o direito mais à
                                                        # frente em t = 0,38 (perna direita atrás, saindo do chão)
COTOVELO, COTOVELO_AMP = 90.0, 10.0                     # flexão do cotovelo: 80° atrás a 100° à frente (~90°)
ABRE_BRACO = (11.0, -5.0)          # cotovelo um pouco pra fora do corpo (graus): 16° com o braço atrás, 6° com ele à frente
ANTEBRACO_DENTRO = (4.0, 12.0)     # mão pro meio quando vai à frente (16°, sem cruzar a linha do meio) e um pouco pra fora quando
                                   # vai atrás (−8°: passa do lado do quadril, sem raspar nele)
DEDOS = (38, 52, 32)     # dobra das 3 falanges dos dedos (graus): mão solta, semifechada
POLEGAR = (10, 25, 20)   # o polegar do fechar_mao (sozinho ele ficava espetado ~44° pro lado dele e ~13° pro dorso: um "joinha")
POLEGAR_DEITADO = (40, 20, 15, 0)   # graus: Thumb1 aduz pro lado dos dedos e as 3 falanges flexionam pro lado da palma — o polegar
                                    # deita do lado da falange do meio do indicador, a polpa encostando nele (1,8 mm, sem entrar;
                                    # medido à parte, pele × pele com a normal dos vértices), sem espetar pra cima (5° pro lado dele)
# ── RBDS a 2,5 m/s: média dos 28 corredores (2 lados) a cada 5% do ciclo (0% = contato), sagital, graus ─────────────────────────────
RBDS_QUADRIL = [32.8, 31.5, 31.6, 29.1, 23.3, 15.2, 6.8, 0.3, -3.0, -2.7, 0.1, 4.0, 9.9, 19.4, 30.0, 38.2, 42.6, 42.8, 39.5,
                35.5, 32.8]
RBDS_JOELHO = [11.0, 21.1, 35.8, 42.8, 41.4, 34.6, 25.3, 17.5, 16.1, 24.2, 40.4, 59.1, 76.1, 88.4, 92.4, 86.7, 72.6, 52.1, 29.5,
               13.2, 11.0]
RBDS_TORNOZELO = [2.3, 1.8, 10.1, 18.0, 22.2, 20.4, 11.1, -2.9, -14.2, -18.6, -17.6, -15.1, -11.8, -6.6, -2.1, 0.8, 2.1, 2.7, 3.2,
                  3.2, 2.3]                            # dorsiflexão (+) / flexão plantar (−)
LADOS = (("Left", 1, 0.5), ("Right", -1, 0.0))        # (lado, s = +1 esquerdo, fase: o direito toca em t = 0)


def no_apoio(psi):
    """O pé está na lona nessa fase? (a saída do pé, psi = BETA, ainda é apoio: a fase vem de somas com erro de arredondamento)"""
    return psi <= BETA + 1e-9


def _cr(tab, x):
    """Catmull-Rom periódico na tabela de 5% (21 pontos, o último igual ao primeiro); x em % do ciclo."""
    n = len(tab) - 1
    u = (x % 100.0) / 5.0
    i = int(math.floor(u))
    f = u - i
    a, b, c, d = (tab[(i + k) % n] for k in (-1, 0, 1, 2))
    return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f ** 3)


def _herm(u, p0, m0, p1, m1, h):
    u2, u3 = u * u, u * u * u
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * h * m1


def _suave(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def _rbds(psi):
    """Fase do boneco (0–1) → % do ciclo do RBDS (apoio e balanço esticados pra caber no BETA)."""
    psi %= 1.0
    if psi <= BETA:
        return 100 * psi * BETA_RBDS / BETA
    return 100 * (BETA_RBDS + (psi - BETA) * (1 - BETA_RBDS) / (1 - BETA))


TF = (0.5 - BETA) * T                                  # voo (s)
V_TO = (Z_IC - Z_TO + G * TF * TF / 2) / TF           # sobe na saída do pé (m/s)
V_IC = V_TO - G * TF                                  # desce no contato (m/s)


def altura_quadril(t):
    """Altura da articulação do quadril do lado de apoio acima da lona (m): 2 Hermites no apoio (contato → mais baixo → saída) e a
    parábola de queda livre no voo, que casa a velocidade da saída com a do contato do outro pé (sem quina)."""
    s = (t % 1.0) % 0.5
    if s <= BETA:
        tau, tm = s * T, PSI_MIN * T
        if tau <= tm:
            return _herm(tau / tm, Z_IC, V_IC, Z_MIN, 0.0, tm)
        return _herm((tau - tm) / (BETA * T - tm), Z_MIN, 0.0, Z_TO, V_TO, BETA * T - tm)
    tau = (s - BETA) * T
    return Z_TO + V_TO * tau - G * tau * tau / 2


def pelve(t):
    """(graus) giro (+ = quadril direito à frente), queda (+ = lado direito mais alto) e (m) balanço pro lado no quadro t."""
    giro = GIRO_PELVE * math.cos(2 * math.pi * t)
    queda = QUEDA_PELVE * math.cos(2 * math.pi * (t - PSI_MIN))
    lado = -BALANCO_X * math.cos(2 * math.pi * (t - PSI_MIN))
    return giro, queda, lado


def rot_pelve(t):
    giro, queda, _ = pelve(t)
    return (Matrix.Rotation(math.radians(giro), 3, "Z") @ Matrix.Rotation(math.radians(queda), 3, "Y")
            @ Matrix.Rotation(math.radians(INCLINA_PELVE), 3, "X"))


def _abs_liso(x, e=0.002):
    return math.sqrt(x * x + e * e) - e


def angulo_pe(psi):
    """Sola × lona no apoio (graus, + = dedos pra cima): calcanhar no contato → chapado → rola na base dos dedos até a saída."""
    if psi <= FF:
        return PE_IC * (1 + math.cos(math.pi * psi / FF)) / 2
    if psi <= HO:
        return 0.0
    return PE_TO * ((psi - HO) / (BETA - HO)) ** EXP_TO


def _sagital(v):
    """Ângulo (graus) do segmento v com a vertical pra baixo, no plano YZ: + = a ponta de baixo à frente (−Y)."""
    return math.degrees(math.atan2(-v.y, -v.z))


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    L1 = (bon.cabeca_osso("LeftLeg") - bon.cabeca_osso("LeftUpLeg")).length
    L2 = (bon.cabeca_osso("LeftFoot") - bon.cabeca_osso("LeftLeg")).length
    quadris0 = {L: bon.cabeca_osso(L + "UpLeg") for L, _, _ in LADOS}
    M0 = (quadris0["Left"] + quadris0["Right"]) / 2       # meio das articulações do quadril no repouso
    meia = (quadris0["Left"] - quadris0["Right"]).length / 2
    es = e3.esteira("esteira", y_rolo_frente=-0.70, espacamento=PASSADA, faixas=2, faixa_y0=-0.47, z_lona=Z0)

    # ── o pé de cada lado no repouso: vértices do pé em relação ao tornozelo, o ponto do calcanhar que toca no contato e a base dos
    # dedos (a lona é z = Z0: o vértice mais baixo da sola é posto nela)
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    pe_rel, calc_rel, mtp_rel = {}, {}, {}
    for L, s, _ in LADOS:
        A0 = bon.cabeca_osso(L + "Foot")
        m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
        rel = co0[m] - np.array(A0)
        pe_rel[L] = rel
        R_ic = np.array(Matrix.Rotation(math.radians(-PE_IC), 3, "X"))
        calc_rel[L] = Vector(rel[np.argmin((rel @ R_ic.T)[:, 2])])        # o que fica mais baixo com a sola a PE_IC
        mtp_rel[L] = bon.cabeca_osso(L + "ToeBase") - A0

    def z_baixo(L, graus):
        """Quanto o vértice mais baixo do pé fica abaixo do tornozelo (m, < 0) com a sola girada `graus` (dedos pra cima)."""
        R = np.array(Matrix.Rotation(math.radians(-graus), 3, "X"))
        return float((pe_rel[L] @ R.T)[:, 2].min())

    Z_PE_CHAPADO = {L: Z0 - z_baixo(L, 0.0) for L, _, _ in LADOS}  # tornozelo com o pé chapado na lona
    # quando o calcanhar sobe, o pé gira na base dos dedos (os dedos deitados na lona); a pele da frente do pé esquerdo segue o osso
    # do pé (pesos da malha) e desceria até ~6 mm pra dentro da lona: o pé sobe o tanto que falta, medido na malha (montar, abaixo)
    SOBE = {L: (np.array([HO, BETA]), np.zeros(2)) for L, _, _ in LADOS}

    def quadril_mundo(t, L):
        """Articulação do quadril do lado L no quadro t (mundo) e o meio da pelve."""
        giro, queda, lado = pelve(t)
        z_meio = Z0 + altura_quadril(t) - meia * _abs_liso(math.sin(math.radians(queda)))
        M = Vector((lado, M0.y, z_meio))
        return M + rot_pelve(t) @ (quadris0[L] - M0), M

    def apoio(L, s, psi):
        """Pé de apoio (psi ≤ BETA): tornozelo (mundo), giro do pé e dos dedos (3x3)."""
        giro = Matrix.Rotation(math.radians(s * GIRO_PE), 3, "Z")
        th = angulo_pe(psi)
        R = giro @ Matrix.Rotation(math.radians(-th), 3, "X")
        # tornozelo com o pé chapado no mesmo ponto da lona (anda com ela): o calcanhar no contato fica em Y_CALC
        y0 = Y_CALC - (giro @ calc_rel[L]).y
        A_ch = Vector((s * X_PE, y0 + V * T * psi, Z_PE_CHAPADO[L]))
        if th > 0:                                       # calcanhar: o ponto dele que toca anda com a lona
            P = A_ch + giro @ calc_rel[L]
            A = P - R @ calc_rel[L]
            A.z = Z0 - z_baixo(L, th)
            return A, R, R
        if th == 0:
            return A_ch, R, R
        Pm = A_ch + giro @ mtp_rel[L]                    # base dos dedos: anda com a lona, os dedos deitados nela
        Pm.z += float(np.interp(psi, *SOBE[L]))
        return Pm - R @ mtp_rel[L], R, giro

    def ik_analitico(H, A):
        """Joelho (mundo) da perna com o quadril em H e o tornozelo em A, dobrando pra frente (plano que contém o −Y)."""
        d = A - H
        dl = min(d.length, L1 + L2 - 1e-6)
        u = d.normalized()
        f = Vector((0, -1, 0))
        w = (f - u * f.dot(u)).normalized()
        cos_a = (L1 * L1 + dl * dl - L2 * L2) / (2 * L1 * dl)
        a = math.acos(max(-1.0, min(1.0, cos_a)))
        return H + (u * math.cos(a) + w * math.sin(a)) * L1

    def angulos_apoio(L, s, psi, t):
        H, _ = quadril_mundo(t, L)
        A, R, Rd = apoio(L, s, psi)
        K = ik_analitico(H, A)
        coxa, canela = _sagital(K - H), _sagital(A - K)
        return dict(coxa=coxa, joelho=coxa - canela, DF=angulo_pe(psi) - canela)

    # pontas do apoio de cada lado (pra emendar o balanço sem salto): valores na saída do pé e no contato
    TAB = {"coxa": RBDS_QUADRIL, "joelho": RBDS_JOELHO, "DF": RBDS_TORNOZELO}
    FIM, INI, CORR = {}, {}, {}

    def emendar():
        for L, s, fase in LADOS:
            FIM[L] = angulos_apoio(L, s, BETA, (BETA - fase) % 1.0)
            INI[L] = angulos_apoio(L, s, 0.0, (0.0 - fase) % 1.0)
            CORR[L] = {k: (FIM[L][k] - _cr(TAB[k], _rbds(BETA)), INI[L][k] - _cr(TAB[k], 100.0)) for k in TAB}

    emendar()

    def balanco(L, k, psi):
        u = (psi - BETA) / (1 - BETA)
        c0, c1 = CORR[L][k]
        return _cr(TAB[k], _rbds(psi)) + c0 * (1 - _suave(u)) + c1 * _suave(u)

    def perna(L, s, fase, t):
        """Tornozelo (mundo), giro do pé e dos dedos (3x3) do lado L no quadro t, e se está no apoio."""
        psi = (t + fase) % 1.0
        if no_apoio(psi):
            A, R, Rd = apoio(L, s, min(psi, BETA))
            return A, R, Rd, True, psi
        H, _ = quadril_mundo(t, L)
        cx, jo, df = balanco(L, "coxa", psi), balanco(L, "joelho", psi), balanco(L, "DF", psi)
        cn = cx - jo
        K = H + Vector((0, -math.sin(math.radians(cx)), -math.cos(math.radians(cx)))) * L1
        A = K + Vector((0, -math.sin(math.radians(cn)), -math.cos(math.radians(cn)))) * L2
        A.x = s * (X_PE + ABRE_BALANCO * math.sin(math.pi * (psi - BETA) / (1 - BETA)) ** 2)
        giro = Matrix.Rotation(math.radians(s * GIRO_PE), 3, "Z")
        th = cn + df                                       # sola × horizontal (+ = dedos pra cima)
        R = giro @ Matrix.Rotation(math.radians(-th), 3, "X")
        th_d = th * _suave((psi - BETA) / DEDOS_VOLTAM)    # os dedos voltam pra linha do pé no começo do balanço
        return A, R, giro @ Matrix.Rotation(math.radians(-th_d), 3, "X"), False, psi

    # ── pernas por IK (alvos nascem no tornozelo de repouso, polos bem à frente), pé e dedos com o giro posto em cada quadro ──────
    alvos, polos, iks, rot_pe, rot_dedos = {}, {}, {}, {}, {}
    for L, s, _ in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))
        polos[L] = p3.vazio("polo_joelho_" + L, (s * 0.11, -1.4, 0.75))
        iks[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        rot_pe[L] = p3.travar_rotacao(rig, L + "Foot")
        rot_dedos[L] = p3.travar_rotacao(rig, L + "ToeBase")
    M_pe0 = {L: rot_pe[L].matrix_world.copy() for L, _, _ in LADOS}
    M_dedos0 = {L: rot_dedos[L].matrix_world.copy() for L, _, _ in LADOS}

    # ── braços por IK → FK; mãos soltas semifechadas (os dedos ficam dobrados em relação à mão o tempo todo) ───────────────────────
    punhos, polos_c, iks_b = {}, {}, {}
    for L, s, _ in LADOS:
        punhos[L] = p3.vazio("punho_" + L, p3.ponta(rig, L + "ForeArm"))
        polos_c[L] = p3.vazio("polo_cotovelo_" + L, p3.cabeca(rig, L + "ForeArm") + Vector((s * 0.2, 0.6, 0)))
        iks_b[L] = p3.ik(rig, L + "ForeArm", punhos[L], polos_c[L])
    La = (bon.cabeca_osso("LeftForeArm") - bon.cabeca_osso("LeftArm")).length
    Lf = (bon.cabeca_osso("LeftHand") - bon.cabeca_osso("LeftForeArm")).length

    def deitar_polegar(L):
        """Polegar deitado do lado do indicador (mão solta de quem corre): as rotações são no referencial da própria mão
        (normal da palma, linha dos nós, direção dos dedos), então dão o mesmo polegar em qualquer pose do braço."""
        a, b, c2, d = POLEGAR_DEITADO
        palma, _, dedos, _, _ = pg._base(rig, L)
        n1 = L + "HandThumb1"
        f = (p3.ponta(rig, n1) - c(n1)).normalized()
        p3.girar_osso(rig, n1, p3.rot_eixo(a if palma.cross(f).dot(dedos) > 0 else -a, palma))   # adução: pro lado dos dedos
        for i, ang in ((1, b), (2, c2), (3, d)):
            n = "%sHandThumb%d" % (L, i)
            f = (p3.ponta(rig, n) - c(n)).normalized()
            p3.girar_osso(rig, n, p3.rot_eixo(ang, f.cross(palma)))                                 # flexão: pro lado da palma

    for L, _, _ in LADOS:
        p3.soltar_dedos(rig, L)
        pg.juntar_dedos(rig, L)
        p3.fechar_mao(rig, L, angulos=DEDOS, polegar=POLEGAR)
        deitar_polegar(L)
    dedos_basis = {pb.name: pb.matrix_basis.copy() for pb in PB if "Hand" in pb.name and pb.name[-1].isdigit()}

    def tronco(t):
        """Pelve (Hips), tórax (Spine, Spine1, Spine2) e cabeça (Neck, Head) no quadro t."""
        for n in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        _, M = quadril_mundo(t, "Left")
        p3.girar_osso(rig, "Hips", rot_pelve(t), pivo=M0, mover=M - M0)
        giro, queda, _ = pelve(t)
        # tórax: endireita a queda da pelve (ombros nivelados), inclina mais um pouco e gira ao contrário da pelve
        p3.girar_osso(rig, "Spine", Matrix.Rotation(math.radians(-queda), 3, Vector((0, 1, 0))))
        p3.girar_osso(rig, "Spine1", Matrix.Rotation(math.radians(INCLINA_TRONCO), 3, "X"))
        torcao = -(giro + GIRO_TORAX * math.cos(2 * math.pi * t))           # tórax × pelve (graus)
        for n, f in (("Spine", 0.30), ("Spine1", 0.35), ("Spine2", 0.35)):
            ax = (p3.ponta(rig, n) - c(n)).normalized()
            p3.girar_osso(rig, n, Matrix.Rotation(math.radians(torcao * f), 3, ax))
        # cabeça olhando pra frente, na horizontal: desfaz o giro e a inclinação que vieram do tronco (metade no pescoço)
        cab = p3.mundo_osso(rig, "Head").to_3x3()
        cab0 = (rig.matrix_world @ rig.data.bones[p3.P + "Head"].matrix_local).to_3x3()
        corr = (cab0 @ cab.inverted()).to_quaternion()
        meio = Matrix.Identity(3).to_quaternion().slerp(corr, 0.5).to_matrix()
        p3.girar_osso(rig, "Neck", meio)
        cab = p3.mundo_osso(rig, "Head").to_3x3()
        p3.girar_osso(rig, "Head", cab0 @ cab.inverted())

    def pernas(t):
        for L, s, fase in LADOS:
            A, R, Rd, _, psi = perna(L, s, fase, t)
            alvos[L].location = A
            rot_pe[L].matrix_world = R.to_4x4() @ M_pe0[L]
            rot_dedos[L].matrix_world = Rd.to_4x4() @ M_dedos0[L]
            H, _ = quadril_mundo(t, L)
            polos[L].location = Vector((s * 0.11, H.y - 1.4, H.z - 0.40))
        p3.atualizar()

    def eixos_torax():
        cima = (c("Neck") - c("Hips")).normalized()
        lado = c("RightShoulder") - c("LeftShoulder")
        lado = (lado - cima * lado.dot(cima)).normalized()
        return cima, lado, cima.cross(lado)

    def _congelar(L):
        nomes = (L + "Arm", L + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks_b[L].mute = True
        for n, Mx in zip(nomes, mats):
            PB[p3.P + n].matrix = Mx
            p3.atualizar()

    def _orientar(L, dedos_q, palma_q):
        """Antebraço gira (pronação/supinação) pra palma ir pra `palma_q`; o resto no punho, até a mão apontar pra `dedos_q`."""
        f0, f1 = c(L + "ForeArm"), c(L + "Hand")
        ax = (f1 - f0).normalized()
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, L)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        h0 = c(L + "Hand")
        y_m = (p3.ponta(rig, L + "Hand") - h0).normalized()
        n_m = pg._base(rig, L)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, L + "Hand", F_quer @ F_tem.transposed())

    def bracos(t):
        cima, lado, frente = eixos_torax()
        for L, s, fase in LADOS:
            u_t = (t + fase) % 1.0                         # o braço esquerdo faz o do direito meio ciclo depois
            onda = math.cos(2 * math.pi * (u_t - BRACO_FASE))
            al = math.radians(BRACO_MEIO + BRACO_AMP * onda)
            ep = math.radians(COTOVELO + COTOVELO_AMP * onda)
            be = math.radians(ABRE_BRACO[0] + ABRE_BRACO[1] * onda)
            io = math.radians(ANTEBRACO_DENTRO[0] + ANTEBRACO_DENTRO[1] * onda)
            fora = -s * lado                               # pra fora do corpo, do lado do braço
            S = c(L + "Arm")
            u = (-cima * math.cos(al) * math.cos(be) + frente * math.sin(al) * math.cos(be) + fora * math.sin(be)).normalized()
            E = S + u * La
            w = (frente - u * frente.dot(u)).normalized()
            f = (u * math.cos(ep) + w * math.sin(ep))
            f = (f * math.cos(io) - fora * math.sin(io)).normalized()
            W = E + f * Lf
            iks_b[L].mute = False
            punhos[L].location = W
            polos_c[L].location = E + (E - (S + W) / 2).normalized() * 0.4   # polo no plano do braço, do lado do cotovelo
        p3.atualizar()
        for L, s, _ in LADOS:
            _congelar(L)
            f = (c(L + "Hand") - c(L + "ForeArm")).normalized()
            dentro = s * lado                              # palma virada pro meio do corpo (polegar pra cima)
            palma = (dentro - cima * 0.35).normalized()    # ... e um pouco pra baixo
            _orientar(L, f, palma)

    estado = {"t": 0.0}

    def pose(t):
        """t = 0 contato do calcanhar direito; t = 0,5 contato do esquerdo; t = 1 igual a t = 0 (ciclo)."""
        estado["t"] = t
        tronco(t)
        pernas(t)
        bracos(t)
        for nome, Mb in dedos_basis.items():               # dedos dobrados em relação à mão (iguais nos 2 lados)
            PB[nome].matrix_basis = Mb
        es.andar(PASSADA * t)
        p3.atualizar()

    # polos certos dos joelhos e dos cotovelos (no meio do apoio de cada perna)
    for L, s, fase in LADOS:
        pose((0.12 - fase) % 1.0)
        e = p3.acertar_polo(rig, iks[L], L + "Leg", L + "UpLeg", L + "Foot")
        print("polo joelho %s erro %.3f ang %d" % (L, e[0], e[1]))
    pose(0.0)
    for L, _, _ in LADOS:
        iks_b[L].mute = False
        e = p3.acertar_polo(rig, iks_b[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo %s erro %.3f ang %d" % (L, e[0], e[1]))
    # o pé que rola na base dos dedos sobe o que a malha pede pra não entrar na lona (2 voltas: subir muda um pouco a perna)
    amostra = np.linspace(HO, BETA, 12)
    for _ in range(2):
        for L, s, fase in LADOS:
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
            falta = []
            for psi in amostra:
                pose((psi - fase) % 1.0)
                co_, _, _ = ck._avaliar(bon.corpo, 1)
                falta.append(max(0.0, Z0 + 0.0002 - float(co_[m][:, 2].min())))
            SOBE[L] = (amostra, SOBE[L][1] + np.array(falta) if len(SOBE[L][1]) == len(amostra) else np.array(falta))
    emendar()                                              # o balanço emenda no apoio já com o pé que subiu
    print("PÉ SOBE (mm, no rolamento dos dedos): " + " | ".join("%s %s" % (L, " ".join("%.1f" % (x * 1000) for x in SOBE[L][1]))
                                                              for L, _, _ in LADOS))

    print("CORRIDA passada %.2f m | %.0f passos/min | apoio %.3f s voo %.3f s | quadril z %.3f..%.3f (contato %.3f, saída %.3f) | "
          "pontas do apoio: saída coxa %+.1f joelho %.1f DF %+.1f, contato coxa %+.1f joelho %.1f DF %+.1f" % (
              PASSADA, 120 / T, BETA * T, TF, Z0 + Z_MIN, Z0 + max(altura_quadril(i / 200) for i in range(201)), Z0 + Z_IC,
              Z0 + Z_TO, FIM["Right"]["coxa"], FIM["Right"]["joelho"], FIM["Right"]["DF"], INI["Right"]["coxa"],
              INI["Right"]["joelho"], INI["Right"]["DF"]))

    # ── diagnóstico de cada quadro ─────────────────────────────────────────────────────────────────────────────────────────────
    mem = {}

    def info():
        t = estado["t"]
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        partes = []
        for L, s, fase in LADOS:
            psi = (t + fase) % 1.0
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes] + [False])[dono]
            P = co[m]
            baixo = (P[:, 2].min() - Z0) * 1000
            tras = P[P[:, 1] > np.median(P[:, 1])]
            calc = (tras[:, 2].min() - Z0) * 1000
            txt = "%s %s planta %+.1f calc %+.1f" % (L[0], "apoio" if no_apoio(psi) else "balanço", baixo, calc)
            ant = mem.get(L)
            if ant is not None and no_apoio(psi) and no_apoio(ant[2]):   # escorregou? só os vértices na lona nos 2 quadros
                dt_ = (t - ant[1]) % 1.0
                belt = PASSADA * dt_
                junto = (P[:, 2] - Z0 < 0.002) & (ant[0][:, 2] - Z0 < 0.002)
                if junto.any():
                    d = P[junto] - ant[0][junto]
                    erro = np.hypot(d[:, 0], d[:, 1] - belt)
                    txt += " | pé × lona %.1f mm (lona %.0f mm)" % (erro.max() * 1000, belt * 1000)
            mem[L] = (P, t, psi)
            partes.append(txt)
        j = ck.posicoes(rig)
        H = (j["LeftUpLeg"] + j["RightUpLeg"]) / 2
        tron = j["Neck"] - j["Hips"]
        incl = math.degrees(math.atan2(-tron[1], tron[2]))
        lr = ""
        for L, s, fase in LADOS:
            psi = (t + fase) % 1.0
            if psi <= 0.06:
                tz = j[L + "Foot"]
                lr = " | contato %s: tornozelo %+.0f mm à frente do quadril, canela %+.1f° (+ = tornozelo à frente do joelho)" % (
                    L[0], (H[1] - tz[1]) * 1000, _sagital(Vector(j[L + "Foot"] - j[L + "Leg"])))
        return " | ".join(partes) + " | tronco %+.1f° à frente | quadril z %.3f%s" % (incl, H[2], lr)

    pegs = []
    return Cena(pose, es.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((4.4, -2.6, 1.55), (0, -0.05, 1.0), 50), info=info, apoios=es.apoios, afunda_apoio_mm=20)
