# Abdominal na Máquina — cena da fábrica 3D (lote 6, 08/10/2026). Máquina nova: equip3d.abdominal_maquina (assento, almofada da
# lombar parada, alavanca em U com a almofada das costas, as almofadas dos braços e os 2 pegadores ao lado da cabeça girando num eixo
# que passa pela coluna, rolos das canelas, torre da pilha). É o modelo mais comum (a "Lever Seated Crunch" do ExRx, a "Abdominal
# crunch (machine)" da NSCA, a "Seated Crunch" da ACE, Life Fitness Insignia Abdominal SS-AB, Precor Resolute Ab Crunch RSL0714).
# t = 0 sentado, o quadril e a lombar na almofada de baixo, as costas de cima na almofada da alavanca, as canelas atrás dos rolos e os
# pés chapados no chão, as mãos nos pegadores ao lado da cabeça (pegada neutra) com os cotovelos pra frente · t = 1 o tronco
# flexionado (as costelas descem na direção do quadril): só a coluna dobra, com o quadril parado; a alavanca gira junto, em volta do
# eixo que passa pela coluna na transição toracolombar. Técnica: ExRx, Lever Seated Crunch: "Sit on machine with back and hips against
# back supports. If available, place lower legs under pads or on platform. Grasp handles above and position back of arm against pads
# to each side." / "With hips stationary, flex waist so elbows travel downward. Return and repeat." NSCA (Achievable CSCS, Abdominal
# crunch (machine)): "Sit with your back against the pad and your feet under the rollers" / "Grasp the handles with a neutral grip" /
# "Curl your torso forward toward your thighs, keeping your buttocks and legs still". ACE, Seated Crunch: "Sitting with the hips pressed
# against the back of the seat, push the shins against the padded roller and tighten the abs. Grasp the handles in both hands, and pull
# down on them to lean forward. Return slowly to the starting position." Life Fitness, Insignia Abdominal (SS-AB): "Adjust the seat
# height so that lower back pad is resting on your lower back." / "With a controlled motion upper torso crunch" / "Avoid using your
# arms to power through the motion, they should provide a guide for the motion."
# Como o rig faz: sentado como nas outras máquinas sentadas (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de
# cima das costas encostarem juntos num plano 10° atrás da vertical; coxas na horizontal e um pouco abertas, canelas em pé, pés
# chapados no chão). A flexão é só da coluna (Spine, Spine1 e Spine2 giram em volta do X, cada um em volta da sua base) e um pouco do
# pescoço; a pelve e as pernas não mexem. O EIXO da alavanca é o centro de giro que melhor segue o tórax nessa flexão (ombros, base do
# pescoço e a pele das costas onde a almofada encosta, em 11 quadros): cai na coluna, na transição toracolombar; quadro a quadro a
# alavanca gira o mesmo ângulo que o tórax (tabela tirada desse ajuste), a almofada das costas vai junto com as costas e cada mão vai
# junto com o seu pegador (IK do braço + mão rígida, fechada uma vez no começo); o braço fica parado em relação ao tórax (os braços só
# guiam, como manda a Life Fitness).
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
ENCOSTO = 10.0            # plano das costas no começo: 10° atrás da vertical (100° com o assento, como as outras máquinas sentadas)
AFUNDA = 0.002            # pele afundando no estofado do assento e das almofadas
AFUNDA_LOMBAR = 0.005     # na almofada da lombar: o ponto mais de trás do sacro/lombar fica perto da borda de cima (no chanfro)
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril
ESP = 0.06                # estofados de 60 mm
LARG_ASSENTO, PROF_ASSENTO = 0.36, 0.36
LARG_COSTAS = 0.30
CURL = (("Spine", 6.0), ("Spine1", 24.0), ("Spine2", 14.0))   # flexão de cada osso da coluna em cima (graus): a coluna (lombar ×
                          # torácica) dobra ~36° e o tórax gira ~44°, de ~8° atrás da vertical a ~31° à frente dela — a flexão de
                          # coluna do crunch (ACSM, citado pelo ExRx: "elevation of the truck to 30°"; YMCA: "30 degree spinal
                          # flexion"), com a dobra mais na transição toracolombar (Spine1) que embaixo (Spine): "upper torso crunch"
PESCOCO = 8.0             # flexão do pescoço em cima (graus): a cabeça acompanha a coluna, o queixo um pouco pra dentro
X_PEG = 0.17              # centro de cada pegador a 17 cm do meio: a mão ao lado da cabeça, sem encostar nela
DY_PEG, DZ_PEG = -0.065, 0.10  # o pegador em relação à base da cabeça (cabeça do osso Head): à frente da orelha, na altura da têmpora
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.15
Z_ROLO, RAIO_ROLO, COMP_ROLO = 0.20, 0.0635, 0.16    # rolos na frente da canela, logo acima do tornozelo (Ø 12,7 cm)
X_LADO = 0.33             # braços da alavanca por fora do corpo
FAIXA_BRACO = (0.03, 0.13)          # almofada do braço embaixo do braço, de 3 a 13 cm do centro do cotovelo
ALMOFADA_BRACO = (0.13, 0.08, 0.05)  # comprimento, largura e espessura da almofada do braço


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

    # ── 1) sentado: coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão ───────────────────────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal do plano das costas (pro corpo)

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

    def costas_plano():
        """Quanto o glúteo e a parte de cima das costas chegam no plano das costas (n·p, m; menor = mais pra trás)."""
        co, _, (nomes, dono) = _malha(bon)
        g = co[_grupo(nomes, dono, ("Hips",))]
        c = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))]
        c = c[np.abs(c[:, 0]) < LARG_COSTAS / 2]
        nn = np.array(n_enc)
        return float((g @ nn).min()), float((c @ nn).min())

    lo, hi = -5.0, 25.0
    for _ in range(12):
        meio = (lo + hi) / 2
        sentar(meio)
        dg, dc = costas_plano()
        if dg < dc:            # o glúteo chega antes: as costas estão longe → inclina mais
            lo = meio
        else:
            hi = meio
    reclina = (lo + hi) / 2
    sentar(reclina)
    dg, dc = costas_plano()
    d_enc = min(dg, dc) + AFUNDA                             # plano das costas: n·p = d_enc
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    topo = float(G[:, 2].min()) + AFUNDA
    print("SENTADO | reclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f) | glúteo z %.4f" % (
        reclina, (dg - dc) * 1000, *H, topo - AFUNDA), flush=True)

    # ── 2) almofada da lombar (parada): a face passa pelo ponto mais de trás do sacro e pelo da lombar e vai do assento até onde a
    #    lombar começa a curvar pra trás (a transição toracolombar fica livre, é onde a coluna dobra) ─────────────────────────────────
    co, _, (nomes, dono) = _malha(bon)
    meio_costas = co[_grupo(nomes, dono, ("Hips", "Spine", "Spine1")) & (np.abs(co[:, 0]) < LARG_COSTAS / 2 - 0.02)]

    def mais_atras(z0, z1):
        f = meio_costas[(meio_costas[:, 2] > z0) & (meio_costas[:, 2] < z1)]
        return Vector(f[np.argmax(f[:, 1])])

    P1, P2 = mais_atras(topo + 0.04, topo + 0.16), mais_atras(topo + 0.16, topo + 0.26)
    a_l = math.atan2(P2.y - P1.y, P2.z - P1.z)               # inclinação da face (+ = topo pra trás)
    n_l = np.array((0.0, -math.cos(a_l), math.sin(a_l)))
    d_l = float((meio_costas[(meio_costas[:, 2] > topo + 0.02) & (meio_costas[:, 2] < P2.z + 0.01)] @ n_l).min()) + AFUNDA_LOMBAR
    # topo da almofada da lombar: o mais alto em que nenhuma pele da faixa entra mais que 1 mm além do AFUNDA_LOMBAR
    z_l1 = P2.z + 0.01
    for zz in np.arange(P2.z + 0.01, P2.z + 0.12, 0.005):
        f = meio_costas[(meio_costas[:, 2] > topo) & (meio_costas[:, 2] < zz)]
        if d_l - float((f @ n_l).min()) > AFUNDA_LOMBAR + 0.001:
            break
        z_l1 = float(zz)
    base_l = Vector((0.0, 0.0, topo + 0.012))                # a face da lombar começa 1,2 cm acima do assento
    base_l.y = (math.sin(a_l) * base_l.z - d_l) / math.cos(a_l)
    h1_l = (z_l1 - base_l.z) / math.cos(a_l)
    print("LOMBAR | sacro (%.3f %.3f) lombar (%.3f %.3f) → face %.1f° da vertical, de z %.3f a %.3f (y %.4f na base)" % (
        P1.y, P1.z, P2.y, P2.z, math.degrees(a_l), base_l.z, z_l1, base_l.y), flush=True)

    # assento: embaixo do glúteo e das coxas, da almofada da lombar pra frente
    y_tras = base_l.y + 0.02
    y_frente = y_tras - PROF_ASSENTO
    Gs = G[(G[:, 1] > y_frente) & (G[:, 1] < y_tras) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2)]
    topo = float(Gs[:, 2].min()) + AFUNDA

    # ── 3) a flexão do tronco: Spine, Spine1 e Spine2 (e o pescoço) giram em volta do X; o centro de giro fixo que melhor segue o tórax
    OSSOS_C = tuple(n for n, _ in CURL) + ("Neck",)
    base_c = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_C}

    def curvar(t):
        for n in OSSOS_C:
            PB[p3.P + n].matrix_basis = base_c[n].copy()
        p3.atualizar()
        for n, g in CURL:
            p3.girar_osso(rig, n, p3.rot_x(g * t))
        p3.girar_osso(rig, "Neck", p3.rot_x(PESCOCO * t))

    co0, _, (nomes, dono) = _malha(bon)
    alto = _grupo(nomes, dono, ("Spine2", "LeftShoulder", "RightShoulder")) & (np.abs(co0[:, 0]) < LARG_COSTAS / 2)
    idx = np.where(alto)[0]
    idx = idx[co0[idx][:, 1] > np.percentile(co0[idx][:, 1], 80)]       # a pele mais de trás (onde a almofada encosta)
    TS = np.linspace(0.0, 1.0, 11)
    PTS = []
    for t in TS:
        curvar(t)
        co, _, _ = _malha(bon)
        P = [cab(n) for n in ("LeftArm", "RightArm", "Neck")]
        PTS.append(np.array([[p.y, p.z] for p in P] + [[co[idx][:, 1].mean(), co[idx][:, 2].mean()]]))
    curvar(0.0)

    def ajuste(C):
        tot, angs = 0.0, []
        A = PTS[0] - C
        for Pt in PTS:
            B = Pt - C
            th = math.atan2(float((A[:, 0] * B[:, 1] - A[:, 1] * B[:, 0]).sum()), float((A * B).sum()))
            R = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
            tot += float(((A @ R.T - B) ** 2).sum())
            angs.append(math.degrees(th))
        return tot, angs

    melhor = None
    s1 = cab("Spine1")
    for yy in np.arange(s1.y - 0.15, s1.y + 0.15, 0.005):
        for zz in np.arange(s1.z - 0.15, s1.z + 0.20, 0.005):
            r, angs = ajuste(np.array([yy, zz]))
            if melhor is None or r < melhor[0]:
                melhor = (r, yy, zz, angs)
    r, ye, ze, ANG = melhor               # ângulo no sentido y → z = o mesmo do girar() (> 0 leva pra frente e pra baixo)
    print("EIXO | centro de giro (y %.4f z %.4f) = %.0f mm atrás e %.0f mm acima da cabeça do Spine1 | resíduo rms %.1f mm | "
          "giro do tórax %s" % (ye, ze, (ye - s1.y) * 1000, (ze - s1.z) * 1000,
                                math.sqrt(r / (len(TS) * len(PTS[0]))) * 1000, " ".join("%.1f" % a for a in ANG)), flush=True)

    def giro(t):
        return float(np.interp(t, TS, ANG))

    # ── 4) mãos nos pegadores ao lado da cabeça (pegada neutra: palma pro meio), cotovelos pra frente ──────────────────────────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, -0.5, 0), polegar_modo="volta")

    def orientacao(s, f):
        """Dedos na direção do antebraço (punho reto) e a palma virada pro meio (pegada neutra)."""
        dq = f.normalized()
        pq = Vector((-s, 0.0, 0.0))
        pq = (pq - dq * pq.dot(dq)).normalized()
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        dq_r, pq_r = orientacao(s, Vector((0, 0.6, 0.8)))
        g_r = S[L] + Vector((-s * 0.03, -0.05, 0.22))
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.2, -0.6, -0.2)))
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def circulo(L, W):
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        return S[L] + u * a, u, rho

    cab_base = cab("Head")
    G0, E0, DQ0, PQ0 = {}, {}, {}, {}
    for L, s in LADOS:
        g0 = Vector((s * X_PEG, cab_base.y + DY_PEG, cab_base.z + DZ_PEG))
        f = Vector((0.0, 0.7, 0.7)).normalized()
        for _ in range(12):                 # antebraço ↔ cotovelo ↔ orientação da mão
            dq, pq = orientacao(s, f)
            W = g0 - vao_menos_punho(L, dq, pq)
            Cc, u, rho = circulo(L, W)
            e1 = Vector((0.0, -1.0, 0.0))
            e1 = (e1 - u * e1.dot(u)).normalized()           # o cotovelo o mais pra frente que o braço deixa
            E = Cc + e1 * rho
            f = (W - E).normalized()
        G0[L], E0[L], DQ0[L], PQ0[L] = g0, E, dq, pq
        flex = math.degrees((E - S[L]).angle(W - E))
        print("COMEÇO %s | pegador (%.4f %.4f %.4f) | cotovelo (%.3f %.3f %.3f) dobrado %.0f°, %.0f mm %s do ombro, %.0f mm à frente | "
              "punho (%.3f %.3f %.3f)" % (L, *g0, *E, flex, abs(E.z - S[L].z) * 1000, "abaixo" if E.z < S[L].z else "acima",
                                         (S[L].y - E.y) * 1000, *W), flush=True)

    # eixo de cada pegador: ⟂ aos dedos e à palma, apontando pra frente (a ponta de trás entra na barra de aço da alavanca)
    pegs = {}
    for L, s in LADOS:
        u = DQ0[L].cross(PQ0[L]).normalized()
        if u.y > 0:
            u = -u
        pegs[s] = (tuple(G0[L]), tuple(u))

    def por_mao(L, g, dq, pq, Ealvo, acertar=False):
        """Mão L com o vão em g (dedos dq, palma pq) e o cotovelo no ponto do círculo do braço mais perto de Ealvo."""
        W = g - vao_menos_punho(L, dq, pq)
        Cc, u, rho = circulo(L, W)
        e = (Ealvo - Cc) - u * (Ealvo - Cc).dot(u)
        e = e.normalized() if e.length > 1e-6 else Vector((0, -1, 0))
        maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))
        if acertar:
            maos.iks[L].mute = False
            p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
            maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4))

    # almofada de cada braço: embaixo da parte de trás do braço, perto do cotovelo (de 3 a 13 cm do centro do cotovelo), com a face
    # de cima na pele mais baixa dessa faixa (a pele afunda AFUNDA nela) — ExRx: "position back of arm against pads to each side"
    for L, s in LADOS:
        por_mao(L, G0[L], DQ0[L], PQ0[L], E0[L], acertar=True)
    co, _, (nomes, dono) = _malha(bon)
    bracos = {}
    for L, s in LADOS:
        Sa, Ea = cab(L + "Arm"), cab(L + "ForeArm")
        a = (Ea - Sa).normalized()
        d = Vector((0.0, 0.0, -1.0))
        d = (d - a * d.dot(a)).normalized()                    # pra baixo, ⟂ ao braço
        P = co[_grupo(nomes, dono, (L + "Arm",))]
        rel = P - np.array(Sa)
        ao = rel @ np.array(a)
        L_b = (Ea - Sa).length
        faixa = P[(ao > L_b - FAIXA_BRACO[1]) & (ao < L_b - FAIXA_BRACO[0]) & ((rel @ np.array(d)) > 0.0)]
        fundo = float(((faixa - np.array(Sa)) @ np.array(d)).max()) - AFUNDA
        meio_b = Sa + a * (L_b - (FAIXA_BRACO[0] + FAIXA_BRACO[1]) / 2)
        f0 = meio_b + d * (fundo - (meio_b - Sa).dot(d))
        bracos[s] = (tuple(f0), tuple(-d), tuple(a))
        print("ALMOFADA DO BRAÇO %s | face em (%.4f %.4f %.4f), %.0f mm abaixo do eixo do braço, braço %.0f° abaixo da horizontal" % (
            L, *f0, (f0 - meio_b).dot(d) * 1000, math.degrees(math.asin(max(-1.0, min(1.0, -a.z))))), flush=True)

    # ── 5) a máquina em volta do corpo ────────────────────────────────────────────────────────────────────────────────────────
    co, _, (nomes, dono) = _malha(bon)
    nn = np.array(n_enc)
    S0z = float(max(S["Left"].z, S["Right"].z))
    costas_pele = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder")) & (np.abs(co[:, 0]) < LARG_COSTAS / 2)]
    z_c0 = ze + 0.05                                          # a almofada das costas começa 5 cm acima do eixo
    alto_c = costas_pele[costas_pele[:, 2] > z_c0]
    z_c1 = max(float(alto_c[(alto_c @ nn) < d_enc + 0.004][:, 2].max()) + 0.01,   # até onde as costas encostam no plano e,
               S0z + 0.04)                                                       # no mínimo, 4 cm acima dos ombros (as escápulas)
    y_c0 = (math.sin(a_enc) * z_c0 - d_enc) / math.cos(a_enc)
    h1_c = (z_c1 - z_c0) / math.cos(a_enc)
    canela = pele(("LeftLeg",))
    y_canela = float(canela[np.abs(canela[:, 2] - Z_ROLO) < 0.01][:, 1].min())
    x_rolo = abs(cab("LeftLeg").x)
    mq = e3.abdominal_maquina(
        "abdominal", eixo=(ye, ze), assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP),
        encosto=(base_l.y, base_l.z, math.degrees(a_l), 0.0, h1_l, LARG_COSTAS, ESP),
        costas=(y_c0, z_c0, ENCOSTO, 0.0, h1_c, LARG_COSTAS, ESP), pegadores=pegs,
        rolo=(y_canela - RAIO_ROLO + AFUNDA, Z_ROLO, RAIO_ROLO, COMP_ROLO, x_rolo), x_lado=X_LADO, lado=-1,
        raio_pegador=RAIO, comp_pegador=COMP_PEGADOR, y_pes=float(pele(("LeftToeBase", "RightToeBase"))[:, 1].min()),
        bracos=bracos, almofada_braco=ALMOFADA_BRACO)
    print("MÁQUINA | assento topo %.4f, y %.3f → %.3f | almofada das costas de z %.3f a %.3f (y %.4f embaixo) | rolos em y %.4f "
          "z %.2f, x ±%.3f" % (topo, y_frente, y_tras, z_c0, z_c1, y_c0, y_canela - RAIO_ROLO + AFUNDA, Z_ROLO, x_rolo), flush=True)

    # ── 6) pose: a coluna dobra, a alavanca gira o mesmo que o tórax e cada mão vai junto com o seu pegador ────────────────────────
    C = Vector((0.0, ye, ze))
    DEDOS = {}

    def girado(v, graus, ponto=True):
        R = Matrix.Rotation(math.radians(graus), 3, "X")
        return (C + R @ (v - C)) if ponto else (R @ v)

    def maos_no_pegador(acertar=False):
        for L, s in LADOS:
            g, _ = mq.pegada(s)
            por_mao(L, g, girado(DQ0[L], mq.angulo, False), girado(PQ0[L], mq.angulo, False), girado(E0[L], mq.angulo),
                    acertar=acertar)
            if L in DEDOS:                      # mão rígida no pegador redondo: os dedos e o polegar fechados no começo
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    def pose(t):
        """t=0 sentado, costas nas almofadas; t=1 o tronco flexionado (a coluna dobra, o quadril parado)."""
        curvar(t)
        mq.girar(giro(t))
        maos_no_pegador()

    mq.girar(0.0)
    maos_no_pegador(acertar=True)
    pose.dedos = {}
    for L, s in LADOS:                          # dedos e polegar fecham UMA vez (pegador redondo: a mão não gira nele)
        g, u = mq.pegada(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)

    # costelas × púbis (pra medir "as costelas em direção ao quadril"): a ponta de baixo do esterno e a frente da pelve, no meio
    co, _, (nomes, dono) = _malha(bon)
    meio = np.abs(co[:, 0]) < 0.012
    tor = np.where(_grupo(nomes, dono, ("Spine2",)) & meio & (co[:, 1] < cab("Spine2").y - 0.08))[0]
    i_ester = tor[np.argmin(co[tor][:, 2])]                  # a pele do peito mais baixa no meio, na frente: perto do fim do esterno
    pel = np.where(_grupo(nomes, dono, ("Hips",)) & meio & (co[:, 2] < topo + 0.20))[0]
    i_pube = pel[np.argmin(co[pel][:, 1])]

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, _ = _malha(bon)
        pelve = p3.ponta(rig, "Hips") - cab("Hips")
        return ("alavanca %.1f° | tronco %.1f° | coluna %.1f° | tórax (Spine1→pescoço) × vertical %.1f° | pelve %.1f° da vertical | "
                "cabeça %.0f° | peito × pelve %.0f mm | cotovelos a z %.3f/%.3f | cotovelo %.0f/%.0f° | ombro %.0f/%.0f° | "
                "punho %.0f/%.0f° (flexão %s) | palma pro meio %s° | %s" % (
                    mq.angulo, ck.angulo_chave(rig, {"medida": "tronco"})[0], tc.coluna(jj)[0],
                    math.degrees(math.atan2(-(jj["Neck"][1] - jj["Spine1"][1]), jj["Neck"][2] - jj["Spine1"][2])),
                    math.degrees(math.atan2(-pelve.y, pelve.z)), tc.cabeca_tronco(jj)[0],
                    np.linalg.norm(co[i_ester] - co[i_pube]) * 1000, jj["LeftForeArm"][2], jj["RightForeArm"][2],
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["ombroE"], juntas["ombroD"], juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs_ck = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs_ck, apoio_mm=0.0, foco_luz=(0, yq - 0.1, 0.8),
                camera_video=((3.0, yq - 2.4, 1.35), (0, yq - 0.1, 0.80), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
