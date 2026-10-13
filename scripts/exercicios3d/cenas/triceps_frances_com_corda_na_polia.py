# Tríceps Francês com Corda na Polia — cena da fábrica 3D (lote 12, 11/10/2026; o "Triceps Overhead Extension with Rope" do
# catálogo, em pé de costas pra polia BAIXA, com a corda e as 2 mãos acima da cabeça).
# t = 0 começo: os 2 braços acima da cabeça com os cotovelos apontando pra cima, os cotovelos dobrados e as mãos com a corda atrás
# da cabeça · t = 1 fim: os cotovelos estendidos (sem travar), os braços esticados pra cima e a corda um pouco aberta.
# Técnica: free-exercise-db, Triceps Overhead Extension with Rope (o fonte_en do catálogo): "Attach a rope to a low pulley." / "grasp
# the rope with both hands and face away from the cable." / "Position your hands behind your head with your elbows point straight
# up. Your elbows should start out flexed, and you can stagger your stance and lean gently away from the machine to create greater
# stability." / "extend through the elbow while keeping the upper arm in position, raising your hands above your head." ExRx, Cable
# Triceps Extension (with rope): "From low pulley cable, grasp ends of rope attachment just under enlarged ends." / "Face away from
# pulley with feet staggered. Position ends of ropes behind head or neck and elbows upward over head." / "Raise ends of rope overhead
# by extending forearms until arms are straight." / "Let cable attachment pull arm back to maintain full shoulder flexion." ACE,
# Cable Rope Extension (Kovar): "With a split-foot stance, slightly hinge forward from the hips to maintain a neutral spine." /
# "Extend the elbows, splitting the rope at full arm extension." ACE, Triceps Extension (halter, em pé): "Your head and neck should be
# aligned with your spine." / "but not completely locked" / "Be sure to avoid making contact with the back of your head." /
# "keep your upper arms vertical to the floor throughout the exercise and your elbows shoulder-width apart." Maeo 2023: "with the
# shoulder joint fixed at 180° flexion for Overhead-Arm".
# Montagem: polia BAIXA (eixo da roldana a 0,20 m) atrás da pessoa, no meio, a 1,20 m das articulações do quadril: o cabo sobe no
# plano dela (sem o garfo que gira) e sai da roldana pelo quarto da frente-baixo em todo quadro, sem pular de lado (não precisa do
# no_plano). O quadro crítico é o fim (t = 1): com a roldana mais perto o cabo passa colado atrás da cabeça — a 4 cm da cabeça e das
# costas com 0,45 m, 10 cm com 0,8 m e 15 cm com 1,2 m (varredura no rascunho); a 1,2 m o cabo chega na corda a 49–57° abaixo da
# horizontal, como nas fotos do free-exercise-db. Pé esquerdo à frente e direito atrás (34 cm), os 2 chapados, joelhos a 12°;
# tronco 14° à frente dobrando no quadril, coluna neutra, cabeça na linha do tronco. Os 2 braços PARADOS acima da cabeça, na linha do
# tronco (180°), fechando 5° pra perto da cabeça (cotovelos a 0,9 × a largura dos ombros), com a cintura escapular subida dos 2
# lados (Ludewig 2009, como no Tríceps Francês Unilateral na Polia Baixa); só os cotovelos mexem (130° → 6°), o antebraço girando
# num plano fixo 15° inclinado pra dentro (as mãos ficam a ~23 cm uma da outra atrás da cabeça, ~13 cm no meio e ~24 cm em cima: a
# corda abre no fim), punho reto. Corda com pegada neutra (palmas uma pra outra), cada mão logo abaixo do batente (encostado no
# mínimo: a corda escorregada DESLIZA pro lado da entrada); a corda entra na mão pelo lado do polegar/indicador (como no Tríceps
# Testa na Polia Alta em Pé) e sai pra baixo e pra trás, até a junção; polegar novo.
# Pernas e cintura escapular como no Tríceps Francês Unilateral na Polia Baixa (cenas/triceps_frances_unilateral_na_polia_baixa.py);
# os 2 braços e a corda como no Tríceps Testa na Polia Alta em Pé (cenas/triceps_testa_na_polia_alta_em_pe.py); as medidas da mão ×
# corda/batente/cabeça como no Abdominal na Polia (cenas/abdominal_na_polia.py).
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

RAIO = 0.014                   # corda de 28 mm (equip3d.corda_polia)
LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
X_PE = 0.12                    # tornozelos a ±12 cm do meio do corpo: cada pé embaixo do seu quadril
Y_PE = {"Left": -0.17, "Right": 0.17}     # tornozelos (m; o boneco olha pra −Y): pé esquerdo à frente, direito atrás
JOELHO = 12.0                  # flexão média dos joelhos (graus), parada
RECUA = 0.0                    # articulações do quadril atrás do y = 0 (m)
INCLINA = 14.0                 # tronco à frente da vertical (graus), dobrando no quadril (coluna neutra)
OMBRO = 180.0                  # flexão do ombro no plano do tronco (graus; 180 = braço na linha do tronco, + = pra trás dela)
FECHA = 5.0                    # braço fechando pra dentro, pra perto da cabeça (graus)
DENTRO = 15.0                  # plano do antebraço inclinado pra dentro (graus): as mãos se aproximam atrás da cabeça
COTOVELO = (130.0, 6.0)        # flexão do cotovelo no começo → no fim (graus): no começo as mãos ficam atrás da cabeça/nuca,
                               # perto do "forearms are against upper arms" da ExRx (a 142° o antebraço já entra no braço)
ELEVA = 18.0                   # cintura escapular subindo dos 2 lados (graus, osso Shoulder do boneco)
DESLIZA = 0.003                # a corda escorrega isso pro lado da entrada: o batente fica encostado no mínimo (m; como no
                               # Abdominal na Polia) e a perna sai da mão com folga
POLIA_Y, POLIA_Z, ALTO = 1.20, 0.20, 2.15   # eixo da roldana baixa (atrás da pessoa, no meio) e altura da coluna
CORPO_CABO = ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "LeftUpLeg", "RightUpLeg", "LeftArm",
              "RightArm", "LeftForeArm", "RightForeArm")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _bissecao(f, lo, hi, alvo, voltas=40):
    flo = f(lo) - alvo
    for _ in range(voltas):
        m = (lo + hi) / 2
        fm = f(m) - alvo
        if (fm > 0) == (flo > 0):
            lo, flo = m, fm
        else:
            hi = m
    return (lo + hi) / 2


def pernas_e_tronco(bon):
    """Base escalonada (pé esquerdo à frente) com os 2 pés chapados: pernas por IK (alvos nascem no tornozelo de repouso —
    alvo = polo dá NaN —, polos à frente dos joelhos), tronco inclinado no quadril e o quadril na altura que deixa os joelhos
    com a flexão média JOELHO (como no Tríceps Francês Unilateral na Polia Baixa). Devolve a altura do quadril."""
    rig = bon.rig
    PB = rig.pose.bones
    pernas, tornozelos = {}, {}
    for lado, s in LADOS:
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo = p3.vazio("polo_joelho_" + lado, (s * (X_PE + 0.03), Y_PE[lado] - 1.0, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polo)
        p3.travar_rotacao(rig, lado + "Foot")              # pés chapados, apontando pra frente
    z_tz = p3.cabeca(rig, "LeftFoot").z
    alvo = {lado: Vector((s * X_PE, Y_PE[lado], z_tz)) for lado, s in LADOS}

    def _pernas(z):
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((0, RECUA - pivo.y, z - pivo.z)))
        for lado, _ in LADOS:
            tornozelos[lado].location = alvo[lado]
        p3.atualizar()

    def _joelho_medio(z):
        _pernas(z)
        j = ck.medir_juntas(rig)
        return (j["joelhoE"] + j["joelhoD"]) / 2

    z_q = 0.90
    for _ in range(2):
        _pernas(z_q)
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            print("polo joelho", lado, "erro %.3f ang %d" % e)
        z_q = _bissecao(_joelho_medio, 0.80, 0.935, JOELHO)
    _pernas(z_q)
    j = ck.medir_juntas(rig)
    print("PERNAS quadril z %.3f | joelho E %.1f° D %.1f° | tronco %.1f°" % (
        z_q, j["joelhoE"], j["joelhoD"], ck.angulo_chave(rig, {"medida": "tronco"})[0]), flush=True)
    return z_q


def cintura_escapular(rig, lado, graus=None):
    """Ombro subindo com o braço acima da cabeça (a do Tríceps Francês Unilateral na Polia Baixa, nos 2 lados): o osso Shoulder
    do boneco (clavícula + escápula num osso só) gira `graus` em volta do eixo frente-trás do tronco (inclinado), na base do
    pescoço, e o ombro sobe sem abrir pro lado — o que sobra de lado vira deslize da base do osso. Devolve quanto a articulação
    do ombro subiu (m)."""
    graus = ELEVA if graus is None else graus
    S0 = p3.cabeca(rig, lado + "Arm")
    if not graus:
        return 0.0
    s = 1 if lado == "Left" else -1
    i = math.radians(INCLINA)
    eixo = Vector((0.0, math.cos(i), math.sin(i)))           # frente-trás do tronco inclinado
    R = Matrix.Rotation(math.radians(-s * graus), 3, eixo)
    H = p3.cabeca(rig, lado + "Shoulder")
    girado = H + R @ (S0 - H)
    p3.girar_osso(rig, lado + "Shoulder", R, mover=Vector((S0.x - girado.x, 0.0, 0.0)))
    S1 = p3.cabeca(rig, lado + "Arm")
    print("CINTURA ESCAPULAR %s %.0f° | ombro de (%.3f %.3f %.3f) pra (%.3f %.3f %.3f)" % (lado, graus, *S0, *S1))
    return (S1 - S0).length


def geometria_bracos(rig, ombro=None, fecha=None, dentro=None):
    """Braços parados e plano do antebraço, no referencial do tronco (tecnica3d.eixos_tronco), com o tronco e a cintura escapular
    já postos (a do Tríceps Testa na Polia Alta em Pé). Por lado: a = ombro → cotovelo (unitário: OMBRO graus de flexão no plano do
    tronco — 180 = na linha dele — e FECHA pra dentro), d = pra onde o antebraço dobra (⟂ a: pra trás da cabeça e DENTRO graus pro
    meio), E = cotovelo, palma = normal do plano do antebraço virada pro meio (pegada neutra). O antebraço com o cotovelo a b graus
    de flexão aponta pra a·cos b + d·sen b."""
    ombro = OMBRO if ombro is None else ombro
    fecha = FECHA if fecha is None else fecha
    dentro = DENTRO if dentro is None else dentro
    c = lambda n: p3.cabeca(rig, n)
    cima = (c("Neck") - c("Hips")).normalized()
    lado_v = c("RightArm") - c("LeftArm")
    lado_v = (lado_v - cima * lado_v.dot(cima)).normalized()
    frente = cima.cross(lado_v)
    g = dict(S={l: c(l + "Arm") for l, _ in LADOS}, Lb=(c("LeftForeArm") - c("LeftArm")).length,
             La=(c("LeftHand") - c("LeftForeArm")).length, a={}, d={}, E={}, palma={}, cima=cima, frente=frente)
    fi, ka, ps = math.radians(ombro), math.radians(fecha), math.radians(dentro)
    for lado, s in LADOS:
        meio = lado_v * s                                 # pro meio do corpo
        sag = -cima * math.cos(fi) + frente * math.sin(fi)
        a = (sag * math.cos(ka) + meio * math.sin(ka)).normalized()
        q = -frente * math.cos(ps) + meio * math.sin(ps)
        d = (q - a * q.dot(a)).normalized()
        n = a.cross(d)
        g["a"][lado], g["d"][lado] = a, d
        g["palma"][lado] = n if n.dot(meio) > 0 else -n
        g["E"][lado] = g["S"][lado] + a * g["Lb"]         # cotovelo parado o movimento todo
    return g


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)    # mão de referência da corda de 28 mm (antes do Maos)
    pg.usar_polegar("volta")         # polegar dando a volta na corda (padrão dos exercícios novos)
    rig = bon.rig
    pernas_e_tronco(bon)
    for lado, _ in LADOS:
        cintura_escapular(rig, lado)
    c = lambda n: p3.cabeca(rig, n)
    g = geometria_bracos(rig)
    S, a, d, E, palma, La = g["S"], g["a"], g["d"], g["E"], g["palma"], g["La"]

    def antebraco(lado, b):
        """Direção do antebraço (cotovelo → punho) com o cotovelo a `b` graus de flexão."""
        r = math.radians(b)
        return a[lado] * math.cos(r) + d[lado] * math.sin(r)

    def mao(lado, b):
        dq = antebraco(lado, b)                           # punho reto: dedos na linha do antebraço
        pq = (palma[lado] - dq * palma[lado].dot(dq)).normalized()
        return dq, pq, dq.cross(pq)

    def polo(lado, Ec, W):
        eixo = (W - S[lado]).normalized()
        fora = (Ec - S[lado]) - eixo * (Ec - S[lado]).dot(eixo)
        return Ec + fora.normalized() * 0.4

    maos = Maos(bon, RAIO, polegar_modo="volta")
    # vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo), com o cotovelo a 60°
    B_REF = 60.0
    off_local = {}
    for lado, s in LADOS:
        dq, pq, lat = mao(lado, B_REF)
        W = E[lado] + dq * La
        maos.segurar(lado, W + dq * 0.09, dq, pq, polo=polo(lado, E[lado], W))
        off = (W + dq * 0.09) - c(lado + "Hand")
        off_local[lado] = (off.dot(dq), off.dot(pq), off.dot(lat))
        print("REF %s: vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão %.1f mm" % (
            lado, *off_local[lado], maos.erro[lado] * 1000))

    def juntas(b):
        out = {}
        for lado, _ in LADOS:
            dq, pq, lat = mao(lado, b)
            W = E[lado] + dq * La
            o = off_local[lado]
            out[lado] = (W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq)
        return out

    pol = e3.polia("polia", x=0.0, y=POLIA_Y, altura=POLIA_Z, frente=(0, -1, 0), alto=ALTO)
    corda = e3.corda_polia("corda", raio=RAIO)
    p3.atualizar()
    BAT = {}                                # batente (malha com o chanfro) no referencial da ponta: mão × batente medida à parte
    for s_ in (1, -1):
        bo = [o for o in corda.pontas[s_].children if "batente" in o.name][0]
        co_b, tri_b = ck._avaliar_simples(bo)
        Mi = np.array(corda.pontas[s_].matrix_world.inverted())
        loc_b = co_b @ Mi[:3, :3].T + Mi[:3, 3]
        BAT[s_] = (BVHTree.FromPolygons([tuple(v) for v in loc_b], [tuple(f) for f in tri_b]), float(loc_b[:, 0].min()),
                   float(loc_b[:, 0].max()), float(np.linalg.norm(loc_b[:, 1:], axis=1).max()))

    def folgas_cena():
        """Pernas da corda, gancho, batentes e cabo → pele da cabeça/pescoço + cabelo e → tronco/glúteo/braços (m)."""
        co, _, (nomes, dono) = _malha(bon)
        cabeca = co[_grupo(nomes, dono, ("Head", "Neck"))]
        cab_co = ck._avaliar_simples(bon.cabelo)[0]
        todos = np.concatenate([cabeca, cab_co])
        corpo = co[_grupo(nomes, dono, CORPO_CABO)]
        J, Ent = corda.juncao, corda.entradas
        A = pol.saida
        u = (A - J).normalized()
        pernas = min(float(_dist_segmento(todos, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        pernas_c = min(float(_dist_segmento(corpo, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        gancho = float(_dist_segmento(todos, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        gancho_c = float(_dist_segmento(corpo, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        cabo = float(_dist_segmento(todos, J + u * corda.engate, A).min()) - 0.003
        cabo_c = float(_dist_segmento(corpo, J + u * corda.engate, A).min()) - 0.003
        bat = 1e9                           # batente: do fim da corda na mão até o fim do batente (eixo da ponta), raio 21 mm
        for s in (1, -1):
            M = corda.pontas[s].matrix_world
            c0 = M @ Vector((corda.meia + 0.003, 0, 0))
            c1 = M @ Vector((corda.meia + 0.003 + 0.045, 0, 0))
            bat = min(bat, float(_dist_segmento(np.concatenate([todos, corpo]), c0, c1).min()) - 0.021)
        return pernas, pernas_c, gancho, gancho_c, cabo, cabo_c, bat

    def mao_x_corda():
        """Pele de cada mão → a perna da corda dela, fora da pegada (da entrada na mão até a junção), mm: − = a corda entrou."""
        co, _, (nomes, dono) = _malha(bon)
        out = []
        for lado, s in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            out.append((float(_dist_segmento(co[m], corda.entradas[s], corda.juncao).min()) - RAIO) * 1000)
        return out

    def mao_x_batente():
        """Pele de cada mão × o batente da ponta dela (malha com o chanfro), mm com sinal (− = o batente entrou na mão)."""
        co, _, (nomes, dono) = _malha(bon)
        out = []
        for lado, s_ in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            Mi = np.array(corda.pontas[s_].matrix_world.inverted())
            L_ = co[m] @ Mi[:3, :3].T + Mi[:3, 3]
            bvh, x0, x1, r_ = BAT[s_]
            perto = (L_[:, 0] > x0 - 0.02) & (L_[:, 0] < x1 + 0.02) & (np.linalg.norm(L_[:, 1:], axis=1) < r_ + 0.02)
            d_ = 20.0
            for v in L_[perto]:
                loc, nor, _, dist = bvh.find_nearest(Vector(v))
                if loc is not None:
                    d_ = min(d_, (dist if (Vector(v) - loc).dot(nor) > 0 else -dist) * 1000)
            out.append(d_)
        return out

    def mao_x_cabeca():
        """Pele de cada mão → pele da cabeça/pescoço e cabelo (mm, sem sinal)."""
        co, _, (nomes, dono) = _malha(bon)
        alvo = np.concatenate([co[_grupo(nomes, dono, ("Head", "Neck"))], ck._avaliar_simples(bon.cabelo)[0]])
        out = []
        for lado, _ in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            out.append(min(float(np.linalg.norm(alvo - p, axis=1).min()) for p in co[m][::4]) * 1000)
        return out

    def mao_x_gancho_cabo():
        """Pele das 2 mãos → gancho (da junção até o começo do cabo, raio 20 mm), → cabo (até a roldana) e uma mão → a outra (mm)."""
        co, _, (nomes, dono) = _malha(bon)
        mE = np.array([n.startswith("LeftHand") for n in nomes] + [False])[dono]
        mD = np.array([n.startswith("RightHand") for n in nomes] + [False])[dono]
        P = np.concatenate([co[mE], co[mD]])
        J, A = corda.juncao, pol.saida
        u = (A - J).normalized()
        gancho = float(_dist_segmento(P, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        cabo = float(_dist_segmento(P, J + u * corda.engate, A).min()) - 0.003
        entre = min(float(np.linalg.norm(co[mD] - p, axis=1).min()) for p in co[mE][::3])
        return gancho * 1000, cabo * 1000, entre * 1000

    def pose(t):
        """t=0 cotovelos dobrados (mãos e corda atrás da cabeça), t=1 braços esticados pra cima."""
        b = p3.lerp(*COTOVELO, t)
        j = juntas(b)
        for lado, _ in LADOS:
            W, g_, dq, pq = j[lado]
            maos.segurar(lado, g_, dq, pq, polo=polo(lado, E[lado], W))
        peg = {}
        for lado, s in LADOS:                     # corda no vão de cada mão, ao longo dos nós dos dedos (indicador → mínimo: a corda
            nos = pg._base(rig, lado)[1]          # entra do lado do polegar e o batente fica no mínimo), escorregada DESLIZA pro lado
            peg[s] = (j[lado][1] - nos * DESLIZA, nos)        # da entrada (o mesmo cilindro: os dedos fecham igual)
        eng = corda.por(peg, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        for lado, s in LADOS:                     # dedos e polegar fecham até a pele encostar na corda
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, j[lado][1], peg[s][1], RAIO, polegar_antes=antes)
        pose.desvio = {l: (c(l + "ForeArm") - E[l]).length * 1000 for l, _ in LADOS}
        pose.maos = (j["Left"][1] - j["Right"][1]).length * 1000
        pose.entradas = (corda.entradas[1] - corda.entradas[-1]).length * 1000
        u = pol.direcao(corda.juncao)
        pose.cabo = math.degrees(u.angle(Vector((0, 0, -1))))
        n = (pol.saida - pol.centro).normalized()       # saída do cabo na roldana: ângulo no plano dela (0 = em cima, + = pro
        pose.saida = math.degrees(math.atan2(-n.y, n.z))  # lado da pessoa) e de lado (mm)
        pose.saida_x = (pol.saida.x - pol.centro.x) * 1000

    pose.dedos = {}
    pose.desvio = {}
    pose.maos = pose.entradas = pose.cabo = pose.saida = pose.saida_x = 0.0

    def info():
        jj = ck.posicoes(rig)
        juntas_ = ck.medir_juntas(rig)
        f = folgas_cena()
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return ("tronco %.1f° | cotovelo %.0f/%.0f° | braco_frente %s | braco_elevacao %s | cotovelo_tronco %s | cotovelos_largura "
                "%.2f | cabeca_tronco %.0f | punho %.0f/%.0f° | palma pro meio %s° | vãos a %.0f mm | entradas a %.0f mm | pernas da "
                "corda → cabeça/cabelo %.0f mm, → corpo %.0f | gancho → cabeça %.0f, → corpo %.0f | cabo → cabeça %.0f, → corpo %.0f | "
                "batente → cabeça/corpo %.0f | mão → corda %s | mão → batente %s | mão → cabeça %s | mãos → gancho %.0f, → cabo %.0f | "
                "mão × mão %.0f mm | cabo × vertical %.1f° | saída do "
                "cabo %+.0f° de lado %+.1f mm | junção (%.3f %.3f %.3f) | cabo %.3f m | cotovelo fora do calculado E %.1f D %.1f mm | "
                "%s | polegar %s" % (
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], juntas_["cotoveloE"], juntas_["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)), tc.cotovelos_largura(jj)[0], tc.cabeca_tronco(jj)[0],
                    juntas_["punhoE"], juntas_["punhoD"], "/".join("%.0f" % v for v in tc.palma_dentro(jj)), pose.maos,
                    pose.entradas, f[0] * 1000, f[1] * 1000, f[2] * 1000, f[3] * 1000, f[4] * 1000, f[5] * 1000, f[6] * 1000,
                    "/".join("%.1f" % v for v in mao_x_corda()), "/".join("%.1f" % v for v in mao_x_batente()),
                    "/".join("%.0f" % v for v in mao_x_cabeca()), *mao_x_gancho_cabo(), pose.cabo, pose.saida, pose.saida_x, *corda.juncao,
                    pol.comprimento, pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), maos.info(), pol_))

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("FRANCÊS CORDA t=%.1f | %s" % (t, info()), flush=True)
    print("BRAÇO ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f) | técnica %s" % (
        *S["Left"], *E["Left"], tc.texto(tc.medir(ck.posicoes(rig)))), flush=True)
    pose(0.0)

    pegs = [(l, ck.Barra(corda.pontas[s], raio=RAIO, meio_compr=corda.meia)) for l, s in LADOS]
    return Cena(pose, corda.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.2, 1.1),
                camera_video=((4.2, 1.6, 1.5), (0, 0.3, 1.15), 50), info=info)
