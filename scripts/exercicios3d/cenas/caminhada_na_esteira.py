# Caminhada na Esteira — cena da fábrica 3D (lote 9, 10/10/2026). CARDIO na esteira (e3.esteira, a mesma peça da Corrida na Esteira).
# CÍCLICO, como a Corrida: t = 0 → 1 é UM ciclo inteiro da marcha — 2 passos, o direito e o esquerdo — e a pose em t = 1 é IGUAL à de
# t = 0 (a ficha tem "ciclo": true e o app repete o clipe). t = 0 = contato do calcanhar DIREITO na lona; t = 0,5 = contato do esquerdo.
# SEM fase de voo: cada pé fica na lona 58,7% do ciclo, então sempre há pelo menos um pé nela, e os 2 ficam juntos nela no duplo apoio
# (do contato de um pé até a saída do outro: 8,7% do ciclo, 2 vezes por ciclo).
# A caminhada (ritmo confortável, 4,5 km/h): a lona anda 1,25 m/s pra trás e o pé de apoio vai junto com ela, sem escorregar (o pé é
# montado preso na lona: calcanhar → pé chapado → rola na base dos dedos); a passada é de 1,275 m por ciclo (117,6 passos/min).
# Referências (só o que foi lido):
#  · WBDS, Fukuchi CA, Fukuchi RK, Duarte M. "A public dataset of overground and treadmill walking kinematics and kinetics in healthy
#    individuals." PeerJ 2018;6:e4640 (dados CC BY 4.0 em doi:10.6084/m9.figshare.5722711): esteira instrumentada (Bertec) a 8
#    velocidades, a 5ª (T05) = "100%" da velocidade confortável; "the participants were asked to walk naturally and were allowed to hold the
#    handrails of the treadmill if necessary" — e nenhum dos 24 jovens segurou no corrimão a 100% (WBDSinfo.csv, "TreadHands" = No).
#    Dos arquivos dos 24 jovens a 100% (rascunho, lote4/caminhada_na_esteira/exp): velocidade 1,245 ± 0,153 m/s, ciclo 1,025 ± 0,078 s,
#    cadência 117,8 ± 9,5 passos/min, passada 1,268 ± 0,125 m e apoio 58,7 ± 1,2% do ciclo (forças da esteira: contato = força vertical
#    > 20 N); largura do passo 132 ± 25 mm, a pelve sobe e desce 37 ± 10 mm por passada e balança 47 mm de lado a lado (marcadores). As
#    curvas médias (2 lados, a cada 5% do ciclo, 0% = contato) estão em WBDS_* abaixo: a coxa é o quadril menos a inclinação da pelve
#    (ângulo da coxa com a vertical) e confere com o pé menos o tornozelo + o joelho (1–3° de diferença).
#  · Semaan MB et al. "Is treadmill walking biomechanically comparable to overground walking? A systematic review." Gait Posture
#    2022;92:249–257: "Spatiotemporal, kinematic, kinetic, electromyographic and energy consumption outcome measures were largely comparable
#    for motorized treadmill and overground walking", com "reduced pelvic ROM" na esteira.
#  · Pirker W, Katzenschlager R. "Gait disorders in adults and the elderly: A clinical guide." Wien Klin Wochenschr 2017;129:81–95: "The
#    heel of the swinging leg is then placed on the ground. The body weight is gradually shifted to the sole and then onwards to the toes";
#    "the body is held upright, the shoulders and pelvis remain relatively level and each arm swings in the direction opposite to that of
#    its ipsilateral leg"; "The stance phase constitutes approximately 60 % of the gait cycle"; "Both feet are on the ground at the
#    beginning and end of the stance phase. Each of these two double support periods lasts for approximately 10–12 % of the gait cycle";
#    "The average cadence in young adults was reported to range between 115 and 120 steps/min".
#  · Kahn MB et al. "The nature and extent of upper limb associated reactions during walking in people with acquired brain injury."
#    J Neuroeng Rehabil 2019;16:160, Tabela 2, 36 adultos saudáveis na velocidade confortável (graus): ombro "Flexion Peak" 16.7 ± 6.3,
#    "Extension Peak" −7.7 ± 4.2, "Flexion ROM" 24.5 ± 8.5; "Abduction Peak" 9.4 ± 3.3, "Adduction Peak" 3.7 ± 3.2; cotovelo "Flexion
#    Peak" 27.4 ± 7.9, "Extension Peak" −0.6 ± 7.9, "Flexion Mean" 11.9 ± 6.0; "The forearm in our HCs was on average ~ 17° pronated".
#  · De Vlieger D et al. PLoS One 2025;20:e0315332: "a healthy, reciprocal 1:1 coordination pattern (i.e. one arm moves in the same
#    direction as the contralateral leg during one stride)".
# Como o rig faz: o pé de apoio é preso na lona (o ponto do calcanhar que toca, o pé chapado ou a base dos dedos andam com ela) com o
# ângulo do pé do WBDS; a pelve (osso Hips) sobe e desce o que deixa o joelho da perna de apoio no ângulo do WBDS (+3°; IK de 2 ossos;
# antes de cada contato ela desce uns mm, pra perna da frente alcançar a lona quase esticada, e em volta do contato passa em 6% do ciclo
# da perna de trás pra da frente, que daí em diante dobra o joelho como o WBDS na absorção do peso), gira, inclina e cai do lado que
# balança como o WBDS e vai pro lado do pé de apoio como os marcadores do WBDS; o tórax gira um pouco ao contrário da pelve e a cabeça fica
# olhando pra frente, na horizontal. No balanço o quadril (coxa), o joelho e o pé seguem as curvas do WBDS, com a diferença pras pontas do
# apoio (só no valor) sumindo até o meio do balanço — a perna passa do apoio pro balanço sem salto. Braços por IK → FK (quase esticados,
# balanço oposto às pernas), mãos soltas semifechadas (sem pegada), iguais nos 2 lados (a mão da Corrida na Esteira).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

# ── ritmo, velocidade e passada (WBDS, esteira a 100%, 24 jovens) ─────────────────────────────────────────────────────────────────────
V = 1.25                 # m/s (4,5 km/h): 1,245 ± 0,153
T = 1.02                 # s por ciclo (= ida_s da ficha): 2 passos → 117,6 passos/min (117,8 ± 9,5)
PASSADA = V * T          # 1,275 m: o que a lona anda num ciclo (1,268 ± 0,125)
BETA = 0.587             # pé na lona (fração do ciclo): 58,7 ± 1,2% → duplo apoio de 8,7% do ciclo, 2 vezes por ciclo
DS = BETA - 0.5
Z0 = 0.203               # topo da lona (Life Fitness Integrity: "Step Up Height" 8" (20.3 cm))
# esteira: a lona anda 1 passada por ciclo = 4 espaçamentos de faixa; 11 faixas → volta de 3,51 m, rolos a 1,60 m (a da Corrida: 1,60 m)
POR_PASSADA, FAIXAS = 4, 11
Y_ROLO = -0.78           # eixo do rolo da frente: o pé que balança à frente passa longe do capô
# ── pé no apoio (preso na lona) ─────────────────────────────────────────────────────────────────────────────────────────────────────
Y_CALC = -0.247          # calcanhar no contato, 25 cm à frente do meio dos quadris: o tornozelo fica ~27 cm à frente do quadril, como
                         # a coxa e a perna do WBDS no contato (coxa 18,9°, joelho 0,7°: 27,5 cm) dão com as medidas do boneco; com 25,5
                         # cm a perna da frente só alcançava a lona com a pelve 6,7 mm mais baixa e o joelho de trás ia a 17° no contato
                         # do outro pé (WBDS: 7,2 ± 4,0°), com 24 cm o de trás esticava (0°) logo depois
X_PE = 0.075             # tornozelo a ±7,5 cm do meio: passo de 15 cm (WBDS: 132 ± 25 mm; com 13,2 cm as coxas musculosas do boneco
                         # se encostavam 8 mm quando a que balança passa pela de apoio)
ABRE_BALANCO = 0.035     # no meio do balanço o pé passa 3,5 cm mais por fora (a coxa que balança não esfrega na de apoio)
SOBE_BALANCO = 0.004     # no meio do balanço o tornozelo sobe 4 mm a mais (folga dos dedos acima da lona)
GIRO_PE = 6.0            # ponta do pé um pouco pra fora (graus)
DK = 3.0                 # graus somados ao joelho do WBDS no apoio (o boneco não trava o joelho esticado)
ANTES = 0.06             # a pelve começa a descer pro contato do outro pé 6% do ciclo antes dele (ver z_meio)
JUNTA = 0.03             # de 3% antes a 3% depois do contato a altura da pelve passa da perna de trás pra da frente (ver z_meio)
TRAS_ESTICA = 5.0        # graus: no duplo apoio o joelho de trás estica no máximo isso além do WBDS (+ DK), e nunca abaixo de 5°
MIN_SUAVE = 0.0015       # m: largura do mínimo suave entre o que a perna da frente pede e o teto da de trás
DEDOS_VOLTAM = 0.12      # no começo do balanço os dedos voltam pra linha do pé (fração do ciclo)
# ── tronco ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INCLINA_PELVE = 2.0      # graus: anteversão da pelve (o tronco vai junto) + a variação do WBDS (±1°)
INCLINA_TRONCO = 1.0     # graus a mais no tórax: tronco em pé, ~3° à frente da vertical
GIRO_TORAX = 3.0         # graus: o tórax gira ao contrário da pelve (o ombro do braço que vai à frente vai junto)
# ── braços (no referencial do tórax; Kahn et al. 2019, saudáveis) ───────────────────────────────────────────────────────────────────
BRACO_MEIO, BRACO_AMP, BRACO_FASE = 4.5, 12.2, 0.55   # braço à frente (+) / atrás (−) do tronco: −7,7° a +16,7°, o direito mais à
                                                       # frente em t = 0,55 (logo depois do contato do pé esquerdo)
COTOVELO, COTOVELO_AMP = 17.0, 11.0                    # flexão do cotovelo: 6° atrás a 28° à frente (quase esticado)
ABRE_BRACO = (9.0, -2.0)           # abdução (graus): 11° com o braço atrás (a mão passa do lado do quadril e da coxa que vem à frente
                                   # sem encostar), 7° com ele à frente
ANTEBRACO_DENTRO = (3.0, 3.0)      # a mão vai um pouco pro meio quando vai à frente (6°), sem cruzar a linha do meio
PRONACAO = 17.0                    # palma virada pra coxa e um pouco pra trás (Kahn: "~ 17° pronated")
DEDOS = (38, 52, 32)     # dobra das 3 falanges dos dedos (graus): mão solta, semifechada (a da Corrida na Esteira)
POLEGAR = (10, 25, 20)   # o polegar do fechar_mao (sozinho ele ficava espetado ~44° pro lado dele e ~13° pro dorso: um "joinha")
POLEGAR_DEITADO = (40, 20, 15, 0)   # graus: o polegar deita do lado da falange do meio do indicador (a mão da Corrida na Esteira)
# ── WBDS a 100% na esteira: média dos 24 jovens (2 lados) a cada 5% do ciclo (0% = contato), graus ─────────────────────────────────
WBDS_COXA = [18.9, 18.4, 18.0, 14.1, 8.7, 3.2, -2.2, -7.2, -11.7, -15.6, -18.1, -18.6, -14.6, -6.0, 3.8, 12.1, 17.9, 21.3, 21.5,
             19.8, 18.9]                               # coxa × vertical (+ = joelho à frente do quadril)
WBDS_JOELHO = [0.7, 6.8, 14.4, 15.6, 13.3, 10.4, 7.2, 4.8, 3.4, 3.7, 7.2, 14.7, 28.9, 46.9, 59.3, 62.1, 56.0, 42.4, 22.9, 4.5, 0.7]
WBDS_PE = [22.0, 9.5, 1.9, 0.6, 0.2, -0.4, -1.1, -2.2, -3.9, -6.7, -12.3, -23.6, -45.5, -65.3, -63.5, -51.2, -34.0, -15.0, 3.4,
           18.3, 22.0]                                 # sola × lona (+ = dedos pra cima)
WBDS_GIRO = [3.5, 3.9, 2.7, 2.5, 3.4, 3.5, 2.4, 1.1, -0.3, -2.0, -3.5, -3.8, -2.7, -2.5, -3.4, -3.5, -2.4, -1.1, 0.3, 1.9, 3.5]
WBDS_OBLIQ = [1.1, 2.4, 4.4, 5.6, 5.0, 3.3, 1.6, 0.3, -0.3, -0.7, -1.1, -2.4, -4.4, -5.6, -5.0, -3.3, -1.6, -0.3, 0.3, 0.7, 1.1]
WBDS_INCL = [0.8, 0.4, -0.2, -0.9, -0.9, -0.5, -0.4, -0.0, 0.6, 1.0, 0.8, 0.4, -0.2, -0.9, -0.9, -0.5, -0.4, -0.0, 0.6, 1.0, 0.8]
WBDS_LADO = [-13.7, -6.4, 0.8, 8.6, 15.1, 19.4, 22.4, 23.6, 22.6, 19.5, 14.4, 7.0, -0.7, -8.7, -15.1, -19.3, -22.4, -23.5, -22.1,
             -18.8, -13.7]                             # pelve pro lado direito (+), mm (marcadores ASIS/PSIS)
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


def _suave(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def pelve(t):
    """(graus) giro (+ = quadril direito à frente), queda (+ = lado direito mais alto), inclinação (+ = anteversão) e (m) o lado
    (x, + = pro lado esquerdo) da pelve no quadro t (t = fase do lado direito)."""
    x = 100.0 * t
    return (_cr(WBDS_GIRO, x), _cr(WBDS_OBLIQ, x), INCLINA_PELVE + _cr(WBDS_INCL, x), -_cr(WBDS_LADO, x) / 1000.0)


def rot_pelve(t):
    giro, queda, incl, _ = pelve(t)
    return (Matrix.Rotation(math.radians(giro), 3, "Z") @ Matrix.Rotation(math.radians(queda), 3, "Y")
            @ Matrix.Rotation(math.radians(incl), 3, "X"))


def angulo_pe(psi):
    """Sola × lona no apoio (graus, + = dedos pra cima): o do WBDS — o calcanhar toca com os dedos pra cima, o pé chapa e o calcanhar
    sobe rolando na base dos dedos até a saída."""
    return _cr(WBDS_PE, 100.0 * psi)


def joelho_wbds(psi):
    return _cr(WBDS_JOELHO, 100.0 * psi)


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
    es = e3.esteira("esteira", y_rolo_frente=Y_ROLO, espacamento=PASSADA / POR_PASSADA, faixas=FAIXAS, faixa_y0=-0.45, z_lona=Z0)

    # ── o pé de cada lado no repouso: vértices do pé em relação ao tornozelo, o ponto do calcanhar que toca no contato e a base dos
    # dedos (a lona é z = Z0: o vértice mais baixo da sola é posto nela)
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    pe_rel, calc_rel, mtp_rel = {}, {}, {}
    pe_ic = angulo_pe(0.0)
    for L, s, _ in LADOS:
        A0 = bon.cabeca_osso(L + "Foot")
        m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
        rel = co0[m] - np.array(A0)
        pe_rel[L] = rel
        R_ic = np.array(Matrix.Rotation(math.radians(-pe_ic), 3, "X"))
        calc_rel[L] = Vector(rel[np.argmin((rel @ R_ic.T)[:, 2])])        # o que fica mais baixo com a sola a pe_ic
        mtp_rel[L] = bon.cabeca_osso(L + "ToeBase") - A0

    def z_baixo(L, graus):
        """Quanto o vértice mais baixo do pé fica abaixo do tornozelo (m, < 0) com a sola girada `graus` (dedos pra cima)."""
        R = np.array(Matrix.Rotation(math.radians(-graus), 3, "X"))
        return float((pe_rel[L] @ R.T)[:, 2].min())

    Z_PE_CHAPADO = {L: Z0 - z_baixo(L, 0.0) for L, _, _ in LADOS}  # tornozelo com o pé chapado na lona
    # quando o calcanhar sobe, o pé gira na base dos dedos (os dedos deitados na lona); a pele da frente do pé segue o osso do pé (pesos
    # da malha) e desceria pra dentro da lona: o pé sobe o tanto que falta, medido na malha (montar, abaixo)
    psi_ho = next(k / 1000.0 for k in range(1000) if angulo_pe(k / 1000.0) < 0)     # o calcanhar começa a subir (WBDS: ~23%)
    SOBE = {L: (np.array([psi_ho, BETA]), np.zeros(2)) for L, _, _ in LADOS}

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

    def z_pela_perna(L, s, psi, t, joelho=None):
        """Altura do meio dos quadris que deixa o joelho de apoio do lado L no ângulo do WBDS (+ DK) — ou em `joelho` (graus) —, com a pelve
        girada no quadro t."""
        A = apoio(L, s, psi)[0]
        o = rot_pelve(t) @ (quadris0[L] - M0)
        lado = pelve(t)[3]
        hx, hy = lado + o.x, M0.y + o.y
        k = math.radians(joelho_wbds(psi) + DK if joelho is None else joelho)
        D2 = L1 * L1 + L2 * L2 + 2 * L1 * L2 * math.cos(k)
        return A.z + math.sqrt(max(D2 - (hx - A.x) ** 2 - (hy - A.y) ** 2, 0.0)) - o.z

    DESCE = {"Right": 0.0, "Left": 0.0}                 # quanto a pelve tem que estar mais baixa no contato de cada pé (m), abaixo

    def z_meio(t):
        """Altura do meio dos quadris no quadro t. No apoio de uma perna só: a dela (joelho do WBDS + DK). Em volta de cada contato:
        antes dele a perna de apoio (a de trás) leva a pelve a descer DESCE (o que falta pra perna da frente alcançar a lona com o joelho do
        WBDS no contato) nos últimos ANTES do ciclo; de JUNTA antes a JUNTA depois do contato a altura passa suave (pesos com derivada zero
        nas pontas) da perna de trás pra da frente — a da frente vale mesmo um pouco antes do contato (o calcanhar dela onde vai tocar) —
        e depois segue a da frente: o joelho dela dobra como o do WBDS na absorção do peso e a de trás, rolando nos dedos, acompanha — sem
        esticar mais que TRAS_ESTICA além do WBDS (aí a pelve fica um pouco abaixo do que a da frente pede: mínimo suave)."""
        for L, s, t_ic in (("Right", -1, 0.0), ("Left", 1, 0.5)):
            tau = (t - t_ic + 0.5) % 1.0 - 0.5           # tempo desde o contato do pé L (fração do ciclo, −0,5 a 0,5)
            if -ANTES <= tau <= DS:
                tr, st = ("Left", 1) if L == "Right" else ("Right", -1)
                z_tras = z_pela_perna(tr, st, 0.5 + tau, t) - DESCE[L] * (_suave((tau + ANTES) / ANTES) if tau < 0 else 1.0)
                if tau < -JUNTA:
                    return z_tras
                teto = z_pela_perna(tr, st, 0.5 + tau, t, max(joelho_wbds(0.5 + tau) + DK - TRAS_ESTICA, 5.0))
                a = z_pela_perna(L, s, tau, t)
                z_frente = (a + teto - math.sqrt((a - teto) ** 2 + MIN_SUAVE ** 2)) / 2
                if tau > JUNTA:
                    return z_frente
                w = _suave((tau + JUNTA) / (2 * JUNTA))
                return (1 - w) * z_tras + w * z_frente
        pr = t % 1.0                                     # apoio de uma perna só
        return z_pela_perna("Right", -1, pr, t) if no_apoio(pr) else z_pela_perna("Left", 1, (t + 0.5) % 1.0, t)

    def medir_descida():
        """DESCE de cada lado: o que falta pra perna que toca alcançar a lona com o joelho do WBDS (+ DK) no contato."""
        for L, s, fase in LADOS:
            t_ic = (0.0 - fase) % 1.0                    # o contato de L
            outro = "Left" if L == "Right" else "Right"
            so = -s
            z_sai = z_pela_perna(outro, so, 0.5, t_ic)   # a perna de trás no fim do apoio dela (fase 0,5)
            DESCE[L] = max(0.0, z_sai - z_pela_perna(L, s, 0.0, t_ic))

    def quadril_mundo(t, L):
        """Articulação do quadril do lado L no quadro t (mundo) e o meio da pelve."""
        lado = pelve(t)[3]
        M = Vector((lado, M0.y, z_meio(t)))
        return M + rot_pelve(t) @ (quadris0[L] - M0), M

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
        return dict(coxa=coxa, joelho=coxa - canela, pe=angulo_pe(psi))

    medir_descida()
    # pontas do apoio de cada lado (pra emendar o balanço sem salto): valores na saída do pé e no contato
    TAB = {"coxa": WBDS_COXA, "joelho": WBDS_JOELHO, "pe": WBDS_PE}
    FIM, INI, CORR = {}, {}, {}

    def emendar():
        for L, s, fase in LADOS:
            FIM[L] = angulos_apoio(L, s, BETA, (BETA - fase) % 1.0)
            INI[L] = angulos_apoio(L, s, 0.0, (0.0 - fase) % 1.0)
            CORR[L] = {k: (FIM[L][k] - _cr(TAB[k], 100.0 * BETA), INI[L][k] - _cr(TAB[k], 100.0)) for k in TAB}

    emendar()

    def balanco(L, k, psi):
        """Curva do WBDS no balanço + a diferença pras pontas do apoio: a da saída some até 60% do balanço e a do contato entra a partir
        de 40% (no meio do balanço a perna segue o WBDS; com a diferença espalhada pelo balanço todo, o joelho passava de 68°)."""
        u = (psi - BETA) / (1 - BETA)
        c0, c1 = CORR[L][k]
        return _cr(TAB[k], 100.0 * psi) + c0 * (1 - _suave(u / 0.6)) + c1 * _suave((u - 0.4) / 0.6)

    def perna(L, s, fase, t):
        """Tornozelo (mundo), giro do pé e dos dedos (3x3) do lado L no quadro t, e se está no apoio."""
        psi = (t + fase) % 1.0
        if no_apoio(psi):
            A, R, Rd = apoio(L, s, min(psi, BETA))
            return A, R, Rd, True, psi
        H, _ = quadril_mundo(t, L)
        cx, jo, th = balanco(L, "coxa", psi), balanco(L, "joelho", psi), balanco(L, "pe", psi)
        cn = cx - jo
        K = H + Vector((0, -math.sin(math.radians(cx)), -math.cos(math.radians(cx)))) * L1
        A = K + Vector((0, -math.sin(math.radians(cn)), -math.cos(math.radians(cn)))) * L2
        meio = math.sin(math.pi * (psi - BETA) / (1 - BETA)) ** 2
        A.x = s * (X_PE + ABRE_BALANCO * meio)
        A.z += SOBE_BALANCO * meio
        giro = Matrix.Rotation(math.radians(s * GIRO_PE), 3, "Z")
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
        """Polegar deitado do lado do indicador (mão solta): as rotações são no referencial da própria mão (normal da palma, linha dos
        nós, direção dos dedos), então dão o mesmo polegar em qualquer pose do braço."""
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
        giro, queda, _, _ = pelve(t)
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
            w = (frente - u * frente.dot(u)).normalized()  # o cotovelo dobra pra frente (no plano do braço com a frente)
            f = (u * math.cos(ep) + w * math.sin(ep))
            f = (f * math.cos(io) - fora * math.sin(io)).normalized()
            W = E + f * Lf
            iks_b[L].mute = False
            punhos[L].location = W
            polos_c[L].location = E - w * 0.4               # polo atrás do cotovelo (o cotovelo aponta pra trás)
        p3.atualizar()
        for L, s, _ in LADOS:
            _congelar(L)
            f = (c(L + "Hand") - c(L + "ForeArm")).normalized()
            dentro = s * lado                              # palma virada pro meio do corpo (a coxa) e um pouco pra trás (pronação)
            palma = (dentro * math.cos(math.radians(PRONACAO)) - frente * math.sin(math.radians(PRONACAO))).normalized()
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
        pose((0.20 - fase) % 1.0)
        e = p3.acertar_polo(rig, iks[L], L + "Leg", L + "UpLeg", L + "Foot")
        print("polo joelho %s erro %.3f ang %d" % (L, e[0], e[1]))
    for L, _, fase in LADOS:                               # cada braço no quadro em que ele vai mais à frente (cotovelo mais dobrado)
        pose((BRACO_FASE - fase) % 1.0)
        iks_b[L].mute = False
        e = p3.acertar_polo(rig, iks_b[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo %s erro %.3f ang %d" % (L, e[0], e[1]))
    # o pé que rola na base dos dedos sobe o que a malha pede pra não entrar na lona (2 voltas: subir muda um pouco a perna)
    amostra = np.linspace(psi_ho, BETA, 14)
    for _ in range(2):
        for L, s, fase in LADOS:
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
            falta = []
            for psi in amostra:
                pose((psi - fase) % 1.0)
                co_, _, _ = ck._avaliar(bon.corpo, 1)
                falta.append(max(0.0, Z0 + 0.0002 - float(co_[m][:, 2].min())))
            SOBE[L] = (amostra, SOBE[L][1] + np.array(falta) if len(SOBE[L][1]) == len(amostra) else np.array(falta))
    medir_descida()
    emendar()                                              # o balanço emenda no apoio já com o pé que subiu
    print("PÉ SOBE (mm, no rolamento dos dedos): " + " | ".join("%s %s" % (L, " ".join("%.1f" % (x * 1000) for x in SOBE[L][1]))
                                                              for L, _, _ in LADOS))
    zs = [z_meio(i / 200) for i in range(201)]
    print("PELVE DESCE antes do contato: direito %.1f mm, esquerdo %.1f mm" % (DESCE["Right"] * 1000, DESCE["Left"] * 1000))
    print("CAMINHADA passada %.3f m | %.1f passos/min | apoio %.3f s, duplo apoio %.3f s | quadril (meio) z %.3f..%.3f (%.0f mm) | "
          "pontas do apoio: saída coxa %+.1f joelho %.1f pé %+.1f, contato coxa %+.1f joelho %.1f pé %+.1f | CORR %s" % (
              PASSADA, 120 / T, BETA * T, DS * T, min(zs), max(zs), (max(zs) - min(zs)) * 1000, FIM["Right"]["coxa"],
              FIM["Right"]["joelho"], FIM["Right"]["pe"], INI["Right"]["coxa"], INI["Right"]["joelho"], INI["Right"]["pe"],
              {k: tuple(round(x, 1) for x in v) for k, v in CORR["Right"].items()}))

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
        n_apoio = sum(1 for L, s, fase in LADOS if no_apoio((t + fase) % 1.0))
        return " | ".join(partes) + " | pés na lona: %d | tronco %+.1f° à frente | quadril z %.3f x %+.3f" % (n_apoio, incl, H[2], H[0])

    pegs = []
    return Cena(pose, es.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((4.4, -2.6, 1.55), (0, -0.05, 1.0), 50), info=info, apoios=es.apoios, afunda_apoio_mm=20)
