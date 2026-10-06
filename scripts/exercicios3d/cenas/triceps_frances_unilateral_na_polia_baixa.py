# Tríceps Francês Unilateral na Polia Baixa — cena da fábrica 3D (lote 3, 06/10/2026; exercício do treino do Weslley).
# t = 0 começo: braço esquerdo acima da cabeça com o cotovelo apontando pra cima, cotovelo bem dobrado e a mão com o
# puxador atrás do pescoço · t = 1 fim: cotovelo estendido (sem travar), braço esticado pra cima.
# Técnica (ExRx, Cable One Arm Triceps Extension, pegada supinada): o puxador vem de trás ("Grasp stirrup cable attachment
# from behind"), mão com o cabo atrás do pescoço, palma virada pro pescoço e cotovelo pra cima ("Place hand with cable
# behind neck; palm toward neck and elbow positioned upward"), estende o braço pra cima ("Extend arm upward") e o cabo puxa
# o braço pra trás, no fim da flexão do ombro ("Let cable pull arm back to maintain full shoulder flexion"); a ExRx diz
# que dá pra fazer na polia baixa ("Exercise can also be performed on traditional low pulley setup") e descreve a versão
# em pé na polia baixa com corda de costas pra ela e os pés escalonados (Cable Triceps Extension (with rope): "From low
# pulley cable"; "Face away from pulley with feet staggered"; "elbows upward over head"); no halter, cotovelo pra dentro
# (Dumbbell One Arm Triceps Extension: "Keep elbow in so movement does not resemble overhead press"). ACE (Triceps
# Extension, halter): base de passada ("Stand in a split-stance position"), tronco firme e cabeça na linha da coluna ("Your
# head and neck should be aligned with your spine"), braço vertical e parado ("Attempt to keep your upper arms vertical to
# the floor"), estica sem travar ("but not completely locked") e não encosta na cabeça ("Be sure to avoid making contact
# with the back of your head"); ACE (Cable Rope Extension): tronco um pouco inclinado pelo quadril ("slightly hinge forward
# from the hips to maintain a neutral spine"). Mão livre na cintura (FitnessAI, One Arm Tricep Extension: "With your other
# hand on your hip").
# Montagem: polia baixa (0,20 m) atrás da pessoa e um pouco pro lado do braço que trabalha (a coluna não tampa as costas
# na vista de trás), com o garfo que gira (equip3d.polia(gira=True)): o cabo sai na diagonal e a roldana vira pra ele
# (~30–42°). Puxador D (equip3d.puxador_polia) na mão esquerda com pegada supinada (polegar pra fora; a palma vira pro
# pescoço embaixo e pra trás com o braço esticado) e o polegar novo em volta do pegador. Pé direito à frente e esquerdo
# atrás, chapados, joelhos levemente dobrados (12°); tronco 10° à frente dobrando no quadril, coluna neutra, cabeça na
# linha do tronco. Braço esquerdo PARADO na vertical (do mundo), 11° fechado pra perto da cabeça, com a cintura escapular
# subida (o boneco tem a clavícula e a escápula num osso só: 18° nele sobem a articulação do ombro ~4,5 cm — Ludewig 2009:
# a clavícula sobe e a escápula gira pra cima quando o braço sobe); só o cotovelo mexe (125° → 6°), o antebraço gira num
# plano fixo 20° inclinado pra dentro (a mão desce atrás do pescoço, pro meio), punho reto. Mão direita parada na cintura
# (palma no flanco, dedos juntos pra frente envolvendo a cintura, polegar junto do indicador, punho dobrado 33°). O cabo
# sobe da roldana até o puxador por trás das costas e da cabeça em todo quadro.
# Pernas como no tríceps na polia alta em pé (cenas/triceps_testa_na_polia_alta_em_pe.py), mas com os 2 pés chapados;
# braço parado e antebraço girando no cotovelo como nos tríceps na polia; cintura escapular como no encolhimento; mão de
# apoio como a da remada unilateral.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO = 0.0125                  # pegador do puxador D de 25 mm (equip3d.puxador_polia)
TRABALHA, LIVRE = "Left", "Right"
LADOS = (("Left", 1), ("Right", -1))
X_PE = 0.12                    # tornozelos a ±12 cm do meio do corpo: cada pé embaixo do seu quadril
Y_PE = {"Right": -0.17, "Left": 0.17}   # tornozelos (m; o boneco olha pra −Y): pé direito à frente, esquerdo atrás
JOELHO = 12.0                  # flexão média dos joelhos (graus), parada
RECUA = 0.0                    # articulações do quadril atrás do y = 0 (m)
INCLINA = 10.0                 # tronco à frente da vertical (graus), dobrando no quadril (coluna neutra)
FECHA = 11.0                   # braço (vertical) inclinado pra dentro, pra perto da cabeça (graus)
ATRAS = 0.0                    # braço inclinado pra trás da vertical (graus)
DENTRO = 20.0                  # plano do antebraço inclinado pra dentro (graus): a mão desce atrás da cabeça, pro meio
COTOVELO = (125.0, 6.0)        # flexão do cotovelo no começo → no fim (graus)
ELEVA = 18.0                   # cintura escapular do braço que trabalha subindo (graus, osso Shoulder do boneco)
POLIA_X, POLIA_Y, POLIA_Z, ALTO = 0.55, 0.75, 0.20, 2.15   # eixo da roldana baixa (atrás da pessoa e do lado do braço que
                               # trabalha: a coluna não tampa as costas na vista de trás) e altura da coluna
# mão livre na cintura
CINTURA_Z = 0.14               # palma na lateral do tronco, isso acima das articulações do quadril (m): na cintura, acima
                               # do osso do quadril
DEDOS_CINTURA = 40.0           # dedos da mão livre pra frente e isso pra baixo da horizontal (graus)
PALMA_CIMA = 30.0              # palma da mão livre virada pro corpo e isso pra cima (graus): a borda do mínimo, embaixo,
                               # sai do osso do quadril e o punho dobra pouco (33°; com a palma de lado, 46–64°)
POLO_LIVRE = (0.40, 0.35, 0.10)   # polo do cotovelo livre em relação ao ombro (m: pra fora, pra trás, pra cima)
POLEGAR_JUNTO = 12.0           # polegar da mão livre a isso do indicador, no plano da palma (graus)
LAMBDA_MAX = 2.0               # dedo da mão livre dobra até perfil × isso pra encostar no corpo (dedos: 60°/50°/30°)
APERTA = 0.001                 # a palma da mão livre afunda isso na pele da cintura (m)
CABECA_PARTES = ("Head", "Neck")
MAO = lambda L: [L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _malha(bon, partes):
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    return co[np.array([n in partes for n in nomes] + [False])[dono]]


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
    """Base escalonada (pé direito à frente) com os 2 pés chapados: pernas por IK (alvos nascem no tornozelo de repouso —
    alvo = polo dá NaN —, polos à frente dos joelhos), tronco inclinado no quadril e o quadril na altura que deixa os
    joelhos com a flexão média JOELHO. Devolve a altura do quadril."""
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
        z_q, j["joelhoE"], j["joelhoD"], ck.angulo_chave(rig, {"medida": "tronco"})[0]))
    return z_q


def cintura_escapular(rig, graus=None):
    """Ombro do braço que trabalha subindo com o braço acima da cabeça: o osso Shoulder do boneco (clavícula + escápula
    num osso só) gira `graus` em volta do eixo frente-trás do tronco (inclinado), na base do pescoço, e o ombro sobe sem
    abrir pro lado — o que sobra de lado vira deslize da base do osso, como no encolhimento (lote 2). Devolve quanto a
    articulação do ombro subiu (m)."""
    graus = ELEVA if graus is None else graus
    S0 = p3.cabeca(rig, TRABALHA + "Arm")
    if not graus:
        return 0.0
    s = 1 if TRABALHA == "Left" else -1
    i = math.radians(INCLINA)
    eixo = Vector((0.0, math.cos(i), math.sin(i)))           # frente-trás do tronco inclinado
    R = Matrix.Rotation(math.radians(-s * graus), 3, eixo)
    H = p3.cabeca(rig, TRABALHA + "Shoulder")
    girado = H + R @ (S0 - H)
    p3.girar_osso(rig, TRABALHA + "Shoulder", R, mover=Vector((S0.x - girado.x, 0.0, 0.0)))
    S1 = p3.cabeca(rig, TRABALHA + "Arm")
    print("CINTURA ESCAPULAR %.0f° | ombro de (%.3f %.3f %.3f) pra (%.3f %.3f %.3f)" % (graus, *S0, *S1))
    return (S1 - S0).length


def geometria_braco(rig, fecha=None, atras=None, dentro=None):
    """Braço que trabalha (esquerdo), parado, e o plano do antebraço, no mundo, com o tronco já posto. a = ombro →
    cotovelo (unitário: a vertical, FECHA graus pra dentro e ATRAS pra trás), d = pra onde o antebraço aponta com o
    cotovelo a 90° (pra trás da cabeça e DENTRO graus pro meio, ⟂ a), E = cotovelo. O antebraço com o cotovelo a b graus
    de flexão aponta pra a·cos b + d·sen b e, com a pegada supinada, a palma fica virada pro lado em que o cotovelo dobra:
    −a·sen b + d·cos b (pro pescoço embaixo, pra trás com o braço esticado)."""
    fecha = FECHA if fecha is None else fecha
    atras = ATRAS if atras is None else atras
    dentro = DENTRO if dentro is None else dentro
    c = lambda n: p3.cabeca(rig, n)
    s = 1 if TRABALHA == "Left" else -1
    k, r, q_ = math.radians(fecha), math.radians(atras), math.radians(dentro)
    a = Vector((-s * math.sin(k), math.cos(k) * math.sin(r), math.cos(k) * math.cos(r))).normalized()
    q = Vector((-s * math.sin(q_), math.cos(q_), 0.0))
    d = (q - a * q.dot(a)).normalized()
    S = c(TRABALHA + "Arm")
    Lb = (c(TRABALHA + "ForeArm") - c(TRABALHA + "Arm")).length
    La = (c(TRABALHA + "Hand") - c(TRABALHA + "ForeArm")).length
    return dict(S=S, a=a, d=d, E=S + a * Lb, Lb=Lb, La=La)


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                # mão de referência do pegador de 25 mm (antes do Maos)
    rig = bon.rig
    pernas_e_tronco(bon)
    cintura_escapular(rig)
    c = lambda n: p3.cabeca(rig, n)
    g = geometria_braco(rig)
    S, a, d, E, La = g["S"], g["a"], g["d"], g["E"], g["La"]

    def mao(b):
        """Dedos (na linha do antebraço: punho reto), palma (supinada) e o lado da mão com o cotovelo a b graus."""
        r = math.radians(b)
        dq = a * math.cos(r) + d * math.sin(r)
        pq = -a * math.sin(r) + d * math.cos(r)
        return dq, pq, dq.cross(pq)

    def polo(Ec, W):
        eixo = (W - S).normalized()
        fora = (Ec - S) - eixo * (Ec - S).dot(eixo)
        return Ec + fora.normalized() * 0.4

    maos = Maos(bon, RAIO, polegar_modo="volta")
    maos.iks[LIVRE].mute = True                  # o braço livre é posto uma vez só, abaixo (mão na cintura)
    # vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo), com o cotovelo a 60°
    B_REF = 60.0
    dq, pq, lat = mao(B_REF)
    W = E + dq * La
    maos.segurar(TRABALHA, W + dq * 0.09, dq, pq, polo=polo(E, W))
    off = (W + dq * 0.09) - c(TRABALHA + "Hand")
    off_local = (off.dot(dq), off.dot(pq), off.dot(lat))
    print("REF: vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão %.1f mm" % (
        *off_local, maos.erro[TRABALHA] * 1000))

    def juntas(b):
        dq, pq, lat = mao(b)
        W = E + dq * La
        return W, W + dq * off_local[0] + pq * off_local[1] + lat * off_local[2], dq, pq

    # ── mão livre na cintura (uma vez só: o braço livre não mexe) ─────────────────────────────────────────────────
    mao_livre = mao_na_cintura(bon, maos)

    pol = e3.polia("polia", x=POLIA_X, y=POLIA_Y, altura=POLIA_Z, frente=(0, -1, 0), alto=ALTO, gira=True)
    pux = e3.puxador_polia("puxador", raio=RAIO)

    # pontos do corpo pras folgas (o tronco e a cabeça não mexem)
    cab_pts = _malha(bon, CABECA_PARTES)
    costas_pts = _malha(bon, ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder"))
    cab_co, cab_tri = ck._avaliar_simples(bon.cabelo)
    todos_cab = np.concatenate([cab_pts, cab_co])
    bvh_cabelo = BVHTree.FromPolygons([tuple(x) for x in cab_co], [tuple(t) for t in cab_tri], all_triangles=True)
    braco_mao = set(MAO(TRABALHA) + [TRABALHA + "ForeArm"])

    def mao_cabelo():
        """Antebraço e mão que trabalham → cabelo (m, sem sinal: o cabelo é uma casca aberta)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = np.array([n in braco_mao for n in nomes] + [False])[dono]
        return min(bvh_cabelo.find_nearest(Vector(v))[3] for v in co[m])

    def folgas_cena():
        """Cabo → pele da cabeça/pescoço + cabelo, cabo → costas, olhal do puxador → cabeça/cabelo (m)."""
        A_ = pol.saida
        Eng = pux.ponto_engate
        cabo_cab = float(_dist_segmento(todos_cab, Eng, A_).min()) - 0.003
        cabo_costas = float(_dist_segmento(costas_pts, Eng, A_).min()) - 0.003
        olhal_cab = float(np.linalg.norm(todos_cab - np.array(pux.ponto_olhal), axis=1).min()) - 0.005
        return cabo_cab, cabo_costas, olhal_cab

    def pose(t):
        """t=0 cotovelo dobrado (mão com o puxador atrás da cabeça), t=1 braço esticado pra cima."""
        b = p3.lerp(*COTOVELO, t)
        W, gv, dq, pq = juntas(b)
        maos.segurar(TRABALHA, gv, dq, pq, polo=polo(E, W))
        eixo = pg._base(rig, TRABALHA)[1]        # pegador ao longo dos nós dos dedos (indicador → mínimo)
        eng = pux.por(gv, eixo, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        antes = pose.dedos.get("Thumb") if t > 0 else None
        pose.dedos = pg.fechar_em_volta(bon, TRABALHA, gv, eixo, RAIO, polegar_antes=antes)
        pose.desvio = (c(TRABALHA + "ForeArm") - E).length * 1000
        pose.folgas = [x * 1000 for x in folgas_cena()]
        u = pol.direcao(pux.ponto_engate)
        pose.cabo = math.degrees(u.angle(Vector((0, 0, -1))))

    pose.dedos = {}
    pose.desvio = 0.0
    pose.folgas = [0.0] * 3
    pose.cabo = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    maos.iks[TRABALHA].mute = False
    e = p3.acertar_polo(rig, maos.iks[TRABALHA], TRABALHA + "ForeArm", TRABALHA + "Arm", TRABALHA + "Hand")
    print("polo cotovelo", TRABALHA, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("FRANCÊS t=%.1f | cotovelo E %.0f° | ombro E %.0f° | vão (%.3f %.3f %.3f) | olhal (%.3f %.3f %.3f) | cabo × "
              "vertical %.1f° | garfo %.1f° | cabo → cabeça %.0f mm | cabo → costas %.0f mm | olhal → cabeça %.0f mm | "
              "mão → cabelo %.0f mm" % (t, jt["cotoveloE"], jt["ombroE"], *juntas(p3.lerp(*COTOVELO, t))[1],
                                        *pux.ponto_olhal, pose.cabo, pol.giro, *pose.folgas, mao_cabelo() * 1000))
    print("BRAÇO ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f) | mão livre %s | técnica %s" % (
        *S, *E, mao_livre, ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))

    def info():
        return maos.info() + (" | cotovelo fora do calculado %.1f mm | cabo × vertical %.1f° | garfo %.1f° | cabo → cabeça "
                              "%.0f mm | cabo → costas %.0f mm | olhal → cabeça %.0f mm | antebraço/mão → cabelo %.0f mm | "
                              "cabo %.3f m | polegar %s | mão livre %s") % (
            pose.desvio, pose.cabo, pol.giro, *pose.folgas, mao_cabelo() * 1000, pol.comprimento, pose.dedos.get("Thumb"),
            mao_livre)

    pegs = [(TRABALHA, ck.Barra(pux.pegador, raio=RAIO, meio_compr=pux.meia))]
    return Cena(pose, pux.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.1, 1.2),
                camera_video=((3.6, 2.2, 1.5), (0, 0.15, 1.15), 50), info=info)


def mao_na_cintura(bon, maos):
    """Mão livre (direita) parada na cintura: palma no flanco, CINTURA_Z acima das articulações do quadril, dedos juntos
    pra frente e DEDOS_CINTURA graus pra baixo, polegar junto do indicador; o cotovelo aponta pro lado e um pouco pra
    trás. O braço vai por IK até o punho e fica congelado (FK); o antebraço gira pra palma e o punho põe os dedos na
    direção; a palma afunda APERTA na pele e cada dedo (e o polegar) dobra até a pele encostar no corpo. Devolve um texto
    com as medidas."""
    rig = bon.rig
    PB = rig.pose.bones
    L = LIVRE
    s = -1 if L == "Right" else 1                 # lado de fora do corpo (x)
    c = lambda n: p3.cabeca(rig, n)
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    tronco = np.array([n in ("Hips", "Spine", "Spine1") for n in nomes] + [False])[dono]
    T = co[tronco]
    quadril = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    zc = quadril.z + CINTURA_Z
    faixa = T[np.abs(T[:, 2] - zc) < 0.006]
    lateral = faixa[np.argmax(s * faixa[:, 0])]   # ponto mais de fora do flanco nessa altura
    meio_y = float(np.median(faixa[s * faixa[:, 0] > s * lateral[0] - 0.015][:, 1]))
    alvo_pele = Vector((float(lateral[0]), meio_y, zc))
    bvh_t = ck._bvh(co, tri[tronco[tri].all(axis=1)])           # pele do tronco (parada)
    # palma virada pro corpo e PALMA_CIMA graus pra cima (a borda do mínimo, embaixo, sai do osso do quadril)
    pc = math.radians(PALMA_CIMA)
    palma_q = Vector((-s * math.cos(pc), 0.0, math.sin(pc)))
    a_ = math.radians(DEDOS_CINTURA)
    dedos_q = Vector((0.0, -math.cos(a_), -math.sin(a_)))
    dedos_q = (dedos_q - palma_q * dedos_q.dot(palma_q)).normalized()

    def _congelar():
        nomes_ = (L + "Arm", L + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_]
        maos.iks[L].mute = True
        for n, M in zip(nomes_, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def _orientar():
        f0, f1 = c(L + "ForeArm"), c(L + "Hand")
        ax = (f1 - f0).normalized()               # 1) antebraço gira pra palma
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, L)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))
        h0 = c(L + "Hand")                        # 2) o resto no punho
        y_m = (p3.ponta(rig, L + "Hand") - h0).normalized()
        n_m = pg._base(rig, L)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, L + "Hand", F_quer @ F_tem.transposed())

    def _esticar_dedos():
        """Dedos juntos, esticados e deitados no plano da palma; o polegar também, encostado no indicador."""
        p3.soltar_dedos(rig, L)
        pg.juntar_dedos(rig, L, 1.0)
        for d_ in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, L)[0]
                o = "%sHand%s%d" % (L, d_, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def _pele(partes):
        co_, _, (nomes_, dono_) = ck._avaliar(bon.corpo, 1)
        return co_, nomes_, dono_, co_[np.array([n in partes for n in nomes_] + [False])[dono_]]

    def _dist(P):
        """Menor distância com sinal (m) dos pontos P até a pele do tronco (− = dentro)."""
        menor = 1e9
        for p in P:
            v = Vector(p)
            loc, nor, idx, dist = bvh_t.find_nearest(v)
            if loc is None:
                continue
            menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    def _dobrar_ate_encostar(ossos, eixos, perfil):
        """Dobra a cadeia (falange 1 → 3) pro corpo com os ângulos perfil × λ até a pele encostar nele: a partir de λ = 0
        (dedo no plano da palma), dobra até o 1º λ em que encosta (≤ 0,5 mm; no máximo λ = LAMBDA_MAX) ou, se já entra
        (< −1 mm), estica até o 1º λ em que sai (no mínimo λ = −0,5). Devolve λ."""
        co_, nomes_, dono_, _ = _pele(ossos)
        pos = {n: i for i, n in enumerate(nomes_)}
        pts = {o: co_[dono_ == pos[o]] for o in ossos}
        cab = {o: np.array(c(o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))

        def dist(lam):
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, eixos, [lam * a for a in perfil])
            return _dist(np.concatenate([pp[o] for o in ossos]))

        escolha = 0.0
        if dist(0.0) < -0.001:
            for lam in np.arange(-0.02, -0.5001, -0.02):
                escolha = float(lam)
                if dist(lam) >= -0.0005:
                    break
        else:
            for lam in np.arange(0.0, LAMBDA_MAX + 0.0001, 0.02):
                escolha = float(lam)
                if dist(lam) <= 0.0005:
                    break
        for k, o in enumerate(ossos):
            if escolha * perfil[k]:
                p3.girar_osso(rig, o, Matrix.Rotation(math.radians(escolha * perfil[k]), 3, Vector(eixos[k])))
        return escolha

    def _polegar_junto():
        """Polegar fechando pro lado do indicador, no plano da palma, até ficar a POLEGAR_JUNTO graus dele."""
        palma = pg._base(rig, L)[0]
        o = L + "HandThumb1"
        t_ = p3.ponta(rig, L + "HandThumb3") - c(o)
        i_ = p3.ponta(rig, L + "HandIndex3") - c(L + "HandIndex1")
        t_ -= palma * t_.dot(palma)
        i_ -= palma * i_.dot(palma)
        ang = math.atan2(t_.cross(i_).dot(palma), t_.dot(i_))
        falta = ang - math.copysign(math.radians(POLEGAR_JUNTO), ang)
        if ang * falta > 0:
            p3.girar_osso(rig, o, Matrix.Rotation(falta, 3, palma))

    def _dedos_no_corpo():
        palma, eixo_nos = pg._base(rig, L)[:2]
        lams = {}
        for d_ in p3.DEDOS:
            ossos = ["%sHand%s%d" % (L, d_, i) for i in (1, 2, 3)]
            f = (p3.ponta(rig, ossos[0]) - c(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1     # + = dobra pro lado da palma (pro corpo)
            lams[d_] = _dobrar_ate_encostar(ossos, [np.array(eixo_nos * sinal)] * 3, (30.0, 25.0, 15.0))
        _polegar_junto()
        ossos = ["%sHand%s%d" % (L, "Thumb", i) for i in (1, 2, 3)]
        eixos = []
        for o in ossos:                           # polegar: dobra em volta de (direção dele × palma) → vai pra palma
            f = (p3.ponta(rig, o) - c(o)).normalized()
            eixos.append(np.array(f.cross(palma).normalized()))
        lams["Thumb"] = _dobrar_ate_encostar(ossos, eixos, (10.0, 20.0, 20.0))
        return lams

    S_l = c(L + "Arm")
    W = alvo_pele - dedos_q * 0.055 - palma_q * 0.02
    maos.polos[L].location = S_l + Vector((s * POLO_LIVRE[0], POLO_LIVRE[1], POLO_LIVRE[2]))
    for volta in range(8):
        maos.iks[L].mute = False
        maos.punhos[L].location = W
        p3.atualizar()
        if volta == 0:
            e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
            print("polo cotovelo livre erro %.3f ang %d" % e)
        _congelar()
        _orientar()
        _esticar_dedos()
        palma_pts = _pele((L + "Hand",))[3]
        palma_n = pg._base(rig, L)[0]
        centro_mao = np.array(palma_pts.mean(axis=0))
        lado_palma = palma_pts[(palma_pts - centro_mao) @ np.array(palma_n) > 0.004]
        centro_palma = Vector(lado_palma.mean(axis=0))
        dist = _dist(lado_palma)
        erro_alvo = alvo_pele - centro_palma
        erro_alvo -= palma_q * erro_alvo.dot(palma_q)                      # no plano da pele: centro da palma no alvo
        W = W + erro_alvo + palma_q * (dist + APERTA)                     # e a palma encostando (afundando APERTA)
        print("MÃO LIVRE volta %d: palma → pele %.1f mm | centro da palma fora do alvo %.1f mm" % (
            volta, dist * 1000, erro_alvo.length * 1000))
        if abs(dist + APERTA) < 0.0004 and erro_alvo.length < 0.003:
            break
    lams = _dedos_no_corpo()
    mao_pts = _pele(tuple(MAO(L)))[3]
    jt = ck.medir_juntas(rig)
    return "punho D %.0f° cotovelo D %.0f° ombro D %.0f° | mão → cintura %.1f mm | dedos λ %s | palma (%.2f %.2f %.2f)" % (
        jt["punhoD"], jt["cotoveloD"], jt["ombroD"], _dist(mao_pts) * 1000,
        " ".join("%s %.2f" % (k[0], v) for k, v in lams.items()), *palma_q)
