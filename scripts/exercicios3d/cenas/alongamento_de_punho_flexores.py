# Alongamento de Punho (flexores) — cena da fábrica 3D (lote 15, 13/10/2026; categoria nova "Alongamento e mobilidade", PR #191). Peso
# corporal, alongamento PARADO (estático) dos flexores do punho e dos dedos, em pé e sem equipamento: o braço DIREITO fica esticado à frente
# e a mão ESQUERDA segura os dedos dele pelo lado da palma e puxa os dedos e o punho pra trás.
# Ciclo (regras do lote 15, por coerência com a Prancha — Caminho A, decisão do Weslley de 11/10/2026 pras pranchas; pra este fica pra
# validação final dele): CÍCLICO ("ciclo": true na ficha, t = 1 igual a t = 0; o app repete). t = 0 é o ALONGAMENTO SEGURADO (a foto
# parada do app): o punho estendido ~70° em "pare", os dedos puxados pra trás; segura; solta até a posição de começo do ExRx (a palma pra
# baixo, o punho reto, a mão esquerda ainda segurando os dedos por baixo — t = 0,5 é o meio do tempo no começo); puxa de novo devagar e
# segura até o fim do ciclo (emenda com a segurada do começo).
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha):
#  · ExRx, Single Arm Wrist Flexor Stretch (cópia do Internet Archive de 28/05/2023): "With palm facing downward, grasp underside of
#    fingers with other hand and straighten elbow." / "Pull finger and wrist upward and back toward forearm. Hold stretch. Repeat with
#    opposite arm." (alvo "Wrist Flexors"); foto: em pé, o braço de perto esticado à frente um pouco abaixo do ombro e pro meio do corpo.
#  · AAOS/OrthoInfo, Therapeutic Exercise Program for Radial Tunnel Syndrome (04/2024), 1. Wrist Extension Stretch (= o NOSSO, alonga os
#    flexores): "Straighten your arm and bend your wrist back as if signaling someone to “stop.”" / "Use your opposite hand to apply
#    gentle pressure across the palm and pull it toward you until you feel a stretch on the inside of your forearm." / "Hold the stretch
#    for 15 seconds." / "Tip Do not lock your elbow."; desenho: em pé, de perfil, o braço de perto (o direito) na altura do ombro, a mão em
#    "pare" e a outra atravessada na frente dela, os dedos dando a volta na borda do dedo mínimo.
#  · Mayo Clinic (vídeo de 26/09/2024): "Breathe freely as you hold each stretch and be careful not to bounce." / "Hold the stretch for 15
#    to 30 seconds." / "Relax and return to the starting position"; quadros: a outra mão fechada em volta dos 4 dedos, o polegar de fora.
#  · Kaiser Permanente, Health Encyclopedia (WebMD Ignite, revisão clínica; 01/05/2026): "Extend your affected arm in front of you with your
#    palm facing down." / "Bend back your wrist on your affected arm, pointing your fingers up." / "With your other hand, gently bend your
#    wrist farther until you feel a mild to medium stretch in your forearm."
#  · ACSM (Garber et al. 2011): "Static stretching involves slowly stretching a muscle/tendon group and holding the position for a period
#    (i.e., 10-30 s)." / "In passive static stretching, a position is assumed while holding a limb or other part of the body".
# Decisões: em pé (ExRx, AAOS; a Mayo faz sentado à mesa), a base dos prontos de peso livre em pé (Elevação Frontal com Anilha: pés na largura
# do quadril, joelhos soltos). O braço direito alonga (o de perto no desenho da AAOS e na foto do ExRx): ombro a FLEXAO graus (o braço na
# altura do ombro, como no desenho da AAOS; a foto do ExRx fica um pouco abaixo) e ADUCAO graus pro meio do corpo (as mãos se encontram na
# frente do peito, como na foto do ExRx — com menos, o braço esquerdo não alcança os dedos direitos sem levar o ombro pra frente), cotovelo
# quase reto sem travar (COTOVELO), antebraço em pronação (a palma pra baixo no começo, ExRx). Segurando, o punho fica
# a PUNHO graus (a extensão normal da AAOS, Norkin & White, no limites.py: "until you feel a stretch", sem passar da amplitude) e os 4
# dedos juntos e retos, com as metacarpofalângicas estendidas MCF graus ("Pull finger and wrist"): a mão em "pare", os dedos pra cima e a
# palma pra frente. O polegar direito fica solto, na linha da palma (POLEGAR_D: fora do lado da palma, onde a mão esquerda segura).
# A mão esquerda: a palma no lado da palma dos dedos direitos ("grasp underside of fingers", ExRx; "across the palm", AAOS), atravessada a
# PHI graus da direção deles, pro lado do mínimo, e encostada sem entrar (AFUNDA); cada dedo esquerdo fecha (as 3 juntas na proporção da
# mão de referência) até a pele encostar na mão direita — os dedos dão a volta na borda do dedo mínimo, como no desenho da AAOS e nos
# quadros da Mayo — e o polegar dobra até encostar. O quadro da mão esquerda fica PRESO no osso da falange proximal do dedo médio direito
# (os 4 dedos direitos andam juntos, a MCF parada): na saída e na volta a mão esquerda anda com os dedos e, no começo, fica com a palma pra
# cima embaixo deles ("grasp underside of fingers"). O braço esquerdo vai por IK até o punho (o cotovelo pra fora e pra baixo) e o antebraço
# gira até a palma (o resto fica no punho esquerdo, que dobra pouco: ~25° segurando e ~17° no começo).
# Como o rig faz: pernas por IK com os tornozelos parados (a Elevação Frontal com Anilha); o braço direito por IK até o punho e congelado; o
# antebraço gira até a palma ficar pra baixo; a mão direita gira no punho em volta do eixo de flexão (+ = flexão, − = extensão: a medida
# punho_flexao do tecnica3d); tronco, escápulas e cabeça parados.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
AL, AJ = "Right", "Left"                  # o braço que alonga e a mão que ajuda
DEDOS = ("Index", "Middle", "Ring", "Pinky")

# ── pernas: a base em pé dos prontos de peso livre (Elevação Frontal com Anilha) ───────────────────────────────────────────────────────
PES_X = 0.165           # tornozelos a ±PES_X do meio (m): pés na largura do quadril
JOELHO = 10.0           # flexão dos joelhos (graus), parada: joelhos soltos, sem travar

# ── braço que alonga (direito), parado o ciclo todo ─────────────────────────────────────────────────────────────────────────────────────
FLEXAO = 92.0           # flexão do ombro: braço × vertical, pra frente (90 = horizontal): na altura do ombro (desenho da AAOS); com 82–88° e
                        # a adução abaixo, a pele do braço entrava 4–9 mm no peito logo depois do vinco da axila (sonda de 13/10/2026)
ADUCAO = 33.0           # o braço vai pro meio do corpo, visto de cima (graus): as mãos se encontram na frente do peito; com menos de ~32° o
                        # braço esquerdo não alcança os dedos direitos no começo (palma pra baixo) sem esticar o cotovelo inteiro
COTOVELO = 6.0          # flexão do cotovelo (graus): esticado sem travar (AAOS: "Do not lock your elbow")
DOBRA = 20.0            # pra onde o cotovelo dobra, em volta do braço (graus): 0 = pra cima, + = pro meio do corpo
PUNHO = -70.0           # punho_flexao segurando (− = extensão): a extensão normal da AAOS (Norkin & White, limites.py)
PUNHO0 = 0.0            # na posição de começo (ExRx: "With palm facing downward"; a mão na linha do antebraço)
MCF = 15.0              # extensão das metacarpofalângicas dos 4 dedos ("Pull finger and wrist"), parada: a mão esquerda segura os dedos
JUNTA = 1.0             # os dedos da mão alongada fecham o leque do repouso: lado a lado ("dedos juntos e retos"; sem a pele de um dedo
                        # cruzar a do vizinho — medido)
POLEGAR_D = (0.0, -25.0, 0.0, 5.0, 0.0, 5.0)   # polegar da mão alongada (polegar3d: CMC flexão, abdução e rotação; MCF flexão e abdução;
                        # IF): solto, na linha da palma

# ── mão que ajuda (esquerda): a palma no lado da palma dos dedos direitos, atravessada ────────────────────────────────────────────────
PHI = 60.0              # os dedos esquerdos a PHI graus da direção dos dedos direitos, pro lado do mínimo (90 = atravessados)
DS, DK = 0.015, 0.0     # o meio da palma esquerda além do meio das falanges proximais direitas (m): pra ponta dos dedos, pro mínimo
JUNTA_E = 0.9           # os dedos da mão que ajuda lado a lado (1 = juntos)
AFUNDA = 0.0005         # a pele da mão que ajuda apertando a outra (m): encosta sem entrar
POLO_E = (0.55, -0.15, 0.85)   # pra onde o cotovelo esquerdo aponta (mundo): pra fora e pra baixo

# ── ciclo (como a Prancha): t = 0 segurando; solta, fica no começo (meio em t = 0,5) e puxa de novo ────────────────────────────────────
SEGURA_S = 5.0          # s segurando por ciclo: uma segurada representativa, a mesma das pranchas (as fontes: 15 a 30 s)
SOLTA_S = 1.5           # s soltando (Mayo: "Relax and return to the starting position")
COMECO_S = 0.5          # s na posição de começo
PUXA_S = 2.0            # s puxando, devagar (ACSM: "slowly stretching"; Mayo: "gently pull"; ACE: "Avoid bouncing or jerking movements")
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


def _com_sinal(bvh, pts, lim=0.5, dentro=0.03):
    """Menor distância com sinal dos pontos até a superfície (− = dentro), como o checagem3d.contatos (o "dentro" só até `dentro` m)."""
    menor = lim
    for p in pts:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is not None:
            menor = min(menor, -d if (d < dentro and (v - loc).dot(nor) < 0) else d)
    return menor


def montar(bon):
    pg.usar_polegar("volta")             # padrão dos exercícios novos (aqui nenhuma mão fecha em pegador: o polegar vai à mão)
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
    d = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th))   # quadril → tornozelo
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

    # ── braço direito: à frente, um pouco abaixo da horizontal e pro meio do corpo, cotovelo quase reto, palma pra baixo (parado) ──────
    s_al = -1
    S = c(AL + "Arm")
    tf, ta = math.radians(FLEXAO), math.radians(ADUCAO)
    u = Matrix.Rotation(-s_al * ta, 3, "Z") @ Vector((0.0, -math.sin(tf), -math.cos(tf)))   # gira pro meio do corpo (+X no direito)
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
    A_ax = (c(AL + "Hand") - c(AL + "ForeArm")).normalized()          # eixo do antebraço (parado o ciclo todo)
    N0 = Vector((0.0, 0.0, -1.0))
    N0 = (N0 - A_ax * N0.dot(A_ax)).normalized()                       # a palma pra baixo, ⟂ antebraço (punho reto)
    print("BRAÇO D | flexão %.1f adução %.1f | polo erro %.3f ang %d | punho a %.1f mm do alvo | ombro %s cotovelo %s punho %s" % (
        FLEXAO, ADUCAO, e[0], e[1], (c(AL + "Hand") - W).length * 1000, tuple(round(x, 3) for x in S),
        tuple(round(x, 3) for x in c(AL + "ForeArm")), tuple(round(x, 3) for x in c(AL + "Hand"))), flush=True)

    # ── mão direita: dedos juntos e retos (a MCF estendida), polegar solto na linha da palma, o punho dobrando no eixo de flexão ───────
    def dedos_retos(lado, mcf):
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, JUNTA)
        palma, k = pg._base(rig, lado)[:2]
        for d_ in DEDOS:
            o1 = "%sHand%s1" % (lado, d_)
            r = (c(o1) - c(lado + "Hand")).normalized()                 # o metacarpo daquele dedo
            f1 = (p3.ponta(rig, o1) - c(o1)).normalized()
            sinal = 1 if k.cross(f1).dot(palma) > 0 else -1               # + = gira pro lado da palma (fecha)
            alvo = Matrix.Rotation(math.radians(-sinal * mcf), 3, k) @ r  # a falange proximal estendida `mcf` graus
            for i in (1, 2, 3):
                o = "%sHand%s%d" % (lado, d_, i)
                fo = (p3.ponta(rig, o) - c(o)).normalized()
                fp = (fo - k * fo.dot(k)).normalized()
                ap = (alvo - k * alvo.dot(k)).normalized()
                p3.girar_osso(rig, o, Matrix.Rotation(math.atan2(fp.cross(ap).dot(k), fp.dot(ap)), 3, k))
                alvo = (p3.ponta(rig, o) - c(o)).normalized()            # a falange seguinte na linha desta (o dedo reto)

    def polegar_d(q):
        """Polegar da mão alongada na postura q (graus, eixos anatômicos do polegar3d, a partir do repouso do rig)."""
        ossos = [AL + "HandThumb%d" % i for i in (1, 2, 3)]
        for o in ossos:
            PB[p3.P + o].matrix_basis = Matrix()
        p3.atualizar()
        cab = [np.array(c(o)) for o in ossos]
        eix = P3.eixos_do_polegar(np.array(pg._base(rig, AL)[0]), cab, np.array(p3.ponta(rig, ossos[2])))
        for o, R in zip(ossos, P3.rotacoes(eix, q)):
            if not np.allclose(R, np.eye(3)):
                p3.girar_osso(rig, o, Matrix(R.tolist()))

    def mao_alongada(a):
        """Mão direita com o alongamento `a` (1 = segurando, 0 = começo): o punho; os dedos e o polegar ficam como estão sempre."""
        g = math.radians(PUNHO0 + (PUNHO - PUNHO0) * a)
        PB[p3.P + AL + "Hand"].matrix_basis = Matrix()
        p3.atualizar()
        mao_quadro(AL, A_ax * math.cos(g) + N0 * math.sin(g), N0 * math.cos(g) - A_ax * math.sin(g))   # + = flexão
        dedos_retos(AL, MCF)
        polegar_d(POLEGAR_D)

    # ── mão esquerda (a que ajuda): o quadro dela fica PRESO no osso da falange proximal do dedo médio direito, calculado uma vez com o
    # alongamento segurado; o braço esquerdo vai por IK até o punho e o antebraço gira pra palma (o resto no punho) ─────────────────────
    for n in (AJ + "Arm", AJ + "ForeArm", AJ + "Hand"):
        PB[p3.P + n].matrix_basis = Matrix()
    p3.soltar_dedos(rig, AJ)
    pg.juntar_dedos(rig, AJ, JUNTA_E)
    p3.atualizar()
    R_bone0 = p3.mundo_osso(rig, AJ + "Hand").to_3x3()
    h0 = c(AJ + "Hand")
    d_L = (c(AJ + "HandMiddle1") - h0).normalized()
    n_L = pg._base(rig, AJ)[0]
    n_L = (n_L - d_L * n_L.dot(d_L)).normalized()
    Q = R_bone0.transposed() @ Matrix((d_L, n_L, d_L.cross(n_L))).transposed()     # o quadro (dedos, palma) no osso da mão
    co0, tri0, (nomes0, dono0) = _malha(bon, 1)
    V = co0[_grupo(nomes0, dono0, (AJ + "Hand",))]
    alt = (V - np.array(h0)) @ np.array(n_L)
    palmar = V[alt > np.percentile(alt, 80)]                            # a pele do lado da palma
    C_loc = R_bone0.transposed() @ (Vector(palmar.mean(axis=0)) - h0)   # o meio da palma, no osso da mão
    TODA_D = tuple(n for n in nomes0 if n.startswith(AL + "Hand"))
    TODA_E = tuple(n for n in nomes0 if n.startswith(AJ + "Hand"))

    def quadro_dedos_d():
        """Quadro dos 4 dedos direitos: f = direção média das falanges proximais, kp = do indicador pro mínimo (⟂ f), n = pro lado da
        palma; O = o meio das 4 falanges proximais (no eixo dos ossos)."""
        fs = [(p3.ponta(rig, AL + "Hand%s1" % d_) - c(AL + "Hand%s1" % d_)).normalized() for d_ in DEDOS]
        f_ = sum(fs, Vector()).normalized()
        kp = c(AL + "HandPinky1") - c(AL + "HandIndex1")
        kp = (kp - f_ * kp.dot(f_)).normalized()
        n_ = f_.cross(kp).normalized()
        if n_.dot(pg._base(rig, AL)[0]) < 0:
            n_ = -n_
        O = sum(((c(AL + "Hand%s1" % d_) + p3.ponta(rig, AL + "Hand%s1" % d_)) / 2 for d_ in DEDOS), Vector()) / 4
        return f_, kp, n_, O

    def alvo_mao_ajuda(dist):
        """Quadro (mundo, do osso da mão esquerda) com a palma virada pros dedos direitos, os dedos esquerdos a PHI graus da direção deles
        e o meio da palma em O + f·DS + kp·DK + n·dist."""
        f_, kp, n_, O = quadro_dedos_d()
        dq = (f_ * math.cos(math.radians(PHI)) + kp * math.sin(math.radians(PHI))).normalized()
        R = Matrix((dq, -n_, dq.cross(-n_))).transposed() @ Q.transposed()
        M = R.to_4x4()
        M.translation = O + f_ * DS + kp * DK + n_ * dist - R @ C_loc
        return M

    def por_mao_ajuda(M_alvo):
        """Braço esquerdo por IK até o punho do quadro M_alvo (mundo, do osso da mão); o antebraço gira pra palma e a mão fica no
        quadro pedido (o resto no punho). Devolve o erro do punho (m)."""
        for n in (AJ + "Arm", AJ + "ForeArm", AJ + "Hand"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        iks[AJ].mute = False
        punhos[AJ].location = M_alvo.translation
        polos[AJ].location = Vector(POLO_E)
        p3.atualizar()
        congelar(AJ)
        R3 = M_alvo.to_3x3()
        girar_antebraco(AJ, R3 @ (Q @ Vector((0.0, 1.0, 0.0))))
        p3.girar_osso(rig, AJ + "Hand", R3 @ p3.mundo_osso(rig, AJ + "Hand").to_3x3().transposed())
        return (c(AJ + "Hand") - M_alvo.translation).length

    def bvh_direita(niveis=1):
        co, tri, (nomes, dono) = _malha(bon, niveis)
        return _bvh(co, tri, _grupo(nomes, dono, TODA_D)), co, nomes, dono

    def palma_x_direita(dist):
        """A palma esquerda (com a base do polegar) até a mão direita, com o meio da palma a `dist` dos dedos direitos (m, − = entrou)."""
        M = alvo_mao_ajuda(dist)
        por_mao_ajuda(M)
        bvh, co, nomes, dono = bvh_direita(1)
        return _com_sinal(bvh, co[_grupo(nomes, dono, (AJ + "Hand", AJ + "HandThumb1"))], 0.1), M

    mao_alongada(1.0)
    M_mid1 = p3.mundo_osso(rig, AL + "HandMiddle1")
    lo, hi = -0.02, 0.06                                               # a palma desce pelos dedos direitos até encostar
    for _ in range(18):
        meio_ = (lo + hi) / 2
        dmm, _M = palma_x_direita(meio_)
        if dmm < -AFUNDA:
            lo = meio_
        else:
            hi = meio_
    DIST = hi
    dmm, M1 = palma_x_direita(DIST)
    print("MÃO E | meio da palma a %.1f mm do eixo das falanges proximais direitas | palma × mão direita %+.2f mm" % (
        DIST * 1000, dmm * 1000), flush=True)

    def fechar_ajuda():
        """Dedos esquerdos: cada um, do esticado pro fechado (as 3 juntas na proporção da mão de referência de 29 mm), até a pele encostar
        na mão direita (sem entrar mais que 1,5 mm); o polegar dobra (ou abre) até encostar sem entrar."""
        bvh, co, nomes, dono = bvh_direita(0)
        pos = {n: i for i, n in enumerate(nomes)}
        palma_n, eixo_nos = pg._base(rig, AJ)[:2]
        ref = pg.angulos_do_cilindro(29.0)
        out = {}
        for d_ in DEDOS:
            ossos = ["%sHand%s%d" % (AJ, d_, i) for i in (1, 2, 3)]
            pts = {o: co[dono == pos[o]] for o in ossos}
            cab = {o: np.array(c(o)) for o in ossos}
            ponta = np.array(p3.ponta(rig, ossos[-1]))
            f1 = (p3.ponta(rig, ossos[0]) - c(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f1).dot(palma_n) > 0 else -1
            escolha, ant = None, None
            for lam in np.arange(-0.30, 1.001, 0.02):
                angs = [lam * ref[d_][k] * sinal for k in range(3)]
                pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, angs)
                dmin = _com_sinal(bvh, np.concatenate([pp[o] for o in ossos])[::2], 0.1)
                if dmin < -0.0015:
                    escolha = ant if ant is not None else (lam, angs, dmin)
                    break
                ant = (lam, angs, dmin)
                if dmin < AFUNDA:
                    escolha = ant
                    break
            if escolha is None:
                escolha = ant
            lam, angs, dmin = escolha
            for k, o in enumerate(ossos):
                if angs[k]:
                    p3.girar_osso(rig, o, p3.rot_eixo(angs[k], eixo_nos))
            out[d_] = (round(float(lam), 2), round(dmin * 1000, 1))
        ossos = [AJ + "HandThumb%d" % i for i in (1, 2, 3)]
        melhor = None
        for lam in np.arange(-1.5, 2.51, 0.1):
            for o in ossos:
                PB[p3.P + o].matrix_basis = Matrix()
            p3.atualizar()
            p3.fechar_mao(rig, AJ, angulos=(0, 0, 0), polegar=tuple(lam * g for g in (10, 20, 15)))
            bvh, co, nomes, dono = bvh_direita(0)
            dmin = _com_sinal(bvh, co[_grupo(nomes, dono, ossos)], 0.1)
            nota = abs(dmin - 0.0003) if dmin >= -0.0015 else 1 + abs(dmin)
            if melhor is None or nota < melhor[0]:
                melhor = (nota, lam, dmin)
        for o in ossos:
            PB[p3.P + o].matrix_basis = Matrix()
        p3.atualizar()
        p3.fechar_mao(rig, AJ, angulos=(0, 0, 0), polegar=tuple(melhor[1] * g for g in (10, 20, 15)))
        out["Thumb"] = (round(float(melhor[1]), 2), round(melhor[2] * 1000, 1))
        return out

    print("MÃO E | dedos (λ, mm até a mão direita) %s" % fechar_ajuda(), flush=True)
    OFF = M_mid1.inverted() @ p3.mundo_osso(rig, AJ + "Hand")         # a mão esquerda presa nos dedos direitos
    estado = {}

    def pose(t):
        """t = 0 (e 1) segurando o alongamento; t = 0,5 no meio do tempo na posição de começo (a palma pra baixo)."""
        a = alongado(t)
        mao_alongada(a)
        estado["erro_E"] = por_mao_ajuda(p3.mundo_osso(rig, AL + "HandMiddle1") @ OFF)
        estado["t"], estado["a"] = t, a

    # ── medidas à parte (mão × mão não entra na checagem do corpo) ─────────────────────────────────────────────────────────────────────
    def _cruzam(co, tri, nomes, dono, a_, b_):
        """Quantos pares de triângulos da parte a_ cruzam os da parte b_ (0 = as peles nem se tocam)."""
        return len(_bvh(co, tri, _grupo(nomes, dono, a_)).overlap(_bvh(co, tri, _grupo(nomes, dono, b_))))

    def _fundo(co, tri, nomes, dono, a_, b_, lim=0.006):
        """Pele de a_ mais funda dentro de b_ (mm, + = fora), o "dentro" só até `lim` (perto de uma borda aberta o sinal engana)."""
        return _com_sinal(_bvh(co, tri, _grupo(nomes, dono, b_)), co[_grupo(nomes, dono, a_)], 0.1, lim) * 1000

    def medidas():
        """mm (− = entrou) e cruzamentos: mão E × mão D (os 2 sentidos), dedos direitos entre si, polegar D × mão E, antebraço E × mão D
        e × antebraço D, mão E × antebraço D, mãos × tronco e cabeça."""
        co, tri, (nomes, dono) = _malha(bon)
        d_ = lambda L, x: ["%sHand%s%d" % (L, x, i) for i in (1, 2, 3)]
        out = {"mão E→D": _fundo(co, tri, nomes, dono, TODA_E, TODA_D), "mão D→E": _fundo(co, tri, nomes, dono, TODA_D, TODA_E)}
        for a_, b_ in (("Index", "Middle"), ("Middle", "Ring"), ("Ring", "Pinky"), ("Thumb", "Index")):
            out["D %s×%s" % (a_[:2], b_[:2])] = _cruzam(co, tri, nomes, dono, d_(AL, a_), d_(AL, b_))
        out["polegar D × mão E"] = _fundo(co, tri, nomes, dono, d_(AL, "Thumb"), TODA_E)
        out["antebraço E × mão D"] = _fundo(co, tri, nomes, dono, (AJ + "ForeArm",), TODA_D)
        out["antebraço E × antebraço D"] = _fundo(co, tri, nomes, dono, (AJ + "ForeArm",), (AL + "ForeArm",))
        out["mão E × antebraço D"] = _fundo(co, tri, nomes, dono, TODA_E, (AL + "ForeArm",))
        out["mãos × tronco"] = min(_fundo(co, tri, nomes, dono, TODA_E + TODA_D, ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head")),
                                   999.0)
        return out

    def info():
        j = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        m = medidas()
        return ("alongado %.2f | punho D flexão %+.1f desvio %+.1f (junta %.1f) | punho E flexão %+.1f desvio %+.1f (junta %.1f) | "
                "cotovelo D %.1f E %.1f | braço frente %s elevação %s plano %s | escápula %s | ombros nível %.1f | tronco giro %.1f | "
                "coluna %.1f | palma D pra cima %.0f, × frente %.0f | punho E a %.1f mm do alvo | %s" % (
                    estado.get("a", -1), tc.punho_flexao(j)[1], tc.punho_desvio(j)[1], jt["punhoD"], tc.punho_flexao(j)[0],
                    tc.punho_desvio(j)[0], jt["punhoE"], jt["cotoveloD"], jt["cotoveloE"],
                    "/".join("%.0f" % v for v in tc.braco_frente(j)), "/".join("%.0f" % v for v in tc.braco_elevacao(j)),
                    "/".join("%.0f" % v for v in tc.braco_plano(j)), "/".join("%.0f" % v for v in tc.escapula_frente(j)),
                    tc.ombros_nivel(j)[0], tc.tronco_giro(j)[0], tc.coluna(j)[0], tc.palma_cima(j)[1], tc.palma_frente(j)[1],
                    estado.get("erro_E", 0) * 1000,
                    " | ".join("%s %s" % (k, ("%+.1f" % v) if isinstance(v, float) else v) for k, v in m.items())))

    for t in (0.0, 0.5):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.3, 1.2),
                camera_video=((-2.7, -2.4, 1.6), (0.0, -0.3, 1.15), 50), info=info)
