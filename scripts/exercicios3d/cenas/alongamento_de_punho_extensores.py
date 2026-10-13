# Alongamento de Punho (extensores) — cena da fábrica 3D (lote 15, 13/10/2026; categoria nova "Alongamento e mobilidade", PR #191). Peso
# corporal, alongamento PARADO (estático) dos extensores do punho, em pé e sem equipamento: o braço DIREITO fica esticado à frente com a
# palma pra baixo e a mão ESQUERDA, nas costas da mão direita, dobra o punho pra baixo e puxa a mão em direção ao corpo.
# Ciclo (regras do lote 15, por coerência com a Prancha — Caminho A, decisão do Weslley de 11/10/2026 pras pranchas; pra este fica pra
# validação final dele), os MESMOS tempos do Alongamento de Punho (flexores): CÍCLICO ("ciclo": true na ficha, t = 1 igual a t = 0; o app
# repete). t = 0 é o ALONGAMENTO SEGURADO (a foto parada do app): o punho dobrado ~74°, os dedos juntos e esticados apontando pro chão;
# segura; solta até a posição de começo (a palma pra baixo, o punho reto, a mão esquerda ainda encostada nas costas da mão direita —
# t = 0,5 é o meio do tempo no começo); dobra de novo devagar e segura até o fim do ciclo (emenda com a segurada do começo).
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha):
#  · ExRx, Single Arm Wrist Extensor Stretch (cópias do Internet Archive de 2023 e 2024): "With palm facing downward, pull wrist and fingers
#    downward toward forearm." / "Extend or straighten elbow. Hold stretch. Repeat with opposite arm." / "Elbow may be extended first,
#    followed by pulling palm toward forearm." (alvo "Wrist Extensors"); foto: em pé, o braço esticado à frente um pouco abaixo do ombro.
#  · AAOS/OrthoInfo, Therapeutic Exercise Program for Radial Tunnel Syndrome (04/2024), 2. Wrist Flexion Stretch (= o NOSSO, alonga os
#    extensores): "Straighten your arm with your palm facing down and bend your wrist so that your fingers point down." / "Gently pull your
#    hand toward your body until you feel a stretch on the outside of your forearm." / "Hold the stretch for 15 seconds." / "Tip Do not lock
#    your elbow."; desenho: em pé, de perfil, o braço na altura do ombro, os dedos pro chão e a outra mão vindo por baixo, a palma no lado
#    do polegar e os dedos dando a volta por cima das costas da mão.
#  · Mayo Clinic (vídeo de 26/09/2024): "lift one of your arms and hold it comfortably in front of you — palm facing down. Bend your hand
#    downward and gently pull it toward you using your other hand." / "Breathe freely as you hold each stretch and be careful not to
#    bounce."; quadros: a outra mão fechada em volta das costas da mão, os dedos alongados esticados pro chão.
#  · Kaiser Permanente, Health Encyclopedia, Wrist extensor stretch (WebMD Ignite, revisão clínica; 01/05/2026): "Extend the arm with the
#    affected wrist in front of you and point your fingers toward the floor." / "With your other hand, gently bend your wrist farther until
#    you feel a mild to moderate stretch in your forearm."
#  · Manias & Stasinopoulos 2006 (epicondilite): "the forearm in full pronation, and the wrist in flexion and ulnar deviation according to
#    the patient's tolerance" — a posição montada pelo fisioterapeuta; aqui sem o desvio pro lado do dedo mínimo (ExRx, AAOS, Mayo, Kaiser).
# Decisões (as mesmas do par, o Alongamento de Punho (flexores), pra saírem coerentes lado a lado no app): em pé, a base dos prontos de peso
# livre em pé (Elevação Frontal com Anilha: pés na largura do quadril, joelhos soltos); o braço DIREITO alonga, a FLEXAO graus (o braço na
# altura do ombro, desenho da AAOS) e ADUCAO graus pro meio do corpo (as mãos na frente do peito, fotos do ExRx e da Kaiser), cotovelo
# quase reto sem travar (COTOVELO; AAOS "Do not lock your elbow"), parado o ciclo todo (o braço esticado antes de dobrar o punho: AAOS,
# Mayo, Kaiser e o "Elbow may be extended first" do ExRx), antebraço em pronação (a palma pra baixo). Segurando, o punho fica a PUNHO
# graus de flexão (perto do fim da flexão normal da AAOS, 80°, Norkin & White: "until you feel a stretch", sem dor) e os 4 dedos juntos e
# retos apontando pro chão ("fingers point down", AAOS; Kaiser; quadros da Mayo); o polegar direito fica solto, no repouso (como no par).
# A mão esquerda (a pegada do desenho da AAOS e dos quadros da Mayo): a palma no LADO DO POLEGAR da mão direita e os 4 dedos passando pela
# frente das costas dela até o lado do dedo mínimo; no começo é a MESMA pegada, só girada junto com a mão direita (2 posturas no
# referencial da mão direita, misturadas pelo alongamento): a mão esquerda desce ~7 cm e puxa pra trás ("Gently pull your hand toward your
# body", AAOS). O braço esquerdo vai por IK até o punho e a mão segue um pouco o antebraço (K_ALINHA); a palma encosta sem entrar (FOLGA),
# cada dedo esquerdo fecha (a base, depois as 2 outras juntas) até encostar na mão direita (APERTO) e o polegar esquerdo procura a posição
# mais perto da natural que encosta sem entrar (a busca do polegar de hoje do pegada3d, numa janela em volta da escolha do alongamento mais
# perto já feito — a mesma pose na saída e na volta, sem salto). A pose da mão esquerda fica guardada por alongamento (o mesmo "a" na
# saída e na volta dá a mesma pose).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
AL, AJ = "Right", "Left"                  # o braço que alonga e a mão que ajuda (os mesmos do Alongamento de Punho (flexores))
DEDOS = ("Index", "Middle", "Ring", "Pinky")

# ── pernas: a base em pé dos prontos de peso livre (Elevação Frontal com Anilha), a mesma do Alongamento de Punho (flexores) ──────
PES_X = 0.165           # tornozelos a ±PES_X do meio (m): pés na largura do quadril
JOELHO = 10.0           # flexão dos joelhos (graus), parada: joelhos soltos, sem travar

# ── braço que alonga (direito): o MESMO do Alongamento de Punho (flexores) ──────────────────────────────────────────────────────────
FLEXAO = 92.0           # flexão do ombro (braço × vertical, pra frente; 90 = horizontal)
ADUCAO = 33.0           # o braço vai pro meio do corpo, visto de cima (graus)
COTOVELO = 6.0          # flexão do cotovelo (graus): quase reto, sem travar
DOBRA = 20.0            # pra onde o cotovelo dobra, em volta do braço (graus): 0 = pra cima, + = pro meio do corpo
PUNHO = 74.0            # punho_flexao no alongamento segurado (+ = flexão): perto do fim da flexão normal (80°, AAOS), sem chegar nela
PUNHO0 = 0.0            # na posição de começo (a palma pra baixo, a mão na linha do antebraço)
JUNTA = 0.9             # quanto os dedos da mão alongada fecham o leque do repouso (1 = lado a lado)

# ── mão que ajuda (esquerda) ───────────────────────────────────────────────────────────────────────────────────────────────────────
S1 = 0.080              # segurando: a linha dos nós da mão esquerda, a partir do punho direito ao longo da mão direita (m)
NOS_FRENTE = 0.012      # segurando: os nós da mão esquerda passam isso da frente das costas da mão direita (m)
NOS_DENTRO = 0.008      # ... e ficam isso pra dentro do lado do polegar dela (m): os dedos atravessam as costas da mão
TETA1 = 105.0           # segurando: o 3º metacarpo esquerdo × a direção da mão direita (graus, pras costas dela): 90 = reto pra frente
TETA0 = 70.0            # no começo: o mesmo (a mão direita deitada; o 3º metacarpo esquerdo sobe pra frente e pra cima)
BETA_LADO = 20.0        # ... e vira isso pro lado do dedo mínimo da mão direita (graus): segue o antebraço esquerdo
S0 = 0.060              # no começo: a linha dos nós da mão esquerda, a partir do punho direito (m)
NOS_DENTRO0 = -0.005    # no começo: os nós da mão esquerda pra dentro do lado do polegar da mão direita (m)
NOS_FRENTE0 = 0.018     # no começo: os nós da mão esquerda acima das costas da mão direita (m)
DEDO_LIVRE = (30.0, 30.0)   # dedo esquerdo que não encosta em nada na busca: dobra relaxada da base e da 2ª junta (graus)
APERTO_POL = 0.0010     # polegar esquerdo × mão direita na busca: a pele afunda no máximo isso (m)
NIVEL = 1               # nível da malha nas buscas da mão esquerda (o mesmo da checagem)
POLO_E = (0.20, 0.20, -0.45)   # polo do cotovelo esquerdo a partir do punho esquerdo (m): pra fora, pra trás e pra baixo
FOLGA = -0.0005         # palma esquerda × mão direita: encostando (m, − = a pele afunda isso)
APERTO = 0.0010         # dedo × mão: a pele pode afundar até isso (m)
MEIO_PALMA = 0.055      # do punho esquerdo até o meio da palma (m), ao longo do 3º metacarpo
ESP = 0.016             # do eixo da mão esquerda até a pele da palma (m)
DEDO_BASE = (8.0, 4.0)  # dobra natural da 2ª e da 3ª junta dos dedos esquerdos (graus) antes de fechar
MCF_MAX, IFP_MAX = 90.0, 100.0   # o máximo que a base e a 2ª junta dos dedos esquerdos dobram na busca (graus)
K_ALINHA = 0.6          # quanto o 3º metacarpo esquerdo segue o antebraço esquerdo (0 = a postura da chave, 1 = o punho reto)
POLEGAR_E = (40.0, 45.0, 60.0)   # dobra máxima das 3 juntas do polegar esquerdo na busca (graus; as do pegada3d)
POL_NAT = (0, 0, 0.3)            # postura natural do polegar esquerdo na busca (afasta, gira no plano da palma, fração da dobra)
JANELA_POL = (10, 0.3)           # busca do polegar esquerdo perto da escolha do quadro anterior: ± graus (afasta, gira) e ± dobra

# ── ciclo (como a Prancha e o Alongamento de Punho (flexores)): t = 0 segurando; solta, fica no começo (meio em t = 0,5) e puxa ───
SEGURA_S, SOLTA_S, COMECO_S, PUXA_S = 5.0, 1.5, 0.5, 2.0
CICLO_S = SEGURA_S + SOLTA_S + COMECO_S + PUXA_S
T_SOLTA = (0.5 - (COMECO_S / 2 + SOLTA_S) / CICLO_S, 0.5 - COMECO_S / 2 / CICLO_S)
T_PUXA = (0.5 + COMECO_S / 2 / CICLO_S, 0.5 + (COMECO_S / 2 + PUXA_S) / CICLO_S)


def alongado(t):
    """Quanto o punho está alongado no quadro t: 1 = segurando (o alongamento feito), 0 = a posição de começo; seno nas pontas."""
    if t <= T_SOLTA[0] or t >= T_PUXA[1]:
        return 1.0
    if t < T_SOLTA[1]:
        return 1.0 - p3.suave((t - T_SOLTA[0]) / (T_SOLTA[1] - T_SOLTA[0]))
    if t <= T_PUXA[0]:
        return 0.0
    return p3.suave((t - T_PUXA[0]) / (T_PUXA[1] - T_PUXA[0]))


def _malha(bon, niveis=1):
    return ck._avaliar(bon.corpo, niveis)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _bvh(co, tri, m):
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def _com_sinal(bvh, pts, lim=0.5, paridade=False):
    """Menor distância com sinal dos pontos até a superfície (− = dentro), como o checagem3d.contatos. paridade: o "dentro" pela
    normal só vale se a paridade do raio (checagem3d._dentro) confirmar — a malha recortada por osso tem bordas e dobras internas
    (o polegar encostado no indicador) que enganam a normal."""
    menor = lim
    for p in pts:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is not None:
            dentro = d < 0.03 and (v - loc).dot(nor) < 0
            if dentro and paridade and d < menor and not ck._dentro(bvh, v):
                dentro = False
            menor = min(menor, -d if dentro else d)
    return menor


MAO_D = tuple("RightHand" + s for s in [""] + ["%s%d" % (d, i) for d in DEDOS + ("Thumb",) for i in (1, 2, 3)])
MAO_D_ANT = MAO_D + ("RightForeArm",)     # a mão direita fechada no punho (a malha só da mão é aberta ali e engana o dentro/fora)


def montar(bon):
    pg.usar_polegar("volta")
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    Lb = (c(AL + "ForeArm") - c(AL + "Arm")).length
    La = (c(AL + "Hand") - c(AL + "ForeArm")).length
    coxa = (c("LeftLeg") - c("LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - c("LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q0 = c("LeftUpLeg")
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2

    # ── pernas por IK: tornozelos parados a ±PES_X do meio, joelhos pra frente, pés chapados (a Elevação Frontal com Anilha) ─────────
    pernas = {}
    for lado, s in LADOS:
        tz = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * PES_X, tz.y, tz.z)))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.22, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    PB[p3.P + "Hips"].matrix_basis = Matrix()
    p3.atualizar()
    th = math.radians(JOELHO)
    d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))
    dx, dy = q0.x - PES_X, q0.y - tornoz.y
    desce = tornoz.z + math.sqrt(max(d ** 2 - dx ** 2 - dy ** 2, 0.01)) - q0.z
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), pivo=pivo, mover=Vector((0, 0, desce)))
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e, flush=True)

    # ── braços por IK (os alvos nascem no punho de repouso: alvo = polo dá NaN), congelados em FK depois ─────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, c(lado + "ForeArm") + Vector((s * 0.3, 0.3, -0.5)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
        iks[lado].mute = True
    p3.atualizar()

    def congelar(lado):
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def girar_antebraco(lado, quer):
        """Prona/supina o antebraço em volta do próprio eixo pra palma ir pra `quer` (projetado ⟂ antebraço)."""
        f0, f1 = c(lado + "ForeArm"), c(lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = (quer - ax * quer.dot(ax)).normalized()
        tem = pg._base(rig, lado)[0]
        tem = (tem - ax * tem.dot(ax)).normalized()
        p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))

    def mao_quadro(lado, dq, pq):
        """Mão `lado` com o 3º metacarpo (punho → base do dedo médio) pra `dq` e a palma pra `pq` (mundo), girando no punho."""
        f1 = c(lado + "Hand")
        dd = (c(lado + "HandMiddle1") - f1).normalized()
        n = pg._base(rig, lado)[0]
        n = (n - dd * n.dot(dd)).normalized()
        pq = (pq - dq * pq.dot(dq)).normalized()
        F_tem = Matrix((dd, n, dd.cross(n))).transposed()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())

    # ── braço direito: à frente, um pouco abaixo da horizontal e pro meio do corpo, cotovelo quase reto, palma pra baixo ──────────────
    s_al = -1
    S = c(AL + "Arm")
    tf, ta = math.radians(FLEXAO), math.radians(ADUCAO)
    u0 = Vector((0.0, -math.sin(tf), -math.cos(tf)))
    u = Matrix.Rotation(-s_al * ta, 3, "Z") @ u0                         # gira pro meio do corpo (+X no braço direito)
    Z = Vector((0.0, 0.0, 1.0))
    cima = (Z - u * u.dot(Z)).normalized()
    meio = Vector((-s_al, 0.0, 0.0))
    meio = (meio - u * meio.dot(u) - cima * meio.dot(cima)).normalized()
    b = cima * math.cos(math.radians(DOBRA)) + meio * math.sin(math.radians(DOBRA))
    f = (u * math.cos(math.radians(COTOVELO)) + b * math.sin(math.radians(COTOVELO))).normalized()
    E = S + u * Lb
    W = E + f * La
    iks[AL].mute = False
    punhos[AL].location = W
    polos[AL].location = E - b * 0.4
    p3.atualizar()
    e = p3.acertar_polo(rig, iks[AL], AL + "ForeArm", AL + "Arm", AL + "Hand")
    congelar(AL)
    girar_antebraco(AL, Vector((0.0, 0.0, -1.0)))                     # pronação: a palma pra baixo
    print("BRAÇO D | polo erro %.3f ang %d | punho a %.1f mm do alvo | ombro %s cotovelo %s punho %s" % (
        e[0], e[1], (c(AL + "Hand") - W).length * 1000, tuple(round(x, 3) for x in S), tuple(round(x, 3) for x in c(AL + "ForeArm")),
        tuple(round(x, 3) for x in c(AL + "Hand"))), flush=True)
    A_ax = (c(AL + "Hand") - c(AL + "ForeArm")).normalized()          # eixo do antebraço (parado o ciclo todo)
    N0 = Vector((0.0, 0.0, -1.0))
    N0 = (N0 - A_ax * N0.dot(A_ax)).normalized()                       # a palma pra baixo, ⟂ antebraço (punho reto)

    def dedos_retos(lado, junta=JUNTA):
        """Dedos lado a lado e retos no plano da palma (AAOS: "fingers point down"; quadros da Mayo); o polegar solto, no repouso
        (como no Alongamento de Punho (flexores))."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, junta)
        for dd in DEDOS:
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, dd, i)
                fo = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = fo - palma * fo.dot(palma)
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, fo.rotation_difference(plano).to_matrix())

    def mao_alongada(a):
        """Mão direita no quadro com o alongamento `a` (1 = segurando, 0 = começo): o punho dobra (+ = flexão)."""
        g = math.radians(PUNHO0 + (PUNHO - PUNHO0) * a)
        PB[p3.P + AL + "Hand"].matrix_basis = Matrix()
        p3.atualizar()
        mao_quadro(AL, A_ax * math.cos(g) + N0 * math.sin(g), N0 * math.cos(g) - A_ax * math.sin(g))   # + = flexão
        dedos_retos(AL)

    def base_dir():
        """Referencial da mão direita: punho W, h (punho → base do dedo médio), dd (costas da mão), e3 = h × dd; e o sinal do lado do
        polegar em e3."""
        Wr = c(AL + "Hand")
        h = (c(AL + "HandMiddle1") - Wr).normalized()
        palma, eixo_nos = pg._base(rig, AL)[:2]
        dd = -(palma - h * palma.dot(h)).normalized()
        e3 = h.cross(dd)
        return Wr, Matrix((h, dd, e3)).transposed(), (1 if e3.dot(-eixo_nos) > 0 else -1)

    # medidas da mão direita no referencial dela (a mão é rígida): costas, lado do polegar
    mao_alongada(0.0)
    Wr, B, sr = base_dir()
    co, tri, (nomes, dono) = _malha(bon)
    md = _grupo(nomes, dono, MAO_D)
    rel = (np.array(co[md]) - np.array(Wr)) @ np.array(B)
    def faixa(s, larg=0.008):
        return rel[np.abs(rel[:, 0] - s) < larg]
    f1, f0 = faixa(S1), faixa(S0)
    R1 = float((f1[:, 2] * sr).max())           # lado do polegar na linha da pegada (distância do eixo, m)
    D1 = float(f1[:, 1].max())                  # costas da mão na linha da pegada
    D0 = float(f0[:, 1].max())

    def medida_dir(s_lin):
        """Lado do polegar e costas da mão direita na linha s_lin (distância do eixo dela, m)."""
        f_ = faixa(s_lin)
        return float((f_[:, 2] * sr).max()), float(f_[:, 1].max())
    print("MÃO D | lado do polegar %.1f mm, costas %.1f mm (pegada, s=%.0f mm) | costas %.1f mm (começo, s=%.0f mm) | larg %.1f mm" % (
        R1 * 1000, D1 * 1000, S1 * 1000, D0 * 1000, S0 * 1000, (f1[:, 2].max() - f1[:, 2].min()) * 1000), flush=True)

    # ── mão esquerda: 2 posturas no referencial da mão direita, misturadas pelo alongamento ──────────────────────────────────────────
    def chaves():
        """As 2 posturas da mão esquerda no referencial da mão direita (h, costas, e3), lidas das constantes do módulo. A pegada é a
        mesma nas 2 pontas — a palma esquerda no lado do polegar da mão direita e os dedos passando por cima das costas dela (Mayo,
        quadros de 23 a 35 s; AAOS, o desenho) —, só gira junto com a mão direita: o 3º metacarpo esquerdo sai TETA graus da direção
        da mão direita (h) pras costas dela e vira BETA_LADO pro lado do dedo mínimo dela; os nós ficam NOS_FRENTE na frente das costas
        e NOS_DENTRO pra dentro do lado do polegar, na linha S (a partir do punho direito)."""
        g = globals()
        k = tuple(g[n] for n in ("TETA1", "TETA0", "BETA_LADO", "S1", "S0", "NOS_FRENTE", "NOS_DENTRO", "NOS_DENTRO0", "NOS_FRENTE0", "MEIO_PALMA", "ESP",
                                 "DEDO_LIVRE", "APERTO_POL",
                                 "POLO_E", "K_ALINHA", "FOLGA", "MCF_MAX", "IFP_MAX", "DEDO_BASE", "POLEGAR_E",
                                 "APERTO", "JUNTA", "PUNHO", "POL_NAT"))
        if estado.get("chave") == k:
            return estado["chaves"]
        bl = math.radians(BETA_LADO)
        qs, Ps = [], []
        for teta, s_lin, dentro, frente in ((TETA0, S0, NOS_DENTRO0, NOS_FRENTE0), (TETA1, S1, NOS_DENTRO, NOS_FRENTE)):
            R_, D_ = medida_dir(s_lin)
            tt = math.radians(teta)
            m_ = Vector((math.cos(tt), math.sin(tt), 0.0))
            m_ = Matrix.Rotation(-sr * bl, 3, Vector((1.0, 0.0, 0.0))) @ m_
            p_ = Vector((0.0, 0.0, -sr))
            p_ = (p_ - m_ * p_.dot(m_)).normalized()
            T_ = Vector((s_lin, D_ + frente, sr * (R_ - dentro)))
            Ps.append(T_ - m_ * (0.110 - MEIO_PALMA) - p_ * ESP)
            qs.append(Matrix((m_, p_, m_.cross(p_))).transposed().to_quaternion())
        estado["chave"], estado["chaves"] = k, (qs[0], qs[1], Ps[0], Ps[1], None, None)
        estado.pop("cache", None)
        return estado["chaves"]

    estado = {"polo": None}

    def por_esquerda(Wt, mq, pq):
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + AJ + n].matrix_basis = Matrix()
        p3.atualizar()
        iks[AJ].mute = False
        punhos[AJ].location = Wt
        polos[AJ].location = Wt + Vector(POLO_E)
        p3.atualizar()
        if estado["polo"] is None or estado["polo"][0] != tuple(POLO_E):
            estado["polo"] = (tuple(POLO_E), p3.acertar_polo(rig, iks[AJ], AJ + "ForeArm", AJ + "Arm", AJ + "Hand"))
        congelar(AJ)
        girar_antebraco(AJ, pq)
        mao_quadro(AJ, mq, pq)

    def palma_esq(co, nomes, dono, pq):
        """Pele da mão esquerda que encosta na mão direita: o osso da mão inteiro e a base do polegar (até 25 mm da junta dele)."""
        P_ = co[_grupo(nomes, dono, (AJ + "Hand",))]
        T_ = co[_grupo(nomes, dono, (AJ + "HandThumb1",))]
        T_ = T_[np.linalg.norm(T_ - np.array(c(AJ + "HandThumb1")), axis=1) < 0.025]
        return np.concatenate([P_, T_])

    def fechar_dedos_esq():
        """Cada dedo da mão esquerda (indicador ao mínimo) dobra a base (MCF) até encostar na mão direita, e depois as 2 outras juntas
        juntas (a 3ª = 0,5 × a 2ª) até encostar de novo — sem entrar na mão direita nem na palma esquerda."""
        p3.soltar_dedos(rig, AJ)
        pg.juntar_dedos(rig, AJ, JUNTA)
        co, tri, (nomes, dono) = _malha(bon, NIVEL)
        bvh_d = _bvh(co, tri, _grupo(nomes, dono, MAO_D_ANT))
        bvh_pe = _bvh(co, tri, _grupo(nomes, dono, (AJ + "Hand",)))
        palma, eixo_nos = pg._base(rig, AJ)[:2]
        pos = {n: i for i, n in enumerate(nomes)}
        W_ = np.array(c(AJ + "Hand"))
        m_ = np.array((c(AJ + "HandMiddle1") - c(AJ + "Hand")).normalized())
        pl_ = np.array(palma)
        out = {}
        for d_ in DEDOS:
            ossos = ["%sHand%s%d" % (AJ, d_, i) for i in (1, 2, 3)]
            pts = {o: co[dono == pos[o]] for o in ossos}
            cab = {o: np.array(c(o)) for o in ossos}
            fo = (p3.ponta(rig, ossos[0]) - c(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(fo).dot(palma) > 0 else -1
            b1, b2 = DEDO_BASE

            def bate(angs):
                pp = pg._cadeia_pts(pts, cab, None, ossos, [eixo_nos] * 3, [x * sinal for x in angs])
                P_ = np.concatenate([pp[o] for o in ossos])
                if _com_sinal(bvh_d, P_[::2], 0.05, paridade=True) < -APERTO:
                    return True
                Q_ = pp[ossos[2]]                                          # a ponta só conta em cima da palma (a malha
                ao = (Q_ - W_) @ m_                                         # da palma é aberta na base dos dedos e engana
                Q_ = Q_[(ao > 0.01) & (ao < 0.10) & ((Q_ - W_) @ pl_ > 0)]  # o dentro/fora perto dos nós)
                return len(Q_) > 0 and _com_sinal(bvh_pe, Q_[::2], 0.05) < -APERTO

            g1 = -10.0
            for g in np.arange(MCF_MAX, -10.01, -1.0):
                if not bate([g, b1, b2]):
                    g1 = float(g)
                    break
            livre = g1 >= MCF_MAX                                       # fechou tudo sem encostar: dobra relaxada (ou a
            if livre:                                                   # menor acima dela que não entra)
                g1 = next((float(g) for g in np.arange(DEDO_LIVRE[0], MCF_MAX + 0.01, 1.0) if not bate([g, b1, b2])), MCF_MAX)
            g2 = b1
            for g in np.arange(DEDO_LIVRE[1] if livre else IFP_MAX, b1 - 0.01, -1.0):
                if not bate([g1, g, b2 + (g - b1) * 0.5]):
                    g2 = float(g)
                    break
            if g2 >= IFP_MAX:                                           # a ponta não encosta: dobra relaxada (ou a menor
                g2 = next((float(g) for g in np.arange(DEDO_LIVRE[1], IFP_MAX + 0.01, 1.0)   # acima dela que não entra)
                           if not bate([g1, g, b2 + (g - b1) * 0.5])), IFP_MAX)
            for k, ang in enumerate((g1, g2, b2 + (g2 - b1) * 0.5)):
                if ang:
                    p3.girar_osso(rig, ossos[k], p3.rot_eixo(ang * sinal, eixo_nos))
            out[d_[0]] = (round(g1), round(g2))
        return out

    def polegar_esq(alvo, antes=None):
        """Polegar esquerdo (a busca do polegar de hoje do pegada3d.fechar_em_volta: afasta da palma em volta da linha dos nós, gira no
        plano da palma e dobra as 3 juntas), com a polpa o mais perto do `alvo` sem entrar na mão direita nem nos dedos/palma
        esquerdos; `antes` = a escolha do quadro anterior (a ponta não salta)."""
        from mathutils.kdtree import KDTree
        ossos = ["%sHandThumb%d" % (AJ, i) for i in (1, 2, 3)]
        for o in ossos:
            PB[p3.P + o].matrix_basis = Matrix()
        p3.atualizar()
        co, tri, (nomes, dono) = _malha(bon, NIVEL)
        pos = {n: i for i, n in enumerate(nomes)}
        bvh_d = _bvh(co, tri, _grupo(nomes, dono, MAO_D_ANT))
        palma, eixo_nos = pg._base(rig, AJ)[:2]
        pts0 = {o: co[dono == pos[o]] for o in ossos}
        cab0 = {o: np.array(c(o)) for o in ossos}
        ponta0 = np.array(p3.ponta(rig, ossos[2]))
        h1 = cab0[ossos[0]]
        outros = co[_grupo(nomes, dono, tuple("%sHand%s%d" % (AJ, d_, i) for d_ in DEDOS for i in (1, 2, 3)))]
        arv = KDTree(len(outros))
        for i, v in enumerate(outros):
            arv.insert(Vector(v), i)
        arv.balance()
        sinais_f = []
        for k, o in enumerate(ossos):
            fo = Vector((cab0[ossos[k + 1]] if k < 2 else ponta0) - cab0[o]).normalized()
            ex = fo.cross(palma).normalized()
            al_ = (c(AJ + "HandMiddle1") - Vector(cab0[o])).normalized()
            sinais_f.append((ex, 1 if ex.cross(fo).dot(al_) > 0 else -1))

        def girar_tudo(pts, cab, ponta, eixo_g, graus):
            pts = {o: pg._rot(pts[o], h1, eixo_g, graus) for o in ossos}
            cab = {o: (pg._rot(cab[o][None], h1, eixo_g, graus)[0] if o != ossos[0] else cab[o]) for o in ossos}
            return pts, cab, pg._rot(ponta[None], h1, eixo_g, graus)[0]

        def busca(abds, bbs, lams):
            melhor = None
            for abd in abds:
                pa, ca, ta = girar_tudo(pts0, cab0, ponta0, eixo_nos, abd)
                for bb in bbs:
                    pb_, cb_, tb = girar_tudo(pa, ca, ta, palma, bb)
                    for lam in lams:
                        angs3 = [lam * POLEGAR_E[k] * sinais_f[k][1] for k in range(3)]
                        pp = pg._cadeia_pts(pb_, cb_, tb, ossos, [x[0] for x in sinais_f], angs3)
                        P_ = np.concatenate([pp[o] for o in ossos])
                        longe = P_[np.linalg.norm(P_ - h1, axis=1) > 0.022]
                        if _com_sinal(bvh_d, longe, 0.05) < -APERTO_POL:   # a mesma medida da checagem (contatos)
                            continue
                        if any(arv.find(Vector(v))[2] < 0.002 for v in longe[::3]):
                            continue
                        toca = _com_sinal(bvh_d, pp[ossos[2]][::2], 0.05, paridade=True)   # polpa × mão direita
                        nota = max(0.0, toca - 0.001) + 0.0008 * (abs(abd - POL_NAT[0]) / 5 + abs(bb - POL_NAT[1]) / 5 +
                                                                 abs(lam - POL_NAT[2]) / 0.1)
                        if antes is not None:
                            nota += 0.002 * ((abs(abd - antes[0]) + abs(bb - antes[1])) / 5 + abs(lam - antes[2]) / 0.1)
                        if melhor is None or nota < melhor[0]:
                            melhor = (nota, abd, bb, float(lam), toca)
            return melhor

        GA, GB, GL = range(-40, 61, 5), range(-40, 41, 5), np.arange(0, 1.05, 0.1)
        melhor = None
        if antes is not None:                       # perto da escolha do quadro anterior (a ponta não salta; a conta cai ~20×);
            ja, jl = JANELA_POL                     # a grade inteira só se nada perto servir
            melhor = busca([v for v in GA if abs(v - antes[0]) <= ja], [v for v in GB if abs(v - antes[1]) <= ja],
                           [v for v in GL if abs(v - antes[2]) <= jl + 1e-6])
        if melhor is None:
            melhor = busca(GA, GB, GL)
        if melhor is None:
            return None
        nota, abd, bb, lam, toca = melhor
        if abd:
            p3.girar_osso(rig, ossos[0], p3.rot_eixo(abd, eixo_nos), pivo=Vector(h1))
        if bb:
            p3.girar_osso(rig, ossos[0], p3.rot_eixo(bb, palma), pivo=Vector(h1))
        for k, o in enumerate(ossos):
            fo = (p3.ponta(rig, o) - c(o)).normalized()
            ex = fo.cross(palma).normalized()
            al_ = (c(AJ + "HandMiddle1") - c(o)).normalized()
            sg = 1 if ex.cross(fo).dot(al_) > 0 else -1
            if lam * POLEGAR_E[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(lam * POLEGAR_E[k] * sg, ex))
        return (abd, bb, round(lam, 1), round(toca * 1000, 1))

    def mao_esquerda(a):
        q0, q1, P0, P1, A0, A1 = chaves()
        cache = estado.setdefault("cache", {})
        chave_a = round(a, 6)
        if chave_a in cache:
            for n, M in cache[chave_a][0].items():
                PB[p3.P + n].matrix_basis = M
            p3.atualizar()
            estado.update(cache[chave_a][1])
            return
        Wr, B, _ = base_dir()
        R = q0.slerp(q1, a).to_matrix()
        mq0, pq0 = B @ R.col[0], B @ R.col[1]
        Pc = Wr + B @ P0.lerp(P1, a)
        mq, pq = mq0, pq0
        p3.soltar_dedos(rig, AJ)
        pg.juntar_dedos(rig, AJ, JUNTA)
        for volta in range(3):                                          # a mão segue um pouco o antebraço (punho mais natural)
            por_esquerda(Pc - mq * MEIO_PALMA, mq, pq)
            fl = (c(AJ + "Hand") - c(AJ + "ForeArm")).normalized()
            mq = (mq0 * (1 - K_ALINHA) + fl * K_ALINHA).normalized()
            pq = (pq0 - mq * pq0.dot(mq)).normalized()
        s_ = 0.0
        for volta in range(8):                                          # a palma esquerda encosta na mão direita
            por_esquerda(Pc - mq * MEIO_PALMA, mq, pq)
            co, tri, (nomes, dono) = _malha(bon, NIVEL)
            bvh_d = _bvh(co, tri, _grupo(nomes, dono, MAO_D_ANT))
            s_ = _com_sinal(bvh_d, palma_esq(co, nomes, dono, pq), 0.08, paridade=True)
            if abs(s_ - FOLGA) < 0.0003:
                break
            Pc = Pc + pq * (s_ - FOLGA)
        dedos = fechar_dedos_esq()
        perto = min(cache, key=lambda x: abs(x - chave_a)) if cache else None   # parte da escolha do alongamento (a) mais
        pol = polegar_esq(None, cache[perto][1]["polegar"] if perto is not None else None)   # perto já feito: a mesma na ida e na volta
        estado.update({"palma": s_ * 1000, "dedos": dedos, "polegar": pol})
        cache[chave_a] = ({pb.name[len(p3.P):]: pb.matrix_basis.copy() for pb in PB if pb.name[len(p3.P):].startswith(AJ)},
                          {"palma": s_ * 1000, "dedos": dedos, "polegar": pol})

    def pose(t):
        a = alongado(t)
        mao_alongada(a)
        mao_esquerda(a)
        estado["t"], estado["a"] = t, a

    def medidas():
        co, tri, (nomes, dono) = _malha(bon)
        out = {}
        bvh_d = _bvh(co, tri, _grupo(nomes, dono, MAO_D_ANT))
        for dd in DEDOS:
            pa = ["%sHand%s%d" % (AJ, dd, i) for i in (1, 2, 3)]
            out["E" + dd[0] + "×D"] = _com_sinal(bvh_d, co[_grupo(nomes, dono, pa)], 0.1) * 1000
        out["ET1×D"] = _com_sinal(bvh_d, co[_grupo(nomes, dono, (AJ + "HandThumb1",))], 0.1) * 1000
        out["ET23×D"] = _com_sinal(bvh_d, co[_grupo(nomes, dono, (AJ + "HandThumb2", AJ + "HandThumb3"))], 0.1) * 1000
        out["Epalma×D"] = _com_sinal(bvh_d, co[_grupo(nomes, dono, (AJ + "Hand",))], 0.1) * 1000
        out["antebracoE×D"] = _com_sinal(bvh_d, co[_grupo(nomes, dono, (AJ + "ForeArm",))], 0.1) * 1000
        return out

    def info():
        j = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        m = medidas()
        return ("a %.2f | punho D flexão %+.1f desvio %+.1f (junta %.1f) | E flexão %+.1f desvio %+.1f (junta %.1f) | cotovelo D %.1f "
                "E %.1f | braço frente %s elevação %s plano %s | escápula %s | ombros nível %.1f | tronco giro %.1f | coluna %.1f | "
                "palma frente %s | %s" % (
                    estado.get("a", -1), tc.punho_flexao(j)[1], tc.punho_desvio(j)[1], jt["punhoD"], tc.punho_flexao(j)[0],
                    tc.punho_desvio(j)[0], jt["punhoE"], jt["cotoveloD"], jt["cotoveloE"], "/".join("%.0f" % v for v in tc.braco_frente(j)),
                    "/".join("%.0f" % v for v in tc.braco_elevacao(j)), "/".join("%.0f" % v for v in tc.braco_plano(j)),
                    "/".join("%.0f" % v for v in tc.escapula_frente(j)), tc.ombros_nivel(j)[0], tc.tronco_giro(j)[0], tc.coluna(j)[0],
                    "/".join("%.0f" % v for v in tc.palma_frente(j)), " ".join("%s %+.1f" % kv for kv in m.items())) +
                " | palma busca %.1f mm | dedos E (MCF, 2ª) %s | polegar E %s" % (estado.get("palma", 0), estado.get("dedos"),
                                                                            estado.get("polegar")))

    for t in (0.0, 0.5):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.3, 1.2),
                camera_video=((-2.6, -2.6, 1.6), (0, -0.3, 1.2), 50), info=info)
