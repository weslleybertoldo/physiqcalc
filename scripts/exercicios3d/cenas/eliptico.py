# Elíptico — cena da fábrica 3D (lote 14, 12/10/2026). CARDIO no elíptico de academia com manetes móveis (e3.eliptico, peça nova; tração
# atrás, como o Life Fitness Integrity). Em pé nos 2 pedais, os pés fazem a elipse sem sair dos pedais e as mãos vão e voltam nos manetes.
# CÍCLICO, como a Corrida e a Caminhada na Esteira: t = 0 → 1 é UMA volta da manivela e a pose em t = 1 é IGUAL à de t = 0 (a ficha tem
# "ciclo": true e o app repete o clipe). t = 0 = pedal DIREITO no ponto mais à frente (o começo do apoio dele, Knutzen 2010: "The stance
# phase was defined as the phase of the elliptical that begins with the most anterior pedal position and ends at the most posterior pedal
# position"); t = 0,5 = o direito no ponto mais atrás e o esquerdo na frente. Cadência de 54,5 voltas/min: 1 volta = 1,10 s (= ida_s).
# Técnica (só o que foi lido):
#  · Em pé, as 2 pernas o tempo todo nos pedais (Cesar 2020: "its constant double-limb support"; Burnfield 2020: "sustained elliptical
#    pedal contact time"), a ponta do pé na borda da frente do pedal (Knutzen 2010: "all subjects placed their feet on the pedals with the
#    front edge of their shoes up against the front edge of the pedal").
#  · Joelho e quadril (Knutzen 2010, Tabela 1, rampa baixa): joelho de 14,91° a 69,14° ("The knee did not reach a fully extended position
#    during the elliptical stride"); quadril (coxa × vertical, Fig. 1: θhip) de 6,78° de extensão a 45,63° de flexão; "Peak knee and hip
#    extension occurred during the last quarter of the stance phase, while peak knee and hip flexion occurred during the final quarter of
#    the closed-chain swing phase." O quadril (a pelve) fica parado onde a perna dá esses ângulos com a elipse da peça.
#  · Tornozelo: com o pé chapado no pedal a dorsiflexão chegaria a ~31° no fim do apoio (o pé atrás, subindo), além da amplitude normal
#    (Alazzawi 2017, Tabela 5: "Dorsiflexion 0-20 degrees"): o calcanhar sobe do pedal nessa parte (o pé gira na base dos dedos, que fica
#    apoiada) — Burnfield 2020: "Heel contact time on SportsArt and Octane exceeded walking, and SportsArt heel contact time exceeded Life
#    Fitness" (o calcanhar não fica apoiado a volta toda). Knutzen: "Peak ankle dorsiflexion occurred during the stance phase and peak
#    plantarflexion occurred during the closed-chain swing phase."
#  · Mãos fechadas nos manetes móveis, que vão e voltam opostos às pernas (Burnfield 2011: "dynamic (nonfixed) handles that move
#    reciprocally with leg motion (ie, if the right foot is posterior, then the right hand is anterior)"), com o cotovelo dobrado ~90° no
#    meio do vaivém, como correndo (ACE/Consumer Reports: "your wrists, arms, shoulders, and knees should be able to comfortably mimic a
#    running motion").
#  · Tronco em pé, um pouco à frente (ACE/CR: "comfortably maintain an upright posture while holding on to the handgrips"; Burnfield 2010:
#    "Significantly greater flexion was documented at the trunk, pelvis, hip, and knee during elliptical training than during walking";
#    Moreside & McGill 2012, Fig. 2a: flexão lombar média ~10° com os manetes) e girando um pouco com os braços (Moreside, Fig. 2b: rotação
#    lombar total ~20° com os manetes); a cabeça olhando pra frente.
# Como o rig faz: a ligação do elíptico (manivela, braço do pedal, balancim) é resolvida primeiro (e3.LigacaoEliptico): passada de 50,8 cm
# centrada em y = 0 e o topo do pedal a 24 cm no ponto mais baixo; o pedal fica nivelado no ponto mais baixo. O pé é preso no pedal (a
# ponta dos dedos 4 mm atrás da borda da frente, a sola 0,8 mm dentro da borracha) e, na parte de trás da volta, o calcanhar sobe girando
# na base dos dedos (CALCANHAR). O quadril (articulações) é posto onde a perna dá o joelho e a coxa do Knutzen; a pelve e o tórax inclinam
# um pouco à frente, o tórax gira com os manetes e a cabeça olha pra frente. Pernas por IK até o tornozelo (o joelho no plano quadril–
# tornozelo–frente). O pegador de cada manete é desenhado onde a mão fecha com o cotovelo a 90° no meio do vaivém; em cada quadro as mãos
# vão por IK até o pegador (Maos.segurar com zerar) e os dedos voltam pra posição fechada em volta dele (a mão fica rígida no pegador).
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
CADENCIA = 54.5           # voltas/min: Prosser 2011 (109 passos/min no elíptico, casado com a caminhada) e Moreside & McGill 2012 (53 ± 7
T = 60.0 / CADENCIA       # ciclos/min, ritmo escolhido pra 30 min) → 1,10 s por volta (= ida_s da ficha)
# ── a máquina (Life Fitness Integrity; o resto é escolha da fábrica, resolvido em lote4/eliptico/exp/geom3.py) ─────────────────────────
PASSADA = 0.508           # Life Fitness: "Stride Length | 20" (51cm)"
DEGRAU = 0.24             # Life Fitness: "Step-Up Height | 9.5" (24cm)" (topo do pedal no ponto mais baixo)
R_MANIVELA = 0.254        # manivela que dá a passada de 50,8 cm com esta ligação
O_MENOS_P = (1.450, -0.800)   # eixo da manivela em relação ao cubo dos balancins (y, z)
BALANCIM, BRACO = 0.90, 1.50  # cubo → ponta de baixo do balancim; pino da manivela → ponta da frente do braço do pedal
PEDAL_NO_BRACO, ALTURA_PEDAL = 1.05, 0.055   # o meio do topo do pedal a 1,05 m do pino da manivela e 5,5 cm acima do braço
X_BRACO, X_MANETE = 0.24, 0.29                # braços dos pedais e balancins por fora das pernas
PEDAL = (0.38, 0.16, 0.026)   # Life Fitness: "Oversized 15" FlexForm Pedals" (38 cm); 16 cm de largura e a chapa: escolha
X_PEDAL = 0.038 + PEDAL[1] / 2   # Life Fitness: "Minimum Space between Foot Pedals | 3" (7.6cm)" → meio do pedal a ±11,8 cm
PONTA = 0.170             # ponta dos dedos a 17 cm do meio do pedal: 4 mm atrás da borda da frente (borda de 16 mm)
AFUNDA_PE = 0.0008        # a sola afunda na borracha do pedal
# ── perna (Knutzen 2010, Tabela 1, rampa baixa) e calcanhar ─────────────────────────────────────────────────────────────────────────
ALVO_JOELHO = (14.91, 69.14)  # flexão mínima e máxima do joelho
ALVO_COXA = (-6.78, 45.63)    # coxa × vertical (θhip): 6,78° de extensão a 45,63° de flexão
CALCANHAR = (20.0, 0.52, 0.60)  # o calcanhar sobe até 20° (o pé gira na base dos dedos), máximo em t = 0,52 (pé direito), cos² de largura
                                # 0,60 da volta (de t = 0,22 a 0,82): a dorsiflexão fica em ≤ 20° (sem isso, ~31°)
# ── tronco ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INCLINA_PELVE = 2.0       # graus: anteversão da pelve (o tronco vai junto)
LOMBAR = (5.0, 5.0)       # Spine e Spine1 (graus): o tórax ~10° à frente da pelve (Moreside, manetes: ~10°)
GIRO_TORAX = 9.0          # o tórax gira até ±9° em relação à pelve, junto com os manetes (Moreside, manetes: ~20° no total)
# ── braços e mãos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BRACO_DESCE = 30.0        # linha ombro → pegador abaixo da horizontal (graus) com o manete no meio do vaivém
COTOVELO = 90.0           # cotovelo no meio do vaivém
X_MAO = 0.25              # pegadores a ±25 cm do meio
RAIO_MANOPLA = 0.0175     # espuma de 35 mm (escolha)
PEGADOR_FRENTE = 12.0     # o alto do pegador inclinado pra frente do perpendicular ao antebraço no meio do vaivém (graus): o punho fica
                          # entre ~15° de desvio pro lado do polegar e ~15° pro do dedo mínimo na volta toda (perpendicular: até 25°
                          # pro lado do polegar com a mão atrás; o limites.py/tecnica3d dão 20° de desvio radial normal); a mão fechada num bastão
                          # também o deixa um pouco inclinado pra frente
ALINHA = 0.0              # a linha dos nós sempre ao longo do pegador: a mão fica igual em volta dele em todo quadro (os dedos
                          # fechados uma vez valem pra volta toda); o punho é que dobra quando o pegador inclina


def _ang(a, b):
    c = a.normalized().dot(b.normalized())
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _bump(t, centro, largura):
    """cos² centrado em `centro` (fração da volta), largura `largura`, 0 fora; periódico."""
    u = ((t - centro + 0.5) % 1.0 - 0.5) / largura
    return math.cos(math.pi * u) ** 2 if abs(u) <= 0.5 else 0.0


def calcanhar(t, s):
    """Quanto o calcanhar do lado s está levantado (graus) no quadro t: o esquerdo faz o do direito meia volta depois."""
    amp, centro, larg = CALCANHAR
    return amp * _bump((t + (0.5 if s > 0 else 0.0)) % 1.0, centro, larg)


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO_MANOPLA * 2000)   # mão de referência de um cilindro de 35 mm (antes do Maos)
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
    A0, T0, ancora = {}, {}, {}
    for L, s in LADOS:
        A0[L], T0[L] = bon.cabeca_osso(L + "Foot"), bon.cabeca_osso(L + "ToeBase")
        m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
        P = co0[m]
        fatia = P[np.abs(P[:, 1] - T0[L].y) < 0.006]
        xc = float(fatia[:, 0].min() + fatia[:, 0].max()) / 2           # meio do pé na base dos dedos
        ancora[L] = Vector((xc, float(P[:, 1].min()), float(P[:, 2].min())))   # (meio, ponta dos dedos, sola)
    TORN0 = _ang(A0["Left"] - bon.cabeca_osso("LeftLeg"), T0["Left"] - A0["Left"])   # canela × pé no repouso (~76°: neutro)
    print("BONECO coxa %.4f canela %.4f quadris ±%.4f | pé: ponta y %.4f sola z %.4f meio x %.4f | tornozelo neutro %.1f°" % (
        L1, L2, X_H, ancora["Left"].y, ancora["Left"].z, ancora["Left"].x, TORN0), flush=True)

    # ── 2) a ligação: passada centrada em y = 0, pedal embaixo a DEGRAU, pedal nivelado no ponto mais baixo ──────────────────────────
    def ligacao(cubo, beta0):
        return e3.LigacaoEliptico(manivela=(cubo[0] + O_MENOS_P[0], cubo[1] + O_MENOS_P[1], R_MANIVELA), cubo=cubo,
                                  balancim=BALANCIM, braco=BRACO, pedal_no_braco=PEDAL_NO_BRACO, altura_pedal=ALTURA_PEDAL,
                                  beta0=beta0, x_braco=X_BRACO, x_manete=X_MANETE, x_pedal=X_PEDAL)

    GR = [360.0 * k / 720 for k in range(720)]
    lig = ligacao((0.0, 1.0), 0.0)
    topos = [lig.pedal(-1, g).to_translation() for g in GR]
    ys, zs = [p.y for p in topos], [p.z for p in topos]
    k_baixo = int(np.argmin(zs))
    beta0 = -lig.inclinacao(-1, GR[k_baixo])
    lig = ligacao((-(min(ys) + max(ys)) / 2, 1.0 + DEGRAU - min(zs)), beta0)
    topos = [lig.pedal(-1, g).to_translation() for g in GR]
    TH0 = GR[int(np.argmin([p.y for p in topos]))]                      # pedal direito no ponto mais à frente
    incls = [lig.inclinacao(-1, g) for g in GR]
    print("LIGAÇÃO manivela (y %.4f z %.4f r %.4f) cubo (y %.4f z %.4f) | passada %.4f m, pedal de %.4f a %.4f m (sobe %.4f) | pedal de "
          "%+.1f° a %+.1f° (β0 %+.2f°) | t = 0 com a manivela direita em %.1f°" % (
              lig.O.y, lig.O.z, lig.r, lig.P.y, lig.P.z, max(p.y for p in topos) - min(p.y for p in topos), min(p.z for p in topos),
              max(p.z for p in topos), max(p.z for p in topos) - min(p.z for p in topos), min(incls), max(incls), beta0, TH0), flush=True)

    def graus(t):
        return TH0 + 360.0 * t

    SOBE = {L: (np.array([0.0, 1.0]), np.zeros(2)) for L, _ in LADOS}   # quanto o pé sobe no quadro (m), medido na malha (abaixo)

    def sobe(L, t):
        ts, zs_ = SOBE[L]
        return float(np.interp(t % 1.0, ts, zs_, period=1.0))

    def no_pe(L, s, t):
        """Matriz 4x4 que leva o pé de repouso pro lugar dele no quadro t: preso no pedal, com o calcanhar levantado girando na base dos
        dedos (a cabeça do ToeBase fica no lugar). Com o calcanhar levantado a pele da dobra dos dedos (pesos do pé e dos dedos) desce
        pra dentro do pedal: o pé inteiro sobe o que a malha pede (SOBE, medido no montar), como na Caminhada na Esteira."""
        g = math.radians(calcanhar(t, s))
        Mh = Matrix.Translation(T0[L]) @ Matrix.Rotation(g, 4, "X") @ Matrix.Translation(-T0[L])
        return lig.pedal(s, graus(t)) @ Matrix.Translation(Vector((0.0, -PONTA, -AFUNDA_PE + sobe(L, t))) - ancora[L]) @ Mh

    # ── 3) o quadril (articulações) onde a perna dá o joelho e a coxa do Knutzen (perna direita; a esquerda é o espelho meia volta depois)
    NQ = 48
    Ad = np.array([list(no_pe("Right", -1, k / NQ) @ A0["Right"]) for k in range(NQ)])
    grade = np.array([(y, z) for y in np.arange(-0.16, 0.1601, 0.0025) for z in np.arange(1.00, 1.30, 0.0025)])
    Hs = np.stack([np.full(len(grade), -X_H), grade[:, 0], grade[:, 1]], axis=1)
    dvec = Ad[None, :, :] - Hs[:, None, :]
    dl = np.linalg.norm(dvec, axis=2)
    cos_k = np.clip((L1 * L1 + L2 * L2 - dl * dl) / (2 * L1 * L2), -1, 1)
    flex = 180.0 - np.degrees(np.arccos(cos_k))                       # flexão do joelho
    u = dvec / dl[..., None]
    f = np.array([0.0, -1.0, 0.0])
    w = f - u * (u @ f)[..., None]
    w /= np.linalg.norm(w, axis=2)[..., None]
    ca = np.clip((L1 * L1 + dl * dl - L2 * L2) / (2 * L1 * dl), -1, 1)
    a = np.arccos(ca)
    K = Hs[:, None, :] + (u * np.cos(a)[..., None] + w * np.sin(a)[..., None]) * L1
    coxa = np.degrees(np.arctan2(-(K - Hs[:, None, :])[..., 1], -(K - Hs[:, None, :])[..., 2]))   # + = joelho à frente
    erro = ((flex.min(1) - ALVO_JOELHO[0]) ** 2 + (flex.max(1) - ALVO_JOELHO[1]) ** 2 + (coxa.min(1) - ALVO_COXA[0]) ** 2
            + (coxa.max(1) - ALVO_COXA[1]) ** 2)
    erro[dl.max(1) > (L1 + L2) * 0.995] = 1e9                          # a perna nunca estica até o fim
    i = int(np.argmin(erro))
    Y_Q, Z_Q = grade[i]
    H_mundo = {L: Vector((s * X_H, Y_Q, Z_Q)) for L, s in LADOS}
    print("QUADRIL em y %.4f z %.4f (erro %.2f°) | joelho %.1f..%.1f° (t %.3f/%.3f) | coxa × vertical %+.1f..%+.1f° (t %.3f/%.3f)" % (
        Y_Q, Z_Q, math.sqrt(erro[i] / 4), flex[i].min(), flex[i].max(), np.argmin(flex[i]) / NQ, np.argmax(flex[i]) / NQ,
        coxa[i].min(), coxa[i].max(), np.argmin(coxa[i]) / NQ, np.argmax(coxa[i]) / NQ), flush=True)

    # ── 4) pelve no lugar (parada a volta toda); tórax e cabeça por quadro ─────────────────────────────────────────────────────────────
    M_alvo = Vector((0.0, Y_Q, Z_Q))
    p3.girar_osso(rig, "Hips", Matrix.Rotation(math.radians(INCLINA_PELVE), 3, "X"), pivo=M0, mover=M_alvo - M0)
    for L, s in LADOS:
        print("QUADRIL %s no lugar: (%.4f %.4f %.4f) — queria (%.4f %.4f %.4f)" % (L[0], *c(L + "UpLeg"), *H_mundo[L]), flush=True)

    # giro do tórax: segue a diferença entre os pegadores (o direito à frente = o tórax vira pra esquerda, o ombro direito à frente)
    def frente_pegador(s, t):
        C_, J_, alfa, fi = lig.pontos(s, graus(t))
        return fi                                                     # o balancim gira junto: o pegador vai à frente com fi
    dif = [frente_pegador(-1, k / 96) - frente_pegador(1, k / 96) for k in range(96)]
    escala_giro = max(abs(x) for x in dif)

    def giro_torax(t):
        return GIRO_TORAX * (frente_pegador(-1, t) - frente_pegador(1, t)) / escala_giro

    def tronco(t):
        for n in ("Spine", "Spine1", "Spine2", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        for n, g in zip(("Spine", "Spine1"), LOMBAR):
            p3.girar_osso(rig, n, Matrix.Rotation(math.radians(g), 3, "X"))
        torcao = giro_torax(t)
        for n, fr in (("Spine", 0.30), ("Spine1", 0.35), ("Spine2", 0.35)):
            ax = (p3.ponta(rig, n) - c(n)).normalized()
            p3.girar_osso(rig, n, Matrix.Rotation(math.radians(torcao * fr), 3, ax))
        # cabeça olhando pra frente, na horizontal: desfaz o giro e a inclinação que vieram do tronco (metade no pescoço)
        cab = p3.mundo_osso(rig, "Head").to_3x3()
        cab0 = (rig.matrix_world @ rig.data.bones[p3.P + "Head"].matrix_local).to_3x3()
        corr = (cab0 @ cab.inverted()).to_quaternion()
        p3.girar_osso(rig, "Neck", Matrix.Identity(3).to_quaternion().slerp(corr, 0.5).to_matrix())
        cab = p3.mundo_osso(rig, "Head").to_3x3()
        p3.girar_osso(rig, "Head", cab0 @ cab.inverted())

    # ── 5) pernas por IK (alvos nascem no tornozelo de repouso, polos bem à frente), pé e dedos com o giro posto em cada quadro ─────────
    alvos, polos, iks, rot_pe, rot_dedos = {}, {}, {}, {}, {}
    for L, s in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))
        polos[L] = p3.vazio("polo_joelho_" + L, (s * 0.13, -1.6, 0.8))
        iks[L] = p3.ik(rig, L + "Leg", alvos[L], polos[L])
        rot_pe[L] = p3.travar_rotacao(rig, L + "Foot")
        rot_dedos[L] = p3.travar_rotacao(rig, L + "ToeBase")
    M_pe0 = {L: rot_pe[L].matrix_world.copy() for L, _ in LADOS}
    M_dedos0 = {L: rot_dedos[L].matrix_world.copy() for L, _ in LADOS}
    estado = {"t": 0.0}

    def pernas(t):
        for L, s in LADOS:
            M = no_pe(L, s, t)
            A = M @ A0[L]
            R_ped = lig.pedal(s, graus(t)).to_3x3()
            R_pe = R_ped @ Matrix.Rotation(math.radians(calcanhar(t, s)), 3, "X")
            alvos[L].location = A
            rot_pe[L].matrix_world = R_pe.to_4x4() @ M_pe0[L]
            rot_dedos[L].matrix_world = R_ped.to_4x4() @ M_dedos0[L]
            polos[L].location = (H_mundo[L] + A) / 2 + Vector((0.0, -1.5, 0.0))
        p3.atualizar()

    def joelho_da_conta(L, t):
        s = 1 if L == "Left" else -1
        A = no_pe(L, s, t) @ A0[L]
        H = H_mundo[L]
        d = A - H
        dl_ = min(d.length, L1 + L2 - 1e-6)
        u_ = d.normalized()
        f_ = Vector((0.0, -1.0, 0.0))
        w_ = (f_ - u_ * f_.dot(u_)).normalized()
        a_ = math.acos(max(-1.0, min(1.0, (L1 * L1 + dl_ * dl_ - L2 * L2) / (2 * L1 * dl_))))
        return H + (u_ * math.cos(a_) + w_ * math.sin(a_)) * L1

    tronco(0.0)
    for L, s in LADOS:                                       # pole_angle de cada joelho: o joelho no plano (quadril, tornozelo, polo)
        t_ = 0.85 if s < 0 else 0.35                          # a perna na frente, bem dobrada
        pernas(t_)
        e = p3.acertar_polo(rig, iks[L], L + "Leg", L + "UpLeg", L + "Foot")
        melhor = None
        for k in range(-20, 21):
            iks[L].pole_angle = math.radians(e[1] + 0.25 * k)
            p3.atualizar()
            dk = (c(L + "Leg") - joelho_da_conta(L, t_)).length
            if melhor is None or dk < melhor[0]:
                melhor = (dk, e[1] + 0.25 * k)
        iks[L].pole_angle = math.radians(melhor[1])
        p3.atualizar()
        print("POLO joelho %s: %.2f° (joelho a %.1f mm do da conta)" % (L, melhor[1], melhor[0] * 1000), flush=True)

    # o pé com o calcanhar levantado sobe o que a malha pede pra pele da dobra dos dedos não entrar no pedal (2 voltas: subir muda um
    # pouco a perna); a sola fica AFUNDA_PE dentro da borracha
    amostra = np.linspace(0.0, 1.0, 25)
    for volta in range(2):
        for L, s in LADOS:
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes0] + [False])[dono0]
            falta = []
            for t_ in amostra[:-1]:
                pernas(t_)
                co_, _, _ = ck._avaliar(bon.corpo, 1)
                Minv = np.array(lig.pedal(s, graus(t_)).inverted())
                loc = co_[m] @ Minv[:3, :3].T + Minv[:3, 3]
                sob = loc[(np.abs(loc[:, 0]) < PEDAL[1] / 2) & (np.abs(loc[:, 1]) < PEDAL[0] / 2)]
                falta.append(max(0.0, -AFUNDA_PE - float(sob[:, 2].min())))
            falta.append(falta[0])
            SOBE[L] = (amostra, SOBE[L][1] + np.array(falta) if len(SOBE[L][1]) == len(amostra) else np.array(falta))
    print("PÉ SOBE (mm, a cada 1/24 da volta): " + " | ".join("%s %s" % (L[0], " ".join("%.1f" % (x * 1000) for x in SOBE[L][1][:-1]))
                                                            for L, _ in LADOS), flush=True)

    # ── 6) mãos: o pegador de cada manete é desenhado onde a mão fecha com o cotovelo a COTOVELO no meio do vaivém ────────────────────
    maos = Maos(bon, RAIO_MANOPLA, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    fis = [lig.pontos(1, graus(k / 96))[3] for k in range(96)]
    fi_meio = (min(fis) + max(fis)) / 2
    k_ref = min(range(96), key=lambda k: abs(fis[k] - fi_meio) + (0.0 if fis[(k + 1) % 96] > fis[k] else 1.0))
    T_REF = k_ref / 96                                        # o manete esquerdo no meio do vaivém, indo pra frente... (fi crescendo)
    pernas(T_REF)
    tronco(T_REF)
    S_ref = c("LeftArm")
    b = math.radians(BRACO_DESCE)
    alc = {"r": (S_ref - c("LeftForeArm")).length + (c("LeftForeArm") - c("LeftHand")).length + maos.palma * 0.92}
    polo_braco = {L: Vector((s * 0.08, 0.60, -0.35)) for L, s in LADOS}   # cotovelo pra trás, perto do corpo (como correndo)
    eixo_ref = {"a": Vector((0.0, 0.0, 1.0))}

    def mao_no(L, s, g, a_eixo, f_):
        """Dedos e palma da mão L no pegador de eixo a_eixo: os dedos pra onde o antebraço aponta (⟂ ao pegador), a palma pro meio."""
        dq = (f_ - a_eixo * f_.dot(a_eixo)).normalized()
        pq = a_eixo.cross(dq).normalized()
        if pq.x * s > 0:                                      # palma virada pro meio do corpo (o polegar fica em cima)
            pq = -pq
        return dq, pq

    def segurar(L, s, g, a_eixo):
        f_ = (g - (c(L + "Arm") + Vector((s * 0.03, 0.04, -0.26)))).normalized()   # 1ª volta: antebraço vindo de um cotovelo baixo
        for _ in range(2):
            dq, pq = mao_no(L, s, g, a_eixo, f_)
            maos.segurar(L, g, dq, pq, polo=c(L + "Arm") + polo_braco[L], alinhar=ALINHA, zerar=True)
            f_ = (c(L + "Hand") - c(L + "ForeArm")).normalized()

    def ponto_ref():
        return Vector((X_MAO, S_ref.y - alc["r"] * math.cos(b), S_ref.z - alc["r"] * math.sin(b)))

    polo_certo = {}
    for volta in range(2):                                    # o eixo do pegador ⟂ ao antebraço; o alcance que dá o cotovelo pedido
        lo_r, hi_r = alc["r"] - 0.25, alc["r"] + 0.005
        for _ in range(16):
            alc["r"] = (lo_r + hi_r) / 2
            segurar("Left", 1, ponto_ref(), eixo_ref["a"])
            if "Left" not in polo_certo:                      # pole_angle de cada braço (os ossos dos 2 lados não são espelhados)
                for L, s in LADOS:
                    maos.iks[L].mute = False
                    polo_certo[L] = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                segurar("Left", 1, ponto_ref(), eixo_ref["a"])
            cot = ck.medir_juntas(rig)["cotoveloE"]
            if cot > COTOVELO:
                lo_r = alc["r"]
            else:
                hi_r = alc["r"]
        alc["r"] = (lo_r + hi_r) / 2
        segurar("Left", 1, ponto_ref(), eixo_ref["a"])
        f_ = (c("LeftHand") - c("LeftForeArm")).normalized()
        a_ = Vector((0.0, -f_.z, f_.y))                       # ⟂ ao antebraço no plano de lado, apontando pra cima
        if a_.z < 0:
            a_ = -a_
        eixo_ref["a"] = (Matrix.Rotation(math.radians(PEGADOR_FRENTE), 3, "X") @ a_).normalized()   # o alto do pegador pra frente
    G_ref = ponto_ref()
    print("MANETE esquerdo no meio do vaivém (t %.3f): pegador em (%.4f %.4f %.4f), eixo (%.3f %.3f %.3f) | alcance %.4f | cotovelo "
          "%.1f°" % (T_REF, *G_ref, *eixo_ref["a"], alc["r"], ck.medir_juntas(rig)["cotoveloE"]), flush=True)

    # ── 7) o elíptico em volta do corpo: o painel 12 cm à frente de onde o pegador chega mais à frente ─────────────────────────────────
    c_esq = lig.balancim(1, graus(T_REF)).inverted() @ G_ref           # o pegador no referencial do balancim esquerdo
    ys_peg = [(lig.balancim(s, graus(k / 48)) @ Vector((s * c_esq.x, c_esq.y, c_esq.z))).y for k in range(48) for s in (1, -1)]
    zs_peg = [(lig.balancim(s, graus(k / 48)) @ Vector((s * c_esq.x, c_esq.y, c_esq.z))).z for k in range(48) for s in (1, -1)]
    painel = (min(ys_peg) - RAIO_MANOPLA - 0.12, 1.50)
    el = e3.eliptico("eliptico", lig, manete=(G_ref, eixo_ref["a"], graus(T_REF)), raio_manopla=RAIO_MANOPLA, pedal=PEDAL,
                     painel=painel)
    print("ELÍPTICO pegadores de y %.3f a %.3f e z %.3f a %.3f (vaivém %.0f mm) | painel com a face em y %.3f, meio %s | base de y %.3f a "
          "%.3f" % (min(ys_peg), max(ys_peg), min(zs_peg), max(zs_peg), (max(ys_peg) - min(ys_peg)) * 1000, painel[0],
                    tuple(round(x, 3) for x in el.medidas["painel"]), el.medidas["y_frente"], el.medidas["y_tras"]), flush=True)

    # ── 8) dedos fechados UMA vez em volta do pegador (no quadro de referência) e iguais em todo quadro ───────────────────────────────
    DEDOS = {}

    def maos_no_pegador(t):
        for L, s in LADOS:
            g, a_eixo = el.manete(s)
            segurar(L, s, g, a_eixo)
            if L in DEDOS:
                for n, Mb in DEDOS[L].items():
                    PB[n].matrix_basis = Mb.copy()
        p3.atualizar()

    def pose(t):
        """t = 0 pedal direito no ponto mais à frente; 0,5 o direito atrás; t = 1 igual a t = 0 (ciclo)."""
        estado["t"] = t
        tronco(t)
        pernas(t)
        el.girar(graus(t))
        maos_no_pegador(t)

    pose(T_REF)
    dedos_info = {}
    for L, s in LADOS:
        g, a_eixo = el.manete(s)
        dedos_info[L] = pg.fechar_em_volta(bon, L, g, a_eixo, RAIO_MANOPLA)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, str(dedos_info[L])[:160]), flush=True)

    # ── diagnóstico de cada quadro ──────────────────────────────────────────────────────────────────────────────────────────────────
    def info():
        t = estado["t"]
        j = ck.medir_juntas(rig)
        jj = ck.posicoes(rig)
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        partes = []
        for L, s in LADOS:
            m = np.array([n in (L + "Foot", L + "ToeBase") for n in nomes] + [False])[dono]
            Minv = np.array(el.pedal(s).inverted())
            loc = co[m] @ Minv[:3, :3].T + Minv[:3, 3]
            sob = loc[(np.abs(loc[:, 0]) < PEDAL[1] / 2) & (np.abs(loc[:, 1]) < PEDAL[0] / 2)]
            sola = float(sob[:, 2].min()) * 1000 if len(sob) else float("nan")
            tras = sob[sob[:, 1] > sob[:, 1].max() - 0.03]           # os 3 cm de trás do pé (o calcanhar)
            calc = float(tras[:, 2].min()) * 1000
            K = c(L + "Leg") - c(L + "UpLeg")
            cx = math.degrees(math.atan2(-K.y, -K.z))
            lado = "E" if s > 0 else "D"
            partes.append("%s joelho %.1f° coxa %+.1f° tornozelo %.0f (DF %+.1f) calcanhar %.1f° (%.0f mm do pedal) sola×pedal %+.1f mm "
                          "IK %.1f mm cotovelo %.0f°" % (
                              L[0], j["joelho" + lado], cx, tc.tornozelo(jj)[0 if s > 0 else 1], tc.tornozelo(jj)[0 if s > 0 else 1] - TORN0,
                              calcanhar(t, s), calc, sola, (c(L + "Foot") - alvos[L].location).length * 1000, j["cotovelo" + lado]))
        tron = ck.angulo_chave(rig, {"medida": "tronco"})[0]
        return " | ".join(partes) + " | tronco %.1f° giro %+.1f° | manivela D %.0f° | %s" % (
            tron, tc.tronco_giro(jj)[0], graus(t) % 360.0, maos.info())

    for t in (0.0, 0.25, 0.5, 0.75):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(el.manoplas[s], RAIO_MANOPLA, el.meia_manopla, eixo=(0, 0, 1))) for L, s in LADOS]
    return Cena(pose, el.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.15, 1.0),
                camera_video=((3.6, -1.9, 1.45), (0, -0.10, 1.0), 50), info=info, apoios=el.apoios, afunda_apoio_mm=20)
