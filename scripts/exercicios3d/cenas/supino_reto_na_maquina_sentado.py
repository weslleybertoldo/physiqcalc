# Supino Reto na Máquina Sentado — cena da fábrica 3D (lote 4, 07/10/2026). Máquina nova: equip3d.supino_sentado (2 braços de
# alavanca que sobem de um eixo baixo na frente, com os pegadores na ponta; assento, encosto, base e torre da pilha) — a mesma peça
# serve ao Desenvolvimento na Máquina.
# t = 0 pegadores na altura do meio do peito, 5 cm à frente dele; cotovelos dobrados (~125°), abertos ~55° do tronco e uns 14 cm
# abaixo dos ombros · t = 1 braços quase esticados (~10°, sem travar). Técnica: ExRx, Lever Chest Press: "Sit on seat with chest
# approximately height of horizontal handles." / "Grasp handles with wide overhand grip; elbows out to sides just below
# shoulders." / "Press lever until arms are extended. Return weight until chest muscles are slightly stretched." ACE, Seated Chest
# Press: "Adjust the seat height so that the handles are level with your mid-chest (around nipple level) and the handles are
# positioned no deeper than chest level (level with the front of your chest)." / "Position your feet firmly on the floor" /
# "Depress and retract your scapulae (pull shoulders back and down) and attempt to hold this position throughout the exercise." /
# "Continue pressing until your elbows are fully extended, but not locked. Your shoulder blades should continue to make contact with
# the backrest". NSCA (Achievable CSCS, Vertical chest press (machine)): "Grasp the handles with a closed, pronated grip, aligned
# with your nipples." / "Push the handles forward until your elbows are fully extended." / "Keep your back against the pad, and
# avoid locking out your elbows." eGym, M5 Chest Press: "Start with your elbows bent and the handles at chest height." / "Pronated
# grip (palms facing the floor): more activation of the pectoralis major." ExRx, Bench Press Analyses: "a 45º to 70º angle between
# the shoulder and torso"; "a standard bench press grip of 1.5 to 1.7 times the biacromial width".
# Como o rig faz: sentado como na cadeira extensora (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das
# costas encostarem juntos num encosto 10° atrás da vertical), com as coxas na horizontal e um pouco abertas e as canelas em pé,
# os pés chapados no chão (a planta no chão); o assento fica embaixo do glúteo e das coxas. O pegador anda num ARCO em volta do eixo
# dos braços da máquina: embaixo (t=0) ele fica na altura do meio do peito (a parte mais saliente do peitoral) e FRENTE0 à frente do
# peito, com o antebraço na linha em que o pegador anda no começo do arco (a tangente: o empurrão do braço da máquina) — daí saem o
# cotovelo, a largura da pegada e a abertura; em cima (t=1) o cotovelo dobra só COTOVELO1° e o pegador fica SOBE acima de onde
# começou; o eixo fica na altura Z_EIXO, à mesma distância dos 2 pontos. Quadro a quadro os braços da máquina giram no arco e a mão
# vai junto com o pegador (IK do braço + mão fechada em volta dele); o cotovelo fica no ponto do círculo que o braço deixa que mantém
# a abertura do começo (o cotovelo não sobe nem cola no tronco), com o antebraço perto da linha do empurrão; a mão com a palma pra
# baixo (pronada) e o punho quase reto. Tronco, quadril, pernas e pés não mexem.
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
ENCOSTO = 10.0            # encosto 10° atrás da vertical = 100° com o assento (escolha da fábrica, como a cadeira extensora)
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.66, 0.30, 0.06   # do assento até perto da base do pescoço; estofado de 60 mm
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.36    # estofado de 60 mm, como o do leg press 45; largura: escolha da fábrica
PROF_ASSENTO = 0.36       # do encosto até a borda da frente (escolha da fábrica: a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento e do encosto
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril (juntas, as coxas se tocavam)
FRENTE0 = 0.05            # no começo o pegador fica 5 cm à frente da frente do peito, na altura do meio do peito (ACE: "the
                          # handles are positioned no deeper than chest level (level with the front of your chest)"; ExRx: "Return
                          # weight until chest muscles are slightly stretched"): o cotovelo vai pra trás do tronco e dobra ~125°
COTOVELO1 = 12.0          # flexão do cotovelo em cima: quase esticado, sem travar
SOBE = 0.02               # o pegador termina 2 cm acima de onde começou (o eixo baixo faz o arco subir um pouco)
Z_EIXO = 0.13             # eixo dos braços da máquina perto do chão (alavanca que sobe da parte de baixo, como a Hammer Strength
                          # Select Chest Press; o cubo de 6 cm de raio fica 7 cm acima do chão)
X_BRACO = 0.53            # plano dos braços da máquina: por fora das mãos e dos cotovelos
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência; escolha da fábrica)
COMP_PEGADOR = 0.15
GIRO_PEG = 10.0           # ponta de dentro do pegador 10° pra frente (Precor RSL0414: "handles can be angled to keep wrists in
                          # correct alignment"): com o braço esticado a mão aponta um pouco pra fora, como o braço, e o punho
                          # fica a ≤ 20° do antebraço o movimento todo
PUNHO = 12.0              # extensão do punho: a mão um pouco pra cima da linha do antebraço, o pegador na palma, na linha dele
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula: o ombro anda ~1,5 cm
                          # pra trás e ~1 cm pra baixo e fica assim o movimento todo (ACE: "Depress and retract your scapulae")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _abertura(v, cima, lado, s):
    """Abertura do braço (vetor ombro → cotovelo) vista de frente do tronco, graus (a mesma conta do tc.braco_abertura)."""
    return math.degrees(math.atan2(v.dot(s * lado), v.dot(-cima)))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado: coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão (a planta no chão) ──────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo)

    def sentar(reclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-reclina), pivo=pivo0)
        for L, s in LADOS:
            h, k = cab(L + "UpLeg"), cab(L + "Leg")
            alvo = Vector((s * math.sin(math.radians(ABRE_COXA)), -math.cos(math.radians(ABRE_COXA)), 0.0))
            p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(alvo).to_matrix())
            k, a = cab(L + "Leg"), cab(L + "Foot")
            p3.girar_osso(rig, L + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
            f = cab(L + "ToeBase") - cab(L + "Foot")       # a canela gira em volta dela mesma até o pé apontar como no repouso
            giro = math.atan2(f_rep[L].x, -f_rep[L].y) - math.atan2(f.x, -f.y)
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation(giro, 3, (cab(L + "Foot") - cab(L + "Leg")).normalized()))
            F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
            p3.girar_osso(rig, L + "Foot", pe_rep[L] @ F.inverted())    # sola chapada, como em pé
        pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, -0.0005 - float(pes[:, 2].min()))))

    def costas():
        """Quanto o glúteo e a parte de cima das costas chegam no encosto (n·p, m; menor = mais pra trás)."""
        co, _, (nomes, dono) = _malha(bon)
        g = co[_grupo(nomes, dono, ("Hips",))]
        c = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))]
        c = c[np.abs(c[:, 0]) < LARG_ENCOSTO / 2]
        nn = np.array(n_enc)
        return float((g @ nn).min()), float((c @ nn).min())

    # escápulas pra trás e pra baixo, paradas o movimento todo (ACE: "Depress and retract your scapulae (pull shoulders back and
    # down) and attempt to hold this position throughout the exercise"; eGym: "Hold the handles, keeping the shoulders lowered"):
    # cada clavícula gira RETRAI° em volta do eixo do tronco e DESCE° em volta do eixo da frente (como o crucifixo invertido gira
    # as escápulas); feito em pé, antes de sentar: o resto (encosto, peito, braços) já sai com os ombros nesse lugar
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    ombro_antes = {L: cab(L + "Arm") for L, _ in LADOS}
    for L, s in LADOS:
        if RETRAI:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        if DESCE:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro E andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (cab("LeftArm") - ombro_antes["Left"]).dot(-frente0) * 1000,
        -(cab("LeftArm") - ombro_antes["Left"]).dot(cima0) * 1000), flush=True)

    # o quanto o corpo inclina pra trás: o glúteo e as costas encostam JUNTOS no encosto ("Sit with your back firmly supported
    # against the backrest", ACE; "Sit back against the seat pad with five-point contact", NSCA)
    lo, hi = -5.0, 25.0
    for _ in range(12):
        meio = (lo + hi) / 2
        sentar(meio)
        dg, dc = costas()
        if dg < dc:            # o glúteo chega antes: as costas estão longe → inclina mais
            lo = meio
        else:
            hi = meio
    reclina = (lo + hi) / 2
    sentar(reclina)
    dg, dc = costas()
    d_enc = min(dg, dc) + AFUNDA                             # face do encosto: n·p = d_enc
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    # assento: embaixo do glúteo (a pele mais baixa no pedaço do assento afunda AFUNDA); o encosto cruza o topo dele em y_base
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    topo = float(G[:, 2].min()) + AFUNDA
    for _ in range(3):
        y_base = (math.sin(a_enc) * topo - d_enc) / math.cos(a_enc)
        y_tras, y_frente = y_base + 0.06, y_base - (PROF_ASSENTO - 0.06)
        Gs = G[(G[:, 1] > y_frente) & (G[:, 1] < y_tras) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2)]
        topo = float(Gs[:, 2].min()) + AFUNDA
    y_base = (math.sin(a_enc) * topo - d_enc) / math.cos(a_enc)
    y_tras, y_frente = y_base + 0.06, y_base - (PROF_ASSENTO - 0.06)
    nuca = float((pele(("Head",)) @ np.array(n_enc)).min()) - d_enc
    print("SENTADO | reclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f | "
          "encosto y_base %.4f | nuca %.0f mm à frente do encosto" % (
              reclina, (dg - dc) * 1000, *H, topo, y_frente, y_tras, y_base, nuca * 1000), flush=True)

    # ── 2) meio do peito: a parte mais saliente do peitoral (|x| 9–13 cm), pra frente do PRÓPRIO tronco (ele está inclinado) ──
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    T = pele(("Spine", "Spine1", "Spine2"))
    rel = T - np.array(S["Left"])
    f = T[(np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (rel @ np.array(cima) > -0.20) & (rel @ np.array(cima) < 0.0)]
    mam = Vector(f[(f @ np.array(frente)).argmax()])
    z_mam = mam.z

    def frente_peito(z):
        """y da frente do peito (a pele mais à frente do tronco) na altura z."""
        ff = T[(np.abs(T[:, 2] - z) < 0.01) & (np.abs(T[:, 0]) < 0.15)]
        return float(ff[:, 1].min())

    print("PEITO | meio do peito (%.4f %.4f %.4f) = %.0f mm abaixo do ombro (ao longo do tronco) | frente do peito nessa altura y "
          "%.4f | ombro E (%.4f %.4f %.4f)" % (*mam, -(mam - S["Left"]).dot(cima) * 1000, frente_peito(z_mam), *S["Left"]),
          flush=True)

    # ── 3) braços: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ──────────────────────────────────────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    g_rad = math.radians(GIRO_PEG)
    eixo_peg = {s: Vector((-s * math.cos(g_rad), -math.sin(g_rad), 0.0)) for _, s in LADOS}   # de fora pra dentro

    def orientacao(s, u, f):
        """Dedos e palma da mão no pegador de eixo u (de fora pra dentro) com o antebraço na direção f: dedos ⟂ ao pegador, na
        direção do antebraço, PUNHO° pra cima (extensão, pro lado do dorso); palma pra baixo (pegada pronada)."""
        u = Vector(u).normalized()
        d = (f - u * f.dot(u)).normalized()
        cima_d = u.cross(d)                       # ⟂ aos dois: escolhe o sentido que sobe
        if cima_d.z < 0:
            cima_d = -cima_d
        dq = (d * math.cos(math.radians(PUNHO)) + cima_d * math.sin(math.radians(PUNHO))).normalized()
        pq = u.cross(dq).normalized()
        if pq.z > 0:
            pq = -pq
        return dq, pq

    # vão − punho no referencial (dedos, palma, dedos × palma) de cada mão: igual em qualquer pose dela (o vão é fixo no osso)
    OFF = {}
    for L, s in LADOS:
        dq_r, pq_r = orientacao(s, eixo_peg[s], Vector((0, -1, 0)))
        g_r = S[L] + Vector((s * 0.18, -0.30, -0.10))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.4, 0.4, -0.3)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def cotovelo(L, s, W, D, alvo=None, antes=None):
        """Cotovelo no círculo que o braço deixa (ombro e punho dados): sem `alvo`, o ponto em que o antebraço fica o mais perto
        da direção D (a do empurrão); com `alvo`, o que deixa a abertura do cotovelo mais perto de `alvo` graus, com o antebraço
        perto de D (meio peso) e perto do quadro anterior (`antes`, direção do cotovelo: sem salto). Devolve o centro do círculo,
        a direção do cotovelo (a partir do centro) e o raio."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        Cc = S[L] + u * a
        e1 = -(D - u * u.dot(D)).normalized()
        if alvo is None:
            return Cc, e1, rho
        e2 = u.cross(e1)
        melhor = None
        for k in range(-120, 121):
            e = e1 * math.cos(math.radians(k)) + e2 * math.sin(math.radians(k))
            E = Cc + e * rho
            custo = abs(_abertura(E - S[L], cima, lado, -s) - alvo) + 0.5 * math.degrees((W - E).angle(D))
            if antes is not None:
                custo += 20.0 * max(0.0, math.degrees(e.angle(antes)) - 15.0)
            if melhor is None or custo < melhor[0]:
                melhor = (custo, e)
        return Cc, melhor[1], rho

    def tangente(g, C):
        """Direção (mundo) em que o pegador anda pra frente no arco em volta do eixo C (y, z): o empurrão."""
        v = Vector((0.0, g.y - C.x, g.z - C.y))
        return Vector((0.0, -v.z, v.y)).normalized()

    # ── 4) embaixo (t=0): pegador na altura do meio do peito, antebraço na linha do empurrão (a tangente do arco no começo) e o
    # cotovelo aberto ABRE° do tronco; em cima (t=1): cotovelo dobrado COTOVELO1°, o pegador SOBE acima de onde começou, no
    # mesmo x. O eixo dos braços fica na altura Z_EIXO, à mesma distância dos 2 pontos (no plano YZ); a tangente do começo sai
    # do eixo — 4 voltas até parar de mudar.
    def comeco(L, s, D):
        dq, pq = orientacao(s, eixo_peg[s], D)
        o = vao_menos_punho(L, dq, pq)
        W = Vector((0.0, frente_peito(z_mam) - FRENTE0 - o.y, z_mam - o.z))  # punho que põe o vão no meio do peito, à frente dele
        E = W - D * La                                                      # cotovelo: o antebraço na direção D
        dy, dz = E.y - S[L].y, E.z - S[L].z
        dx = math.sqrt(max(Lb ** 2 - dy * dy - dz * dz, 0.0))               # o cotovelo abre pro lado o que o braço deixa
        E = Vector((S[L].x + s * dx, E.y, E.z))
        W = E + D * La
        return W + o, E, W

    def fim(L, s, g0):
        d1 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO1)))
        g1 = Vector((g0.x, g0.y - 0.3, g0.z + SOBE))
        for _ in range(8):
            dq, pq = orientacao(s, eixo_peg[s], (g1 - S[L]).normalized())
            o = vao_menos_punho(L, dq, pq)
            w = g1 - o - S[L]
            dy = -math.sqrt(max(d1 ** 2 - w.x ** 2 - w.z ** 2, 0.0))
            g1 = Vector((g0.x, S[L].y + dy + o.y, g0.z + SOBE))
        return g1

    def eixo_dos_bracos(g0, g1):
        a0, a1 = Vector((g0.y, g0.z)), Vector((g1.y, g1.z))
        lo, hi = -2.0, 1.0
        for _ in range(60):
            yc = (lo + hi) / 2
            if (a0 - Vector((yc, Z_EIXO))).length > (a1 - Vector((yc, Z_EIXO))).length:
                lo = yc
            else:
                hi = yc
        return Vector(((lo + hi) / 2, Z_EIXO))

    D0 = Vector((0, -1, 0))
    for volta in range(5):
        g0, E0, W0 = comeco("Left", 1, D0)
        g1 = fim("Left", 1, g0)
        C = eixo_dos_bracos(g0, g1)
        D_novo = tangente(g0, C)
        print("   volta %d | antebraço no começo %.1f° acima da horizontal → tangente %.1f°" % (
            volta, math.degrees(math.asin(D0.z)), math.degrees(math.asin(D_novo.z))))
        D0 = D_novo
    g0, E0, W0 = comeco("Left", 1, D0)
    g1 = fim("Left", 1, g0)
    C = eixo_dos_bracos(g0, g1)
    x_peg = g0.x
    flex0 = math.degrees((E0 - S["Left"]).angle(W0 - E0))
    print("COMEÇO | pegador (%.4f %.4f %.4f) | %.0f mm à frente da frente do peito | cotovelo (%.3f %.3f %.3f) dobrado %.0f°, "
          "%.0f mm abaixo do ombro | abertura %.0f° | antebraço %.1f° acima da horizontal | pegada %.2f × ombros" % (
              *g0, (frente_peito(g0.z) - g0.y) * 1000, *E0, flex0, (S["Left"].z - E0.z) * 1000,
              _abertura(E0 - S["Left"], cima, lado, -1), math.degrees(math.asin(D0.z)),
              2 * x_peg / (S["Left"] - S["Right"]).length), flush=True)
    a0, a1 = Vector((g0.y, g0.z)) - C, Vector((g1.y, g1.z)) - C
    R_alav = a0.length
    ARCO = math.degrees(math.atan2(a0.x * a1.y - a0.y * a1.x, a0.dot(a1)))         # giro em volta do +X (y → z)
    print("FIM | pegador (%.4f %.4f %.4f) | curso %.3f m | eixo dos braços y %.4f z %.3f | braço da alavanca %.3f m | arco %.1f° "
          "| braço começa %.1f° e termina %.1f° da vertical (+ = pra trás)" % (
              *g1, (g1 - g0).length, C.x, C.y, R_alav, ARCO, math.degrees(math.atan2(a0.x, a0.y)),
              math.degrees(math.atan2(a1.x, a1.y))), flush=True)

    # ── 5) a máquina em volta do corpo ────────────────────────────────────────────────────────────────────────────────────────
    mq = e3.supino_sentado("supino", eixo=(C.x, Z_EIXO), x_braco=X_BRACO,
                           pegadores=(g0.y, g0.z, x_peg, COMP_PEGADOR, RAIO), giro_pegador=GIRO_PEG,
                           assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                           encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), lado=-1)

    # ── 6) pose: os braços da máquina giram no arco e cada mão vai junto com o pegador ─────────────────────────────────────────
    estado = {}
    ABRE0 = _abertura(E0 - S["Left"], cima, lado, -1)    # a abertura do começo fica o movimento todo (o cotovelo não sobe)
    print("ABERTURA do cotovelo mantida no movimento: %.1f°" % ABRE0, flush=True)

    def maos_no_pegador(t, acertar=False):
        for L, s in LADOS:
            g, u = mq.pegada(s)
            D = tangente(g, C)
            f, antes = estado.get(L, (D, None))
            for _ in range(3):                  # antebraço ↔ cotovelo ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(s, u, f)
                W = g - vao_menos_punho(L, dq, pq)
                Cc, e, rho = cotovelo(L, s, W, D, alvo=ABRE0, antes=antes)
                f = (W - (Cc + e * rho)).normalized()
            estado[L] = (f, e)
            maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))
        for L, s in LADOS:                       # dedos e polegar fecham até a pele encostar no pegador
            g, u = mq.pegada(s)
            antes = pose.dedos.get(L, {}).get("Thumb") if t > 0 else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO, polegar_antes=antes)

    def pose(t):
        """t=0 pegadores na linha do peito, cotovelos dobrados; t=1 braços quase esticados."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        mq.girar(p3.lerp(0.0, ARCO, t))
        maos_no_pegador(t)

    pose.dedos = {}
    mq.girar(0.0)
    maos_no_pegador(0.0, acertar=True)          # polo certo do cotovelo com ele bem dobrado (embaixo)
    estado.clear()

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g, _ = mq.pegada(1)
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm acima do meio do peito | cotovelo %.0f/%.0f° | "
                "abertura %s° | antebraço × horizontal %s° | punho %.0f/%.0f° (flexão %s) | palma × cima %s° | pegada %.2f | "
                "tronco %.1f° | coluna %.1f° | %s" % (
                    mq.angulo, *g, (g.z - z_mam) * 1000, juntas["cotoveloE"], juntas["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.palma_cima(jj)), tc.pegada_largura(jj)[0],
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 0.85),
                camera_video=((3.2, yq - 2.6, 1.45), (0, yq - 0.2, 0.80), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
