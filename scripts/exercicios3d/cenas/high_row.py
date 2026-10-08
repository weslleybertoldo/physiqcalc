# High Row — cena da fábrica 3D (lote 6, 07/10/2026). Máquina: equip3d.remada_sentada, a MESMA peça da Remada Fechada e da Remada
# Aberta na Máquina (assento, almofada do peito, 2 braços de alavanca independentes com o conjunto do pegador na ponta, que gira em
# volta da barra, e a torre da pilha na frente), SEM mudar nada nela: só os parâmetros — o eixo dos braços no ALTO, acima e um pouco
# atrás dos ombros (a alavanca pendurada: o "overhead pivot" que o próprio bloco da peça já prevê pro High Row), e a mão na borracha
# PRONADA da barra, como na Remada Aberta.
# t = 0 braços esticados pra cima e pra frente (as mãos uns 30° acima da horizontal dos ombros), cotovelos quase retos, pegada
# pronada (palmas pra frente e pra baixo), escápulas abertas e subidas (ombros levados pra frente e pra cima) · t = 1 mãos na frente
# do peito, por fora da almofada, um pouco abaixo dos ombros, cotovelos dobrados, descendo junto do corpo e um pouco atrás do tronco,
# escápulas fechadas e descidas (pra trás e pra baixo).
# Técnica: ExRx, Lever Seated High Row (plate loaded): "Sit on seat and position chest against pad. Grasp lever handles with overhand
# grip." / "Pull lever back until elbows are behind back and shoulders are pulled back. Return until arms are extended and shoulders
# are stretched forward." / "Chest pad should be adjusted to allow shoulders to stretch forward. The seat or grip should be adjusted to
# allow wrists to follow elbows." University of Sussex Sport, MTS High Row (Hammer Strength MTS Iso-Lateral High Row): "Adjust the seat
# so you can just about reach the handles" / "Keeping the core engaged, spine straight, take hold of the handles with an overhand grip"
# / "Retract the shoulder blades" / "Keeping the chest against the pads, pull back, leading with the elbows, until hands are just in
# front of the body" / "The neck should stay facing forwards, maintaining spinal alignment". ACE, High Row (a versão no cabo): "Lift the
# chest up and pull the elbows back until the hands are right in front of the shoulders". NSCA (Achievable CSCS) — não tem o High Row;
# as 2 vizinhas dele: Lat pulldown (machine): "Fully extend your elbows" / "Pull the bar down to your upper chest" / "Maintain your
# torso position without jerking"; Seated row (machine): "Sit erect with your feet flat and your chest against the pad" / "Grasp the
# handles with a closed grip (pronated or neutral)" / "Maintain an erect torso". Life Fitness (Hammer Strength Plate Loaded Iso-Lateral
# High Row): "The high pulling angle targets the upper back and lats, while the overhand grip reinforces strong, athletic movement
# patterns" (essa versão de anilhas prende as coxas: "the seat and thigh pads are fully adjustable"; aqui vale a do ExRx e da MTS, com
# o peito no apoio).
# Como o rig faz: sentado igual às remadas (tronco em pé, TRONCO° pra frente, coxas na horizontal e um pouco abertas, canelas em pé, pés
# chapados no chão; o assento embaixo do glúteo e das coxas e a almofada encostando na parte de baixo do peito). As escápulas giram de
# abertas e subidas (t=0) a fechadas e descidas (t=1). No começo o braço fica BRACO0° acima da horizontal, pra frente, com o cotovelo
# dobrado COTOVELO0° (o cotovelo pra baixo e um pouco pra fora, DOBRA0), e o vão da mão em x = ±X_MAO; no fim o braço fica FRENTE1°
# atrás da vertical do tronco e ABRE1° pro lado, com o antebraço ANTEBRACO1° acima da horizontal, virado pra dentro/fora o que precisa
# pra o vão ficar na mesma linha. A borracha pronada é coaxial com a barra (ao longo do X): o vão da mão fica NO eixo da barra; o eixo
# dos braços da máquina fica à mesma distância da barra no começo e no fim, na altura Z_EIXO (acima e um pouco atrás dos ombros), e quadro
# a quadro os braços giram no arco (cada lado o seu giro, que deixa o punho à distância planejada do ombro nas 2 pontas: o boneco não é
# simétrico ao milímetro). A mão vai junto com a barra (IK do braço partindo do braço dobrado + mão rígida no pegador: dedos e polegar
# fecham UMA vez, no começo); a mão gira em volta da barra com o antebraço (dedos ⟂ à barra, palma pra frente/baixo) e o conjunto do
# pegador gira junto com ela (o pegador neutro, de fora do exercício, acompanha, apontando pro lado da palma: longe do corpo). O
# cotovelo anda no círculo de onde ele pode ficar (ombro e punho dados) num ângulo que vai do cotovelo do começo pro do fim. Tronco,
# quadril, pernas, pés e cabeça não mexem.
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
TRONCO = 2.0              # tronco 2° pra frente da vertical (o peito apoiado na almofada): "position chest against pad" (ExRx), "Sit
                          # erect" (NSCA); o mesmo das remadas na máquina
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril (o das remadas)
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.36    # estofado de 60 mm e largura do assento: os das remadas
PROF_ASSENTO = 0.34       # do fundo até a borda da frente (o das remadas)
AFUNDA = 0.002            # pele afundando no estofado do assento e da almofada
LARG_ALMOFADA, ESP_ALMOFADA = 0.24, 0.06  # almofada do peito estreita (as mãos descem por fora dela) e estofado de 60 mm
ALMOFADA = (-0.20, 0.06)  # almofada do peito de 20 cm abaixo até 6 cm acima da linha do meio do peito ("Keeping the chest against the
                          # pads", Sussex; "position chest against pad", ExRx)
BRACO0 = 26.0             # começo: braço 26° acima da horizontal, pra frente (a pegada alta: "The high pulling angle", Life Fitness;
                          # "Adjust the seat so you can just about reach the handles", Sussex)
COTOVELO0 = 10.0          # começo: cotovelo dobrado 10°, quase esticado sem travar ("Return until arms are extended", ExRx; "Fully
                          # extend your elbows", NSCA no Lat pulldown)
DOBRA0 = 15.0             # começo: pra onde o cotovelo dobra — 0 = o antebraço sobe (cotovelo pra baixo), 90 = o antebraço vira pra
                          # dentro (cotovelo pra fora): com a pegada pronada um pouco mais aberta que os ombros, o cotovelo aponta pra
                          # baixo e um pouco pra fora
FRENTE1 = -17.0           # fim: braço 17° atrás da vertical do tronco ("Pull lever back until elbows are behind back", ExRx)
ABRE1 = 15.0              # fim: braço 15° pro lado do plano do tronco — o cotovelo desce junto do corpo, sem encostar ("leading with
                          # the elbows", Sussex; pedido: "cotovelos descendo junto do corpo")
ANTEBRACO1 = 18.0         # fim: antebraço 18° acima da horizontal, apontando pra frente — a mão na frente do peito, um pouco abaixo do
                          # ombro ("until hands are just in front of the body", Sussex; "until the hands are right in front of the
                          # shoulders", ACE; "Pull the bar down to your upper chest", NSCA no Lat pulldown)
PROTRAI, ELEVA0 = 8.0, 10.0   # escápulas abertas e subidas no começo: clavícula 8° pra frente em volta do eixo do tronco e 10° pra cima
                              # ("shoulders are stretched forward", ExRx; pedido: "volta devagar até os braços estenderem com as
                              # escápulas subindo")
RETRAI, DESCE1 = 8.0, 3.0     # escápulas fechadas e descidas no fim: 8° pra trás e 3° pra baixo ("shoulders are pulled back", ExRx;
                              # "Retract the shoulder blades", Sussex; pedido: "escápulas aproximando e descendo")
Z_EIXO = 1.47             # eixo dos braços da máquina no alto: ~50 cm acima da articulação do ombro (1,47 m do chão), o y sai da
                          # conta (à mesma distância da barra no começo e no fim) — fica acima e um pouco atrás dos ombros, como o
                          # eixo do Hammer Strength Iso-Lateral High Row nas fotos do fabricante (no alto da torre, atrás do assento)
X_MAO = 0.28              # vão da mão (meio da borracha pronada) em |x| = 0,28 m: pegada um pouco mais aberta que os ombros
X_BRACO = 0.45            # plano dos braços da máquina: por fora da borracha pronada (a peça pede 4 cm de folga depois do colar)
X_DENTRO = 0.17           # ponta de dentro da barra (pegador neutro): por fora da almofada do peito (12 cm de meia largura)
RAIO = 0.0145             # borrachas dos pegadores: 29 mm, o cilindro da mão de referência (o das remadas)
COMP_NEUTRO = 0.14        # pegador neutro (o das remadas; aqui fica de fora)
COMP_PRONADO = 0.13       # borracha pronada de 13 cm (a da Remada Aberta)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na borracha (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    X = Vector((1.0, 0.0, 0.0))

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

    # ── 2) escápulas: clavícula girando em volta do eixo do tronco (pra frente = abre, pra trás = fecha) e em volta do eixo da frente
    #    (pra cima = sobe, pra baixo = desce) ────────────────────────────────────────────────────────────────────────────────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def escapulas(t):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        ret, sobe = p3.lerp(-PROTRAI, RETRAI, t), p3.lerp(ELEVA0, -DESCE1, t)
        for L, s in LADOS:
            if ret:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * ret), 3, cima0))
            if sobe:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * sobe), 3, frente0))

    S_rep = {L: cab(L + "Arm") for L, _ in LADOS}

    def escapula_sobe():
        """Quanto cada ombro (cabeça do úmero) subiu desde o repouso, no eixo do tronco (mm) [E, D]."""
        return [(cab(L + "Arm") - S_rep[L]).dot(cima0) * 1000 for L, _ in LADOS]

    for t in (0.0, 1.0):
        escapulas(t)
        jj = ck.posicoes(rig)
        print("ESCÁPULAS t=%.0f | ombro E andou %+.1f mm pra frente, %+.1f mm pra cima, %+.1f mm pra fora | escapula_frente %s mm" % (
            t, (cab("LeftArm") - S_rep["Left"]).dot(frente0) * 1000, (cab("LeftArm") - S_rep["Left"]).dot(cima0) * 1000,
            (cab("LeftArm") - S_rep["Left"]).dot(-lado0) * 1000, "/".join("%.0f" % v for v in tc.escapula_frente(jj))), flush=True)

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
    print("BRAÇO %.4f m | ANTEBRAÇO %.4f m" % (Lb, La), flush=True)

    def pegada_pronada(f_):
        """Dedos ⟂ à barra (ao longo do X), na direção do antebraço f_ (sem dobrar o punho pra cima nem pra baixo), e palma pro
        lado de fora da curva (pegada pronada: palma pra frente/baixo; vale pros 2 lados)."""
        dq = (f_ - X * f_.dot(X)).normalized()
        pq = -(dq.cross(X)).normalized()
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        dq_r, pq_r = pegada_pronada(Vector((0, -1, 0)))
        g_r = S[L] + Vector((s * 0.12, -0.52, -0.03))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.6, 0.1, -0.3)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def eixos_tronco():
        return (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))

    def comeco(L, s):
        """Começo: o braço BRACO0° acima da horizontal, pra frente, o cotovelo dobrado COTOVELO0° (DOBRA0: o antebraço sobe e vira
        um pouco pra dentro — o cotovelo aponta pra baixo e um pouco pra fora) e o vão da mão em x = s·X_MAO. Devolve o vão, o
        cotovelo, o punho, o antebraço e os dedos."""
        Sx = cab(L + "Arm")
        p = math.radians(BRACO0)
        c0, d0 = math.radians(COTOVELO0), math.radians(DOBRA0)
        Z = Vector((0.0, 0.0, 1.0))

        def montar_lat(lat):
            b = Vector((s * math.sin(lat) * math.cos(p), -math.cos(lat) * math.cos(p), math.sin(p)))
            sobe = (Z - b * Z.dot(b)).normalized()             # ⟂ ao braço, pra cima
            dentro = -(sobe.cross(b)).normalized() * s          # ⟂ ao braço, na horizontal, pro meio
            k = sobe * math.cos(d0) + dentro * math.sin(d0)    # o antebraço sai do braço pra esse lado
            f_ = (b * math.cos(c0) + k * math.sin(c0)).normalized()
            E = Sx + b * Lb
            W = E + f_ * La
            dq, pq = pegada_pronada(f_)
            return W + vao_menos_punho(L, dq, pq), E, W, f_, dq

        lo, hi = math.radians(-30), math.radians(40)
        for _ in range(50):
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
            dq, pq = pegada_pronada(f_)
            return W + vao_menos_punho(L, dq, pq), E, W, f_, dq

        lo, hi = math.radians(-70), math.radians(70)
        for _ in range(50):
            meio = (lo + hi) / 2
            if s * montar_h(meio)[0].x < X_MAO:
                lo = meio
            else:
                hi = meio
        return montar_h((lo + hi) / 2)

    def medidas_braco(L, s, E, W):
        """Elevação do braço (0 = pendurado, 90 = na altura do ombro, 180 = pra cima), braço à frente (+) / atrás (−) no plano
        sagital, abertura pro lado (cotovelo × tronco) e o desvio de lado do punho (antebraço × ⟂ da barra), graus."""
        Sx = cab(L + "Arm")
        cima, lado, frente = eixos_tronco()
        fora = -lado * s
        b = E - Sx
        f_ = (W - E).normalized()
        bs = b - lado * b.dot(lado)
        return (math.degrees(b.angle(-cima)), math.degrees(math.atan2(bs.dot(frente), bs.dot(-cima))),
                math.degrees(math.asin(max(-1.0, min(1.0, b.normalized().dot(fora))))),
                math.degrees(math.asin(max(-1.0, min(1.0, f_.dot(X) * s)))))

    escapulas(0.0)
    G0 = {L: comeco(L, s) for L, s in LADOS}
    M0 = {L: medidas_braco(L, s, G0[L][1], G0[L][2]) for L, s in LADOS}
    S0 = {L: cab(L + "Arm") for L, _ in LADOS}
    escapulas(1.0)
    G1 = {L: fim(L, s) for L, s in LADOS}
    M1 = {L: medidas_braco(L, s, G1[L][1], G1[L][2]) for L, s in LADOS}
    S1 = {L: cab(L + "Arm") for L, _ in LADOS}
    for L, s in LADOS:
        for nome, (g, E, W, f_, dq), m, Sx in (("COMEÇO", G0[L], M0[L], S0[L]), ("FIM", G1[L], M1[L], S1[L])):
            print("%s %s | vão (%.4f %.4f %.4f) | cotovelo (%.3f %.3f %.3f) dobrado %.0f° | antebraço %.1f° da horizontal, %+.1f° pra "
                  "fora | vão %.0f mm à frente e %.0f mm acima do ombro | braço: elevação %.0f°, frente %.0f°, abertura %.0f°" % (
                      nome, L, *g, *E, math.degrees((E - Sx).angle(W - E)), math.degrees(math.asin(f_.z)), m[3],
                      (Sx.y - g.y) * 1000, (g.z - Sx.z) * 1000, m[0], m[1], m[2]), flush=True)

    # ── 5) a barra (eixo da borracha pronada = eixo do vão da mão) no começo e no fim e o eixo dos braços da máquina: à mesma
    #    distância das 2, na altura Z_EIXO ──────────────────────────────────────────────────────────────────────────────────────
    B0 = (G0["Left"][0] + G0["Right"][0]) / 2
    B1 = (G1["Left"][0] + G1["Right"][0]) / 2
    a0, a1 = Vector((B0.y, B0.z)), Vector((B1.y, B1.z))
    yc = ((a1.x ** 2 - a0.x ** 2) + (a1.y - Z_EIXO) ** 2 - (a0.y - Z_EIXO) ** 2) / (2 * (a1.x - a0.x))   # |a0 − C| = |a1 − C|
    C = Vector((yc, Z_EIXO))
    v0, v1 = a0 - C, a1 - C
    ARCO = math.degrees(math.atan2(v0.x * v1.y - v0.y * v1.x, v0.dot(v1)))     # giro em volta do +X (y → z)
    Sm = (S0["Left"] + S0["Right"]) / 2
    print("MÁQUINA | barra no começo (%.4f %.4f) e no fim (%.4f %.4f) — curso %.3f m | eixo y %.4f z %.3f (%.0f mm atrás e %.0f mm "
          "acima dos ombros) | braço da alavanca %.3f m | arco %.1f° | alavanca %.1f° abaixo da horizontal no começo e %.1f° no fim" % (
              B0.y, B0.z, B1.y, B1.z, (a1 - a0).length, C.x, C.y, (C.x - Sm.y) * 1000, (C.y - Sm.z) * 1000, v0.length, ARCO,
              math.degrees(math.atan2(-v0.y, -v0.x)), math.degrees(math.atan2(-v1.y, -v1.x))), flush=True)

    # o pegador neutro (de fora do exercício) sai da barra pro lado da palma no começo: gira junto com a mão e fica sempre do lado
    # de fora (longe do antebraço e do peito)
    w0 = (pegada_pronada(G0["Left"][3])[1] + pegada_pronada(G0["Right"][3])[1]).normalized()
    INCL_NEUTRO = math.degrees(math.atan2(w0.y, w0.z))

    # ── 6) a máquina em volta do corpo ────────────────────────────────────────────────────────────────────────────────────────
    mq = e3.remada_sentada("high_row", eixo=(C.x, Z_EIXO), x_braco=X_BRACO, barra=(B0.y, B0.z), x_dentro=X_DENTRO,
                           neutro=(COMP_NEUTRO, RAIO, INCL_NEUTRO), pronado=(X_MAO, COMP_PRONADO, RAIO),
                           assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                           almofada=(y_face, z_baixo, z_cima, LARG_ALMOFADA, ESP_ALMOFADA, 0.0))

    # ── 7) pose: os braços da máquina giram no arco; a mão vai junto com a barra; o conjunto do pegador gira com a mão ──────────────
    def circulo(Sx, W):
        """Centro, eixo e raio do círculo onde o cotovelo pode ficar, com o ombro em Sx e o punho em W."""
        d = W - Sx
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        return Sx + u * a, u, math.sqrt(max(Lb ** 2 - a * a, 1e-8))

    def base_circulo(s, u):
        """No plano do círculo do cotovelo: o "pra fora" (o fora do tronco ⟂ ao ombro→punho) e o "pra baixo" (⟂ aos 2)."""
        cima, lado, frente = eixos_tronco()
        fora = -lado * s
        o = (fora - u * fora.dot(u)).normalized()
        dn = u.cross(o)
        if dn.dot(cima) > 0:
            dn = -dn
        return o, dn

    def angulo_no_circulo(s, Sx, W, E):
        Cc, u, rho = circulo(Sx, W)
        o, dn = base_circulo(s, u)
        v = E - Cc
        return math.degrees(math.atan2(v.dot(dn), v.dot(o)))

    def polo_do_angulo(s, Sx, W, delta):
        """Polo do IK: 0,5 m pra fora do centro do círculo do cotovelo, `delta` graus abaixo do "pra fora"."""
        Cc, u, rho = circulo(Sx, W)
        o, dn = base_circulo(s, u)
        d = math.radians(delta)
        return Cc + (o * math.cos(d) + dn * math.sin(d)) * 0.5

    def cotovelo_do_polo(Sx, W, polo):
        """O cotovelo que o IK acha: o ponto do círculo do lado do polo."""
        Cc, u, rho = circulo(Sx, W)
        v = polo - Cc
        return Cc + (v - u * v.dot(u)).normalized() * rho

    # o cotovelo no círculo vai do ângulo do cotovelo planejado no começo pro do fim, em linha reta no t
    DELTA = {}
    for L, s in LADOS:
        dd = []
        for t_, Gx in ((0.0, G0[L]), (1.0, G1[L])):
            escapulas(t_)
            dd.append(angulo_no_circulo(s, cab(L + "Arm"), Gx[2], Gx[1]))
        DELTA[L] = dd
        print("COTOVELO %s | no círculo: %.1f° abaixo do \"pra fora\" no começo e %.1f° no fim" % (L, *dd), flush=True)

    def vao_na_barra(s, fi):
        """Vão da mão (no eixo da barra, em x = s·X_MAO) com o braço da máquina em fi."""
        P = mq.pivo(s, graus=fi)
        return Vector((s * X_MAO, P.y, P.z))

    def no_pegador(L, s, Sx, fi, delta, f_, voltas=12):
        """A mão do lado s na barra com o braço da máquina em fi (só a conta, sem mexer em nada): vão → punho → cotovelo (no ponto
        do círculo `delta` graus abaixo do "pra fora") → antebraço. Devolve o vão, os dedos, a palma, o punho, o antebraço e o
        polo."""
        g = vao_na_barra(s, fi)
        for _ in range(voltas):
            dq, pq = pegada_pronada(f_)
            W = g - vao_menos_punho(L, dq, pq)
            f_ = (W - cotovelo_do_polo(Sx, W, polo_do_angulo(s, Sx, W, delta))).normalized()
        dq, pq = pegada_pronada(f_)
        W = g - vao_menos_punho(L, dq, pq)
        return g, dq, pq, W, f_, polo_do_angulo(s, Sx, W, delta)

    # cada braço da máquina gira um pouco diferente do outro (braços independentes): o boneco não é simétrico ao milímetro; o giro de
    # cada lado no começo e no fim é o que deixa o punho à distância planejada do ombro
    FI = {}
    for L, s in LADOS:
        pontas = []
        for t_, Gx, fi_ini in ((0.0, G0[L], 0.0), (1.0, G1[L], ARCO)):
            escapulas(t_)
            Sx = cab(L + "Arm")
            d_quer = (Gx[2] - Sx).length
            melhor = None
            for k in range(-300, 301):
                fi = fi_ini + k * 0.01
                g, dq, pq, W, f_, polo = no_pegador(L, s, Sx, fi, DELTA[L][int(t_)], Gx[3], voltas=3)
                erro = abs((W - Sx).length - d_quer)
                if melhor is None or erro < melhor[0]:
                    melhor = (erro, fi)
            pontas.append(melhor[1])
            print("GIRO %s t=%.0f | braço da máquina %.2f° (planejado %.2f°) | punho a %.1f mm da distância planejada" % (
                L, t_, melhor[1], fi_ini, melhor[0] * 1000), flush=True)
        FI[L] = pontas

    def fi_x(dq):
        """Ângulo dos dedos em volta do +X (no plano YZ, de +Y pra +Z): a mão girando em volta da barra."""
        return math.degrees(math.atan2(dq.z, dq.y))

    estado, DEDOS, DOBRADO, PSI0 = {}, {}, {}, {}

    def maos_na_barra(t):
        for L, s in LADOS:
            Sx = cab(L + "Arm")
            fi = p3.lerp(FI[L][0], FI[L][1], t)
            delta = p3.lerp(DELTA[L][0], DELTA[L][1], t)
            f_ = estado.get(L, G0[L][3].lerp(G1[L][3], t).normalized())
            g, dq, pq, W, f_, polo = no_pegador(L, s, Sx, fi, delta, f_)
            mq.girar(fi, pegador=0.0, lado=s)
            for volta in range(4):              # a conta → o IK → o antebraço DE VERDADE acerta os dedos (⟂ à barra, na linha dele)
                if L in DOBRADO:                # o IK parte do braço dobrado (com o braço reto ele não consegue dobrar)
                    for n, M in DOBRADO[L].items():
                        PB[n].matrix_basis = M.copy()
                    p3.atualizar()
                maos.segurar(L, g, dq, pq, polo=polo)
                f_ = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
                dq2, pq2 = pegada_pronada(f_)
                if dq2.angle(dq) < math.radians(0.3):
                    break
                dq, pq = dq2, pq2
            estado[L] = f_
            if L in DEDOS:                      # mão rígida na barra: os dedos e o polegar fechados no começo, iguais
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()
            # o conjunto do pegador gira em volta da barra junto com a mão (a borracha pronada é dele)
            psi = ((fi_x(dq) - PSI0[L] + 180.0) % 360.0 - 180.0) if L in PSI0 else 0.0
            mq.girar(fi, pegador=psi, lado=s)

    def pose(t):
        """t=0 braços esticados pra cima e pra frente, escápulas abertas e subidas; t=1 mãos na frente do peito, cotovelos dobrados
        descendo junto do corpo e um pouco atrás dele, escápulas fechadas e descidas."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        escapulas(t)
        maos_na_barra(t)

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
        g, u = mq.pegada(s, "pronado")
        g = vao_na_barra(s, mq.angulos[s])
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        PSI0[L] = fi_x(pegada_pronada((cab(L + "Hand") - cab(L + "ForeArm")).normalized())[0])
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)
    estado.clear()

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        g = vao_na_barra(1, mq.angulos[1])
        dev = []                                  # punho de lado: o antebraço × o plano ⟂ à barra (+ = antebraço apontando pra fora)
        for L, s in LADOS:
            fa = (Vector(jj[L + "Hand"]) - Vector(jj[L + "ForeArm"])).normalized()
            dev.append(math.degrees(math.asin(max(-1.0, min(1.0, fa.dot(X) * s)))))
        return ("braços da máquina %.1f/%.1f° | pegador E %.1f° D %.1f° | vão E (%.3f %.3f %.3f) %.0f mm acima do ombro | cotovelo "
                "%.0f/%.0f° | elevação %s° | braço à frente %s° | cotovelo × tronco %s° | antebraço × horizontal %s° | antebraço pra "
                "fora %s° | punho %.0f/%.0f° (flexão %s°) | palma × cima %s° | palma pro meio %s° | pegada %.2f | escápula %s mm, "
                "subiu %s mm | tronco %.1f° | coluna %.1f° | cabeça %s° | %s" % (
                    mq.angulos[1], mq.angulos[-1], mq.giros_pegador[1], mq.giros_pegador[-1], *g,
                    (g.z - cab("LeftArm").z) * 1000, jt["cotoveloE"], jt["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    "/".join("%+.1f" % v for v in dev), jt["punhoE"], jt["punhoD"],
                    "/".join("%+.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.palma_cima(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    tc.pegada_largura(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    "/".join("%+.0f" % v for v in escapula_sobe()),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), maos.info()))

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores["pronado"][s], RAIO, COMP_PRONADO / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 1.0),
                camera_video=((3.0, yq + 1.7, 1.75), (0, yq - 0.25, 0.95), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
