# Paralela na Máquina (Mergulho) — cena da fábrica 3D (21/10/2026, o 157º exercício, pedido do Weslley). Máquina nova:
# equip3d.paralela_maquina (mergulho sentado: os 2 braços da máquina giram num eixo ATRÁS do encosto, cada um com o pegador neutro
# do lado do quadril, preso pela ponta de trás; de lado e de frente a mão fica livre).
# t = 0 cotovelos dobrados a ~90°, apontando pra trás, perto do tronco, com o braço ~48° atrás do tronco (o ombro só um pouco
# alongado) e as mãos nos pegadores do lado do quadril · t = 1 braços estendidos ao lado do tronco, sem travar (~10°), as mãos do
# lado do assento. O app faz a volta. Técnica (as frases na ficha):
#   • ExRx, Lever Triceps Dip: "If possible, place handles in narrow position. Sit on seat with back against pad. Grasp handles and
#     position elbows back." / "Push levers down by straightening arms downward. Allow lever bar to raise with elbows pointing back
#     until shoulders are slightly stretched. Repeat." · ExRx, Lever Triceps Dip (plate loaded): "Sit upright on seat." / "Push
#     levers down with elbows pointing back." · a versão de PEITO é outra (ExRx, Lever Chest Dip: "place handles in wide position",
#     "Lean forward slightly and allow elbows to flare out").
#   • ACE, Seated Close-Grip Chest Press (as regras do ACE pra empurrar na máquina com os cotovelos do lado do corpo): "Sit with your
#     back firmly supported against the backrest." / "maintain a neutral wrist position (i.e., wrists in line with your forearms)" /
#     "Position your feet firmly on the floor" / "Depress and retract your scapulae (pull shoulders back and down) and attempt to hold
#     this position throughout the exercise." / "head aligned with your spine" / "Continue pressing until your elbows are fully
#     extended, but not locked." · ACE, Dangerous Dips (2011): "Dips also push the glenohumeral joint beyond the normal anatomical
#     range of shoulder extension" e "forcing a rounding of the shoulders".
#   • NSCA (Achievable CSCS, cap. 15): "Neutral grip - knuckles point laterally (like a handshake)"; sentado, "five-point body contact
#     position" ("Head on the bench or pad", "Shoulders/upper back on the bench", "Buttocks on the bench or seat", os 2 pés "flat on
#     the floor").
#   • eGym (fabricante), M18 Triceps: "Start with your elbows bent at approximately a right angle." / "Extend your arms downward
#     against the resistance. Stop when your elbows are slightly bent." / "Do not lock your elbows." / "keeping your shoulders
#     lowered". Hammer Strength Seated Dip (Life Fitness): "primarily targets the triceps", "particularly the lower pecs and anterior
#     deltoids, as secondary muscles". Goniometria (CSJM): ombro "Extension – 0-60°".
# Como o rig faz: sentado como no Desenvolvimento na Máquina (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de
# cima das costas encostarem juntos no encosto, aqui só ENCOSTO° atrás da vertical — tronco em pé —, a cabeça encostada na almofada
# da cabeça, coxas na horizontal um pouco abertas, canelas em pé, pés chapados; escápulas um pouco pra trás e pra BAIXO, paradas).
# O pegador de cada lado fica em x = ±X_PEG (do lado do quadril, com folga dele e do assento) e anda num ARCO em volta do eixo dos
# braços da máquina: no começo (t=0) o cotovelo dobra COTOVELO0° com o braço EXT0° atrás do tronco; no fim (t=1) o cotovelo dobra
# COTOVELO1° com o braço BF1° do tronco (ao lado dele) — os 2 pontos saem de uma busca com o boneco (cotovelo, braço e mão de
# verdade); o eixo fica Y_EIXO atrás do ombro, à mesma distância dos 2 (atrás do encosto). O cotovelo fica no ponto do círculo que o
# braço deixa (ombro e punho dados) que aponta BEM PRA TRÁS (a direção de trás do tronco, ⟂ à reta ombro → punho): perto do
# tronco, sem abrir. A mão fecha em volta do pegador com a palma pra dentro (neutra) e o punho PUNHO° estendido; o pegador gira junto
# com o braço da máquina e o antebraço gira mais que ele, então a inclinação do pegador no começo (INC0) sai da conta que divide o
# desvio do punho em partes iguais entre o começo (pro lado do mínimo) e o fim (pro lado do polegar). Os dedos e o polegar fecham UMA
# vez, no começo (mão rígida no pegador redondo). Tronco, escápulas, cabeça, quadril, pernas e pés não mexem.
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
ENCOSTO = 5.0             # encosto 5° atrás da vertical: tronco em pé (ExRx: "Sit upright on seat"), encostado ("back against pad")
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.88, 0.24, 0.06   # do assento até o topo da cabeça; ESTREITO (Titan: "Seat Back
                          # Dimensions: 33-in. x 9.5-in."): os braços passam dos lados dele com os cotovelos pra trás; estofado de 60 mm
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.32    # estofado de 60 mm; 32 cm de largura: as mãos descem do lado dele com folga
PROF_ASSENTO = 0.36       # do encosto até a borda da frente (a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento, do encosto e da almofada da cabeça
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril
CABECEIRA = (0.70, 0.17)  # almofada da cabeça de 0,70 a 0,87 m ao longo do encosto (a parte de trás da cabeça encosta nela)
X_PEG = 0.255             # centro de cada pegador a 25,5 cm do meio: do lado do quadril (ExRx: "place handles in narrow position"),
                          # com a mão fechada passando por fora do quadril, das coxas e do assento
COTOVELO0 = 90.0          # começo: cotovelo a 90° (eGym M18: "Start with your elbows bent at approximately a right angle.")
EXT0 = 48.0               # começo: braço 48° atrás do tronco (ExRx: "until shoulders are slightly stretched"; ombro até 60°)
COTOVELO1 = 10.0          # fim: cotovelo dobrado 10°, esticado sem travar (eGym: "Stop when your elbows are slightly bent.")
BF1 = 0.0                 # fim: o braço ao lado do tronco (cotovelo embaixo do ombro, na linha do tronco)
ABRE = 0.0                # cotovelo girado pra fora a partir de "bem pra trás" (graus): 0 = bem pra trás
Y_EIXO = 0.40             # eixo dos braços da máquina 40 cm atrás da articulação do ombro (atrás do encosto)
X_BRACO = 0.38            # plano dos braços da máquina: por fora das mãos, dos cotovelos e do assento
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.16
PUNHO = 5.0               # extensão do punho: a mão um pouco pra fora da linha do antebraço (o empurrão desce pelo antebraço);
                          # com o 3º metacarpo da mão de referência o punho_flexao mede ~−9° (a 1ª prévia, com 10°, mediu −13/−15°)
DESVIO_BASE = 6.8         # o 3º metacarpo (punho → base do dedo médio) fica ~6,8° pro lado do polegar da perpendicular ao pegador
                          # (medido na 1ª prévia: o punho_desvio deu +6,8° acima da conta pegador × antebraço no começo e no fim);
                          # entra na conta da inclinação do pegador pra o desvio do punho ficar igual pros 2 lados
RETRAI, DESCE = 5.0, 6.0  # escápulas um pouco pra trás (retração) e pra baixo (depressão), graus de giro da clavícula, paradas o
                          # movimento todo (ACE: "Depress and retract your scapulae (pull shoulders back and down)"; eGym: "keeping
                          # your shoulders lowered")


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

    # ── 1) sentado: coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão (a planta no chão) ──────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo)
    u_enc = Vector((0, math.sin(a_enc), math.cos(a_enc)))    # ao longo do encosto, pra cima

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

    # escápulas um pouco pra trás e pra baixo, paradas o movimento todo: cada clavícula gira RETRAI° em volta do eixo do tronco e
    # DESCE° em volta do eixo da frente, feito em pé, antes de sentar (como no Desenvolvimento na Máquina)
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

    # o quanto o corpo inclina pra trás: o glúteo e as costas encostam JUNTOS no encosto ("Sit on seat with back against pad", ExRx;
    # "five-point body contact position", NSCA)
    lo, hi = -10.0, 25.0
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
    base = Vector((0, y_base, topo))                         # onde a face do encosto cruza o topo do assento (h = 0)

    # cabeça × encosto: a almofada da cabeça tem a espessura que leva a face dela até a parte de trás da cabeça (ela afunda AFUNDA)
    co, _, (nomes, dono) = _malha(bon)
    nn, uu = np.array(n_enc), np.array(u_enc)
    cabeca_p = co[_grupo(nomes, dono, ("Head",))]
    nuca = float((cabeca_p @ nn).min()) - d_enc
    esp_cab = nuca + AFUNDA
    h_nuca = float((cabeca_p[(cabeca_p @ nn).argmin()] - np.array(base)) @ uu)
    resto = co[_grupo(nomes, dono, ("Neck", "Spine2", "LeftShoulder", "RightShoulder"))]
    hr = (resto - np.array(base)) @ uu
    na_faixa = resto[(hr > CABECEIRA[0] - 0.03) & (np.abs(resto[:, 0]) < LARG_ENCOSTO / 2)]    # da borda de baixo pra cima
    folga_pescoco = float((na_faixa @ nn).min() - d_enc - esp_cab)
    print("SENTADO | reclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f | "
          "encosto y_base %.4f | cabeça %.1f mm à frente do encosto (em h %.3f) → almofada da cabeça de %.1f mm, de h %.2f a %.2f | "
          "pescoço e ombros (de 3 cm abaixo da almofada pra cima) a %.1f mm da face dela" % (
              reclina, (dg - dc) * 1000, *H, topo, y_frente, y_tras, y_base, nuca * 1000, h_nuca, esp_cab * 1000,
              CABECEIRA[0], CABECEIRA[0] + CABECEIRA[1], folga_pescoco * 1000), flush=True)

    # ── 2) ombros, braço e antebraço, referencial do tronco ───────────────────────────────────────────────────────────────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    tras = -frente
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    print("OMBROS | E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | %.0f mm acima do assento | braço %.4f antebraço %.4f | tronco: cima "
          "(%.3f %.3f %.3f) frente (%.3f %.3f %.3f)" % (*S["Left"], *S["Right"], (S["Left"].z - topo) * 1000, Lb, La, *cima,
                                                         *frente), flush=True)

    # ── 3) mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ──────────────────────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def eixo_pegador(inc):
        """Direção do pegador (de trás pra frente) com a ponta da frente `inc` graus acima da horizontal."""
        r = math.radians(inc)
        return Vector((0.0, -math.cos(r), math.sin(r)))

    def orientacao(s, u, f):
        """Dedos e palma da mão no pegador de eixo u (frente-trás) com o antebraço na direção f: dedos ⟂ ao pegador, na direção do
        antebraço, PUNHO° pra fora (extensão, pro lado do dorso); palma pra dentro (pegada neutra, o dorso da mão pra fora)."""
        u = Vector(u).normalized()
        d = (f - u * f.dot(u)).normalized()
        p0 = u.cross(d)
        if p0.x * s > 0:
            p0 = -p0                                  # palma pra dentro (pro meio do corpo)
        dq = (d * math.cos(math.radians(PUNHO)) - p0 * math.sin(math.radians(PUNHO))).normalized()
        pq = u.cross(dq).normalized()
        if pq.x * s > 0:
            pq = -pq
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        u_r = eixo_pegador(35.0)
        f_r = Vector((0.0, -0.6, -0.8))
        dq_r, pq_r = orientacao(s, u_r, f_r)
        g_r = S[L] + Vector((s * 0.06, -0.02, -0.44))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.2, 0.5, -0.2)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def cotovelo(L, s, W):
        """Cotovelo no círculo que o braço deixa (ombro e punho dados): o ponto que aponta BEM PRA TRÁS (a direção de trás do tronco,
        ⟂ à reta ombro → punho), girado ABRE° pra fora. Devolve o centro do círculo, a direção do cotovelo e o raio."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        Cc = S[L] + u * a
        e = (tras - u * u.dot(tras)).normalized()
        if ABRE:
            fora = Vector((s, 0.0, 0.0))
            fora = (fora - u * u.dot(fora) - e * e.dot(fora)).normalized()
            e = (e * math.cos(math.radians(ABRE)) + fora * math.sin(math.radians(ABRE))).normalized()
        return Cc, e, rho

    def braco_frente(L, E):
        b = E - S[L]
        b = b - lado * b.dot(lado)
        return math.degrees(math.atan2(b.dot(frente), b.dot(-cima)))

    def braco(L, s, g, u, f=None):
        """Punho, cotovelo e antebraço com a mão fechada no pegador de centro g e eixo u (antebraço ↔ cotovelo ↔ mão: 6 voltas)."""
        if f is None:
            f = (-cima + frente * 0.6).normalized()
        for _ in range(6):
            dq, pq = orientacao(s, u, f)
            W = g - vao_menos_punho(L, dq, pq)
            Cc, e, rho = cotovelo(L, s, W)
            E = Cc + e * rho
            f = (W - E).normalized()
        flex = math.degrees((E - S[L]).angle(W - E))
        return W, E, f, flex, braco_frente(L, E), (Cc, e, rho), (dq, pq)

    def achar(L, s, inc, flex_alvo, bf_alvo, g):
        """Centro do pegador (x = s·X_PEG) que deixa o cotovelo dobrado flex_alvo° com o braço bf_alvo° do tronco (Newton 2D em y, z)."""
        u = eixo_pegador(inc)
        for _ in range(30):
            _, _, _, fl, bf, _, _ = braco(L, s, g, u)
            r = Vector((fl - flex_alvo, bf - bf_alvo))
            if r.length < 0.05:
                break
            J = []
            for dv in (Vector((0, 0.002, 0)), Vector((0, 0, 0.002))):
                _, _, _, fl2, bf2, _, _ = braco(L, s, g + dv, u)
                J.append(((fl2 - fl) / 0.002, (bf2 - bf) / 0.002))
            det = J[0][0] * J[1][1] - J[1][0] * J[0][1]
            if abs(det) < 1e-6:                  # braço esticado (o punho fora do alcance): o pegador chega 2 cm pro ombro
                g = S[L] + (g - S[L]) * (1 - 0.02 / (g - S[L]).length)
                g.x = s * X_PEG
                continue
            dy = (-r.x * J[1][1] + r.y * J[1][0]) / det
            dz = (-r.y * J[0][0] + r.x * J[0][1]) / det
            passo = Vector((0, dy, dz))
            if passo.length > 0.05:
                passo *= 0.05 / passo.length
            g = g + passo
        return g

    def fi(f):
        """Antebraço × vertical de lado (graus, + = a mão à frente do cotovelo)."""
        return math.degrees(math.atan2(-f.y, -f.z))

    # ── 4) começo (t=0) e fim (t=1); o eixo dos braços da máquina à mesma distância dos 2 pegadores, Y_EIXO atrás do ombro. A
    # inclinação do pegador no começo divide o desvio do punho igual entre o começo e o fim (o pegador gira ARCO°, o antebraço mais)
    L, s = "Left", 1
    inc0, arco, g0, g1 = 35.0, 20.0, S[L] + Vector((0.0, -0.05, -0.42)), S[L] + Vector((0.0, -0.10, -0.56))
    g0.x = g1.x = s * X_PEG
    for volta in range(4):
        g0 = achar(L, s, inc0, COTOVELO0, -EXT0, g0)
        a0 = Vector((g0.y, g0.z))
        g1 = achar(L, s, inc0 - arco, COTOVELO1, BF1, g1)
        a1 = Vector((g1.y, g1.z))
        meio, corda = (a0 + a1) / 2, (a1 - a0).normalized()
        nrm = Vector((corda.y, -corda.x))
        if nrm.x < 0:
            nrm = -nrm
        C = meio + nrm * ((S[L].y + Y_EIXO - meio.x) / nrm.x)       # (y, z) do eixo
        r0, r1 = a0 - C, a1 - C
        arco = math.degrees(math.atan2(r0.x * r1.y - r0.y * r1.x, r0.dot(r1)))     # giro em volta do +X (y → z)
        _, _, f0, _, _, _, _ = braco(L, s, g0, eixo_pegador(inc0))
        _, _, f1, _, _, _, _ = braco(L, s, g1, eixo_pegador(inc0 - arco))
        novo = (fi(f0) + fi(f1) + arco) / 2 - DESVIO_BASE
        print("   volta %d | inclinação do pegador %.1f° → %.1f° | arco %.1f° | antebraço de lado %.1f° → %.1f°" % (
            volta, inc0, novo, arco, fi(f0), fi(f1)), flush=True)
        inc0 = novo
    g0 = achar(L, s, inc0, COTOVELO0, -EXT0, g0)
    g1 = achar(L, s, inc0 - arco, COTOVELO1, BF1, g1)
    W0, E0, f0, fl0, bf0, _, _ = braco(L, s, g0, eixo_pegador(inc0))
    W1, E1, f1, fl1, bf1, _, _ = braco(L, s, g1, eixo_pegador(inc0 - arco))
    print("COMEÇO | pegador (%.4f %.4f %.4f) = %.0f mm acima do assento, %.0f mm à frente do ombro | cotovelo (%.3f %.3f %.3f) "
          "dobrado %.1f°, braço %.1f° do tronco | antebraço de lado %.1f° | inclinação do pegador %.1f°" % (
              *g0, (g0.z - topo) * 1000, (S[L].y - g0.y) * 1000, *E0, fl0, bf0, fi(f0), inc0), flush=True)
    print("FIM | pegador (%.4f %.4f %.4f) = %.0f mm acima do assento, %.0f mm à frente do ombro | cotovelo (%.3f %.3f %.3f) dobrado "
          "%.1f°, braço %.1f° do tronco | antebraço de lado %.1f° | inclinação do pegador %.1f°" % (
              *g1, (g1.z - topo) * 1000, (S[L].y - g1.y) * 1000, *E1, fl1, bf1, fi(f1), inc0 - arco), flush=True)
    a0, a1 = Vector((g0.y, g0.z)), Vector((g1.y, g1.z))
    meio, corda = (a0 + a1) / 2, (a1 - a0).normalized()
    nrm = Vector((corda.y, -corda.x))
    if nrm.x < 0:
        nrm = -nrm
    C = meio + nrm * ((S[L].y + Y_EIXO - meio.x) / nrm.x)
    r0, r1 = a0 - C, a1 - C
    R_alav = r0.length
    ARCO = math.degrees(math.atan2(r0.x * r1.y - r0.y * r1.x, r0.dot(r1)))
    meio_arco = C + (r0 + r1).normalized() * R_alav
    print("EIXO | y %.4f z %.4f (%.0f mm acima do assento, %.0f mm atrás do encosto na altura dele) | braço da alavanca %.3f m | "
          "arco %.1f° | curso %.3f m | no meio o pegador passa %.0f mm à frente da reta" % (
              C.x, C.y, (C.y - topo) * 1000, (C.x - (y_base + math.tan(a_enc) * (C.y - topo))) * 1000, R_alav, ARCO,
              (g1 - g0).length, (meio - meio_arco).length * 1000), flush=True)

    # ── 5) a máquina em volta do corpo: cada braço vai reto do cubo até a ponta, do lado de fora da ponta de trás do pegador ────────
    mq = e3.paralela_maquina("paralela", eixo=(C.x, C.y), x_braco=X_BRACO,
                             pegadores=(g0.y, g0.z, X_PEG, COMP_PEGADOR, RAIO), inclinacao_pegador=inc0,
                             assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                             encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), lado=-1,
                             cabeceira=(CABECEIRA[0], CABECEIRA[1], esp_cab))

    # ── 6) pose: os braços da máquina giram no arco e cada mão vai junto com o pegador ─────────────────────────────────────────
    estado, DEDOS = {}, {}

    def maos_no_pegador(t, acertar=False):
        for L, s in LADOS:
            g, u = mq.pegada(s)
            W, E, f, _, _, (Cc, e, rho), (dq, pq) = braco(L, s, g, u, estado.get(L))
            estado[L] = f
            maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))
            if L in DEDOS:                      # mão rígida no pegador redondo: os dedos e o polegar fechados no começo
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    def pose(t):
        """t=0 cotovelos a ~90°, pra trás; t=1 braços estendidos ao lado do tronco, sem travar."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        mq.girar(p3.lerp(0.0, ARCO, t))
        maos_no_pegador(t)

    mq.girar(0.0)
    maos_no_pegador(0.0, acertar=True)          # polo certo do cotovelo com ele dobrado (começo)
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:                          # dedos e polegar fecham UMA vez (o pegador é redondo: a mão gira em volta dele igual)
        g, u = mq.pegada(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)
    estado.clear()

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g, u = mq.pegada(1)
        incl = math.degrees(math.atan2(u.z, -u.y))
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm acima do assento, inclinado %.0f° | cotovelo %.0f/%.0f° "
                "| braço × tronco %s° | abertura do cotovelo %s° | antebraço × vertical %s° | punho %.0f/%.0f° (flexão %s, desvio %s) "
                "| palma pra dentro %s° | pegada %.2f | ombro caído %s° | escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça %s° | %s"
                % (mq.angulo, *g, (g.z - topo) * 1000, incl, juntas["cotoveloE"], juntas["cotoveloD"],
                   "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                   "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), juntas["punhoE"], juntas["punhoD"],
                   "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.punho_desvio(jj)),
                   "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                   "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Shoulder", "Arm"]})),
                   "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                   math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                   tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq + 0.05, 0.8),
                camera_video=((3.3, yq - 2.4, 1.3), (0, yq + 0.05, 0.72), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
