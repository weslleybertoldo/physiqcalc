# Tríceps Pulley Pegada Supinada — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do banco: 0 usos nos treinos prontos, 6 como
# troca equivalente). Sem peça nova: a estação de polia ALTA do Tríceps Pulley (equip3d.polia) e a barra reta curta da polia
# (equip3d.barra_polia, 20" com a pegada de borracha de 30,5 mm, a mesma da Rosca Direta na Polia).
# t = 0 começo: cotovelos dobrados, a barra segura POR BAIXO (palmas pra cima) na altura do peito, os antebraços acima da horizontal ·
# t = 1 fim: cotovelos estendidos (sem travar), os braços esticados junto das laterais do tronco e a barra na frente das coxas (palmas
# viradas pra frente). O app faz a volta (sobe devagar até a barra chegar no peito de novo).
# Técnica (as frases e os links ficam na ficha):
#   • free-exercise-db, Reverse Grip Triceps Pushdown (o nome em inglês do catálogo): "Start by setting a bar attachment (straight or e-z)
#     on a high pulley machine." / "Facing the bar attachment, grab it with the palms facing up (supinated grip) at shoulder width." /
#     "Tip: Elbows should be in by your sides and your feet should be shoulder width apart from each other." / "Slowly elevate the bar
#     attachment up as you inhale so it is aligned with your chest. Only the forearms should move and the elbows/upper arms should be
#     stationary by your side at all times.";
#   • Catalyst Athletics, Reverse-Grip Tricep Pushdown: "Hold a straight handle in front of you on a high cable attachment with the elbows
#     flexed and the palms up. Keeping the trunk braced tightly, and the elbows close to the sides, extend the elbows maximally, then
#     return to the top under control.";
#   • ACE, Triceps Pushdowns: "keeping your torso aligned vertically with the floor"; "arms postioned firmly by sides and wrists in neutral
#     positon (i.e., aligned with your forearms)"; "until your elbows become fully extended, (do not allow them to "lock out" in full
#     extension)"; a volta "until your elbows begin to drift forward from the mid-line of your trunk (around upper chest level)";
#   • NSCA (CSCS, Achievable), Triceps pushdown (machine) — o da pegada pronada, base do Tríceps Pulley: "Stand erect with feet
#     shoulder-width apart and knees slightly flexed."; "Stand close enough to the machine that the cable hangs straight down in the
#     starting position."; "Don’t forcefully lock out the elbows.".
# Montagem: a do Tríceps Pulley (cenas/triceps_pulley.py) — pernas com os joelhos JOELHO° dobrados e os pés chapados na largura dos ombros,
# tronco ereto, roldana alta (POLIA_Z) na frente e perto, o cabo descendo quase na vertical no começo (RECUO_CABO); cada braço PARADO junto
# da lateral do tronco (ABRE° aberto, FRENTE° à frente) e só o cotovelo mexe: o antebraço gira num plano fixo em volta do cotovelo, do
# antebraço ACIMA° acima da horizontal (a barra na altura do peito) até o cotovelo a COTOVELO_FIM°. A mão é a SUPINADA da Rosca Direta na
# Polia (cenas/rosca_direta_na_polia.py): palma pro lado em que o antebraço sobe (pra cima no começo, pra frente embaixo), o polegar novo
# dando a volta por fora, as mãos a ±MEIA do meio da barra (na largura dos ombros, o mais aberto que a barra de 20" deixa) e os dedos
# seguindo o antebraço ALINHA (o punho não desvia mais que o normal pro lado do polegar). O vão de cada mão é medido no referencial
# REAL da mão (o mesmo que a Maos.segurar põe com o alinhar), então o cotovelo fica onde a conta manda. A pegada (4 dedos + o polegar
# na postura POLEGAR_FIXO) é fechada uma vez no começo e repetida em todo quadro: a mão só gira junto com o antebraço em volta da barra.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import polegar3d as P3
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.01524           # pegada de borracha de 1,2" (equip3d.barra_polia)
COMPR_BARRA = 0.508            # barra reta de 20"
JOELHO = 15.0                  # joelhos levemente dobrados (graus), parados o movimento todo (como no Tríceps Pulley)
ABRE = 1.5                     # braço aberto pro lado (graus), parado: o cotovelo junto da lateral do tronco (como na Rosca Direta na
                               # Polia); mais aberto, o antebraço fecha mais pra dentro até a barra e o cotovelo não estica (V de lado:
                               # com 3° o mínimo é 12°, com 5° é 16°)
FRENTE = 15.0                  # braço à frente da vertical (graus), parado: embaixo o dorso das mãos passa a ~6 mm das coxas (com 14° e
                               # o cotovelo a 13°, a ~2 mm; com 16° o braço passa da faixa do Tríceps Pulley, até 16°)
MEIA = 0.175                   # meia distância entre os vãos das mãos (m): 35 cm entre os centros das mãos, na largura dos ombros (as
                               # articulações dos ombros a ~40 cm) — o mais aberto que a barra de 20" deixa com o polegar dando a volta
                               # por fora (Rosca Direta na Polia: com 0,185–0,195 o polegar chegava na ponta de aço)
ACIMA = 30.0                   # começo: antebraço acima da horizontal (graus) — a barra na altura do peito (z ~1,31: a pele da frente do
                               # peito vai mais à frente entre z 1,25 e 1,35, no máximo em 1,29; com 25° a barra ficava em 1,28)
COTOVELO_FIM = 11.5            # fim: flexão do cotovelo (graus) — estendido sem travar (~8° dela é o V de lado: o antebraço vem de fora
                               # pra dentro até a mão na barra curta)
POLIA_Z, ALTO = 2.05, 2.30     # eixo da roldana alta e altura da coluna (as do Tríceps Pulley)
RECUO_CABO = 0.06              # no começo a barra fica 6 cm mais perto do corpo que a vertical da saída do cabo (Tríceps Pulley)
TH_REF = 60.0                  # antebraço da referência da mão (graus da vertical pra baixo)
ALINHA = 0.6                   # quanto os dedos seguem o antebraço em vez da linha da barra (Maos.segurar(alinhar)), como na Rosca
                               # Direta na Polia
POLEGAR_FIXO = {"Left": (-8.0, 20.0, -9.0, 22.0, -7.3, 39.0), "Right": (-8.0, 22.0, -7.0, 22.0, -9.3, 39.0)}
                               # polegar NOVO dando a volta na barra, FIXO em todos os quadros (CMC flexão, abdução, rotação, MCP flexão,
                               # abdução, IP flexão, graus): a postura que a busca do pg.polegar_em_volta achou em t = 0 (checagem de 25
                               # quadros de 11/10/2026, polegar buscado quadro a quadro: alvo 45,0/45,3 mm, vão até as falanges médias
                               # 7,9/8,3 mm). Buscado quadro a quadro ele mudava de postura na 2ª metade da descida (a mão não muda na
                               # barra) e o da mão direita abria até 14,5 mm das falanges e chegava a 1,5 mm da ponta de aço. A mão só
                               # gira junto com o antebraço em volta da barra: a pegada (dedos e polegar) é a MESMA em todo quadro,
                               # fechada uma vez no começo. Medido (sonda de 6 posturas da própria busca, t = 0/0,5/1): pele do polegar →
                               # barra −0,7…−1,4 (E) e −0,8…−1,6 mm (D), pele da base 1,86× (E) e 2,07× (D); na mão direita 2 triângulos
                               # do avesso na base em TODAS as posturas testadas (vem da mão fechada, não do polegar). None = busca quadro
                               # a quadro (o jeito de antes)
LADOS = (("Left", 1), ("Right", -1))
EIXO = Vector((1, 0, 0))
PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")
COXAS = ("LeftUpLeg", "RightUpLeg")
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")


def _malha(bon, partes):
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    return co[np.array([n in partes for n in nomes] + [False])[dono]]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _bvh_de(ob):
    co, tri = ck._avaliar_simples(ob)
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in tri], all_triangles=True)


def _menor_com_sinal(pts, bvh, lim=0.25):
    """Menor distância (m) dos pontos até a malha fechada, − = o ponto entrou nela (normal contra e paridade do raio, como na
    checagem3d.folgas); até `lim` (mais longe = lim)."""
    menor = lim
    for p in pts:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is None:
            continue
        if d < 0.03 and (v - loc).dot(nor) < 0 and ck._dentro(bvh, v):
            d = -d
        menor = min(menor, d)
    return menor


def _polegar_nos_angulos(bon, lado, q):
    """Polegar da mão `lado` na postura anatômica q = (cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex), em graus — a mesma conta
    do pg.polegar_em_volta (polegar3d.eixos_do_polegar + rotacoes, osso por osso); a do Supino Fechado com Barra, copiada."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, np.array(p3.ponta(rig, ossos[2])))
    for o, R in zip(ossos, P3.rotacoes(eixos, q)):
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))


def pernas(bon):
    """Joelhos levemente dobrados com os pés chapados (como no Tríceps Pulley): tornozelos fixos, o quadril desce o que precisar pra
    flexão pedida."""
    rig = bon.rig
    iks = {}
    for lado, s in LADOS:
        alvo = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo_j = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        iks[lado] = p3.ik(rig, lado + "Leg", alvo, polo_j)
        p3.travar_rotacao(rig, lado + "Foot")
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - p3.cabeca(rig, "LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q = p3.cabeca(rig, "LeftUpLeg")
    th_j = math.radians(JOELHO)
    d_j = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th_j))     # quadril → tornozelo
    desce = tornoz.z + math.sqrt(max(d_j ** 2 - (q.x - tornoz.x) ** 2 - (q.y - tornoz.y) ** 2, 0.01)) - q.z
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, desce)))
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    j = ck.medir_juntas(rig)
    print("JOELHOS quadril desceu %.1f mm | joelho E %.0f° D %.0f°" % (-desce * 1000, j["joelhoE"], j["joelhoD"]))


def montar(bon):
    pg.usar_cilindro(RAIO_BARRA * 2000)          # mão de referência da pegada de 30,5 mm (antes do Maos)
    rig = bon.rig
    pernas(bon)
    cab = lambda n: p3.cabeca(rig, n)
    barra = e3.barra_polia("barra_polia", comprimento=COMPR_BARRA, raio=RAIO_BARRA)
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    S = {l: cab(l + "Arm") for l, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço
    a_, f_ = math.radians(ABRE), math.radians(FRENTE)
    braco = {l: Vector((s * math.sin(a_), -math.sin(f_) * math.cos(a_), -math.cos(f_) * math.cos(a_))) for l, s in LADOS}
    E = {l: S[l] + braco[l] * Lb for l, _ in LADOS}       # cotovelo parado o movimento todo

    def mao_supinada(th):
        """Dedos e palma (mundo) com o antebraço a `th` graus da vertical pra baixo, girando pra frente: th = 0 dedos pra baixo e palma
        pra frente, th = 90 dedos pra frente e palma pra cima, th = 115 palma pra cima e um pouco pro corpo — a pegada supinada com o
        punho reto (a mão não dobra pra frente nem pra trás)."""
        a = math.radians(th)
        return Vector((0, -math.sin(a), -math.cos(a))), Vector((0, -math.cos(a), math.sin(a)))

    def real(dq, pq, ax):
        """Dedos, palma e lado da mão (mundo) que a Maos.segurar(alinhar=ALINHA) põe com o antebraço na direção `ax`."""
        d = (dq * (1 - ALINHA) + ax * ALINHA).normalized()
        p = (pq - d * pq.dot(d)).normalized()
        return d, p, d.cross(p)

    def polo(lado, Ec, W):
        eixo = (W - S[lado]).normalized()
        fora = (Ec - S[lado]) - eixo * (Ec - S[lado]).dot(eixo)
        return Ec + fora.normalized() * 0.4

    # ── referência (antebraço a TH_REF° da vertical), como no Tríceps Pulley: (1) giro da mão em volta da palma pra linha dos nós dos
    # dedos ficar paralela à barra (sem dobrar o punho pra frente/trás); (2) com o alinhar, o vão da mão em relação ao punho no
    # referencial REAL da mão (osso da mão × normal da palma — fixo o movimento todo: a mão é rígida e só gira em volta do x)
    giro, off_local = {}, {}
    for lado, s in LADOS:
        dq, pq = mao_supinada(TH_REF)
        W = E[lado] + dq * La
        maos.segurar(lado, W + dq * 0.09, dq, pq, polo=polo(lado, E[lado], W))
        nos = pg._base(rig, lado)[1]
        nos_p = (nos - pq * nos.dot(pq)).normalized()
        quer = Vector((1, 0, 0)) if nos_p.x > 0 else Vector((-1, 0, 0))
        giro[lado] = math.atan2(nos_p.cross(quer).dot(pq), nos_p.dot(quer))
        dq2 = Matrix.Rotation(giro[lado], 3, pq) @ dq
        maos.segurar(lado, W + dq2 * 0.09, dq2, pq, polo=polo(lado, E[lado], W), alinhar=ALINHA)
        h0 = cab(lado + "Hand")
        y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
        n_m = pg._base(rig, lado)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        off = p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado] - h0
        off_local[lado] = (off.dot(y_m), off.dot(n_m), off.dot(y_m.cross(n_m)))
        nos2 = pg._base(rig, lado)[1]
        print("REF %s: giro da mão %.1f° | nós × barra antes %.1f° depois (com o alinhar %.1f) %.1f° | vão−punho no referencial da mão "
              "(%.3f %.3f %.3f) | erro do vão %.1f mm" % (
                  lado, math.degrees(giro[lado]), math.degrees(min(nos.angle(quer), nos.angle(-quer))), ALINHA,
                  math.degrees(min(nos2.angle(quer), nos2.angle(-quer))), *off_local[lado], maos.erro[lado] * 1000))

    def mao(lado, th):
        dq, pq = mao_supinada(th)
        return Matrix.Rotation(giro[lado], 3, pq) @ dq, pq

    def antebraco(lado, th, fx):
        c = math.sqrt(max(1 - fx ** 2, 1e-9))
        a = math.radians(th)
        return Vector((fx, -c * math.sin(a), -c * math.cos(a)))

    def vao(lado, th, fx):
        """Punho W e vão da mão g (mundo) com o antebraço a `th` graus da vertical e a parte de lado `fx`."""
        ax = antebraco(lado, th, fx)
        W = E[lado] + ax * La
        dq, pq = mao(lado, th)
        d, p, l = real(dq, pq, ax)
        o = off_local[lado]
        return W, W + d * o[0] + p * o[1] + l * o[2], dq, pq

    # o vão de cada mão fica sempre a ±MEIA do meio da barra: o antebraço com a parte de lado fx fixa (o cotovelo não sai do x dele, e o
    # desvio do vão em x no referencial real da mão não depende do ângulo: a mão e o antebraço só giram juntos em volta do x)
    fx = {}
    for lado, s in LADOS:
        f = 0.0
        for _ in range(30):
            g = vao(lado, TH_REF, f)[1]
            f += (s * MEIA - g.x) / La
        fx[lado] = f

    def juntas(th):
        """Por lado: punho W, vão da mão g, dedos e palma (pedidos), com o antebraço a `th` graus da vertical pra baixo."""
        return {lado: vao(lado, th, fx[lado]) for lado, _ in LADOS}

    def centro(th):
        j = juntas(th)
        g = (j["Left"][1] + j["Right"][1]) / 2
        return Vector((0, g.y, g.z))

    def flexao(th):
        """Ângulo do cotovelo (braço × antebraço, graus) com o antebraço a `th` graus da vertical pra baixo."""
        return math.degrees(braco["Left"].angle(antebraco("Left", th, fx["Left"])))

    def bisseca(f, a, b, n=40):
        fa = f(a)
        for _ in range(n):
            m = (a + b) / 2
            fm = f(m)
            if (fm > 0) == (fa > 0):
                a, fa = m, fm
            else:
                b = m
        return (a + b) / 2

    # começo: antebraço ACIMA graus acima da horizontal; fim: cotovelo a COTOVELO_FIM graus (o antebraço à frente do braço)
    c_l = math.sqrt(1 - fx["Left"] ** 2)
    th0 = math.degrees(math.acos(-math.sin(math.radians(ACIMA)) / c_l))
    if flexao(FRENTE) >= COTOVELO_FIM:            # o V de lado (braço aberto + antebraço fechando) já passa do pedido
        raise ValueError("cotovelo não estica até %.0f°: o mínimo com essa pegada é %.1f°" % (COTOVELO_FIM, flexao(FRENTE)))
    th1 = bisseca(lambda th: flexao(th) - COTOVELO_FIM, FRENTE, FRENTE + 40.0)
    c0, c1 = centro(th0), centro(th1)

    # polia alta de frente pro corpo (a torre fica na frente da pessoa, em −Y): a saída do cabo (atrás da roldana, que dá a volta por
    # trás e por baixo dela) fica RECUO_CABO à frente da barra do começo
    raio_rold = 0.045
    pol = e3.polia("polia", x=0.0, y=c0.y - RECUO_CABO + raio_rold, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)

    # pontos do corpo pras folgas (pernas e tronco não mexem); peças da barra fora da pegada (pontas de aço, luva, orelha, mosquetão)
    pernas_pts = _malha(bon, PERNAS)
    coxas_pts = _malha(bon, COXAS)
    tronco_pts = _malha(bon, TRONCO)
    cabelo = ck._avaliar_simples(bon.cabelo)[0]
    fora_da_pegada = [o for o in barra.children if o.type == "MESH" and any(
        o.name.endswith(x) for x in ("_ponta+1", "_ponta-1", "_luva", "_orelha", "_mosquetao"))]

    # o peito do boneco (pra conferir o "aligned with your chest" do começo): a pele da frente do tronco, por altura
    T = tronco_pts[(np.abs(tronco_pts[:, 0]) < 0.12)]
    faixas = []
    for z in np.arange(1.00, 1.50, 0.02):
        F = T[(T[:, 2] >= z) & (T[:, 2] < z + 0.02)]
        if len(F):
            faixas.append((round(float(z) + 0.01, 2), round(float(F[:, 1].min()), 3)))
    peito = min(faixas, key=lambda x: x[1])
    print("PEITO pele da frente do tronco (|x| < 12 cm) por altura (z, y mais à frente): %s | mais à frente em z %.2f (y %.3f) | ombros z "
          "%.3f | Spine2 z %.3f | pescoço z %.3f" % (faixas, peito[0], peito[1], S["Left"].z, cab("Spine2").z, cab("Neck").z))

    def folgas_cena(c, u):
        """Barra (superfície) → coxas e → tronco/cabeça; gancho (luva → bola, ~2 cm de raio) → tronco/cabeça; cabo reto → pernas, →
        tronco/cabeça e → cabelo (m)."""
        A = c + u * e3.ENGATE_BARRA_POLIA
        T_ = pol.tangente(A)[0]
        P = coxas_pts[np.abs(coxas_pts[:, 0]) < COMPR_BARRA / 2]
        barra_coxa = float(np.hypot(P[:, 1] - c.y, P[:, 2] - c.z).min()) - RAIO_BARRA
        Q = tronco_pts[np.abs(tronco_pts[:, 0]) < COMPR_BARRA / 2]
        barra_tronco = float(np.hypot(Q[:, 1] - c.y, Q[:, 2] - c.z).min()) - RAIO_BARRA
        gancho = float(_dist_segmento(tronco_pts, c, c + u * (e3.ENGATE_BARRA_POLIA + 0.007)).min()) - 0.020
        cabo_p = float(_dist_segmento(pernas_pts, A, T_).min()) - 0.003
        cabo_t = float(_dist_segmento(tronco_pts, A, T_).min()) - 0.003
        cabo_c = float(_dist_segmento(cabelo, A, T_).min()) - 0.003
        return barra_coxa, barra_tronco, gancho, cabo_p, cabo_t, cabo_c

    def maos_fora(c, u):
        """Pele de cada mão → peças da barra fora da pegada (pontas de aço, luva, orelha, mosquetão; m, − = entrou, e o nome da mais
        perto), → cabo (m) e até onde a mão vai na barra (|x| da pele a menos de 2,5 cm da borracha, m: a borracha vai até
        COMPR_BARRA/2 − 0,019)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        A = c + u * e3.ENGATE_BARRA_POLIA
        T_ = pol.saida if pol.saida is not None else pol.tangente(A)[0]
        bvhs = [(o.name.replace("barra_polia_", ""), _bvh_de(o)) for o in fora_da_pegada]
        out = {}
        for lado, _ in LADOS:
            H = co[np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]]
            pecas = min((_menor_com_sinal(H, b), nome) for nome, b in bvhs)
            cabo_ = float(_dist_segmento(H, A, T_).min()) - 0.003
            perto = H[np.hypot(H[:, 1] - c.y, H[:, 2] - c.z) < RAIO_BARRA + 0.025]
            ate = float(np.abs(perto[:, 0]).max()) if len(perto) else 0.0
            out[lado] = (pecas[0], cabo_, pecas[1], ate)
        return out

    def polegar_medidas(c):
        """Por mão: pele do polegar → superfície da barra (m, − = entrou; sem os 15 mm da base, que é a eminência tenar apoiada na
        barra), pele da falange distal → pele das falanges médias do indicador e do médio (m, o "vão" do pg.polegar_em_volta) e a pele
        da base do polegar (alongamento máximo das arestas e triângulos do avesso, pg.pele_do_polegar)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
        out = {}
        for lado, _ in LADOS:
            P_ = co[np.array([n in (lado + "HandThumb2", lado + "HandThumb3") for n in nomes] + [False])[dono]]
            base = np.array(cab(lado + "HandThumb1"))
            P_ = P_[np.linalg.norm(P_ - base, axis=1) > 0.015]
            barra_ = float((np.hypot(P_[:, 1] - c.y, P_[:, 2] - c.z) - RAIO_BARRA).min())
            D = co[np.array([n == lado + "HandThumb3" for n in nomes] + [False])[dono]]
            M = co[np.array([n in (lado + "HandIndex2", lado + "HandMiddle2") for n in nomes] + [False])[dono]]
            vao_ = float(np.sqrt(((D[:, None, :] - M[None, :, :]) ** 2).sum(axis=2)).min())
            pp = pg.pele_do_polegar(bon, lado)
            out[lado] = (barra_, vao_, pp["alonga_max"], pp["viradas"])
        return out

    # ── a pegada (4 dedos fechados até a pele encostar na barra + o polegar na postura fixa) é feita UMA vez, no começo, e repetida em
    # todo quadro (a mão só gira junto com o antebraço em volta da barra; o jeito do Supino Fechado com Barra)
    PB = rig.pose.bones
    DEDOS, dedos_info = {}, {}
    if POLEGAR_FIXO:
        j0 = juntas(th0)
        for lado, s in LADOS:
            W, g, dq, pq = j0[lado]
            maos.segurar(lado, Vector((s * MEIA, c0.y, c0.z)), dq, pq, polo=polo(lado, E[lado], W), alinhar=ALINHA)
        for lado, _ in LADOS:
            dedos_info[lado] = pg.fechar_em_volta(bon, lado, c0, EIXO, RAIO_BARRA, polegar_modo="busca")
            _polegar_nos_angulos(bon, lado, POLEGAR_FIXO[lado])
            dedos_info[lado]["Thumb"] = ("volta fixo",) + tuple(POLEGAR_FIXO[lado])
            DEDOS[lado] = {pb.name: pb.matrix_basis.copy() for pb in PB
                           if pb.name[len(p3.P):].startswith(lado + "Hand") and pb.name[len(p3.P):] != lado + "Hand"}
            print("DEDOS %s | %s" % (lado, dedos_info[lado]), flush=True)

    def pose(t):
        """t=0 cotovelos dobrados (antebraços acima da horizontal, a barra no peito), t=1 braços estendidos, barra na frente das coxas."""
        th = p3.lerp(th0, th1, t)
        j = juntas(th)
        c = centro(th)
        u = pol.direcao(c)
        e3.por_acessorio(barra, c, EIXO, u)               # gancho virado pro cabo (gira livre na barra)
        pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)          # cabo reto da saída da roldana até o engate
        p3.atualizar()
        for lado, s in LADOS:
            W, g, dq, pq = j[lado]
            maos.segurar(lado, Vector((s * MEIA, c.y, c.z)), dq, pq, polo=polo(lado, E[lado], W), alinhar=ALINHA)
        for lado, _ in LADOS:
            if POLEGAR_FIXO:                   # a mesma pegada do começo (a Maos.segurar põe a mão de referência a cada volta)
                for n, M in DEDOS[lado].items():
                    PB[n].matrix_basis = M.copy()
                pose.dedos[lado] = dedos_info[lado]
            else:                              # dedos e polegar fecham até a pele encostar na barra, quadro a quadro
                antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
                pose.dedos[lado] = pg.fechar_em_volta(bon, lado, c, EIXO, RAIO_BARRA, polegar_antes=antes)
        p3.atualizar()
        pose.desvio = {l: (cab(l + "ForeArm") - E[l]).length * 1000 for l, _ in LADOS}
        pose.folgas = [x * 1000 for x in folgas_cena(c, u)]
        pose.fora = {l: (a * 1000, b * 1000, n, x) for l, (a, b, n, x) in maos_fora(c, u).items()}
        pose.cabo = math.degrees(u.angle(Vector((0, 0, 1))))
        pose.barra = c
        pose.th = th

    pose.dedos = {}
    pose.desvio = {}
    pose.folgas = [0.0] * 6
    pose.fora = {}
    pose.cabo = pose.th = 0.0
    pose.barra = Vector()

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        pm = polegar_medidas(pose.barra)
        print("POLEGAR t=%.1f | E %s D %s | pele do polegar → barra E %+.1f D %+.1f mm | ponta → falanges médias E %.1f D %.1f mm | pele da "
              "base E %.2f× (%d do avesso) D %.2f× (%d do avesso)" % (
                  t, pose.dedos["Left"]["Thumb"], pose.dedos["Right"]["Thumb"], pm["Left"][0] * 1000, pm["Right"][0] * 1000,
                  pm["Left"][1] * 1000, pm["Right"][1] * 1000, pm["Left"][2], pm["Left"][3], pm["Right"][2], pm["Right"][3]))
        print("PULLEY SUPINADO t=%.1f | antebraço %.1f° da vertical | cotovelo E %.0f° D %.0f° | barra (y %.3f z %.3f) | barra → coxas "
              "%.0f, → tronco/cabeça %.0f mm | gancho → tronco %.0f mm | cabo → pernas %.0f, → tronco/cabeça %.0f, → cabelo %.0f mm | "
              "cabo × vertical %.1f° | mão × peças fora da pegada E %.1f (%s) D %.1f (%s) mm, × cabo E %.0f D %.0f mm | mão até |x| E "
              "%.3f D %.3f m | cotovelo fora do calculado E %.1f D %.1f mm | técnica %s" % (
                  t, pose.th, jt["cotoveloE"], jt["cotoveloD"], pose.barra.y, pose.barra.z, *pose.folgas, pose.cabo,
                  pose.fora["Left"][0], pose.fora["Left"][2], pose.fora["Right"][0], pose.fora["Right"][2], pose.fora["Left"][1],
                  pose.fora["Right"][1], pose.fora["Left"][3], pose.fora["Right"][3], pose.desvio["Left"], pose.desvio["Right"],
                  ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))
    print("BRAÇO ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f) | braço %.3f antebraço %.3f m | antebraço pra dentro E %.1f° D "
          "%.1f° | antebraço de %.1f° a %.1f° da vertical | cotovelo %.1f° → %.1f° | roldana (y %.3f z %.3f)" % (
              *S["Left"], *E["Left"], Lb, La, -math.degrees(math.asin(fx["Left"])), math.degrees(math.asin(fx["Right"])), th0, th1,
              flexao(th0), flexao(th1), pol.centro.y, pol.centro.z))

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | antebraço %.1f° | cotovelo fora do calculado E %.1f D %.1f mm | barra (y %.3f z %.3f) | barra → coxas "
                              "%.0f, → tronco/cabeça %.0f mm | gancho → tronco %.0f mm | cabo → pernas %.0f, → tronco/cabeça %.0f, → "
                              "cabelo %.0f mm | cabo × vertical %.1f° | mão × peças fora da pegada E %.1f D %.1f mm, × cabo E %.0f D %.0f "
                              "mm | cabo %.3f m | polegar %s") % (
            pose.th, pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.barra.y, pose.barra.z, *pose.folgas, pose.cabo,
            pose.fora.get("Left", (0, 0))[0], pose.fora.get("Right", (0, 0))[0], pose.fora.get("Left", (0, 0))[1],
            pose.fora.get("Right", (0, 0))[1], pol.comprimento, pol_)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra] + pol.raizes, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, -0.2, 1.1), camera_video=((3.4, -2.6, 1.35), (0, -0.2, 1.05), 50), info=info)
