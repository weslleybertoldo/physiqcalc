# Mesa Flexora — cena da fábrica 3D (lote 6, 07/10/2026). A flexora DEITADA (de bruços), na peça nova equip3d.mesa_flexora: banco em
# V invertido (almofada do peito descendo pra cabeça e almofada das coxas descendo pros joelhos, as 2 a 15°, o quadril no ápice), o
# eixo da alavanca nos 2 joelhos, logo além da ponta da almofada das coxas, o rolo atrás das pernas perto dos tornozelos e um pegador
# de cada lado da almofada do peito, na altura da cabeça.
# t = 0 joelhos quase esticados (~5°, sem travar) · t = 1 joelhos dobrados a ~JOELHO1° (o rolo chega perto da parte de trás das
# coxas, junto do glúteo). Técnica (ExRx, Lever Lying Leg Curl): "Facing bench, stand between bench and lever pads. Lie prone on bench
# with knees just beyond edge of bench and lower legs under lever pads. Grasp handles." / "Raise lever pad to back of thighs by
# flexing knees. Lower lever pads until knees are straight." / "Keep torso on bench to reduce hyperextension of lower back. Most
# machines are angled at user's hip to position hamstring in more favorable mechanical position." / "Dorsal flexion of ankle reduces
# active insufficiency of Gastrocnemius allowing it to assist in knee flexion." Fabricantes: Hoist RS-2408 Prone Leg Curl ("Position
# knees aligned with RED PIVOT POINT and ankles under rolling pads." / "Grasp handles and curl legs by bending at the knee." / "Slowly
# return to start position." / "Keep your body on the pads and hands on handles at all times."); Precor Resolute RSL0606 ("The angled
# hip and chest pads ... ensure proper alignment of the exerciser’s knee with the pivot point"); TRUE FUSE-1800 ("Chest and thigh
# pads angled at 15° for proper alignment during exercise movement"; placa da máquina: "Adjust ankle pad so it rests comfortably behind
# ankles when knees are aligned with pivot point." / "Lay on machine and grasp handles." / "Keeping hips firmly in contact with pad,
# slowly curl legs up as far as comfortable or until fully flexed."). NASM, Lying Leg Curl: "Lie face down on the leg curl machine with
# your legs extended and the pad positioned just above your ankles. Ensure your hips remain on the machine throughout the movement." /
# "Curl the pad upward by flexing your hamstrings, bringing your heels toward your glutes" / "Stop just short of full extension to
# maintain continuous muscular tension." NFPT, How To Do Lying Leg Curls: "Lie face-down on the bench with your knees just off the
# edge of the pad. Position your body so the leg pads are resting up against the Achilles tendon (just above your ankle). Hold on to
# the handles located on the either side at head level." / "raise the leg pad up as far as you can (at least 90 degrees)" / "Do not
# point your toes during this exercise." ACE, Prone (Lying) Hamstrings Curl (no colchonete, com caneleira): "Lie with feet hip-width
# apart." / "Keep your ankle lightly dorsi-flexed (toes pointed towards your shinbone) throughout the exercise." / "Continue bending
# your knee until your heels near, or touch your buttock, or you reach the limits of your comfort level."
# Como o rig faz: o corpo inteiro gira em volta do quadril até ficar de bruços com a frente do tronco DEITADA na almofada do peito (o
# tronco gira até o peito e o quadril encostarem juntos no plano dela, a 15°) e cada coxa gira na articulação do quadril até a pele da
# frente dela ficar paralela ao plano da almofada das coxas (a 15°); as almofadas são montadas em volta do corpo, o ápice delas é
# levado à altura do desenho da TRUE (603 mm) e a almofada das coxas termina antes do joelho ("knees just beyond edge of bench"). A
# cabeça fica na linha do tronco (como em pé), olhando pra almofada, com o rosto ~3 cm acima dela (a almofada da TRUE vai até a frente do
# rosto). Os tornozelos ficam em flexão dorsal leve (10°) e parados. No movimento só o joelho mexe: as 2 canelas (com os pés) giram em
# volta do eixo do joelho e a alavanca e o rolo giram o MESMO ângulo em volta do eixo da máquina (no X, pelos 2 joelhos) — o rolo fica
# encostado atrás da perna o tempo todo; quadril, tronco, cabeça, braços e mãos não mexem. Fim do movimento: a ~135° o rolo fica a ~3 cm
# da parte de trás da coxa, junto do glúteo (ExRx: "to back of thighs"; TRUE: "until fully flexed"; a dica do app: "flexione até o pad
# tocar o glúteo"), e a
# panturrilha já aperta a parte de trás da coxa (a pele de uma entra ~2 cm na da outra fora da dobra do joelho: é o músculo comprimido,
# a malha não amassa); Yessis (Lying Leg Curl) para antes: "In the finish position the shins should be perpendicular to the thigh or
# slightly beyond."
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
ANG = 15.0                # almofadas do peito e das coxas a 15° do chão (TRUE FUSE-1800: "Chest and thigh pads angled at 15°";
                          # medido no desenho lateral do manual: 15,0° e 14,95°)
APICE_Y, APICE_Z = 0.0, 0.603   # ápice das almofadas (onde o topo das 2 se encontra) a 603 mm do chão (desenho da TRUE, em escala)
COMPR_PEITO, LARG_QUADRIL, LARG_FRENTE = 0.774, 0.39, 0.31   # almofada do peito (TRUE, desenho: ~774 mm, 390 → 310 mm de largura)
COMPR_COXAS, LARG_COXAS = 0.321, 0.39     # almofada das coxas (TRUE, desenho: ~321 mm × 390 mm)
ESP = 0.065               # estofado de 2,5" (Precor RSL0606: "Total thickness is 2.5 inches (65 mm)")
AFUNDA = 0.003            # pele afundando no estofado das almofadas
ABRE = 3.0                # coxas abertas 3° pra fora (pés mais ou menos na largura do quadril, ACE: "Lie with feet hip-width apart")
JOELHO0, JOELHO1 = 5.0, 135.0   # flexão do joelho: quase esticado no começo → ~135° no fim
DORSI = 10.0              # tornozelo 10° em flexão dorsal (dedos pra canela), parado (amplitude normal 0–20°, Alazzawi 2017)
RAIO_ROLO, COMPR_ROLO = 0.071, 0.466     # rolo de Ø ~142 mm × ~466 mm (TRUE, desenho)
ROLO_ACIMA = 0.07         # o rolo encosta atrás da perna 7 cm acima do centro do tornozelo ("just above your ankle", NFPT; "pad
                          # positioned just above your ankles", NASM)
AFUNDA_ROLO = 0.003       # a espuma do rolo afunda na pele
X_ALAVANCA, X_TORRE = 0.34, 0.44         # plano do braço da alavanca e da torre do eixo (fora da perna e do quadril)
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.13
U_PEG = 0.62              # centro do pegador 62 cm do ápice ao longo da almofada do peito: na altura da cabeça (NFPT: "handles
                          # located on the either side at head level")
X_PEG = 0.26              # pegadores por fora da almofada do peito
COTOVELO = 88.0           # cotovelo dobrado ~90° com a mão no pegador (a altura do pegador sai daí)
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")
VINCO_JOELHO = 0.12       # perna × coxa até 12 cm do centro do joelho = dobra da junta (não conta, como o vinco do cotovelo)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _cruza(co, tri, ma, mb, junta, raio):
    """Quanto a pele A entra na pele B (mm), só onde os triângulos se cruzam de verdade (o jeito do checagem3d.corpo_x_corpo); perto da
    `junta` (até `raio` m) é o vinco e não conta. Devolve (mm, distância da junta em cm)."""
    ta, tb = tri[ma[tri].all(axis=1)], tri[mb[tri].all(axis=1)]
    if not len(ta) or not len(tb):
        return 0.0, 0.0
    ba = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in ta], all_triangles=True)
    bb = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tb], all_triangles=True)
    pares = ba.overlap(bb)
    fundo, onde = 0.0, 0.0
    for i in (np.unique(ta[[p_[0] for p_ in pares]].ravel()) if pares else ()):
        v = Vector(co[i])
        if (v - junta).length < raio:
            continue
        loc, nor, idx, d = bb.find_nearest(v, 0.03)
        if loc is not None and (v - loc).dot(nor) < 0 and d > fundo:
            fundo, onde = d, (v - junta).length
    return fundo * 1000, onde * 100


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    b = math.radians(ANG)
    n_t, u_t = Vector((0.0, -math.sin(b), math.cos(b))), Vector((0.0, -math.cos(b), -math.sin(b)))   # almofada do peito: normal; pra
    n_c, u_c = Vector((0.0, math.sin(b), math.cos(b))), Vector((0.0, math.cos(b), -math.sin(b)))     # cabeça; das coxas: normal; pros
    N_T, U_T, N_C, U_C = (np.array(v) for v in (n_t, u_t, n_c, u_c))                                  # joelhos

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    def centro_quadril():
        return (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2

    # ── de bruços: o corpo inteiro gira em volta do quadril até a linha quadril → pescoço descer `gama` graus pra cabeça; `gama` é o
    #    que deixa o peito e o quadril (barriga de baixo) encostando JUNTOS no plano da almofada do peito ─────────────────────────────
    repouso = {pb.name: pb.matrix_basis.copy() for pb in PB}
    pivo0 = centro_quadril()
    d0 = p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")
    phi0 = math.degrees(math.atan2(d0.z, d0.y))              # ângulo da linha quadril → pescoço no YZ, em pé (~90°)

    def deitar(gama):
        for pb in PB:
            pb.matrix_basis = repouso[pb.name].copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x((gama - 180.0) - phi0), pivo=pivo0)

    def apoio_peito():
        """Pele mais baixa (na normal da almofada do peito) do peito e do quadril/barriga de baixo, |x| < 0,17."""
        P = pele(TRONCO)
        P = P[np.abs(P[:, 0]) < 0.17]
        al = (P - np.array(centro_quadril())) @ U_T
        dn = P @ N_T
        return float(dn[(al > 0.28) & (al < 0.50)].min()), float(dn[(al > -0.05) & (al < 0.22)].min())

    lo, hi = 0.0, 20.0
    for _ in range(12):
        gama = (lo + hi) / 2
        deitar(gama)
        dp, dq = apoio_peito()
        if dp < dq:            # o peito encosta antes: o tronco está inclinado demais pra cabeça
            hi = gama
        else:
            lo = gama
    gama = (lo + hi) / 2
    deitar(gama)
    dp, dq = apoio_peito()

    # ── coxas: giro na articulação do quadril (abertas ABRE graus) até a pele da frente delas, entre 8 e 30 cm do quadril, ficar
    #    paralela ao plano da almofada das coxas ─────────────────────────────────────────────────────────────────────────────────
    def por_coxas(beta):
        for lado, s in LADOS:
            h, k = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Leg")
            a = math.radians(ABRE)
            alvo = Vector((s * math.sin(a), math.cos(a) * math.cos(math.radians(beta)), -math.cos(a) * math.sin(math.radians(beta))))
            p3.girar_osso(rig, lado + "UpLeg", (k - h).rotation_difference(alvo).to_matrix())

    def inclinacao_coxas():
        Q = np.array(centro_quadril())
        out = []
        for lado, _ in LADOS:
            P = pele((lado + "UpLeg",))
            al, dn = (P - Q) @ U_C, P @ N_C
            out.append((float(dn[(al > 0.22) & (al < 0.30)].min()) - float(dn[(al > 0.08) & (al < 0.16)].min())) / 0.14)
        return float(np.mean(out))

    beta_c = ANG
    for _ in range(4):
        por_coxas(beta_c)
        beta_c += math.degrees(math.atan(inclinacao_coxas()))
    por_coxas(beta_c)

    # ── pernas: canela a 90° da coxa (pra trás, pra cima), ponta do pé no plano da perna → eixo de dobra de cada joelho (⟂ à coxa e à
    #    canela); tornozelo em flexão dorsal DORSI; joelho no começo do movimento (JOELHO0) ──────────────────────────────────────────
    eixo_joelho = {}
    for lado, s in LADOS:
        h, k, f = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Leg"), p3.cabeca(rig, lado + "Foot")
        u = (k - h).normalized()
        cima = (Vector((0, 0, 1)) - u * u.z).normalized()      # ⟂ coxa, pro lado de trás da perna (pra cima, de bruços)
        p3.girar_osso(rig, lado + "Leg", (f - k).rotation_difference(cima).to_matrix())
        k, f, tb = p3.cabeca(rig, lado + "Leg"), p3.cabeca(rig, lado + "Foot"), p3.cabeca(rig, lado + "ToeBase")
        ax = (f - k).normalized()                              # a canela gira em volta dela mesma até a ponta do pé ir pra +Y
        pe = tb - f
        pe = (pe - ax * pe.dot(ax)).normalized()
        quer = Vector((0, 1, 0))
        quer = (quer - ax * quer.dot(ax)).normalized()
        p3.girar_osso(rig, lado + "Leg", Matrix.Rotation(math.atan2(pe.cross(quer).dot(ax), pe.dot(quer)), 3, ax))
        k = p3.cabeca(rig, lado + "Leg")
        eixo_joelho[lado] = (k - p3.cabeca(rig, lado + "UpLeg")).cross(p3.cabeca(rig, lado + "Foot") - k).normalized()
        # > 0 no eixo do joelho dobra mais (o calcanhar vai pro glúteo); flexão dorsal: o pé gira < 0 (dedos pra canela)
        p3.girar_osso(rig, lado + "Foot", Matrix.Rotation(math.radians(-DORSI), 3, eixo_joelho[lado]))
        p3.girar_osso(rig, lado + "Leg", Matrix.Rotation(math.radians(JOELHO0 - 90.0), 3, eixo_joelho[lado]))

    # ── planos das almofadas (a pele afunda AFUNDA em cada uma), ápice e o corpo levado pro ápice em (0, APICE_Y, APICE_Z) ──────────
    def planos():
        Pt = pele(TRONCO)
        Pt = Pt[np.abs(Pt[:, 0]) < 0.17]
        Pc = pele(("LeftUpLeg", "RightUpLeg"))
        Pc = Pc[np.abs(Pc[:, 0]) < LARG_COXAS / 2]
        d_t, d_c = float((Pt @ N_T).min()) + AFUNDA, float((Pc @ N_C).min()) + AFUNDA
        y, z = np.linalg.solve(np.array([[N_T[1], N_T[2]], [N_C[1], N_C[2]]]), [d_t, d_c])
        return d_t, d_c, Vector((0.0, float(y), float(z)))

    _, _, A = planos()
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0.0, APICE_Y, APICE_Z)) - A)
    d_t, d_c, A = planos()

    jl = ck.posicoes(rig)
    print("DE BRUÇOS | tronco %.2f° (peito × quadril no plano %.1f mm) | coxas %.2f° | quadril %s | joelho %s | tornozelo %s | "
          "cabeca_tronco %.1f° | cabeça %.1f mm acima da almofada do peito | ápice (%.4f %.4f)" % (
              gama, (dp - dq) * 1000, beta_c, "/".join("%.1f" % v for v in tc.quadril_sinal(jl)),
              "/".join("%.1f" % ck.medir_juntas(rig)[k] for k in ("joelhoE", "joelhoD")),
              "/".join("%.1f" % v for v in tc.tornozelo(jl)), tc.cabeca_tronco(jl)[0],
              (float((pele(("Head",)) @ N_T).min()) - d_t) * 1000, A.y, A.z), flush=True)

    K = {L: p3.cabeca(rig, L + "Leg") for L, _ in LADOS}
    ye, ze = (K["Left"].y + K["Right"].y) / 2, (K["Left"].z + K["Right"].z) / 2
    base_pernas = {L: PB[p3.P + L + "Leg"].matrix_basis.copy() for L, _ in LADOS}

    def pernas(t):
        """Só as canelas (com os pés): joelho em lerp(JOELHO0, JOELHO1, t), cada canela no eixo de dobra do seu joelho. Devolve o
        giro a partir da base (o começo do movimento; ≥ 0 = flexão)."""
        g = p3.lerp(JOELHO0, JOELHO1, t) - JOELHO0
        for lado, _ in LADOS:
            PB[p3.P + lado + "Leg"].matrix_basis = base_pernas[lado].copy()
        p3.atualizar()
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "Leg", Matrix.Rotation(math.radians(g), 3, eixo_joelho[lado]))
        return g

    # ── rolo ATRÁS da perna (em cima, de bruços), ROLO_ACIMA acima do tornozelo: o mais perto dela sem a pele entrar mais que
    #    AFUNDA_ROLO ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
    centros = []
    for lado, _ in LADOS:
        Af, Kl = p3.cabeca(rig, lado + "Foot"), p3.cabeca(rig, lado + "Leg")
        u = (Af - Kl).normalized()                                 # ao longo da canela, pro pé
        f = Vector((0, 0, 1))
        f = (f - u * f.dot(u)).normalized()                        # pra trás da perna, ⟂ canela (o lado da panturrilha)
        c = Af - u * ROLO_ACIMA
        P = pele((lado + "Leg", lado + "Foot", lado + "ToeBase")) - np.array(c)
        al, fr = P @ np.array(u), P @ np.array(f)
        r = RAIO_ROLO - AFUNDA_ROLO
        m = np.abs(al) < r
        F = float((fr[m] + np.sqrt(r ** 2 - al[m] ** 2)).max())
        centros.append(c + f * F)
    y_r, z_r = (centros[0].y + centros[1].y) / 2, (centros[0].z + centros[1].z) / 2

    # ── braços: mãos nos pegadores dos lados da almofada do peito, na altura da cabeça (pegada neutra, palma pra almofada), cotovelo
    #    pra fora e pra cima; a altura do pegador (abaixo do plano da almofada) sai do cotovelo a ~COTOVELO° ─────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def centro_pegador(s, n_abaixo):
        return A + u_t * U_PEG - n_t * n_abaixo + Vector((s * X_PEG, 0.0, 0.0))

    def mao_no_pegador(lado, s, n_abaixo, acertar=False):
        """Mão `lado` no pegador a n_abaixo m do plano da almofada (IK + mão na pegada, sem fechar os dedos): palma pro meio, dedos
        ⟂ pegador seguindo o antebraço (punho reto: 3 voltas, o antebraço muda com a mão), cotovelo pra fora, pra frente e pra cima.
        acertar: escolhe o ângulo do polo do IK. Devolve a flexão do cotovelo."""
        S = p3.cabeca(rig, lado + "Arm")
        g = centro_pegador(s, n_abaixo)
        d = g - S
        dq = (d - u_t * d.dot(u_t)).normalized()               # 1ª volta: dedos ⟂ pegador, na direção do ombro → pegador
        polo = S + Vector((s * 0.45, 0, 0)) + u_t * 0.25 + n_t * 0.15   # cotovelo pra fora, pra cabeça e pra cima
        for volta in range(3):
            pq = Vector((-s, 0, 0))
            pq = (pq - dq * pq.dot(dq)).normalized()           # palma pro meio (pra almofada)
            maos.segurar(lado, g, dq, pq, polo=polo)
            if acertar and volta == 0:
                maos.iks[lado].mute = False
                p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
                maos.segurar(lado, g, dq, pq, polo=polo)
            fa = (p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")).normalized()
            dq = (fa - u_t * fa.dot(u_t)).normalized()         # dedos seguindo o antebraço, ⟂ pegador
        return ck.medir_juntas(rig)["cotovelo" + ("E" if s > 0 else "D")]

    for lado, s in LADOS:                                       # polo certo com o cotovelo bem dobrado (pegador alto)
        mao_no_pegador(lado, s, 0.12, acertar=True)
    lo, hi = 0.10, 0.40                                         # mais fundo = braço mais esticado
    for _ in range(8):
        n_p = (lo + hi) / 2
        if mao_no_pegador("Left", 1, n_p) > COTOVELO:
            lo = n_p
        else:
            hi = n_p
    n_p = (lo + hi) / 2
    for lado, s in LADOS:                                       # as mãos não mexem: dedos e polegar fecham uma vez só
        mao_no_pegador(lado, s, n_p)
        pg.fechar_em_volta(bon, lado, centro_pegador(s, n_p), u_t, RAIO)
    print("MÃOS | pegadores %.3f m abaixo do plano da almofada do peito, %.2f m do ápice, x ±%.2f | %s | cotovelo %s | punho %s" % (
        n_p, U_PEG, X_PEG, maos.info(), "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("cotoveloE", "cotoveloD")),
        "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("punhoE", "punhoD"))), flush=True)

    # ── a máquina em volta do corpo (montada com o joelho no começo do movimento) ────────────────────────────────────────────────
    mq = e3.mesa_flexora("mesa", eixo=(ye, ze), apice=(A.y, A.z), peito=(ANG, COMPR_PEITO, LARG_QUADRIL, LARG_FRENTE, ESP),
                         coxas=(ANG, COMPR_COXAS, LARG_COXAS, ESP), rolo=(y_r, z_r, RAIO_ROLO, COMPR_ROLO),
                         pegadores=(U_PEG, n_p, X_PEG, COMP_PEGADOR, RAIO), lado=-1, x_alavanca=X_ALAVANCA, x_torre=X_TORRE)
    K_al = (Vector((0, ye, ze)) - A).dot(u_c)
    print("MÁQUINA | eixo (%.3f %.3f %.3f) %.3f m do ápice ao longo da almofada das coxas (ela termina em %.3f) | rolo y %.4f z %.4f "
          "(braço da alavanca %.3f m)" % (*mq.eixo, K_al, COMPR_COXAS, y_r, z_r, math.hypot(y_r - ye, z_r - ze)), flush=True)

    def pose(t):
        """t=0 joelhos quase esticados, t=1 joelhos dobrados a ~JOELHO1°."""
        mq.girar(pernas(t))                # a alavanca e o rolo, o mesmo ângulo em volta do eixo da máquina (o X, nos 2 joelhos)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        E = mq.raizes["alavanca"].matrix_world
        c0, ux = E.to_translation(), (E.to_3x3() @ Vector((1, 0, 0))).normalized()
        eixo_mm = []
        for L, _ in LADOS:
            v = p3.cabeca(rig, L + "Leg") - c0
            eixo_mm.append((v - ux * v.dot(ux)).length * 1000)
        co, tri, (nomes, dono) = _malha(bon)
        dobra = []
        for L, _ in LADOS:
            dobra.append(_cruza(co, tri, _grupo(nomes, dono, (L + "Leg",)), _grupo(nomes, dono, (L + "UpLeg",)),
                                p3.cabeca(rig, L + "Leg"), VINCO_JOELHO))
        P = co[_grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "Hips"))]
        P = P[np.abs(P[:, 0]) < COMPR_ROLO / 2]
        g = math.radians(mq.angulo)                           # o centro do rolo neste quadro (gira com a alavanca, no X)
        yy, zz = y_r - ye, z_r - ze
        cy, cz = ye + yy * math.cos(g) - zz * math.sin(g), ze + yy * math.sin(g) + zz * math.cos(g)
        rolo_coxa = float((np.hypot(P[:, 1] - cy, P[:, 2] - cz) - RAIO_ROLO).min()) * 1000
        return ("joelho %.1f/%.1f° | joelho × eixo da máquina %.1f/%.1f mm | alavanca %.1f° | perna × coxa fora do vinco %.1f/%.1f mm | "
                "rolo × coxa %.0f mm | quadril %.0f/%.0f° | tronco %.1f° | tornozelo %s° | cotovelo %.0f/%.0f° | %s" % (
                    juntas["joelhoE"], juntas["joelhoD"], *eixo_mm, mq.angulo, dobra[0][0], dobra[1][0], rolo_coxa,
                    juntas["quadrilE"], juntas["quadrilD"], ck.angulo_chave(rig, {"medida": "tronco"})[0],
                    "/".join("%.0f" % v for v in tc.tornozelo(jj)), juntas["cotoveloE"], juntas["cotoveloD"], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, A.y, 0.8),
                camera_video=((3.2, A.y + 1.6, 1.6), (0, A.y + 0.05, 0.72), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
