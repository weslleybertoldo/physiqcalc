# Supino Declinado na Máquina — cena da fábrica 3D (lote 5, 07/10/2026). Máquina: equip3d.supino_sentado (a peça do Supino Reto na
# Máquina Sentado) no modo DECLINADO: o eixo dos 2 braços da máquina fica embaixo do pegador (bem embaixo dele no começo, ao lado do
# assento), e não na frente como no supino reto, então o pegador anda num arco pra frente e PRA BAIXO; os pegadores começam logo
# abaixo da linha do peito.
# t = 0 pegadores logo abaixo do peitoral, 4 cm à frente do tronco; cotovelos dobrados (~128°), abertos pro lado (~66°) e ~10 cm
# abaixo dos ombros · t = 1 braços quase esticados (~12°, sem travar), apontando pra frente e pra baixo (pras coxas: o pegador
# termina ~9 cm mais baixo, o braço ~30° abaixo da perpendicular ao tronco). Técnica: ExRx, Lever
# Decline Chest Press: "Sit on seat with lever grips lower chest height. Grasp grips with wide overhand grip; elbows out to sides
# just below shoulders." / "Press lever until arms are extended. Return weight until chest muscles are slightly stretched." /
# "Range of motion will be compromised if grip is too wide." ACE, Seated Decline Cable Press (Weight Machines / Selectorized):
# "Sit with your back firmly supported against the backrest." / "Grasp the handles and position your hands just below chest level,
# maintaining a neutral wrist position (i.e., wrists in line with your forearms)." / "Position your feet firmly on the floor" /
# "Depress and retract your scapulae (pull shoulders back and down) and attempt to hold this position throughout the exercise." /
# "perform a pressing movement, extending your arms forward towards your thighs." / "Continue pressing until your elbows are fully
# extended, but not locked." / "moving the handles back towards your lower chest, stopping when they lightly touch, or are close
# to, the lower portion of your chest". Life Fitness (Hammer Strength), Iso-Lateral Decline Chest Press: "the ultimate decline
# press experience in an upright, seated position". Rodríguez-Ridao et al. 2020 (Int J Environ Res Public Health 17:7339), sobre
# Glass e Armstrong 1997: "two bench press inclinations (+30° and −15° from horizontal)"; "significantly greater lower pectoral
# activation with a decline bench press".
# Como o rig faz: sentado como no supino reto na máquina (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima
# das costas encostarem juntos num encosto 10° atrás da vertical; coxas na horizontal e um pouco abertas, canelas em pé, pés
# chapados no chão; escápulas pra trás e pra baixo, paradas). A "parte de baixo do peito" é o ponto da pele PEITO_BAIXO do boneco
# em pé (no mapa do peitoral do musculos_def), levado junto com o tronco quando ele senta. O pegador anda num ARCO em volta do eixo
# dos braços da máquina: embaixo (t=0) ele fica na altura da parte de baixo do peito, FRENTE0 à frente do tronco, com o antebraço
# na linha em que o pegador anda no começo do arco (o empurrão: DESCE0° abaixo da horizontal) — daí saem o cotovelo, a largura da
# pegada e a abertura; o eixo fica embaixo (Z_EIXO), na reta ⟂ ao empurrão que passa pelo pegador; o arco vai até o cotovelo
# dobrar só COTOVELO1°. Quadro a quadro os braços da máquina giram no arco e a mão vai junto com o pegador (IK do braço + mão
# fechada em volta dele); o cotovelo fica no ponto do círculo que o braço deixa com a abertura indo de ABRE0 (começo) a ABRE1 (a
# reta ombro → punho no fim) junto com o arco, o antebraço perto da linha do empurrão e sem salto entre quadros (os cotovelos fecham
# pra frente e pra baixo, sem subir); a mão com a palma pra baixo (pronada) e o punho quase reto. Os dedos e o polegar fecham UMA vez,
# no começo (mão rígida no pegador redondo). Tronco, escápulas, quadril, pernas e pés não mexem.
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
ENCOSTO = 10.0            # encosto 10° atrás da vertical = 100° com o assento (a regulagem do supino reto na máquina; "upright,
                          # seated position", Life Fitness)
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.66, 0.30, 0.06   # do assento até perto da base do pescoço; estofado de 60 mm
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.36    # estofado de 60 mm, como o do supino reto na máquina
PROF_ASSENTO = 0.36       # do encosto até a borda da frente (a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento e do encosto
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril
PEITO_BAIXO = (0.11, 1.245)   # (|x|, z) do boneco em pé: logo abaixo da borda de baixo do peitoral, na linha do mamilo (o
                              # peitoral do musculos_def desce até z 1,250–1,262 nessa linha e sobe até 1,43; o ponto mais saliente
                              # fica em ~1,30; o xifoide em ~1,25): "position your hands just below chest level" (ACE), "lever
                              # grips lower chest height" (ExRx)
FRENTE0 = 0.04            # no começo o pegador fica 4 cm à frente da frente do tronco, nessa altura (ACE: "stopping when they
                          # lightly touch, or are close to, the lower portion of your chest")
DESCE0 = 0.0              # o empurrão do começo vai na horizontal (com o tronco 8° pra trás, já 8° pros pés da perpendicular a
                          # ele): o braço da máquina começa em pé, em cima do eixo, e o arco desce cada vez mais até o fim (pras
                          # coxas: "towards your thighs", ACE)
COTOVELO1 = 12.0          # flexão do cotovelo em cima: quase esticado, sem travar
Z_EIXO = 0.13             # eixo dos braços da máquina perto do chão, ao lado do assento (o cubo de 6 cm de raio fica 7 cm acima do
                          # chão, como no supino reto na máquina)
X_BRACO = 0.53            # plano dos braços da máquina: por fora das mãos e dos cotovelos
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.15
GIRO_PEG = 10.0           # ponta de dentro do pegador 10° pra frente (como no supino reto na máquina)
PUNHO = 12.0              # extensão do punho: a mão um pouco pra cima da linha do antebraço, o pegador na palma, na linha dele
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula (ACE: "Depress and
                          # retract your scapulae")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _abertura(v, cima, lado, s):
    """Abertura do braço (vetor ombro → cotovelo) vista de frente do tronco, graus (a mesma conta do tc.braco_abertura)."""
    return math.degrees(math.atan2(v.dot(s * lado), v.dot(-cima)))


def _gira_x(v, graus):
    """Vetor v girado `graus` em volta do +X (y → z), como os braços da máquina."""
    a = math.radians(graus)
    return Vector((v.x, v.y * math.cos(a) - v.z * math.sin(a), v.y * math.sin(a) + v.z * math.cos(a)))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 0) a parte de baixo do peito no boneco em pé: o vértice da pele do tronco mais perto de PEITO_BAIXO (|x|, z), na frente ───
    co, _, (nomes, dono) = _malha(bon)
    tronco = _grupo(nomes, dono, ("Spine1", "Spine2"))
    i_peito = {}
    for _, s in LADOS:
        cand = np.where(tronco & (co[:, 1] < -0.03) & (s * co[:, 0] > 0))[0]
        d = np.hypot(np.abs(co[cand, 0]) - PEITO_BAIXO[0], co[cand, 2] - PEITO_BAIXO[1])
        i_peito[s] = int(cand[d.argmin()])
    print("PEITO EM PÉ | parte de baixo do peito E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (
        *co[i_peito[1]], *co[i_peito[-1]]), flush=True)

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
    # down) and attempt to hold this position throughout the exercise"): cada clavícula gira RETRAI° em volta do eixo do tronco e
    # DESCE° em volta do eixo da frente, feito em pé, antes de sentar (como no supino reto na máquina)
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
    # against the backrest", ACE)
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
    print("SENTADO | reclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f | "
          "encosto y_base %.4f" % (reclina, (dg - dc) * 1000, *H, topo, y_frente, y_tras, y_base), flush=True)

    # ── 2) a parte de baixo do peito (sentado), o meio do peito e a frente do peito ────────────────────────────────────────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    co, _, (nomes, dono) = _malha(bon)
    baixo = {s: Vector(co[i_peito[s]]) for _, s in LADOS}
    z_baixo = (baixo[1].z + baixo[-1].z) / 2
    T = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2"))]
    rel = T - np.array(S["Left"])
    f = T[(np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (rel @ np.array(cima) > -0.20) & (rel @ np.array(cima) < 0.0)]
    mam = Vector(f[(f @ np.array(frente)).argmax()])         # meio do peito: a parte mais saliente do peitoral (como no supino)

    def frente_peito(z):
        """y da frente do peito (a pele mais à frente do tronco) na altura z."""
        ff = T[(np.abs(T[:, 2] - z) < 0.01) & (np.abs(T[:, 0]) < 0.15)]
        return float(ff[:, 1].min())

    print("PEITO | parte de baixo E (%.4f %.4f %.4f) = %.0f mm abaixo do ombro e %.0f mm abaixo do meio do peito (ao longo do "
          "tronco) | frente do peito nessa altura y %.4f | meio do peito z %.4f | ombro E (%.4f %.4f %.4f)" % (
              *baixo[1], -(baixo[1] - S["Left"]).dot(cima) * 1000, -(baixo[1] - mam).dot(cima) * 1000,
              frente_peito(z_baixo), mam.z, *S["Left"]), flush=True)

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
        g_r = S[L] + Vector((s * 0.18, -0.30, -0.12))
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
        da direção D (a do empurrão naquele ponto do arco); com `alvo`, o que deixa a abertura do cotovelo mais perto de `alvo`
        graus, com o antebraço perto de D (meio peso) e perto do quadro anterior (`antes`, direção do cotovelo: sem salto).
        Devolve o centro do círculo, a direção do cotovelo (a partir do centro) e o raio."""
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

    # ── 4) embaixo (t=0): pegador na altura da parte de baixo do peito, FRENTE0 à frente dele, com o antebraço na linha do
    # empurrão (DESCE0° abaixo da horizontal); o eixo dos braços da máquina fica em Z_EIXO, na reta ⟂ ao empurrão que passa pelo
    # pegador (o pegador começa DESCE0° à frente da vertical do eixo); em cima (t=1) o arco vai até o cotovelo dobrar COTOVELO1°
    a0 = math.radians(DESCE0)
    D0 = Vector((0.0, -math.cos(a0), -math.sin(a0)))

    def comeco(L, s, D):
        dq, pq = orientacao(s, eixo_peg[s], D)
        o = vao_menos_punho(L, dq, pq)
        W = Vector((0.0, frente_peito(z_baixo) - FRENTE0 - o.y, z_baixo - o.z))   # punho que põe o vão na parte de baixo do peito
        E = W - D * La                                                             # cotovelo: o antebraço na direção D
        dy, dz = E.y - S[L].y, E.z - S[L].z
        dx = math.sqrt(max(Lb ** 2 - dy * dy - dz * dz, 0.0))                     # o cotovelo abre pro lado o que o braço deixa
        E = Vector((S[L].x + s * dx, E.y, E.z))
        W = E + D * La
        return W + o, E, W

    g0, E0, W0 = comeco("Left", 1, D0)
    R_alav = (g0.z - Z_EIXO) / math.cos(a0)
    C = Vector((g0.y + R_alav * math.sin(a0), Z_EIXO))      # (y, z) do eixo
    x_peg = g0.x
    flex0 = math.degrees((E0 - S["Left"]).angle(W0 - E0))
    ABRE0 = _abertura(E0 - S["Left"], cima, lado, -1)
    print("COMEÇO | pegador (%.4f %.4f %.4f) | %.0f mm à frente da frente do peito, %.0f mm abaixo do meio do peito | cotovelo "
          "(%.3f %.3f %.3f) dobrado %.0f°, %.0f mm abaixo do ombro | abertura %.0f° | antebraço %.1f° abaixo da horizontal | "
          "pegada %.2f × ombros | eixo dos braços y %.4f z %.3f, braço da alavanca %.3f m" % (
              *g0, (frente_peito(g0.z) - g0.y) * 1000, (mam.z - g0.z) * 1000, *E0, flex0, (S["Left"].z - E0.z) * 1000, ABRE0,
              DESCE0, 2 * x_peg / (S["Left"] - S["Right"]).length, C.x, C.y, R_alav), flush=True)

    d1 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO1)))
    c3 = Vector((0.0, C.x, C.y))

    def alcance(beta):
        """Distância ombro → punho com o pegador do lado esquerdo girado `beta` graus no arco (a mão fechada nele)."""
        g = c3 + _gira_x(g0 - c3, beta)
        u = _gira_x(eixo_peg[1], beta)
        dq, pq = orientacao(1, u, (g - S["Left"]).normalized())
        return (g - vao_menos_punho("Left", dq, pq) - S["Left"]).length

    lo, hi = 0.0, 80.0
    for _ in range(50):
        meio = (lo + hi) / 2
        if alcance(meio) < d1:
            lo = meio
        else:
            hi = meio
    ARCO = (lo + hi) / 2
    g1 = c3 + _gira_x(g0 - c3, ARCO)
    g1.x = g0.x
    w1 = g1 - S["Left"]
    dq1, pq1 = orientacao(1, _gira_x(eixo_peg[1], ARCO), w1.normalized())
    ABRE1 = _abertura(g1 - vao_menos_punho("Left", dq1, pq1) - S["Left"], cima, lado, -1)   # abertura da reta ombro → punho no fim
    print("FIM | pegador (%.4f %.4f %.4f) | curso %.3f m, %.0f mm abaixo do começo (corda %.1f° abaixo da horizontal) | arco "
          "%.1f° | empurrão no fim %.1f° abaixo da horizontal | ombro → pegador %.1f° abaixo da horizontal, %.1f° do tronco "
          "pra baixo da perpendicular" % (
              *g1, (g1 - g0).length, (g0.z - g1.z) * 1000,
              math.degrees(math.atan2(g0.z - g1.z, g0.y - g1.y)), ARCO, DESCE0 + ARCO,
              math.degrees(math.atan2(-w1.z, -w1.y)),
              90 - math.degrees(math.atan2(Vector((0, w1.y, w1.z)).dot(frente), Vector((0, w1.y, w1.z)).dot(-cima)))),
          flush=True)

    # ── 5) a máquina em volta do corpo ────────────────────────────────────────────────────────────────────────────────────────
    mq = e3.supino_sentado("declinado", eixo=(C.x, Z_EIXO), x_braco=X_BRACO,
                           pegadores=(g0.y, g0.z, x_peg, COMP_PEGADOR, RAIO), giro_pegador=GIRO_PEG,
                           assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                           encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), lado=-1)

    # ── 6) pose: os braços da máquina giram no arco e cada mão vai junto com o pegador ─────────────────────────────────────────
    # o cotovelo vai fechando de ABRE0 (começo) até ABRE1 (a reta ombro → punho no fim) junto com o arco: os braços vão do lado
    # pra frente e pra baixo, pras coxas, sem o cotovelo subir
    print("ABERTURA do cotovelo: %.1f° no começo → %.1f° no fim (junto com o arco)" % (ABRE0, ABRE1), flush=True)
    DEDOS, estado = {}, {}

    def maos_no_pegador(acertar=False):
        frac = mq.angulo / ARCO if ARCO else 0.0
        for L, s in LADOS:
            g, u = mq.pegada(s)
            D = tangente(g, C)
            f, antes = estado.get(L, (D, None))
            for _ in range(3):                  # antebraço ↔ cotovelo ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(s, u, f)
                W = g - vao_menos_punho(L, dq, pq)
                Cc, e, rho = cotovelo(L, s, W, D, alvo=ABRE0 + (ABRE1 - ABRE0) * frac, antes=antes)
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
        """t=0 pegadores na altura da parte de baixo do peito, cotovelos dobrados; t=1 braços quase esticados, pra frente e pra
        baixo."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        mq.girar(p3.lerp(0.0, ARCO, t))
        maos_no_pegador()

    mq.girar(0.0)
    maos_no_pegador(acertar=True)               # polo certo do cotovelo com ele bem dobrado (embaixo)
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:                          # dedos e polegar fecham UMA vez (o pegador é redondo: a mão gira em volta dele igual)
        g, u = mq.pegada(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g, _ = mq.pegada(1)
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm abaixo da parte de baixo do peito, %.0f mm à frente "
                "do ombro | cotovelo %.0f/%.0f° | abertura %s° | braço à frente %s° | antebraço × horizontal %s° | punho "
                "%.0f/%.0f° (flexão %s) | palma × cima %s° | pegada %.2f | escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça "
                "%s° | %s" % (
                    mq.angulo, *g, (z_baixo - g.z) * 1000, (S["Left"].y - g.y) * 1000, juntas["cotoveloE"],
                    juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.palma_cima(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), maos.info()))

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 0.80),
                camera_video=((3.2, yq - 2.6, 1.40), (0, yq - 0.2, 0.75), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
