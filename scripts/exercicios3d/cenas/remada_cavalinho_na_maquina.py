# Remada Cavalinho na Máquina — cena da fábrica 3D (lote 5, 07/10/2026). Máquina nova: equip3d.remada_cavalinho (remada cavalinho de
# anilha com apoio de peito: os 2 pedais, a almofada do peito inclinada a 40°, a alavanca comprida que gira em volta do pivô baixo,
# atrás dos pés, com a travessa e os pegadores neutros paralelos e o pino de anilha na ponta, a coluna da frente que segura a almofada).
# t = 0 braços pendurados, quase esticados, escápulas soltas pro chão · t = 1 alavanca perto do peito, pegadores na cintura, do lado do
# corpo, cotovelos dobrados e atrás da linha do tronco, rentes ao corpo, escápulas aproximadas. Técnica: ExRx, Lever Neutral Grip Incline
# Row (plate loaded): "Lie prone on inclined platform and place feet on foot rest. Grasp angled handles and lift lever out of support
# rack. Position lever directly under body with arms extended down." / "Pull lever up. As lever approaches, hyperextend thoracic spine and
# squeeze shoulders back. Lower lever until arms are extended and shoulders are pulled downward." ExRx, Lever Close Grip T-bar Row
# (plate loaded): "Bend knees slightly and bend over lever handles with back straight. Grasp narrow grip parallel lever handles." /
# "Pull handles up to waist. Return until arms are extended and shoulders are stretched downward." / "Keep low back straight. Lighten
# load if torso raises beyond 45 degrees". NSCA (Achievable CSCS, Bent-over row): "Stand with a shoulder-width stance and knees
# slightly flexed" / "Keep a neutral spine and look ahead" / "Fully extend your arms" / "Pull the bar to your torso (lower chest/upper
# abdomen)" / "Keep your torso rigid and your knees flexed". ACE, Bent-Over Row: "keep the back straight with a slight bend in the
# knees" / "Lower the bar towards the floor until the elbows are completely straight".
# Como o rig faz: em pé nos pedais (os tornozelos presos por IK, os pés chapados como em pé), o quadril dobra até o tronco ficar a
# INCLINA° da vertical (o peito na almofada a 90 − INCLINA° do chão), com os joelhos levemente dobrados (JOELHO°) e a articulação do
# quadril RECUA m atrás dos tornozelos; a coluna e a cabeça seguem a linha do tronco. A almofada fica embaixo do peito (a pele afunda
# AFUNDA) e os pedais embaixo dos pés. As escápulas giram (clavícula em volta do eixo do tronco) de soltas pro chão (t=0) a aproximadas
# (t=1). No começo o vão da mão fica embaixo do ombro, com o cotovelo dobrado COTOVELO0° (braço pendurado); no fim o braço fica FRENTE1°
# atrás da linha do tronco e ABRE1° pro lado (rente ao corpo) e o cotovelo dobra COTOVELO1°. O pivô da alavanca fica na altura Z_EIXO, à
# mesma distância do pegador no começo e no fim (atrás dos pés: a alavanca passa entre as pernas, como na cavalinho livre); a viga sai
# do pivô ANG_VIGA° acima do chão e os pegadores ficam na ponta de 2 hastes ⟂ a ela, inclinados o ângulo que divide ao meio o desvio do
# punho do começo e do fim. Quadro a quadro a alavanca gira no arco e a mão vai junto com o pegador (IK do braço + mão rígida no
# pegador: os dedos e o polegar fecham UMA vez, no começo, e ficam iguais em todos os quadros); o cotovelo fica do lado do polo, que anda
# do cotovelo do começo pro do fim. Tronco, quadril, pernas, pés e cabeça não mexem.
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
INCLINA = 50.0            # tronco 50° pra frente da vertical: o peito deitado na almofada a 40° do chão (Dynamic Fitness & Strength 40
                          # Degree T-Bar Row; ExRx: "Lighten load if torso raises beyond 45 degrees")
JOELHO = 20.0             # joelhos levemente dobrados (ExRx: "Bend knees slightly"; NSCA: "knees slightly flexed")
RECUA = 0.05              # articulação do quadril 5 cm atrás dos tornozelos (o peso fica na almofada)
PEDAL = 0.15              # topo dos pedais (a almofada fica a ~1,25 m do chão; Titan: "Overall Height: 50-in.")
AFUNDA = 0.002            # pele afundando na almofada
COMP_ALM, LARG_ALM, ESP_ALM = 0.42, 0.25, 0.06   # almofada de 42 × 25 cm (Titan: "Chest Pad Dimensions: 20-in. x 10-in."; BodyKore CF2173:
                          # "PAD,Chest 160*260*360*55") e estofado de 60 mm
TOPO_ALM = 0.07           # a borda de cima da almofada fica 7 cm abaixo da base do pescoço, ao longo do tronco (o peito todo apoiado e
                          # a cabeça livre)
LARG_PEDAL, PROF_PEDAL = 0.22, 0.32   # cada pedal (os 2 juntos, com o vão da alavanca, ~60 cm: Titan "Footplate Dimensions:
                                      # 23.5-in. x 17.5-in.")
COTOVELO0 = 12.0          # começo: cotovelo dobrado 12° (braços quase esticados, sem travar: "arms extended down", ExRx)
FRENTE1 = -35.0           # fim: braço 35° atrás da linha do tronco ("Pull lever up to torso", ExRx; "to your torso (lower chest/upper
                          # abdomen)", NSCA)
ABRE1 = 15.0              # fim: braço 15° pro lado do plano do tronco — rente ao corpo (pegada fechada: "Closer grip increases lat
                          # involvement by emphasizing shoulder extension over transverse extension", ExRx)
COTOVELO1 = 105.0         # fim: cotovelo dobrado 105°: os pegadores chegam na cintura, do lado do corpo ("Pull handles up to waist",
                          # ExRx; "pulled towards the belly button", ACE); com ~95° a mão parava na frente do quadril e a ponta de
                          # trás do pegador entrava na coxa
PROTRAI = 8.0             # escápulas soltas no começo: clavícula 8° pra frente (pro chão) em volta do eixo do tronco ("shoulders are
                          # pulled downward", "shoulders are stretched downward", ExRx)
RETRAI = 8.0              # escápulas aproximadas no fim: 8° pra trás ("squeeze shoulders back", ExRx)
Z_EIXO = 0.20             # pivô da alavanca baixo, atrás dos pés (a máquina fica com ~2,0 m de comprimento, como a Gymleco 116 e a
                          # Titan: "Length: 195-212 cm", "Overall Depth: 84-in.")
ANG_VIGA = 12.0           # a viga da alavanca sai do pivô 12° acima do chão (no começo): passa baixa entre os pés e as canelas
PONTA = 0.15              # a ponta da alavanca (com o pino de anilha) fica 15 cm na frente da travessa dos pegadores
X_PEG = 0.2223            # pegadores neutros a 17,5" de centro a centro (Titan: "Vertical Grip Spread: 17.5-in.")
DIAM_PEG = 31.5           # borracha de 31,5 mm (BodyKore CF2173: "Handgrip φ24*φ31.5*120"; Titan: "Grip Diameter: 31mm")
RAIO = DIAM_PEG / 2000.0
COMP_PEG = 0.12           # borracha de 120 mm (BodyKore CF2173)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _yz(v):
    """Ângulo (graus) de um vetor no plano YZ, a partir do +Y (pra trás), subindo pro +Z."""
    return math.degrees(math.atan2(v.z, v.y))


def montar(bon):
    pg.usar_cilindro(DIAM_PEG)        # mão de referência de um cilindro de 31,5 mm (antes do Maos)
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) em pé nos pedais: tornozelos presos (IK) PEDAL m acima de onde estão em repouso, pés chapados como em pé; o quadril dobra
    #    INCLINA° e vai pra onde os joelhos ficam dobrados JOELHO°, RECUA m atrás dos tornozelos ───────────────────────────────────────
    tornoz = {L: p3.ponta(rig, L + "Leg") + Vector((0.0, 0.0, PEDAL)) for L, _ in LADOS}
    pernas = {}
    for L, s in LADOS:
        alvo = p3.vazio("tornozelo_" + L, tornoz[L])
        polo = p3.vazio("polo_joelho_" + L, tornoz[L] + Vector((s * 0.10, -1.0, 0.45)))
        pernas[L] = p3.ik(rig, L + "Leg", alvo, polo)
        p3.travar_rotacao(rig, L + "Foot")
    Lt = (cab("LeftLeg") - cab("LeftUpLeg")).length
    Ls = (p3.ponta(rig, "LeftLeg") - cab("LeftLeg")).length
    d = math.sqrt(Lt ** 2 + Ls ** 2 + 2 * Lt * Ls * math.cos(math.radians(JOELHO)))
    H0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    dx = cab("LeftUpLeg").x - tornoz["Left"].x
    dz = math.sqrt(d * d - dx * dx - RECUA * RECUA)
    H_alvo = Vector((H0.x, tornoz["Left"].y + RECUA, tornoz["Left"].z + dz))
    p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=H0, mover=H_alvo - H0)
    for L, _ in LADOS:
        e_ = p3.acertar_polo(rig, pernas[L], L + "Leg", L + "UpLeg", L + "Foot")
        print("polo joelho %s erro %.3f ang %d" % (L, *e_), flush=True)
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    jt = ck.medir_juntas(rig)
    print("EM PÉ | quadril (%.4f %.4f %.4f) | joelho %.1f/%.1f° | quadril %.1f/%.1f° | tornozelo E (%.4f %.4f %.4f)" % (
        *H, jt["joelhoE"], jt["joelhoD"], jt["quadrilE"], jt["quadrilD"], *cab("LeftFoot")), flush=True)

    # ── 2) escápulas: clavícula girando em volta do eixo do tronco (pra frente = soltas pro chão, pra trás = aproximadas) ────────────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def escapulas(t):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        ret = p3.lerp(-PROTRAI, RETRAI, t)
        for L, s in LADOS:
            if ret:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * ret), 3, cima0))

    S_rep = {L: cab(L + "Arm") for L, _ in LADOS}
    for t in (0.0, 1.0):
        escapulas(t)
        jj = ck.posicoes(rig)
        print("ESCÁPULAS t=%.0f | ombro E andou %+.1f mm pro peito, %+.1f mm pra cabeça | escapula_frente %s mm" % (
            t, (cab("LeftArm") - S_rep["Left"]).dot(frente0) * 1000, (cab("LeftArm") - S_rep["Left"]).dot(cima0) * 1000,
            "/".join("%.0f" % v for v in tc.escapula_frente(jj))), flush=True)

    # ── 3) almofada do peito: face inclinada 90 − INCLINA° do chão (na linha do tronco), encostando no peito (a pele afunda AFUNDA), da
    #    borda de cima TOPO_ALM abaixo da base do pescoço até COMP_ALM mais embaixo ─────────────────────────────────────────────────────
    escapulas(0.0)
    ang_alm = 90.0 - INCLINA
    aa = math.radians(ang_alm)
    u_a = Vector((0.0, -math.cos(aa), math.sin(aa)))         # ao longo da face, subindo pra frente
    n_a = Vector((0.0, math.sin(aa), math.cos(aa)))          # normal da face, pro peito
    s_pesc = (cab("Neck") - H).dot(u_a)
    s_top, s_bot = s_pesc - TOPO_ALM, s_pesc - TOPO_ALM - COMP_ALM
    TT = pele(("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck"))
    rel = (TT - np.array(H)) @ np.array(u_a)
    zona = TT[(rel > s_bot) & (rel < s_top) & (np.abs(TT[:, 0]) < LARG_ALM / 2)]
    d_face = float((zona @ np.array(n_a)).min()) + AFUNDA
    s_c = (s_top + s_bot) / 2
    p_c = H + u_a * s_c
    c_alm = p_c + n_a * (d_face - p_c.dot(n_a))
    c_alm.x = 0.0
    mais = zona[(zona @ np.array(n_a)).argmin()]
    print("ALMOFADA | %.0f° do chão | centro da face (%.4f %.4f %.4f) | borda de cima %.0f mm abaixo da base do pescoço | ponto do "
          "peito mais fundo (%.3f %.3f %.3f) | borda de baixo %.0f mm acima do quadril (ao longo do tronco)" % (
              ang_alm, *c_alm, TOPO_ALM * 1000, *mais, s_bot * 1000), flush=True)

    # ── 4) mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ───────────────────────────────────────────────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def mao(s, w, f_):
        """Pegada neutra no pegador de eixo w (no plano YZ): dedos ⟂ ao pegador, o mais perto do antebraço f_; palma pro meio."""
        w = Vector(w).normalized()
        dq = (f_ - w * f_.dot(w)).normalized()
        m = Vector((-s, 0.0, 0.0))
        pq = (m - dq * m.dot(dq) - w * m.dot(w)).normalized()
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        f_r = Vector((0.0, 0.0, -1.0))
        dq_r, pq_r = mao(s, Vector((0.0, 1.0, 0.0)), f_r)
        g_r = cab(L + "Arm") + Vector((s * 0.03, 0.0, -0.55))
        maos.segurar(L, g_r, dq_r, pq_r, polo=cab(L + "Arm") + Vector((s * 0.3, 0.6, -0.3)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def circulo(Sx, W):
        """Centro, eixo e raio do círculo onde o cotovelo pode ficar, com o ombro em Sx e o punho em W."""
        dd = W - Sx
        u = dd.normalized()
        a = (Lb ** 2 - La ** 2 + dd.length_squared) / (2 * dd.length)
        return Sx + u * a, u, math.sqrt(max(Lb ** 2 - a * a, 1e-8))

    def cotovelo_do_polo(Sx, W, polo):
        """O cotovelo que o IK acha: o ponto do círculo do lado do polo."""
        Cc, u, rho = circulo(Sx, W)
        v = polo - Cc
        return Cc + (v - u * v.dot(u)).normalized() * rho

    # ── 5) começo: braço pendurado — o vão da mão embaixo do ombro, em x = s·X_PEG, o cotovelo dobrado COTOVELO0° (pra trás); w = eixo
    #    do pegador nesse momento (a mão fecha ⟂ a ele) ─────────────────────────────────────────────────────────────────────────────
    def comeco(L, s, w):
        Sx = cab(L + "Arm")
        dW = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO0)))
        wx, wy = s * X_PEG, Sx.y
        for _ in range(30):
            W = Vector((wx, wy, Sx.z - math.sqrt(max(dW ** 2 - (wx - Sx.x) ** 2 - (wy - Sx.y) ** 2, 1e-8))))
            Cc, u, rho = circulo(Sx, W)
            tras = Vector((0.0, 1.0, 0.0))
            e1 = (tras - u * tras.dot(u)).normalized()
            E = Cc + e1 * rho
            f_ = (W - E).normalized()
            dq, pq = mao(s, w, f_)
            g = W + vao_menos_punho(L, dq, pq)
            wx += s * X_PEG - g.x
            wy += Sx.y - g.y
        return g, E, W, f_

    # ── 6) fim: braço FRENTE1° atrás da linha do tronco e ABRE1° pro lado, cotovelo dobrado COTOVELO1°; o antebraço gira em volta do
    #    braço o que precisa pra o vão da mão ficar em x = s·X_PEG; w = eixo do pegador no fim ─────────────────────────────────────────
    def fim(L, s, w):
        Sx = cab(L + "Arm")
        cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
        fora = -lado * s
        bf, ab = math.radians(FRENTE1), math.radians(ABRE1)
        b = (fora * math.sin(ab) + (-cima * math.cos(bf) + frente * math.sin(bf)) * math.cos(ab)).normalized()
        E = Sx + b * Lb
        q1 = (frente - b * frente.dot(b)).normalized()      # o antebraço dobra pro lado do peito (a frente do braço)
        q2 = b.cross(q1)
        k = math.radians(COTOVELO1)

        def montar_h(h):
            f_ = (b * math.cos(k) + (q1 * math.cos(h) + q2 * math.sin(h)) * math.sin(k)).normalized()
            W = E + f_ * La
            dq, pq = mao(s, w, f_)
            return W + vao_menos_punho(L, dq, pq), E, W, f_

        lo, hi = math.radians(-80), math.radians(80)
        sinal = 1.0 if (montar_h(hi)[0].x - montar_h(lo)[0].x) * s > 0 else -1.0
        for _ in range(50):
            meio = (lo + hi) / 2
            if (s * montar_h(meio)[0].x - X_PEG) * sinal < 0:
                lo = meio
            else:
                hi = meio
        return montar_h((lo + hi) / 2)

    # ── 7) a alavanca: pegador (o meio das 2 mãos, simétrico) no começo e no fim; o pivô na altura Z_EIXO, à mesma distância dos 2 ──────
    def media(Gx):
        gL, gR = Gx["Left"][0], Gx["Right"][0]
        return Vector((X_PEG, (gL.y + gR.y) / 2, (gL.z + gR.z) / 2))

    def ideal(f_):
        v = Vector((0.0, f_.z, -f_.y))
        return v if v.y > 0 else -v

    def eixo_yz(graus):
        return Vector((0.0, math.cos(math.radians(graus)), math.sin(math.radians(graus))))

    # o pegador inclina junto com a alavanca: o começo e o fim saem com a mão fechando ⟂ ao eixo DELE nesse momento (1ª volta com o
    # pegador deitado; as outras com o ângulo que a volta anterior achou — converge em 2–3)
    w_ini = w_fim = eixo_yz(0.0)
    for volta in range(4):
        escapulas(0.0)
        G0 = {L: comeco(L, s, w_ini) for L, s in LADOS}
        escapulas(1.0)
        G1 = {L: fim(L, s, w_fim) for L, s in LADOS}
        A0, A1 = media(G0), media(G1)
        a0, a1 = Vector((A0.y, A0.z)), Vector((A1.y, A1.z))
        yc = ((a1.x ** 2 - a0.x ** 2) + (a1.y - Z_EIXO) ** 2 - (a0.y - Z_EIXO) ** 2) / (2 * (a1.x - a0.x))
        Cp = Vector((yc, Z_EIXO))
        v0, v1 = a0 - Cp, a1 - Cp
        ARCO = -math.degrees(math.atan2(v0.x * v1.y - v0.y * v1.x, v0.dot(v1)))   # > 0 = sobe (girar da peça)
        # pegador no plano YZ: ⟂ ao antebraço no meio do caminho (divide o desvio do punho do começo e do fim); a alavanca subindo
        # ARCO° gira o pegador junto: no fim ele fica em ANG_PEG − ARCO°
        f0 = (G0["Left"][3] + Vector((-G0["Right"][3].x, G0["Right"][3].y, G0["Right"][3].z))) / 2
        f1 = (G1["Left"][3] + Vector((-G1["Right"][3].x, G1["Right"][3].y, G1["Right"][3].z))) / 2
        psi0, psi1 = _yz(ideal(f0)), _yz(ideal(f1))
        ANG_PEG = (psi0 + psi1 + ARCO) / 2
        print("ALAVANCA volta %d | pegador no começo (y %.4f z %.4f) e no fim (y %.4f z %.4f) — curso %.3f m | pivô y %.4f z %.3f | "
              "raio %.3f m | arco %.1f° | pegador ideal %.1f° no começo e %.1f° no fim → %.1f° (desvio ±%.1f°)" % (
                  volta, A0.y, A0.z, A1.y, A1.z, (a1 - a0).length, Cp.x, Cp.y, v0.length, ARCO, psi0, psi1, ANG_PEG,
                  abs(ANG_PEG - psi0)), flush=True)
        w_ini, w_fim = eixo_yz(ANG_PEG), eixo_yz(ANG_PEG - ARCO)
    for L, s in LADOS:
        for nome, (g, E, W, f_), t_ in (("COMEÇO", G0[L], 0.0), ("FIM", G1[L], 1.0)):
            escapulas(t_)
            Sx = cab(L + "Arm")
            print("%s %s | vão (%.4f %.4f %.4f) | cotovelo (%.3f %.3f %.3f) dobrado %.0f° | antebraço %.1f° da vertical (+ = mão à "
                  "frente) | vão %.0f mm atrás e %.0f mm abaixo do ombro" % (
                      nome, L, *g, *E, math.degrees((E - Sx).angle(W - E)),
                      math.degrees(math.atan2(-f_.y, -f_.z)), (g.y - Sx.y) * 1000, (Sx.z - g.z) * 1000), flush=True)

    a_v = math.radians(ANG_VIGA)
    bv = Vector((0.0, -math.cos(a_v), math.sin(a_v)))
    w0 = eixo_yz(ANG_PEG)
    P = Vector((0.0, Cp.x, Cp.y))
    E_peg = A0 - w0 * (COMP_PEG / 2 + 0.03)
    r_H = (E_peg - P).dot(bv)
    T = P + bv * (r_H + PONTA)
    print("VIGA | %.0f° do chão no começo, %.0f° no fim | a travessa a %.3f m do pivô, hastes de %.3f m | ponta (%.4f %.4f) no começo" % (
        ANG_VIGA, ANG_VIGA + ARCO, r_H, (E_peg - P - bv * r_H).length, T.y, T.z), flush=True)

    # ── 8) a máquina em volta do corpo: pedais embaixo dos pés (o meio de cada pé), almofada, alavanca ───────────────────────────────────
    pes = {L: (cab(L + "Foot") + cab(L + "ToeBase")) / 2 for L, _ in LADOS}
    y_ped = (pes["Left"].y + pes["Right"].y) / 2 + 0.02
    x_ped = (pes["Left"].x - pes["Right"].x) / 2
    mq = e3.remada_cavalinho("cavalinho", eixo=(P.y, P.z), ponta=(T.y, T.z), pegadores=(A0.y, A0.z, X_PEG, COMP_PEG, RAIO, ANG_PEG),
                             almofada=(c_alm, ang_alm, COMP_ALM, LARG_ALM, ESP_ALM), pedais=(y_ped, PEDAL, x_ped, LARG_PEDAL, PROF_PEDAL))

    # ── 9) pose: a alavanca gira no arco; a mão vai junto com o pegador ────────────────────────────────────────────────────────────
    estado = {}
    POLO = {}
    for L, s in LADOS:
        rel_ = []
        for t_, Gx in ((0.0, G0[L]), (1.0, G1[L])):
            escapulas(t_)
            Sx = cab(L + "Arm")
            g, E, W, f_ = Gx
            Cc, uu, rho = circulo(Sx, W)
            v = E - Cc
            rel_.append(E + (v - uu * v.dot(uu)).normalized() * 0.5 - Sx)
        POLO[L] = rel_

    def no_pegador(L, s, Sx, polo, f_):
        g, w = mq.pegada(s)
        for _ in range(5):                      # mão ↔ punho ↔ cotovelo (converge em 2–3 voltas)
            dq, pq = mao(s, w, f_)
            W = g - vao_menos_punho(L, dq, pq)
            f_ = (W - cotovelo_do_polo(Sx, W, polo)).normalized()
        dq, pq = mao(s, w, f_)
        return g, dq, pq, f_

    DEDOS, DOBRADO = {}, {}

    def maos_no_pegador(t):
        for L, s in LADOS:
            Sx = cab(L + "Arm")
            polo = Sx + POLO[L][0].lerp(POLO[L][1], t)
            f_ = estado.get(L, G0[L][3])
            g, dq, pq, f_ = no_pegador(L, s, Sx, polo, f_)
            if L in DOBRADO:                    # o IK parte do braço dobrado (com o braço reto ele não consegue dobrar)
                for n_, M in DOBRADO[L].items():
                    PB[n_].matrix_basis = M.copy()
                p3.atualizar()
            maos.segurar(L, g, dq, pq, polo=polo)
            estado[L] = f_
            if L in DEDOS:                      # mão rígida no pegador: os dedos e o polegar fechados no começo, iguais
                for n_, M in DEDOS[L].items():
                    PB[n_].matrix_basis = M.copy()
                p3.atualizar()

    def pose(t):
        """t=0 braços pendurados, escápulas soltas; t=1 pegadores na cintura, cotovelos atrás, escápulas aproximadas."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        escapulas(t)
        mq.girar(p3.lerp(0.0, ARCO, t))
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
        DOBRADO[L] = {p3.P + n_: PB[p3.P + n_].matrix_basis.copy() for n_ in (L + "Arm", L + "ForeArm")}
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:
        g, u = mq.pegada(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)
    estado.clear()

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        g, u = mq.pegada(1)
        dev = []                                  # punho de lado (desvio radial/ulnar): 90° − ângulo pegador × antebraço
        for L, s in LADOS:
            fa = (Vector(jj[L + "Hand"]) - Vector(jj[L + "ForeArm"])).normalized()
            gs, us = mq.pegada(s)
            dev.append(90.0 - math.degrees(fa.angle(us)))
        return ("alavanca %.1f° | pegador E (%.3f %.3f %.3f) | cotovelo %.0f/%.0f° | abertura %s° | braço × tronco %s° | antebraço "
                "× vertical %s° | pegador × antebraço %s° | punho %.0f/%.0f° (flexão %s) | palma pro meio %s° | pegada %.2f | "
                "escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça %.0f° | %s" % (
                    mq.angulo, *g, jt["cotoveloE"], jt["cotoveloD"], "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), "/".join("%+.1f" % v for v in dev),
                    jt["punhoE"], jt["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEG / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.3, 0.8),
                camera_video=((3.2, yq - 2.4, 1.5), (0, yq - 0.3, 0.75), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
