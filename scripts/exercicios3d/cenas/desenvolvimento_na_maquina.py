# Desenvolvimento na Máquina — cena da fábrica 3D (lote 5, 07/10/2026). Máquina: equip3d.supino_sentado (a peça do Supino Reto na
# Máquina Sentado) no modo de EMPURRAR PRA CIMA: o eixo dos 2 braços da máquina fica ATRÁS do encosto, na altura do pescoço, os
# braços vêm de trás pra frente por fora dos ombros até os pegadores horizontais, e o encosto é alto, com a almofada da cabeça.
# t = 0 pegadores um pouco acima do topo dos ombros, do lado da cabeça, cotovelos bem dobrados, embaixo das mãos e um pouco à frente
# do tronco (4 e 8 horas) · t = 1 braços quase esticados acima da cabeça (~10°, sem travar). Técnica: ExRx, Lever Shoulder Press:
# "Set and grasp lever handles to each side with overhand grip." / "Press lever upward until arms are extended overhead. Lower and
# repeat." / "Range of motion will be compromised if grip is too wide." ACE, Seated Shoulder Press (Weight Machines / Selectorized):
# "Sit with your back firmly supported against the backrest. Adjust the seat height so that the handles are level with your
# shoulders or just higher than your shoulders." / "maintain a neutral wrist position (i.e., wrists in line with your forearms)" /
# "Position your elbows in the 4 and 8 o'clock position (i.e., slightly forward than the 3 and 9 o'clock positions where the elbows
# are aligned with the midline of your trunk)." / "Position your feet firmly on the floor" / "Depress and retract your scapulae
# (pull shoulders back and down) and attempt to hold this position throughout the exercise." / "head aligned with your spine" /
# "Continue pressing until your elbows are fully extended, but not locked." NSCA (Achievable CSCS, Machine shoulder press): "Sit
# down and lean back so your body is in the five-point body contact position." (cabeça, ombros/costas de cima e glúteo no apoio,
# os 2 pés chapados no chão) / "Grasp the handles with a closed, pronated grip." / "Align the handles with the top of the
# shoulders." / "Push the handles upward until the elbows are fully extended." / "Don't arch the lower back or forcefully lock out
# the elbows." eGym, M17 Shoulder Press: "Sit with your back straight against the backrest." / "Keep your shoulders lowered and
# avoid locking your elbows."
# Como o rig faz: sentado como no supino sentado (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das
# costas encostarem juntos num encosto 10° atrás da vertical; coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no
# chão; escápulas pra trás e pra baixo, paradas). A cabeça do boneco fica ~6 cm à frente do plano das costas: a almofada da cabeça
# (cabeceira) tem essa espessura e a cabeça encosta nela sem mexer o pescoço (5 pontos de contato da NSCA). Os pegadores, na largura
# X_PEG, andam num ARCO em volta do eixo dos braços da máquina: embaixo (t=0) o centro do pegador fica SOBE0 acima da articulação do
# ombro e FRENTE0 à frente dela; em cima (t=1) o cotovelo dobra só COTOVELO1° e o punho fica em cima do ombro (braço em pé, visto de
# lado). O eixo fica Y_EIXO atrás, à mesma distância dos 2 pontos. Quadro a quadro os braços da máquina giram no arco e a mão vai
# junto com o pegador (IK do braço + mão fechada em volta dele); o cotovelo fica no ponto do círculo que o braço deixa em que o
# antebraço fica em pé visto de lado (o cotovelo embaixo da mão, pra frente e pra trás), por fora; a mão com a palma pra frente
# (pegada pronada) e o punho quase reto. Os dedos e o polegar fecham UMA vez, no começo (mão rígida no pegador redondo). Tronco,
# escápulas, cabeça, quadril, pernas e pés não mexem.
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
ENCOSTO = 10.0            # encosto 10° atrás da vertical = 100° com o assento (a mesma regulagem do supino sentado)
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.88, 0.30, 0.06   # do assento até o topo da cabeça; estofado de 60 mm
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.36    # estofado de 60 mm, como o do supino sentado
PROF_ASSENTO = 0.36       # do encosto até a borda da frente (a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento, do encosto e da almofada da cabeça
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril
CABECEIRA = (0.70, 0.17)  # almofada da cabeça de 0,70 a 0,87 m ao longo do encosto (a parte de trás da cabeça encosta em ~0,74–0,81;
                          # embaixo dela o pescoço fica a ≥ 2 cm): a espessura sai da distância da cabeça ao encosto
X_PEG = 0.35              # centro de cada pegador a 35 cm do meio: as mãos logo por fora dos ombros (deltoide até |x| ~0,31)
SOBE0 = 0.135             # começo: centro do pegador 13,5 cm acima da articulação do ombro (a pele do topo do ombro fica 7,5 cm
                          # acima dela): "level with your shoulders or just higher than your shoulders" (ACE)
FRENTE0 = 0.10            # começo: o pegador 10 cm à frente da articulação do ombro — com o antebraço em pé, o cotovelo fica ~30° à
                          # frente do lado (as 4 e 8 horas da ACE)
COTOVELO1 = 10.0          # fim: cotovelo dobrado 10°, quase esticado sem travar
FRENTE1 = 0.0             # fim: o punho em cima da articulação do ombro (o braço em pé, visto de lado)
Y_EIXO = 0.56             # eixo dos braços da máquina atrás do encosto (sai na altura do pescoço, à mesma distância dos 2 pegadores)
X_BRACO = 0.53            # plano dos braços da máquina: por fora das mãos e dos cotovelos
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.15
GIRO_PEG = 0.0            # pegadores ao longo do X (pegada pronada reta)
PUNHO = 8.0               # extensão do punho: a mão um pouco pra trás da linha do antebraço ("neutral wrist position", ACE)
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula: o ombro anda ~1,5 cm
                          # pra trás e ~1 cm pra baixo e fica assim o movimento todo (ACE: "Depress and retract your scapulae")


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

    # escápulas pra trás e pra baixo, paradas o movimento todo (ACE: "Depress and retract your scapulae (pull shoulders back and
    # down) and attempt to hold this position throughout the exercise"; eGym: "Keep your shoulders lowered"): cada clavícula gira
    # RETRAI° em volta do eixo do tronco e DESCE° em volta do eixo da frente, feito em pé, antes de sentar (como no supino sentado)
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
    # against the backrest", ACE; "five-point body contact position", NSCA)
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

    # ── 2) ombros, braço e antebraço; o topo do ombro (a pele em cima da articulação) ─────────────────────────────────────────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    T = co[_grupo(nomes, dono, ("Spine2", "LeftShoulder", "LeftArm", "Neck"))]
    perto = T[(np.abs(T[:, 0] - S["Left"].x) < 0.03) & (np.abs(T[:, 1] - S["Left"].y) < 0.05)]
    z_topo_ombro = float(perto[:, 2].max())
    print("OMBROS | E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | braço %.4f antebraço %.4f | topo do ombro (pele) z %.4f = ombro + %.0f mm"
          % (*S["Left"], *S["Right"], Lb, La, z_topo_ombro, (z_topo_ombro - S["Left"].z) * 1000), flush=True)

    # ── 3) mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ──────────────────────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    g_rad = math.radians(GIRO_PEG)
    eixo_peg = {s: Vector((-s * math.cos(g_rad), -math.sin(g_rad), 0.0)) for _, s in LADOS}   # de fora pra dentro

    def orientacao(s, u, f):
        """Dedos e palma da mão no pegador de eixo u com o antebraço na direção f: dedos ⟂ ao pegador, na direção do antebraço,
        PUNHO° pra trás (extensão, pro lado do dorso); palma pra frente (pegada pronada, o dorso da mão pra trás)."""
        u = Vector(u).normalized()
        d = (f - u * f.dot(u)).normalized()
        p0 = u.cross(d)
        if p0.y > 0:
            p0 = -p0                                  # palma pra frente (−Y)
        dq = (d * math.cos(math.radians(PUNHO)) - p0 * math.sin(math.radians(PUNHO))).normalized()
        pq = u.cross(dq).normalized()
        if pq.y > 0:
            pq = -pq
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        dq_r, pq_r = orientacao(s, eixo_peg[s], Vector((0, 0, 1)))
        g_r = S[L] + Vector((s * 0.15, -0.06, 0.16))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.4, -0.2, -0.4)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def cotovelo(L, s, W, antes=None):
        """Cotovelo no círculo que o braço deixa (ombro e punho dados): o ponto por fora do ombro em que o antebraço fica mais em pé
        visto de lado (o cotovelo embaixo da mão, pra frente e pra trás), perto do quadro anterior (`antes`, direção do cotovelo:
        sem salto). Devolve o centro do círculo, a direção do cotovelo (a partir do centro) e o raio."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        Cc = S[L] + u * a
        e1 = (Vector((s, 0.0, 0.0)) - u * (u.x * s)).normalized()     # pro lado de fora, ⟂ ao eixo ombro → punho
        e2 = u.cross(e1)
        melhor = None
        for k in range(-180, 180):
            e = e1 * math.cos(math.radians(k)) + e2 * math.sin(math.radians(k))
            E = Cc + e * rho
            if (E.x - S[L].x) * s < 0.02:
                continue                                    # cotovelo por fora do ombro
            f = (W - E).normalized()
            custo = abs(math.degrees(math.atan2(f.y, f.z)))
            if antes is not None:
                custo += 20.0 * max(0.0, math.degrees(e.angle(antes)) - 10.0)
            if melhor is None or custo < melhor[0]:
                melhor = (custo, e)
        return Cc, melhor[1], rho

    # ── 4) embaixo (t=0) e em cima (t=1); o eixo dos braços da máquina à mesma distância dos 2 pegadores, Y_EIXO atrás ──────────────
    def comeco(L, s):
        g0 = Vector((s * X_PEG, S[L].y - FRENTE0, S[L].z + SOBE0))
        f = Vector((0, 0, 1))
        for _ in range(8):                         # antebraço ↔ cotovelo ↔ orientação da mão
            dq, pq = orientacao(s, eixo_peg[s], f)
            W = g0 - vao_menos_punho(L, dq, pq)
            Cc, e, rho = cotovelo(L, s, W)
            E = Cc + e * rho
            f = (W - E).normalized()
        return g0, E, W, f, e

    def fim(L, s, g0):
        d1 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO1)))
        g1 = Vector((g0.x, S[L].y, S[L].z + 0.5))
        for _ in range(10):
            dq, pq = orientacao(s, eixo_peg[s], (g1 - S[L]).normalized())
            o = vao_menos_punho(L, dq, pq)
            w = g1 - o - S[L]
            wx, wy = w.x, -FRENTE1
            wz = math.sqrt(max(d1 ** 2 - wx * wx - wy * wy, 0.0))
            g1 = Vector((g0.x, S[L].y + wy + o.y, S[L].z + wz + o.z))
        return g1

    g0, E0, W0, f0, e0 = comeco("Left", 1)
    g1 = fim("Left", 1, g0)
    a0, a1 = Vector((g0.y, g0.z)), Vector((g1.y, g1.z))
    meio, corda = (a0 + a1) / 2, (a1 - a0).normalized()
    nrm = Vector((corda.y, -corda.x))                        # ⟂ à corda, pra trás (+Y) e um pouco pra baixo
    if nrm.x < 0:
        nrm = -nrm
    C = meio + nrm * ((Y_EIXO - meio.x) / nrm.x)            # (y, z) do eixo
    x_peg = g0.x
    flex0 = math.degrees((E0 - S["Left"]).angle(W0 - E0))
    b0 = E0 - S["Left"]
    print("COMEÇO | pegador (%.4f %.4f %.4f) = %.0f mm acima do topo do ombro, %.0f mm à frente da articulação | cotovelo (%.3f %.3f "
          "%.3f) dobrado %.0f°, %.0f mm abaixo do ombro, %.0f° à frente do lado | antebraço %.1f° da vertical de frente (+ = mão pra "
          "fora), %.1f° de lado | pegada %.2f × ombros" % (
              *g0, (g0.z - z_topo_ombro) * 1000, (S["Left"].y - g0.y) * 1000, *E0, flex0, -b0.z * 1000,
              math.degrees(math.atan2(-b0.y, b0.x)), math.degrees(math.atan2(f0.x, f0.z)),
              math.degrees(math.atan2(f0.y, f0.z)), 2 * x_peg / (S["Left"] - S["Right"]).length), flush=True)
    r0, r1 = a0 - C, a1 - C
    R_alav = r0.length
    ARCO = math.degrees(math.atan2(r0.x * r1.y - r0.y * r1.x, r0.dot(r1)))     # giro em volta do +X (y → z)
    meio_arco = C + (r0 + r1).normalized() * R_alav
    print("FIM | pegador (%.4f %.4f %.4f), %.0f mm acima do ombro | curso %.3f m | eixo dos braços y %.4f z %.4f | braço da alavanca "
          "%.3f m | arco %.1f° | no meio o pegador passa %.0f mm à frente da reta | braço da máquina começa %.1f° e termina %.1f° da "
          "horizontal (+ = pra cima)" % (
              *g1, (g1.z - S["Left"].z) * 1000, (g1 - g0).length, C.x, C.y, R_alav, ARCO,
              (meio.x - meio_arco.x) * 1000,
              math.degrees(math.atan2(r0.y, -r0.x)), math.degrees(math.atan2(r1.y, -r1.x))), flush=True)

    # ── 5) a máquina em volta do corpo ────────────────────────────────────────────────────────────────────────────────────────
    mq = e3.supino_sentado("desenv", eixo=(C.x, C.y), x_braco=X_BRACO,
                           pegadores=(g0.y, g0.z, x_peg, COMP_PEGADOR, RAIO), giro_pegador=GIRO_PEG,
                           assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                           encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), lado=-1,
                           cabeceira=(CABECEIRA[0], CABECEIRA[1], esp_cab))

    # ── 6) pose: os braços da máquina giram no arco e cada mão vai junto com o pegador ─────────────────────────────────────────
    estado, DEDOS = {}, {}

    def maos_no_pegador(t, acertar=False):
        for L, s in LADOS:
            g, u = mq.pegada(s)
            f, antes = estado.get(L, (Vector((s * f0.x, f0.y, f0.z)), None))
            for _ in range(3):                  # antebraço ↔ cotovelo ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(s, u, f)
                W = g - vao_menos_punho(L, dq, pq)
                Cc, e, rho = cotovelo(L, s, W, antes=antes)
                f = (W - (Cc + e * rho)).normalized()
            estado[L] = (f, e)
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
        """t=0 pegadores um pouco acima do topo dos ombros, cotovelos bem dobrados; t=1 braços quase esticados acima da cabeça."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        mq.girar(p3.lerp(0.0, ARCO, t))
        maos_no_pegador(t)

    mq.girar(0.0)
    maos_no_pegador(0.0, acertar=True)          # polo certo do cotovelo com ele bem dobrado (embaixo)
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
        g, _ = mq.pegada(1)
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm acima do topo do ombro, %.0f mm à frente do ombro | "
                "cotovelo %.0f/%.0f° | braço: elevação %s°, plano %s°, abertura %s° | antebraço × vertical %s° | punho %.0f/%.0f° "
                "(flexão %s) | palma × frente %s° | pegada %.2f | escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça %s° | %s" % (
                    mq.angulo, *g, (g.z - z_topo_ombro) * 1000, (S["Left"].y - g.y) * 1000, juntas["cotoveloE"],
                    juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.braco_plano(jj)), "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                    tc.pegada_largura(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.1, 1.0),
                camera_video=((3.2, yq - 2.6, 1.55), (0, yq - 0.1, 0.95), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
