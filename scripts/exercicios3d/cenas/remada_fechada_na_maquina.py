# Remada Fechada na Máquina — cena da fábrica 3D (lote 5, 07/10/2026). Máquina nova: equip3d.remada_sentada (remada sentada com apoio
# de peito: assento, almofada do peito, 2 braços de alavanca com o conjunto do pegador na ponta — pegador neutro e pronado, que gira
# em volta da barra —, torre da pilha na frente) — a mesma peça serve à Remada Aberta na Máquina (pegador pronado) e ao High Row.
# t = 0 braços esticados pra frente, paralelos ao chão, pegada neutra fechada (palmas uma pra outra), escápulas abertas (ombros
# levados pra frente) · t = 1 mãos do lado do tronco, embaixo do peito, cotovelos dobrados, rentes ao corpo e atrás das costas,
# escápulas fechadas (pra trás). Técnica: ExRx, Lever Seated Row: "Sit on seat and position chest against pad. Push foot lever if
# available. Grasp narrower parallel grip handles." / "Pull lever back until elbows are behind back and shoulders are pulled back.
# Return until arms are extended and shoulders are stretched forward." / "Chest pad should be adjusted to allow shoulders to stretch
# forward. The seat or grip should be adjusted to allow wrists to follow elbows." / "Let shoulders roll forward when arms extend."
# ACE, Seated Row: "Adjust the seat height to a level that positions the machine handles approximately level, or near level, with your
# shoulders. Position your feet firmly on the floor or foot pads to stabilize your body." / "Adjust the position the chest pad to
# contact your chest lightly." / "Flex (bend) your elbows and pull them towards your chest keeping your elbows close to the sides of
# your body. Continue to maintain a neutral wrist position, and contact with your chest against the chest pad." / "Continue pulling
# until your elbows pass the sides of your body." / "stopping when your arms are fully extended". NSCA (Achievable CSCS, Seated row
# (machine)): "Sit erect with your feet flat and your chest against the pad" / "Grasp the handles with a closed grip (pronated or
# neutral)" / "Adjust your arm position so your arms are parallel to the floor, with elbows fully extended" / "Pull the handles to
# your chest or upper abdomen" / "Maintain an erect torso and keep your elbows close to your body". University of Sussex Sport (Life
# Fitness Signature Row): "Take hold of the vertical handles with a neutral grip, keeping the elbows close to the sides" / "Pull the
# handles back until you hands are by your side" / "Keep the chest in contact with the pad throughout the movement".
# Como o rig faz: sentado com o tronco em pé (TRONCO° pra frente) e parado, coxas na horizontal e um pouco abertas, canelas em pé, pés
# chapados no chão; o assento embaixo do glúteo e das coxas e a almofada encostando na parte de baixo do peito. As escápulas giram
# (clavícula em volta do eixo do tronco) de abertas pra frente (t=0) a fechadas pra trás e um pouco pra baixo (t=1). No começo o braço
# fica BRACO0° abaixo da horizontal com o cotovelo dobrado COTOVELO0° (o cotovelo pra baixo) e a mão na linha do ombro (X_MAO); no fim
# o braço fica FRENTE1° atrás da vertical do tronco e ABRE1° pro lado (rente ao corpo), com o antebraço ANTEBRACO1° da horizontal
# (− = a mão um pouco abaixo do cotovelo) e a mão na mesma linha. O pegador neutro fica PENDURADO na barra (a barra em cima da mão,
# como os pegadores verticais da Signature Row da Sussex) e ⟂ ao antebraço (o punho reto): o eixo dos braços da máquina fica à mesma
# distância da barra no começo e no fim, na altura Z_EIXO; quadro a quadro os braços da máquina giram no arco (cada lado o seu giro,
# que deixa o punho à distância planejada do ombro nas 2 pontas: o boneco não é simétrico ao milímetro) e o pegador gira em volta da
# barra até ficar ⟂ ao antebraço de verdade (o pegador que se ajeita sozinho). A mão vai junto com o pegador (IK do braço partindo do
# braço dobrado + mão rígida no pegador: os dedos e o polegar fecham UMA vez, no começo, e ficam iguais em todos os quadros); o
# cotovelo fica no plano do polo, que anda em linha reta (relativo ao ombro) do polo do começo pro do fim. Tronco, quadril, pernas,
# pés e cabeça não mexem.
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
TRONCO = 2.0              # tronco 2° pra frente da vertical (o peito apoiado na almofada): "Sit erect" (NSCA), "torso vertical" (ACE)
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril (juntas, as coxas se tocavam)
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.36    # estofado de 60 mm, como o do leg press 45; largura: escolha da fábrica
PROF_ASSENTO = 0.34       # do fundo até a borda da frente (escolha da fábrica: a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento e da almofada
LARG_ALMOFADA, ESP_ALMOFADA = 0.24, 0.06  # almofada do peito estreita (as mãos passam do lado dela no fim) e estofado de 60 mm
ALMOFADA = (-0.20, 0.06)  # almofada do peito de 20 cm abaixo até 6 cm acima da linha do meio do peito (a parte de baixo do peito
                          # encosta: ExRx, "keeping lower chest on pad")
BRACO0 = 6.0              # começo: braço 6° abaixo da horizontal ("arms are parallel to the floor", NSCA; "handles approximately level,
                          # or near level, with your shoulders", ACE)
COTOVELO0 = 15.0          # começo: cotovelo dobrado 15°, quase esticado sem travar ("arms are extended", ExRx; "elbows fully extended",
                          # NSCA — "quase esticarem", pedido)
FRENTE1 = -35.0           # fim: braço 35° atrás da vertical do tronco ("until elbows are behind back", ExRx; "until your elbows pass
                          # the sides of your body", ACE)
ABRE1 = 12.0              # fim: braço 12° pro lado do plano do tronco — rente ao corpo sem encostar ("keeping your elbows close to the
                          # sides of your body", ACE; "keep your elbows close to your body", NSCA)
ANTEBRACO1 = -8.0         # fim: antebraço 8° abaixo da horizontal — a mão do lado do tronco, embaixo do peito ("Pull the handles to
                          # your chest or upper abdomen", NSCA; "hands are by your side", Sussex)
PROTRAI = 8.0             # escápulas abertas no começo: clavícula 8° pra frente em volta do eixo do tronco ("shoulders are stretched
                          # forward", "Let shoulders roll forward when arms extend", ExRx)
RETRAI, DESCE = 8.0, 2.0  # escápulas fechadas no fim: 8° pra trás e 2° pra baixo ("shoulders are pulled back", "pull shoulder blades
                          # together", ExRx; "pull shoulders back and down", ACE)
Z_EIXO = 0.13             # eixo dos braços da máquina perto do chão, na frente (a alavanca sobe do eixo até a barra, como a do supino
                          # sentado; o cubo de 5 cm de raio fica 8 cm acima do chão)
X_BRACO = 0.45            # plano dos braços da máquina: por fora das mãos, dos cotovelos e dos joelhos
RAIO = 0.0145             # borracha dos pegadores: 29 mm, o cilindro da mão de referência (escolha da fábrica)
COMP_NEUTRO = 0.14        # pegador neutro (a mão de ~9 cm com folga)
PRONADO = (0.32, 0.12)    # borracha do pegador pronado na barra: centro em |x| = 0,32 m, 12 cm (a Remada Aberta usa esse)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado: tronco em pé, coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão ────────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    t_rep = cab("Neck") - cab("Hips")
    frente_rep = math.degrees(math.atan2(-t_rep.y, t_rep.z))   # o tronco do boneco em pé, no repouso, já inclina isso pra frente

    def sentar(inclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina - frente_rep), pivo=pivo0)
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

    sentar(TRONCO)
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    tt = cab("Neck") - cab("Hips")
    # assento: embaixo do glúteo (a pele mais baixa no pedaço do assento afunda AFUNDA), o fundo 4 cm atrás do glúteo
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    gl = G[np.abs(G[:, 0]) < LARG_ASSENTO / 2]
    y_tras = float(gl[gl[:, 2] < float(gl[:, 2].min()) + 0.06][:, 1].max()) + 0.04
    y_frente = y_tras - PROF_ASSENTO
    Gs = gl[(gl[:, 1] > y_frente) & (gl[:, 1] < y_tras)]
    topo = float(Gs[:, 2].min()) + AFUNDA
    print("SENTADO | tronco %.1f° pra frente (repouso %.1f°) | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f" % (
        math.degrees(math.atan2(-tt.y, tt.z)), frente_rep, *H, topo, y_frente, y_tras), flush=True)

    # ── 2) escápulas: clavícula girando em volta do eixo do tronco (pra frente = abre, pra trás = fecha) e um pouco pra baixo ───────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def escapulas(t):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        ret, des = p3.lerp(-PROTRAI, RETRAI, t), p3.lerp(0.0, DESCE, t)
        for L, s in LADOS:
            if ret:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * ret), 3, cima0))
            if des:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * des), 3, frente0))

    S_rep = {L: cab(L + "Arm") for L, _ in LADOS}
    for t in (0.0, 1.0):
        escapulas(t)
        jj = ck.posicoes(rig)
        print("ESCÁPULAS t=%.0f | ombro E andou %+.1f mm pra frente, %+.1f mm pra cima | escapula_frente %s mm" % (
            t, (cab("LeftArm") - S_rep["Left"]).dot(frente0) * 1000, (cab("LeftArm") - S_rep["Left"]).dot(cima0) * 1000,
            "/".join("%.0f" % v for v in tc.escapula_frente(jj))), flush=True)

    # ── 3) almofada do peito: face vertical encostando na parte de baixo do peito (a pele afunda AFUNDA) ────────────────────────────
    escapulas(0.0)
    T = pele(("Spine", "Spine1", "Spine2"))
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    f = T[(np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (T[:, 2] > S["Left"].z - 0.20) & (T[:, 2] < S["Left"].z)]
    mam = Vector(f[f[:, 1].argmin()])                         # meio do peito: a parte mais saliente do peitoral (|x| 9–13 cm)
    z_baixo, z_cima = mam.z + ALMOFADA[0], mam.z + ALMOFADA[1]
    TT = pele(("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck"))
    zona = TT[(TT[:, 2] > z_baixo) & (TT[:, 2] < z_cima) & (np.abs(TT[:, 0]) < LARG_ALMOFADA / 2)]
    y_face = float(zona[:, 1].min()) + AFUNDA
    print("ALMOFADA | meio do peito (%.4f %.4f %.4f) = %.0f mm abaixo do ombro | face y %.4f, z %.3f → %.3f" % (
        *mam, (S["Left"].z - mam.z) * 1000, y_face, z_baixo, z_cima), flush=True)

    # ── 4) mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ───────────────────────────────────────────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def pegada_neutra(s, f_):
        """Pegador ⟂ ao antebraço f_, no plano YZ e pra cima (u), dedos ao longo do antebraço (dq) e palma pro meio (pq)."""
        u = Vector((0.0, f_.z, -f_.y)).normalized()
        if u.z < 0:
            u = -u
        dq = (f_ - u * f_.dot(u)).normalized()
        pq = (dq.cross(u) * s).normalized()
        return u, dq, pq

    OFF = {}
    for L, s in LADOS:
        u_r, dq_r, pq_r = pegada_neutra(s, Vector((0, -1, 0)))
        g_r = S[L] + Vector((0.0, -0.55, -0.05))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.3, 0.3, -0.6)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    X_MAO = (S_rep["Left"].x - S_rep["Right"].x) / 2          # mão na linha do ombro (pegada fechada: as mãos na largura dos ombros)

    def eixos_tronco():
        return (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))

    def abertura(E, Sx, s):
        cima, lado, frente = eixos_tronco()
        return math.degrees(math.asin(max(-1.0, min(1.0, (E - Sx).normalized().dot(-lado * s)))))

    def comeco(L, s):
        """Começo: o braço BRACO0° abaixo da horizontal, cotovelo dobrado COTOVELO0° pra cima (o cotovelo aponta pra baixo) e o vão
        da mão em x = s·X_MAO. Devolve o vão, o cotovelo, o punho e o antebraço."""
        Sx = cab(L + "Arm")
        p = math.radians(BRACO0)
        q = math.radians(BRACO0 - COTOVELO0)

        def montar_lat(lat):
            b = Vector((s * math.sin(lat) * math.cos(p), -math.cos(lat) * math.cos(p), -math.sin(p)))
            f_ = Vector((s * math.sin(lat) * math.cos(q), -math.cos(lat) * math.cos(q), -math.sin(q)))
            E = Sx + b * Lb
            W = E + f_ * La
            u, dq, pq = pegada_neutra(s, f_)
            return W + vao_menos_punho(L, dq, pq), E, W, f_, u

        lo, hi = math.radians(-30), math.radians(30)
        for _ in range(40):
            meio = (lo + hi) / 2
            if s * montar_lat(meio)[0].x < X_MAO:
                lo = meio
            else:
                hi = meio
        return montar_lat((lo + hi) / 2)

    def fim(L, s):
        """Fim: o braço FRENTE1° atrás da vertical do tronco e ABRE1° pro lado; o antebraço ANTEBRACO1° acima da horizontal, virado
        pra dentro/fora o que precisa pra o vão da mão ficar em x = s·X_MAO."""
        Sx = cab(L + "Arm")
        cima, lado, frente = eixos_tronco()
        fora = -lado * s
        bf, ab = math.radians(FRENTE1), math.radians(ABRE1)
        b = fora * math.sin(ab) + (-cima * math.cos(bf) + frente * math.sin(bf)) * math.cos(ab)
        E = Sx + b * Lb
        g1 = math.radians(ANTEBRACO1)

        def montar_h(h):
            f_ = Vector((s * math.sin(h) * math.cos(g1), -math.cos(h) * math.cos(g1), math.sin(g1)))
            W = E + f_ * La
            u, dq, pq = pegada_neutra(s, f_)
            return W + vao_menos_punho(L, dq, pq), E, W, f_, u

        lo, hi = math.radians(-60), math.radians(60)
        for _ in range(40):
            meio = (lo + hi) / 2
            if s * montar_h(meio)[0].x < X_MAO:
                lo = meio
            else:
                hi = meio
        return montar_h((lo + hi) / 2)

    escapulas(0.0)
    G0 = {L: comeco(L, s) for L, s in LADOS}
    escapulas(1.0)
    G1 = {L: fim(L, s) for L, s in LADOS}
    for L, s in LADOS:
        for nome, (g, E, W, f_, u) in (("COMEÇO", G0[L]), ("FIM", G1[L])):
            Sx = cab(L + "Arm")
            print("%s %s | vão (%.4f %.4f %.4f) | cotovelo (%.3f %.3f %.3f) dobrado %.0f° | antebraço %.1f° da horizontal | "
                  "vão %.0f mm à frente e %.0f mm abaixo do ombro | pegador %.1f° da vertical" % (
                      nome, L, *g, *E, math.degrees((E - Sx).angle(W - E)), math.degrees(math.asin(f_.z)),
                      (Sx.y - g.y) * 1000, (Sx.z - g.z) * 1000, math.degrees(math.atan2(u.y, u.z))), flush=True)

    # ── 5) a barra (eixo do pegador neutro) no começo e no fim e o eixo dos braços da máquina: à mesma distância das 2, na altura
    #    Z_EIXO; o pegador gira em volta da barra o que o antebraço pede ─────────────────────────────────────────────────────────
    sobe_n = 0.022 + COMP_NEUTRO / 2                          # do eixo da barra até o meio da borracha neutra

    def barra_de(Gx):
        g, E, W, f_, u = Gx
        return g + u * sobe_n                                 # o pegador neutro fica PENDURADO na barra (a barra em cima da mão)

    B0 = (barra_de(G0["Left"]) + barra_de(G0["Right"]) * 1) / 2
    B1 = (barra_de(G1["Left"]) + barra_de(G1["Right"])) / 2
    a0, a1 = Vector((B0.y, B0.z)), Vector((B1.y, B1.z))
    yc = ((a1.x ** 2 - a0.x ** 2) + (a1.y - Z_EIXO) ** 2 - (a0.y - Z_EIXO) ** 2) / (2 * (a1.x - a0.x))   # |a0 − C| = |a1 − C|
    C = Vector((yc, Z_EIXO))
    v0, v1 = a0 - C, a1 - C
    ARCO = math.degrees(math.atan2(v0.x * v1.y - v0.y * v1.x, v0.dot(v1)))     # giro em volta do +X (y → z)
    u0, u1 = G0["Left"][4], G1["Left"][4]
    INCL0 = math.degrees(math.atan2(-u0.y, -u0.z))                # o pegador sai da barra pra baixo (180° = pendurado reto)
    PSI1 = (INCL0 - math.degrees(math.atan2(-u1.y, -u1.z)) + 180.0) % 360.0 - 180.0   # girar em volta do +X diminui a inclinação
    print("MÁQUINA | barra no começo (%.4f %.4f) e no fim (%.4f %.4f) — curso %.3f m | eixo y %.4f z %.3f | braço da alavanca "
          "%.3f m | arco %.1f° | pegador %.1f° da vertical no começo, gira %.1f°" % (
              B0.y, B0.z, B1.y, B1.z, (a1 - a0).length, C.x, C.y, v0.length, ARCO, INCL0, PSI1), flush=True)

    # ── 6) a máquina em volta do corpo ────────────────────────────────────────────────────────────────────────────────────────
    mq = e3.remada_sentada("remada", eixo=(C.x, Z_EIXO), x_braco=X_BRACO, barra=(B0.y, B0.z), x_dentro=X_MAO,
                           neutro=(COMP_NEUTRO, RAIO, INCL0), pronado=(PRONADO[0], PRONADO[1], RAIO),
                           assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                           almofada=(y_face, z_baixo, z_cima, LARG_ALMOFADA, ESP_ALMOFADA, 0.0))

    # ── 7) pose: os braços da máquina giram no arco; cada pegador gira em volta da barra até ficar ⟂ ao antebraço; a mão vai junto ─
    estado = {}



    def circulo(Sx, W):
        """Centro, eixo e raio do círculo onde o cotovelo pode ficar, com o ombro em Sx e o punho em W."""
        d = W - Sx
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        return Sx + u * a, u, math.sqrt(max(Lb ** 2 - a * a, 1e-8))

    def cotovelo_do_polo(Sx, W, polo):
        """O cotovelo que o IK acha: o ponto do círculo do lado do polo."""
        Cc, u, rho = circulo(Sx, W)
        v = polo - Cc
        return Cc + (v - u * v.dot(u)).normalized() * rho

    def giro_ate(u, f_):
        """Giro (graus, em volta do +X) que leva o eixo u do pegador pra direção ⟂ ao antebraço f_ (no plano YZ, do lado de u)."""
        quer = Vector((0.0, f_.z, -f_.y)).normalized()
        if quer.dot(u) < 0:
            quer = -quer
        return math.degrees(math.atan2(u.cross(quer).x, u.dot(quer)))

    # polo do cotovelo no começo e no fim, relativo ao ombro: o cotovelo planejado + 0,5 m na direção dele (a partir do centro do
    # círculo); no meio o polo anda em linha reta de um pro outro e o cotovelo vai de um jeito pro outro sem pular
    POLO = {}
    for L, s in LADOS:
        rel = []
        for t_, Gx in ((0.0, G0[L]), (1.0, G1[L])):
            escapulas(t_)
            Sx = cab(L + "Arm")
            g, E, W, f_, u = Gx
            Cc, uu, rho = circulo(Sx, W)
            v = E - Cc
            rel.append(E + (v - uu * v.dot(uu)).normalized() * 0.5 - Sx)
        POLO[L] = rel

    def mao_no(u, s, f_):
        """Dedos (ao longo do antebraço f_, ⟂ ao pegador de eixo u) e palma (pro meio) da mão do lado s, o polegar pra cima."""
        up = u if u.z >= 0 else -u              # o pegador desce da barra: o eixo dele aponta pra baixo
        dq = (f_ - up * f_.dot(up)).normalized()
        return dq, (dq.cross(up) * s).normalized()

    def no_pegador(L, s, Sx, polo, fi, psi, f_, livre=True):
        """Pegador do lado s com o braço da máquina em fi (só a conta, sem mexer em nada): livre = o pegador gira em volta da
        barra (psi) até ficar ⟂ ao antebraço; senão fica no psi dado. Devolve o vão, os dedos, a palma, o punho, o antebraço e o
        psi."""
        for _ in range(12 if livre else 3):     # pegador ↔ punho ↔ cotovelo
            g, u = mq.pegada(s, "neutro", graus=fi, pegador=psi)
            dq, pq = mao_no(u, s, f_)
            W = g - vao_menos_punho(L, dq, pq)
            f_ = (W - cotovelo_do_polo(Sx, W, polo)).normalized()
            if livre:                           # amortecido: com o braço quase esticado o antebraço responde forte ao punho
                psi += 0.6 * giro_ate(u, f_)
        g, u = mq.pegada(s, "neutro", graus=fi, pegador=psi)
        dq, pq = mao_no(u, s, f_)
        return g, dq, pq, g - vao_menos_punho(L, dq, pq), f_, psi

    def psi_plano(Gx):
        """Giro do pegador (mundo, a partir da montagem) que deixa ele ⟂ ao antebraço planejado Gx."""
        d = INCL0 - math.degrees(math.atan2(-Gx[4].y, -Gx[4].z))
        return (d + 180.0) % 360.0 - 180.0

    # cada braço da máquina gira um pouco diferente do outro (braços independentes): o boneco não é simétrico ao milímetro e, com o
    # braço quase esticado no começo, 1 mm a mais de distância entre o ombro e o punho estica o cotovelo ~3° — então o giro de cada
    # lado no começo e no fim é o que deixa o punho à distância planejada do ombro (o cotovelo dobrado como o planejado), com o
    # pegador no giro planejado
    FI = {}
    for L, s in LADOS:
        pontas = []
        for t_, Gx, fi_ini in ((0.0, G0[L], 0.0), (1.0, G1[L], ARCO)):
            escapulas(t_)
            Sx = cab(L + "Arm")
            polo = Sx + POLO[L][0].lerp(POLO[L][1], t_)
            d_quer = (Gx[2] - Sx).length
            melhor = None
            for k in range(-300, 301):
                fi = fi_ini + k * 0.01
                g, dq, pq, W, f_, psi = no_pegador(L, s, Sx, polo, fi, psi_plano(Gx), Gx[3], livre=False)
                erro = abs((W - Sx).length - d_quer)
                if melhor is None or erro < melhor[0]:
                    melhor = (erro, fi)
            pontas.append(melhor[1])
            print("GIRO %s t=%.0f | braço da máquina %.2f° (planejado %.2f°) | punho a %.1f mm da distância planejada" % (
                L, t_, melhor[1], fi_ini, melhor[0] * 1000), flush=True)
        FI[L] = pontas

    def maos_no_pegador(t):
        for L, s in LADOS:
            Sx = cab(L + "Arm")
            polo = Sx + POLO[L][0].lerp(POLO[L][1], t)
            fi = p3.lerp(FI[L][0], FI[L][1], t)
            psi, f_ = estado.get(L, (p3.lerp(psi_plano(G0[L]), psi_plano(G1[L]), t), G0[L][3].lerp(G1[L][3], t).normalized()))
            g, dq, pq, W, f_, psi = no_pegador(L, s, Sx, polo, fi, psi, f_)
            for volta in range(4):              # a conta → o IK → o antebraço DE VERDADE acerta o giro do pegador (⟂ a ele)
                mq.girar(fi, pegador=psi, lado=s)
                g, u = mq.pegada(s, "neutro")
                dq, pq = mao_no(u, s, f_)
                if L in DOBRADO:                # o IK parte do braço dobrado (com o braço reto ele não consegue dobrar)
                    for n, M in DOBRADO[L].items():
                        PB[n].matrix_basis = M.copy()
                    p3.atualizar()
                maos.segurar(L, g, dq, pq, polo=polo)
                f_ = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
                desvio = giro_ate(u, f_)
                if abs(desvio) < 0.3:
                    break
                psi += desvio
            estado[L] = (psi, f_)
            if L in DEDOS:                      # mão rígida no pegador: os dedos e o polegar fechados no começo, iguais
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    DEDOS, DOBRADO = {}, {}

    def pose(t):
        """t=0 braços esticados, escápulas abertas; t=1 mãos do lado do tronco, cotovelos atrás, escápulas fechadas."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        escapulas(t)
        maos_no_pegador(t)

    # polo certo do cotovelo com ele bem dobrado (fim) e os dedos fechados UMA vez, no começo
    pose(1.0)
    for L, _ in LADOS:
        maos.iks[L].mute = False
        e_ = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo %s erro %.3f ang %d" % (L, *e_), flush=True)
    estado.clear()
    pose(1.0)
    for L, _ in LADOS:                          # braço dobrado de partida do IK em todo quadro
        DOBRADO[L] = {p3.P + n: PB[p3.P + n].matrix_basis.copy() for n in (L + "Arm", L + "ForeArm")}
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:
        g, u = mq.pegada(s, "neutro")
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)
    estado.clear()

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        g, u = mq.pegada(1, "neutro")
        dev = []                                  # punho de lado (desvio radial +/ulnar −): o pegador × a normal do antebraço
        for L, s in LADOS:
            fa = (Vector(jj[L + "Hand"]) - Vector(jj[L + "ForeArm"])).normalized()
            gs, us = mq.pegada(s, "neutro")
            dev.append(90.0 - math.degrees(fa.angle(us)))
        return ("braços da máquina %.1f° | pegador E %.1f° D %.1f° | vão E (%.3f %.3f %.3f) %.0f mm abaixo do ombro | cotovelo "
                "%.0f/%.0f° | abertura %s° | braço × tronco %s° | antebraço × horizontal %s° | pegador × antebraço %s° | punho "
                "%.0f/%.0f° | palma pro meio %s° | pegada %.2f | escápula %s mm | tronco %.1f° | coluna %.1f° | %s" % (
                    mq.angulo, mq.giros_pegador[1], mq.giros_pegador[-1], *g, (cab("LeftArm").z - g.z) * 1000,
                    jt["cotoveloE"], jt["cotoveloD"], "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    "/".join("%+.1f" % v for v in dev), jt["punhoE"], jt["punhoD"],
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores["neutro"][s], RAIO, COMP_NEUTRO / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 0.9),
                camera_video=((3.0, yq + 1.6, 1.6), (0, yq - 0.25, 0.85), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
