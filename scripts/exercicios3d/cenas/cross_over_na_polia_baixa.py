# Cross-over na Polia Baixa — cena da fábrica 3D (lote 10, 10/10/2026; exercício novo do banco do treino, troca equivalente em 7
# treinos prontos). t = 0 começo: braços embaixo e abertos pros lados, um pouco à frente do corpo, as mãos abaixo da cintura (do
# lado do quadril), cotovelos levemente dobrados apontando pra trás e um pouco pra baixo, palmas pra frente · t = 1 fim: as mãos se
# encontram (os puxadores quase se encostando, sem cruzar) na frente do corpo, na altura do queixo, as palmas pra cima e uma pra
# outra.
# Técnica (ExRx, Cable Standing Incline Fly — a página CBStandingInclineFly do peitoral, porção clavicular): de pé entre as 2
# polias ("Stand between two pulleys"), um puxador em cada mão, braços abertos com o cotovelo levemente dobrado, apontando pra
# trás e um pouco pra baixo ("Extend arms out with elbows slightly bent, pointed back and downward slightly"), um passo à frente
# até o cabo esticar ("Step forward until cables are taut") e a base escalonada ("Stand with feet staggered"); com o cotovelo
# parado, junta os puxadores num abraço que sobe em arco até eles se encontrarem em cima ("Keeping elbows fixed in slightly bent
# position, bring stirrups together in upwardly arching, hugging motion, at 30º to 45º angle until they meet at top of motion") e
# volta pelo mesmo caminho até alongar o peito ("Lower stirrups to original position in reverse pattern. As soon as stretch is felt
# in chest or shoulders, repeat motion"). ACE (Standing Incline Cable Flyes): base escalonada e o tronco em pé ("Assume a
# staggered-stance position (i.e., walking position, with one leg forward) to stabilize yourself and align your trunk
# vertically"), sem inclinar à frente ("Avoid the tendency to lean forward"), cotovelo levemente dobrado e punho reto ("Maintain a
# slight bend in your elbows, neutral wrist position"), aberto as mãos não passam pra trás da linha da axila ("do not allow your
# hands to move past the midline of your body (level of your armpit)") e em cima as mãos se encontram ("until your hands meet
# level with your face or above your head"). free-exercise-db (Low Cable Crossover, a lista do nome do catálogo): polias embaixo
# ("place the pulleys at the low position"), um passo à frente ("Step forward, gaining tension in the pulleys"), palmas pra
# frente e mãos abaixo da cintura no começo ("Your palms should be facing forward, hands below the waist"), as mãos sobem e vão
# pro meio ("draw your hands upward and toward the midline of your body") e se encontram na frente do peito, com as palmas pra
# cima ("Your hands should come together in front of your chest, palms facing up").
# Montagem: a mesma estação do Cross-over na Polia (cenas/cross_over_na_polia.py): 2 polias com o garfo que gira
# (equip3d.polia(gira=True)), uma de cada lado, a ±1,345 m do meio, com a coluna de 2,39 m, agora com a roldana na posição MAIS
# BAIXA da Life Fitness Signature Series Adjustable Cable Crossover (carrinho de 7" a 76" do chão: 0,178 m), viradas pra pessoa
# (`frente` pro meio; o garfo gira ~37–44° pro cabo, que sai pra trás e pra cima) e 40 cm atrás dos ombros (POLIA_Y: o passo à
# frente; com isso a torre fica atrás do corpo na vista de lado). Um puxador D (equip3d.puxador_polia, pegador de 25 mm) em cada
# mão, com o polegar novo em volta do pegador; o aro gira em volta do pegador e fica no plano do cabo.
# Corpo: base escalonada (pé direito à frente, os 2 chapados, cada um embaixo do seu quadril), joelhos levemente dobrados e o
# tronco em pé (INCLINA°, coluna neutra, cabeça na linha do tronco) — tudo parado. Cada braço é UMA peça girando num plano só (em
# volta de n = a0 × a1, o eixo do "abraço": o plano do arco sobe ~45° da horizontal, o "at 30º to 45º angle" do ExRx): de a0
# (embaixo, aberto pro lado e um pouco à frente) até a1 (à frente, um pouco acima da horizontal e um pouco pra dentro); o
# antebraço dobra COTOVELO° pro lado em que o braço anda (o cotovelo aponta pra trás e um pouco pra baixo no começo, sem mexer) e
# a mão fica reta no antebraço com a palma virada pra onde o braço anda (pra frente no começo, pra cima e pra dentro no fim). O
# plano do fim sai de uma conta (bisseção) que deixa os 2 pegadores a VAO_FIM um do outro: as mãos se encontram sem cruzar (com a
# palma pra cima, os 2 pegadores ficam em V e os aros de dentro chegam perto: 0,12 m deixa os aros a ~7 mm e as mãos a ~29 mm).
# Braço e mão como no Cross-over na Polia, pernas e tronco como lá (com o tronco em pé).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO = 0.0125                  # pegador do puxador D de 25 mm (equip3d.puxador_polia)
LADOS = (("Left", 1), ("Right", -1))   # s = +1 é o lado esquerdo (+X); o boneco olha pra −Y
SIGLA = {"Left": "E", "Right": "D"}
X_PE = 0.12                    # tornozelos a ±12 cm do meio do corpo: cada pé embaixo do seu quadril
Y_PE = {"Right": -0.17, "Left": 0.17}   # tornozelos (m; o boneco olha pra −Y): pé direito à frente, esquerdo atrás
JOELHO = 10.0                  # flexão média dos joelhos (graus), parada
INCLINA = 0.0                  # tronco em pé (graus à frente da vertical, dobrando no quadril), parado
RECUA = 0.0                    # articulações do quadril em y = 0 (m), no meio da base: os 2 joelhos dobram igual
COTOVELO = 15.0                # flexão do cotovelo (graus), parada o movimento todo
ELEVA = (45.0, 97.0)           # braço × "pra baixo" do tronco no começo → no fim (graus): 90 = na altura do ombro
PLANO0 = 12.0                  # começo: o braço um pouco à frente do plano dos ombros (0 = pro lado; − = atrás do tronco)
VAO_FIM = 0.12                 # fim: distância entre os eixos dos 2 pegadores, de lado a lado (m) — os puxadores quase se encostam
POLIA_X, POLIA_Y, POLIA_Z, ALTO = 1.345, 0.40, 0.178, 2.39   # roldanas (±X), 40 cm atrás dos ombros (o passo à frente); coluna de 2,39 m
MAO = {L: tuple([L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]) for L, _ in LADOS}


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
    alvo = polo dá NaN —, polos à frente dos joelhos), tronco inclinado INCLINA° no quadril e o quadril na altura que deixa os
    joelhos com a flexão média JOELHO (como no Cross-over na Polia). Devolve a altura do quadril."""
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


def eixos_tronco(rig):
    """Referencial do tronco (parado): cima (quadril → pescoço), lado (ombro esquerdo → direito, ⟂ cima) e frente."""
    c = lambda n: p3.cabeca(rig, n)
    cima = (c("Neck") - c("Hips")).normalized()
    lado = c("RightArm") - c("LeftArm")
    lado = (lado - cima * lado.dot(cima)).normalized()
    return cima, lado, cima.cross(lado)


def geometria(rig, lado, s, plano1):
    """Braço do lado `lado` (s = +1 esquerdo) indo de (ELEVA[0], PLANO0) a (ELEVA[1], plano1): o úmero gira num plano só, em
    volta de n = a0 × a1 (o "abraço", sem girar no próprio eixo); o antebraço dobra COTOVELO° pro lado em que o braço anda
    (d = n × a) e a palma olha pra esse mesmo lado, perpendicular ao antebraço. eleva = braço × "pra baixo" do tronco; plano =
    pra onde o braço aponta visto de cima do tronco (0 = pro lado, 90 = pra frente, > 90 = um pouco pra dentro).
    segmentos(t) devolve braço, antebraço e palma (unitários), cotovelo E e punho W no mundo."""
    cima, lado_v, frente = eixos_tronco(rig)
    fora = -s * lado_v

    def direcao(eleva, plano):
        th, ph = math.radians(eleva), math.radians(plano)
        return (fora * (math.sin(th) * math.cos(ph)) + frente * (math.sin(th) * math.sin(ph)) - cima * math.cos(th)).normalized()

    a0, a1 = direcao(ELEVA[0], PLANO0), direcao(ELEVA[1], plano1)
    n = a0.cross(a1).normalized()
    TH = a0.angle(a1)
    c = lambda nm: p3.cabeca(rig, nm)
    S = c(lado + "Arm")
    Lb = (c(lado + "ForeArm") - S).length
    La = (c(lado + "Hand") - c(lado + "ForeArm")).length
    k = math.radians(COTOVELO)

    def segmentos(t):
        a = Matrix.Rotation(TH * t, 3, n) @ a0
        d = n.cross(a).normalized()                      # pra onde o braço anda
        f = (a * math.cos(k) + d * math.sin(k)).normalized()
        p = (-a * math.sin(k) + d * math.cos(k)).normalized()
        E = S + a * Lb
        return a, f, p, E, E + f * La

    return dict(S=S, segmentos=segmentos, n=n, TH=math.degrees(TH), plano1=plano1)


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                 # mão de referência do pegador de 25 mm (antes do Maos)
    rig = bon.rig
    c = lambda n: p3.cabeca(rig, n)
    pernas_e_tronco(bon)
    maos = Maos(bon, RAIO, polegar_modo="volta")  # polegar novo: dá a volta no pegador
    pol, pux, geo = {}, {}, {}
    for lado, s in LADOS:
        sg = SIGLA[lado]
        pol[lado] = e3.polia("polia_" + sg, x=s * POLIA_X, y=POLIA_Y, altura=POLIA_Z, frente=(-s, 0, 0), alto=ALTO,
                             gira=True)
        pux[lado] = e3.puxador_polia("puxador_" + sg, raio=RAIO)
        geo[lado] = geometria(rig, lado, s, 95.0)

    def polo(lado, E, W):
        S = geo[lado]["S"]
        eixo = (W - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        return E + fora.normalized() * 0.4

    # vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo: punho reto) — sai da mão, não do plano
    off_local = {}
    for lado, _ in LADOS:
        a, f, p, E, W = geo[lado]["segmentos"](0.5)
        lat = f.cross(p)
        maos.segurar(lado, W + f * 0.09, f, p, polo=polo(lado, E, W))
        off = (W + f * 0.09) - c(lado + "Hand")
        off_local[lado] = (off.dot(f), off.dot(p), off.dot(lat))
        print("REF %s: vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão %.1f mm" % (
            lado, *off_local[lado], maos.erro[lado] * 1000))

    def vao(g, lado, t):
        a, f, p, E, W = g["segmentos"](t)
        lat = f.cross(p)
        o = off_local[lado]
        return E, W, W + f * o[0] + p * o[1] + lat * o[2], f, p

    # fim: o plano do braço que deixa os 2 pegadores a VAO_FIM um do outro, de lado a lado (as mãos se encontram sem cruzar):
    # a distância com sinal (+ = sem cruzar) cai sempre que o plano aumenta
    para_esquerda = -eixos_tronco(rig)[1]

    def dist_fim(plano1):
        g = {lado: geometria(rig, lado, s, plano1) for lado, s in LADOS}
        return (vao(g["Left"], "Left", 1.0)[2] - vao(g["Right"], "Right", 1.0)[2]).dot(para_esquerda)

    plano1 = _bissecao(dist_fim, 75.0, 115.0, VAO_FIM)
    for lado, s in LADOS:
        geo[lado] = geometria(rig, lado, s, plano1)
        print("ARCO %s: de (%.0f°, %.0f°) a (%.0f°, %.1f°) | %.1f° em volta de (%.2f %.2f %.2f) | plano do arco %.1f° da "
              "horizontal" % (lado, ELEVA[0], PLANO0, ELEVA[1], plano1, geo[lado]["TH"], *geo[lado]["n"],
                              math.degrees(math.acos(min(1.0, abs(geo[lado]["n"].z))))))

    def juntas(lado, t):
        return vao(geo[lado], lado, t)

    def vao_entre_maos():
        """Menor distância da pele de uma mão até a da outra (m)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        pe = co[np.array([n in MAO["Left"] for n in nomes] + [False])[dono]]
        pd = co[np.array([n in MAO["Right"] for n in nomes] + [False])[dono]]
        arv = KDTree(len(pd))
        for i, v in enumerate(pd):
            arv.insert(Vector(v), i)
        arv.balance()
        return min(arv.find(Vector(v))[2] for v in pe)

    def pose(t):
        """t=0 braços embaixo e abertos, mãos abaixo da cintura; t=1 as mãos se encontram na frente do queixo."""
        for lado, _ in LADOS:
            E, W, gv, f, p = juntas(lado, t)
            maos.segurar(lado, gv, f, p, polo=polo(lado, E, W))
            eixo = pg._base(rig, lado)[1]                # pegador ao longo dos nós dos dedos (indicador → mínimo)
            eng = pux[lado].por(gv, eixo, pol[lado].direcao)
            pol[lado].ligar(eng)
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, gv, eixo, RAIO, polegar_antes=antes)
            pose.desvio[lado] = (c(lado + "ForeArm") - E).length * 1000
            u = pol[lado].direcao(pux[lado].ponto_engate)
            pose.cabo[lado] = math.degrees(math.asin(max(-1.0, min(1.0, -u.z))))
            pose.ante_cabo[lado] = math.degrees((E - W).angle(u))
            pose.alt[lado] = gv.z

    pose.dedos, pose.desvio, pose.cabo, pose.ante_cabo, pose.alt = {}, {}, {}, {}, {}

    pose(0.5)                                     # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("CROSSOVER BAIXO t=%.1f | cotovelo E %.0f° D %.0f° | ombro E %.0f° D %.0f° | vão E (%.3f %.3f %.3f) D (%.3f %.3f "
              "%.3f) | mãos a %.0f mm | cabo E %.1f° D %.1f° abaixo da horizontal | garfo E %.1f° D %.1f° | antebraço × cabo E "
              "%.0f° D %.0f° | técnica %s" % (
                  t, jt["cotoveloE"], jt["cotoveloD"], jt["ombroE"], jt["ombroD"], *juntas("Left", t)[2],
                  *juntas("Right", t)[2], vao_entre_maos() * 1000, pose.cabo["Left"], pose.cabo["Right"],
                  pol["Left"].giro, pol["Right"].giro, pose.ante_cabo["Left"], pose.ante_cabo["Right"],
                  ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))

    def info():
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | pegador E %.3f D %.3f m do chão | cabo E %.1f° "
                              "D %.1f° abaixo da horizontal | garfo E %.1f° D %.1f° | antebraço × cabo E %.0f° D %.0f° | cabo E "
                              "%.3f D %.3f m | polegar E %s D %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.alt.get("Left", 0), pose.alt.get("Right", 0),
            pose.cabo.get("Left", 0), pose.cabo.get("Right", 0), pol["Left"].giro, pol["Right"].giro,
            pose.ante_cabo.get("Left", 0), pose.ante_cabo.get("Right", 0), pol["Left"].comprimento,
            pol["Right"].comprimento, pose.dedos.get("Left", {}).get("Thumb"), pose.dedos.get("Right", {}).get("Thumb"))

    pegs = [(lado, ck.Barra(pux[lado].pegador, raio=RAIO, meio_compr=pux[lado].meia)) for lado, _ in LADOS]
    equip = []
    for lado, _ in LADOS:
        equip += pux[lado].raizes + [pol[lado].roldana, pol[lado].cabo]
    # As 2 torres (paradas, a mais de 1 m do corpo) vão em `apoios`, como no Cross-over na Polia: a checagem do peso × corpo
    # amostra a superfície de cada equipamento a cada 8 mm, e os triângulos compridos da carenagem da pilha viram ~1 milhão de
    # pontos por torre. Como apoio, o corpo é medido contra elas só perto delas (corpo_no_apoio) e com afunda 0 mm: nada do corpo
    # pode entrar nelas. A roldana que gira e o cabo continuam equipamento (nada encosta neles).
    return Cena(pose, equip, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.1),
                camera_video=((2.6, -4.4, 1.4), (0, -0.2, 1.0), 50), info=info,
                apoios=[pol[lado].torre for lado, _ in LADOS], afunda_apoio_mm=0.0)
