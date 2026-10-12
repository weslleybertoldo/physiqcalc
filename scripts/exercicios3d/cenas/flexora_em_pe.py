# Flexora em Pé — cena da fábrica 3D (lote 14, 12/10/2026). A flexora EM PÉ, UMA perna de cada vez, na peça nova equip3d.flexora_em_pe:
# em pé de frente pra máquina, o pé de apoio (o DIREITO) chapado na plataforma, a frente da coxa da perna que trabalha (a ESQUERDA)
# encostada na almofada da coxa, logo acima do joelho, o joelho na linha do eixo da alavanca, o rolo atrás da perna, no terço de baixo,
# e o peito na almofada do peito, com as mãos fechadas nos 2 pegadores verticais dos lados dela.
# t = 0 joelho quase esticado (~6°, sem travar), o pé dela um pouco acima da plataforma · t = 1 joelho dobrado a ~120°, o calcanhar indo
# na direção do glúteo. Técnica (ExRx, Lever Standing Leg Curl): "Position exercising leg with lever pad behind lower leg and upper pad in
# front of lower thigh. Bend over and grasp handles for support if available. Stand with body weight shifted on foot of resting leg and
# raise foot of exercising leg slightly off of floor or platform." / "Pull lever up to back of thigh by flexing knee. Return lever until
# knee is straight. Repeat. Continue with opposite leg." / "Dorsal flexion of ankle reduces active insufficiency of Gastrocnemius allowing
# it to assist in knee flexion." free-exercise-db (Standing Leg Curl): "the pad of the lever on the back of your right leg (just a few
# inches under the calves) and the front of the right leg on top of the machine pad" / "ensure your leg is fully stretched and grab the
# side handles of the machine. Position your toes straight." / "curl your right leg up as far as possible without lifting the upper leg
# from the pad" (o tronco a 30–45° dele é da flexora AJOELHADA das fotos dele: não seguido). Joelho no eixo (NSCA, flexora sentada:
# "Align the knees with the axis of the machine."; ACE, deitada: "aligning the mid-point of your knee joint with the axis of rotation of
# the moving lever (arm) of the machine"); rolo no terço de baixo da perna, sem pegar no calcanhar (ACE: "Position the backs of the lower
# 1/3 of your lower legs under the resistance pads, avoiding contact with the pads at, or just above the heel."); sem travar o joelho
# (NSCA: "Do not forcefully lock out the knees."). Dica do app: "Tronco apoiado, flexione o joelho levando o calcanhar ao glúteo e volte
# devagar. Quadril estável, sem inclinar."
# Como o rig faz: tronco 15° à frente e PARADO (a pelve gira em volta das articulações do quadril, a coluna fica neutra e a cabeça na
# linha do tronco), pelve nivelada e deslocada pro lado do pé de apoio até o centro de massa ficar em cima dele (5 cm à frente do
# tornozelo e 2 cm pra dentro do eixo do pé: o peso no pé de apoio; massa e centro de massa de cada parte pela tabela de Dempster em
# Winter 2009, a mesma do Coice de Glúteo na Polia), o pé de apoio chapado na plataforma e o joelho de apoio a 5°. A coxa que trabalha
# fica PARADA, 15° à frente da vertical (encostada na almofada; com a coxa em pé o pé não saía da plataforma) e 8° aberta (com a pelve em
# cima do pé de apoio a coxa de apoio fecha ~6° e as coxas musculosas entravam uma na outra perto da virilha: 11–18 mm com a coxa que
# trabalha em pé, 0,3 mm com ela 8° aberta). Só o joelho mexe: a perna (com o pé; tornozelo parado a 10° de flexão dorsal, a ponta do pé
# pra frente) dobra em volta do eixo do joelho (⟂ à coxa, no plano frontal dela: 8° do X) de 6° a 120°, e a alavanca e o rolo giram em
# volta do eixo da máquina (o X, pelo centro do joelho) o mesmo ângulo que a perna vista de lado — o rolo fica encostado atrás da perna o
# movimento todo e a perna escorrega ~3 cm ao longo dele (dobrar no X puro, com a coxa aberta, jogava a perna ~28° pra fora no fim, vista
# de trás). No fim, a 120°, a panturrilha já aperta a parte de trás da coxa (a pele de uma entra ~1,5 cm na da outra fora da dobra do
# joelho: é o músculo comprimido, a malha não amassa, como na Mesa Flexora a 135°). Mãos fechadas nos pegadores verticais de 29 mm dos
# lados da almofada do peito, pegada neutra, polegar em volta, cotovelos a ~95°. A máquina é montada EM VOLTA do corpo (eixo no joelho,
# almofada da coxa na frente da coxa, rolo atrás da perna, almofada do peito no peito, pegadores nas mãos, plataforma embaixo dos pés).
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

TRABALHA, APOIO = "Left", "Right"
S = 1.0                        # lado da perna que trabalha (+X, a esquerda): a alavanca fica por fora dela
INCLINA = 15.0                 # tronco inclinado pra frente da vertical (graus), parado, apoiado na almofada do peito
JOELHO_APOIO = 5.0             # flexão do joelho de apoio (graus): quase esticado, parado
COXA = 15.0                    # coxa que trabalha à frente da vertical (graus), parada, encostada na almofada da coxa
ABDUZ = 8.0                    # coxa que trabalha aberta pro lado (graus), parada: as coxas não entram uma na outra perto da virilha
JOELHO0, JOELHO1 = 6.0, 120.0  # flexão do joelho que trabalha: quase esticado no começo → ~120° no fim
DORSI = 10.0                   # tornozelo que trabalha 10° em flexão dorsal (dedos pra canela), parado
PLATAFORMA = 0.05              # topo da chapa da plataforma (m): o pé de apoio fica chapado nela
PE_APOIO = (-0.10, 0.0)        # tornozelo de apoio (x, y), m
CM_ALVO = (0.05, 0.02)         # centro de massa em cima do pé de apoio: 5 cm à frente do tornozelo (meio do pé), 2 cm pra dentro
SEGMENTOS = (                  # Winter DA, Biomechanics and Motor Control of Human Movement (2009), tabela de Dempster: (de, até,
                               # fração da massa, centro de massa a partir do de cima)
    ("Arm", "ForeArm", 0.028, 0.436), ("ForeArm", "Hand", 0.016, 0.430), ("Hand", "HandMiddle1", 0.006, 0.506),
    ("UpLeg", "Leg", 0.100, 0.433), ("Leg", "Foot", 0.0465, 0.433), ("Foot", "ToeBase", 0.0145, 0.50))
RAIO_ROLO, COMPR_ROLO = 0.0635, 0.43    # rolo de 17" × 5" (Titan, o da cadeira_joelho)
ROLO_ACIMA = 0.08              # o rolo encosta atrás da perna 8 cm acima do centro do tornozelo (terço de baixo da perna)
AFUNDA_ROLO = 0.003            # a espuma do rolo afunda na pele
ROLO_DENTRO = 0.08             # a ponta de dentro do rolo fica isso pra dentro do eixo da perna que trabalha (cobre a parte de trás dela)
AFUNDA = 0.002                 # a pele afunda nas almofadas
ALM_COXA = (0.12, 0.22, 0.16, 0.05)     # almofada da coxa: centro a 12 cm do joelho ao longo da coxa; largura, altura, espessura
ALM_PEITO = (0.36, 0.30, 0.26, 0.05)    # almofada do peito: centro a 36 cm do quadril ao longo do tronco; largura, altura, espessura
RAIO = 0.0145                  # pegador de 29 mm (o cilindro da mão de referência)
COMP_PEGADOR = 0.14
X_PEG = 0.22                   # pegadores a 22 cm do meio do tronco
COTOVELO = 95.0                # cotovelo dobrado ~90° com a mão no pegador (a posição do pegador sai daí)
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder")
VINCO_JOELHO = 0.12            # perna × coxa até 12 cm do centro do joelho = dobra da junta (não conta, como na Mesa Flexora)
PERNA_T = ("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase")
PERNA_A = ("RightUpLeg", "RightLeg", "RightFoot", "RightToeBase")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _cruza(co, tri, ma, mb, junta, raio):
    """Quanto a pele A entra na pele B (mm), só onde os triângulos se cruzam de verdade (o jeito do checagem3d.corpo_x_corpo); perto da
    `junta` (até `raio` m) é o vinco e não conta (o mesmo da Mesa Flexora)."""
    ta, tb = tri[ma[tri].all(axis=1)], tri[mb[tri].all(axis=1)]
    if not len(ta) or not len(tb):
        return 0.0
    ba = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in ta], all_triangles=True)
    bb = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tb], all_triangles=True)
    pares = ba.overlap(bb)
    fundo = 0.0
    for i in (np.unique(ta[[p_[0] for p_ in pares]].ravel()) if pares else ()):
        v = Vector(co[i])
        if (v - junta).length < raio:
            continue
        loc, nor, idx, d = bb.find_nearest(v, 0.03)
        if loc is not None and (v - loc).dot(nor) < 0 and d > fundo:
            fundo = d
    return fundo * 1000


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes, malha=None):
        co, _, (nomes, dono) = malha or _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    Lt = (c("LeftLeg") - c("LeftUpLeg")).length
    Ls = (c("LeftFoot") - c("LeftLeg")).length
    ankle_z = c("RightFoot").z
    # ── perna de apoio: tornozelo fixo na plataforma (pé chapado na orientação de repouso), joelho pra frente ───────────────────────────
    alvo_pe = p3.vazio("tornozelo_" + APOIO, Vector((PE_APOIO[0], PE_APOIO[1], ankle_z + PLATAFORMA)))
    polo_joelho = p3.vazio("polo_joelho_" + APOIO, Vector((PE_APOIO[0] - 0.05, PE_APOIO[1] - 1.0, 0.55 + PLATAFORMA)))
    ik_apoio = p3.ik(rig, APOIO + "Leg", alvo_pe, polo_joelho)
    p3.travar_rotacao(rig, APOIO + "Foot")
    quadril0 = {L: c(L + "UpLeg").copy() for L in ("Left", "Right")}
    pivo = (quadril0["Left"] + quadril0["Right"]) / 2

    def pelve(dx, dy):
        """Tronco inclinado INCLINA graus em volta das articulações do quadril, pelve nivelada, deslocada (dx, dy) e na altura que dá a
        flexão JOELHO_APOIO no joelho de apoio (o tornozelo de apoio não sai do lugar)."""
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        H = quadril0[APOIO] + Vector((dx, dy, 0.0))
        k = math.radians(JOELHO_APOIO)
        L = math.sqrt(Lt ** 2 + Ls ** 2 + 2 * Lt * Ls * math.cos(k))
        A = alvo_pe.location
        dz = A.z + math.sqrt(max(L ** 2 - (H.x - A.x) ** 2 - (H.y - A.y) ** 2, 0.01)) - H.z
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((dx, dy, dz)))

    a_, c_ = math.radians(ABDUZ), math.radians(COXA)
    dt = Vector((S * math.sin(a_), -math.sin(c_) * math.cos(a_), -math.cos(c_) * math.cos(a_)))   # direção da coxa que trabalha
    k_joelho = Vector((1.0, 0.0, 0.0)) - dt * dt.x          # eixo de dobra do joelho: ⟂ à coxa, no plano frontal dela (a coxa aberta
    k_joelho.normalize()                                     # ABDUZ graus inclina ele isso do X; a máquina gira no X)
    w0 = dt.cross(k_joelho).normalized()                     # pra frente, ⟂ à perna esticada (a ponta do pé vai pra cá)

    def perna(phi):
        """Perna que trabalha: coxa na direção dt (parada); a canela dobra phi graus em volta do eixo do joelho (k_joelho) e gira em
        volta dela mesma até a ponta do pé ficar pra frente, no plano da perna; tornozelo DORSI graus em flexão dorsal. Devolve o
        ângulo (graus) da canela em volta do X, visto de lado (no plano YZ): o giro da alavanca."""
        for n in PERNA_T[:3]:
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        H, K = c("LeftUpLeg"), c("LeftLeg")
        p3.girar_osso(rig, "LeftUpLeg", (K - H).normalized().rotation_difference(dt).to_matrix())
        K, A = c("LeftLeg"), c("LeftFoot")
        R = Matrix.Rotation(math.radians(phi), 3, k_joelho)
        ds = R @ dt
        p3.girar_osso(rig, "LeftLeg", (A - K).normalized().rotation_difference(ds).to_matrix())
        A, T = c("LeftFoot"), c("LeftToeBase")
        f = T - A
        f = (f - ds * f.dot(ds)).normalized()
        w = R @ w0
        w = (w - ds * w.dot(ds)).normalized()
        p3.girar_osso(rig, "LeftLeg", Matrix.Rotation(math.atan2(f.cross(w).dot(ds), f.dot(w)), 3, ds))
        p3.girar_osso(rig, "LeftFoot", Matrix.Rotation(math.radians(-DORSI), 3, k_joelho))
        return math.degrees(math.atan2(ds.z, ds.y))

    def centro_de_massa():
        """Centro de massa do corpo (tabela de Dempster em Winter 2009): braços, pernas, tronco (do meio dos quadris ao meio dos
        ombros, 49,7%, no meio) e cabeça + pescoço (8,1%, na altura da orelha)."""
        cm = Vector()
        for L in ("Left", "Right"):
            for a, b, m, f in SEGMENTOS:
                pa, pb_ = c(L + a), c(L + b)
                cm += (pa + (pb_ - pa) * f) * m
        q, o = (c("LeftUpLeg") + c("RightUpLeg")) / 2, (c("LeftArm") + c("RightArm")) / 2
        cm += (q + (o - q) * 0.5) * 0.497
        cm += (c("Head") + (p3.ponta(rig, "Head") - c("Head")) * 0.3) * 0.081
        return cm

    def pe_apoio_eixo():
        """Ponto do eixo do pé de apoio (tornozelo → base dos dedos, no chão) e a direção dele."""
        a, b = c(APOIO + "Foot"), c(APOIO + "ToeBase")
        d = Vector((b.x - a.x, b.y - a.y, 0.0)).normalized()
        return Vector((a.x, a.y, 0.0)), d

    def cm_no_pe():
        """Centro de massa em relação ao pé de apoio, no chão (mm): à frente do tornozelo ao longo do pé e de lado (+ = pra dentro)."""
        cm = centro_de_massa()
        a, d = pe_apoio_eixo()
        v = Vector((cm.x, cm.y, 0.0)) - a
        dentro = Vector((d.y, -d.x, 0.0))
        if dentro.x < 0:                               # pé direito: "pra dentro" é +X
            dentro = -dentro
        return v.dot(d) * 1000, v.dot(dentro) * 1000

    def eixos_tronco():
        cima = (c("Neck") - c("Hips")).normalized()
        lado = c("RightArm") - c("LeftArm")
        lado = (lado - cima * lado.dot(cima)).normalized()
        return cima, lado, cima.cross(lado)

    # ── mãos nos pegadores verticais (pegada neutra, polegar pra cima): posição do pegador em relação ao meio dos ombros ───────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, -0.3), polegar_modo="volta")

    def pegador(s, rel):
        """Centro do pegador do lado s (+1 = esquerdo) a `rel` = (frente, abaixo) m do meio dos ombros, X_PEG do meio do tronco."""
        o = (c("LeftArm") + c("RightArm")) / 2
        q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        return Vector((q.x + s * X_PEG, o.y - rel[0], o.z - rel[1]))

    def mao_no_pegador(lado, s, g, acertar=False, voltas=3):
        """Mão `lado` fechando no pegador vertical em g (IK + mão na pegada, sem fechar os dedos): palma pro meio (pegada neutra), dedos
        ⟂ ao pegador seguindo o antebraço (punho reto: 3 voltas), cotovelo pra baixo, pra trás e um pouco pra fora. zerar=True no
        segurar (o conserto do giro do antebraço, 120b243): braço, antebraço e mão voltam pro repouso antes de cada pegada e o giro que
        sobra de uma não passa pra próxima. acertar: escolhe o ângulo do polo do IK. Devolve a flexão do cotovelo."""
        Sh = c(lado + "Arm")
        z = Vector((0.0, 0.0, 1.0))
        dq = g - Sh
        dq = (dq - z * dq.dot(z)).normalized()
        polo = Sh + Vector((s * 0.12, 0.30, -0.45))
        for volta in range(voltas):
            pq = Vector((-s, 0.0, 0.0))
            pq = (pq - dq * pq.dot(dq)).normalized()
            maos.segurar(lado, g, dq, pq, polo=polo, zerar=True)
            if acertar and volta == 0:
                maos.iks[lado].mute = False
                p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
                maos.segurar(lado, g, dq, pq, polo=polo, zerar=True)
            fa = (c(lado + "Hand") - c(lado + "ForeArm")).normalized()
            dq = (fa - z * fa.dot(z)).normalized()
        return ck.medir_juntas(rig)["cotovelo" + ("E" if s > 0 else "D")]

    REL0 = (0.30, 0.27)

    def maos_nos_pegadores(rel, acertar=False, voltas=3):
        for lado, s in (("Left", 1), ("Right", -1)):
            mao_no_pegador(lado, s, pegador(s, rel), acertar, voltas)

    # ── 1) pelve: o centro de massa em cima do pé de apoio (com a perna que trabalha no meio do movimento e as mãos nos pegadores) ──────
    dx, dy = -0.09, 0.02
    rel = REL0
    for rodada in range(2):
        for volta in range(8):
            pelve(dx, dy)
            perna((JOELHO0 + JOELHO1) / 2)
            maos_nos_pegadores(rel, acertar=(rodada == 0 and volta == 0), voltas=1)   # 1 volta basta pro centro de massa
            a, d = pe_apoio_eixo()
            dentro = Vector((d.y, -d.x, 0.0))
            if dentro.x < 0:
                dentro = -dentro
            alvo = a + d * CM_ALVO[0] + dentro * CM_ALVO[1]
            cm = centro_de_massa()
            erro = Vector((alvo.x - cm.x, alvo.y - cm.y, 0.0))
            if erro.length < 0.001:
                break
            dx += erro.x * 1.3
            dy += erro.y * 1.3
        p3.acertar_polo(rig, ik_apoio, APOIO + "Leg", APOIO + "UpLeg", APOIO + "Foot")
        pelve(dx, dy)
        perna((JOELHO0 + JOELHO1) / 2)
        # ── 2) pegadores: na altura que deixa o antebraço quase na horizontal, à frente até o cotovelo dar COTOVELO graus ─────────────
        lo, hi = 0.12, 0.45                             # mais à frente = braço mais esticado
        for _ in range(9):
            f_ = (lo + hi) / 2
            mao_no_pegador("Left", 1, pegador(1, (f_, rel[1])), voltas=2)
            if ck.medir_juntas(rig)["cotoveloE"] > COTOVELO:
                lo = f_
            else:
                hi = f_
        rel = ((lo + hi) / 2, rel[1])
        print("RODADA %d | pelve dx %.4f dy %.4f | pegador %.3f m à frente e %.3f abaixo do meio dos ombros | CM %.0f mm à frente do "
              "tornozelo de apoio, %.0f pra dentro" % (rodada, dx, dy, rel[0], rel[1], *cm_no_pe()), flush=True)
    maos_nos_pegadores(rel)
    G = {s: pegador(s, rel) for s in (1, -1)}
    for lado, s in (("Left", 1), ("Right", -1)):         # dedos e polegar fecham em volta do pegador (parados: as mãos não mexem)
        pg.fechar_em_volta(bon, lado, G[s], Vector((0.0, 0.0, 1.0)), RAIO)
    jl = ck.posicoes(rig)
    J = ck.medir_juntas(rig)
    print("CORPO | pelve dx %.4f dy %.4f | CM %.0f mm à frente do tornozelo de apoio, %.0f pra dentro | tronco %.1f° | quadril_sinal %s | "
          "joelhos %.1f/%.1f | coxa_abducao %s | cotovelos %.0f/%.0f | punhos %.0f/%.0f | %s" % (
              dx, dy, *cm_no_pe(), math.degrees((c("Neck") - c("Hips")).angle(Vector((0, 0, 1)))),
              "/".join("%.1f" % v for v in tc.quadril_sinal(jl)), J["joelhoE"], J["joelhoD"],
              "/".join("%.1f" % v for v in tc.coxa_abducao(jl)), J["cotoveloE"], J["cotoveloD"], J["punhoE"], J["punhoD"],
              maos.info()), flush=True)

    # ── 3) almofada do peito: paralela ao tronco, encostando no ponto mais pra frente do peito na faixa dela ────────────────────────────
    cima, lado, frente = eixos_tronco()
    q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    u0, lq, hq, eq = ALM_PEITO
    T = pele(TRONCO) - np.array(q)
    al, fr, xx = T @ np.array(cima), T @ np.array(frente), T @ np.array(lado)
    m = (np.abs(al - u0) < hq / 2) & (np.abs(xx) < lq / 2)
    prof = float(fr[m].max()) - AFUNDA
    face_peito = q + cima * u0 + frente * prof
    ang_peito = math.degrees(math.atan2(-cima.y, cima.z))
    print("ALMOFADA DO PEITO | face (%.4f %.4f %.4f) | %.1f mm à frente da linha do quadril | inclinada %.1f°" % (
        *face_peito, prof * 1000, ang_peito), flush=True)

    # ── 4) perna que trabalha no começo (montagem): eixo no joelho, almofada da coxa e rolo ─────────────────────────────────────────────
    psi0 = perna(JOELHO0)
    K = c("LeftLeg")
    ye, ze = K.y, K.z
    # almofada da coxa: paralela à coxa (contém o X), encostando na frente dela, na faixa de 4 a 20 cm acima do joelho, na pele mais pra
    # frente do movimento todo (perto do joelho ela muda um pouco quando ele dobra)
    u0c, lc, hc, ec = ALM_COXA
    cima_c = -dt
    n_c = Vector((0.0, -cima_c.z, cima_c.y)).normalized()      # normal da face (no plano YZ, ⟂ à 'cima' projetada), pra trás
    if n_c.y < 0:
        n_c = -n_c
    cima_c = Vector((0.0, cima_c.y, cima_c.z)).normalized()
    fr_c, x_c = [], []
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        perna(p3.lerp(JOELHO0, JOELHO1, t))
        P = pele(("LeftUpLeg", "LeftLeg")) - np.array(K)
        alc, frc = P @ np.array(cima_c), P @ np.array(-n_c)
        mm_ = (np.abs(alc - u0c) < hc / 2) & (np.abs(P[:, 0]) < lc / 2)
        fr_c.append(float(frc[mm_].max()))
        x_c.append(float(P[mm_, 0].mean()))
    perna(JOELHO0)
    face_coxa = K + cima_c * u0c - n_c * (max(fr_c) - AFUNDA)
    face_coxa.x = K.x + x_c[0]                                 # no meio da coxa, na altura da almofada
    ang_coxa = math.degrees(math.atan2(-cima_c.y, cima_c.z))
    print("ALMOFADA DA COXA | face (%.4f %.4f %.4f) | inclinada %.1f° | pele mais pra frente por t: %s mm" % (
        *face_coxa, ang_coxa, "/".join("%.1f" % (v * 1000) for v in fr_c)), flush=True)
    # rolo ATRÁS da perna, ROLO_ACIMA acima do tornozelo (joelho no começo): o mais perto dela sem a pele entrar mais que AFUNDA_ROLO
    A = c("LeftFoot")
    u = (A - K).normalized()                                   # ao longo da canela, pra baixo
    f = Vector((0.0, 1.0, 0.0))
    f = (f - u * f.dot(u))
    f = Vector((0.0, f.y, f.z)).normalized()                   # pra trás, ⟂ canela, no plano YZ (o lado da panturrilha)
    centro = A - u * ROLO_ACIMA
    P = pele(PERNA_T[1:]) - np.array(centro)
    alr = P @ np.array(Vector((0.0, u.y, u.z)).normalized())
    frr = P @ np.array(f)
    r = RAIO_ROLO - AFUNDA_ROLO
    m = np.abs(alr) < r
    F = float((frr[m] + np.sqrt(r ** 2 - alr[m] ** 2)).max())
    C_r = centro + f * F
    x_in = centro.x - S * ROLO_DENTRO
    print("ROLO | centro (%.4f %.4f %.4f) | ponta de dentro x %.3f | braço da alavanca %.3f m" % (
        C_r.x, C_r.y, C_r.z, x_in, math.hypot(C_r.y - ye, C_r.z - ze)), flush=True)

    # ── 5) a máquina em volta do corpo (montada com o joelho no começo) ───────────────────────────────────────────────────────────────
    q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    a_q, a_c = math.radians(ang_peito), math.radians(ang_coxa)
    costas_q = face_peito.y - math.cos(a_q) * (eq + 0.024)   # y das costas das chapas das almofadas
    costas_c = face_coxa.y - math.cos(a_c) * (ec + 0.024)
    y_col = min(G[1].y - 0.08, costas_q - 0.12, costas_c - 0.12)   # colunas da frente: na frente dos pegadores e das almofadas
    x_braco = x_in + S * (COMPR_ROLO + 0.035)
    x_torre = x_braco + S * 0.10
    fp = e3.flexora_em_pe("flexora", eixo=(ye, ze), lado=S, rolo=(x_in, C_r.y, C_r.z, RAIO_ROLO, COMPR_ROLO),
                          coxa=(face_coxa.x, face_coxa.y, face_coxa.z, ang_coxa, lc, hc, ec),
                          peito=(q.x, face_peito.y, face_peito.z, ang_peito, lq, hq, eq),
                          pegadores=(G[1].y, G[1].z, G[1].x, G[-1].x, COMP_PEGADOR, RAIO),
                          plataforma=(q.x - 0.24, face_coxa.x + 0.17, y_col + 0.05, 0.30, PLATAFORMA), y_coluna=y_col,
                          pilha=(G[-1].x - S * 0.21, y_col + 0.05, 0.24, 0.34, 1.40), x_torre=x_torre)
    print("MÁQUINA | eixo (%.3f %.3f %.3f) | colunas y %.3f | medidas %s" % (*fp.eixo, y_col, fp.medidas), flush=True)

    def pose(t):
        """t=0 joelho quase esticado, t=1 joelho dobrado a ~JOELHO1°."""
        psi = perna(p3.lerp(JOELHO0, JOELHO1, t))
        fp.girar((psi - psi0 + 180.0) % 360.0 - 180.0)   # a alavanca e o rolo giram em volta do eixo da máquina (o X, no joelho) o
                                                         # mesmo ângulo que a canela, vista de lado

    z_chapa = PLATAFORMA

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        E = fp.raizes["alavanca"].matrix_world
        c0, ux = E.to_translation(), (E.to_3x3() @ Vector((1, 0, 0))).normalized()
        v = c("LeftLeg") - c0
        eixo_mm = (v - ux * v.dot(ux)).length * 1000
        co, tri, (nomes, dono) = _malha(bon)
        dobra = _cruza(co, tri, _grupo(nomes, dono, ("LeftLeg",)), _grupo(nomes, dono, ("LeftUpLeg",)), c("LeftLeg"), VINCO_JOELHO)
        pe = co[_grupo(nomes, dono, ("LeftFoot", "LeftToeBase"))]
        return ("joelho %.1f/%.1f° | joelho × eixo da máquina %.1f mm | alavanca %.1f° | perna × coxa fora do vinco %.1f mm | pé E %.1f mm "
                "acima da plataforma | CM %.0f mm à frente do tornozelo de apoio, %.0f pra dentro | quadril_sinal %s | tronco %.1f° | "
                "tornozelo %s° | cotovelo %.0f/%.0f° | %s" % (
                    juntas["joelhoE"], juntas["joelhoD"], eixo_mm, fp.angulo, dobra, (float(pe[:, 2].min()) - z_chapa) * 1000,
                    *cm_no_pe(), "/".join("%.1f" % v for v in tc.quadril_sinal(jj)), ck.angulo_chave(rig, {"medida": "tronco"})[0],
                    "/".join("%.0f" % v for v in tc.tornozelo(jj)), juntas["cotoveloE"], juntas["cotoveloD"], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(fp.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in (("Left", 1), ("Right", -1))]
    return Cena(pose, fp.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.1, 0.8),
                camera_video=((3.4, 1.9, 1.3), (0, -0.1, 0.75), 50), info=info, apoios=fp.apoios, afunda_apoio_mm=20)
