# Cross-over na Polia — cena da fábrica 3D (lote 7, 08/10/2026; exercício dos treinos prontos do app, 2 usos).
# t = 0 começo: braços abertos pros lados, na horizontal, na linha dos ombros, cotovelos levemente dobrados e apontando pra
# cima/pra trás, as mãos um pouco abaixo dos ombros · t = 1 fim: as mãos se encontram (quase se encostando, sem cruzar) na
# frente do quadril, na altura da cintura, as palmas uma pra outra e os cotovelos apontando pros lados.
# Técnica (ExRx, Cable Isolateral Standing Fly — a página CBStandingFly do peitoral, porção esternal): as 2 polias ALTAS, uma
# de cada lado ("Grasp two opposing high pulley dumbbell attachments. Stand with pulleys to each side."); tronco um pouco à
# frente dobrando o quadril e os joelhos ("Bend over slightly by flexing hips and knees."); cotovelos levemente dobrados e os
# ombros girados pra dentro ("Bend elbows slightly and internally rotate shoulders so elbows are back initially."); fecha os
# braços num abraço, com o cotovelo parado ("Bring cable attachments together in hugging motion with elbows in fixed
# position."), os cotovelos apontando pra cima em cima e pros lados embaixo ("Keep shoulders internally rotated so elbows are
# pointed upward at top and out to sides at bottom."), e volta até alongar o peito ("Return to starting position until chest
# muscles are stretched."). Schoenfeld (M.A.X. Muscle Plan 2.0, Cable Fly): polia alta, base escalonada com os pés mais ou
# menos na largura dos ombros e o tronco um pouco à frente ("Grasp the handles of a high-pulley apparatus. Stand with your feet
# about shoulder-width apart in a staggered stance and slightly bend your torso forward at the waist."), braços levemente
# dobrados e abertos pros lados, mais ou menos paralelos ao chão ("Slightly bend your arms and hold them out to the sides so
# that they are approximately parallel with the floor."), puxa pra baixo e pra dentro num semicírculo ("pull both handles down
# and across your body, creating a semicircular movement") até as mãos se encontrarem na altura da cintura ("Bring your hands
# together at the level of your waist"), volta pelo mesmo caminho e o cotovelo não mexe ("Your elbows should remain slightly
# bent and fixed throughout the move"; "think of hugging a beach ball"). ACE (Schanke, Porcari et al. 2012, Bent-forward Cable
# Crossover): base com os pés lado a lado ou escalonada ("Start with your feet hip-width apart in line with the body or with
# the feet in a staggered stance"), mãos abaixo dos ombros no começo ("Your hands should be lower than the shoulders and your
# elbows should be slightly bent."), braços quase esticados ("with the arms almost fully extended"), primeiro pra baixo e
# depois pra dentro ("Think about moving the arms downward first and then inward to get a nice wide arc."), o tronco não vai
# pras mãos ("Avoid moving the torso closer to the hands") e as mãos não passam do meio do corpo ("cross the two handles above
# and below each other to come past the midline ... there is a risk of injury ... of the hand when the handles pass so close to
# each other"). NASM (Cable Crossover): pegada neutra ("Grab the handles with a neutral grip (palms facing each other).").
# Montagem: 2 estações de cabo (equip3d.polia(gira=True), o garfo que gira), uma de cada lado, com a roldana na posição mais
# alta da Life Fitness Signature Series Adjustable Cable Crossover (carrinho de 7" a 76" do chão: 1,93 m), viradas pra pessoa
# (`frente` pro meio; o garfo gira até ~23°), as roldanas a ±1,345 m do meio (a máquina tem 381 cm de ponta a ponta e a
# roldana fica 0,56 m pra dentro do fundo da pilha) e a coluna com 2,39 m (a altura da máquina), na linha dos ombros
# (POLIA_Y). Um puxador D (equip3d.puxador_polia, pegador de 25 mm) em cada mão, com o polegar novo em volta do pegador; o aro
# gira em volta do pegador e fica no plano do cabo.
# Corpo: base escalonada (pé direito à frente, os 2 chapados, cada um embaixo do seu quadril), joelhos levemente dobrados,
# tronco INCLINA° à frente dobrando no quadril (coluna neutra, cabeça na linha do tronco) — tudo parado. Cada braço é UMA
# peça girando num plano só (em volta de n = a0 × a1, o eixo do "abraço"): de a0 (aberto pro lado, na horizontal) até a1 (pra
# baixo, à frente e um pouco pra dentro); o antebraço dobra COTOVELO° pro lado em que o braço anda (o cotovelo aponta pra
# cima/pra trás no começo e pro lado no fim, sem mexer) e a mão fica reta no antebraço com a palma virada pra onde o braço
# anda (empurra o puxador: pra frente/baixo no começo, uma pra outra no fim). O plano do fim sai de uma conta (bisseção) que
# deixa os 2 pegadores a VAO_FIM um do outro: as mãos quase se encostam, sem cruzar. Braço e mão como no crucifixo com
# halteres (cenas/crucifixo_com_halteres.py) e na elevação lateral na polia; pernas e tronco como no tríceps francês
# unilateral na polia baixa (base escalonada).
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
JOELHO = 12.0                  # flexão média dos joelhos (graus), parada
INCLINA = 15.0                 # tronco à frente da vertical (graus), dobrando no quadril (coluna neutra), parado
RECUA = 0.02                   # articulações do quadril atrás do y = 0 (m): o peso fica no meio da base
COTOVELO = 15.0                # flexão do cotovelo (graus), parada o movimento todo
ELEVA = (90.0, 64.0)           # braço × "pra baixo" do tronco no começo → no fim (graus): 90 = na horizontal, pro lado
PLANO0 = 0.0                   # começo: o braço no plano dos ombros (0 = pro lado; − = atrás do tronco)
VAO_FIM = 0.078                # fim: distância entre os eixos dos 2 pegadores (m) — as mãos quase se encostam
POLIA_X, POLIA_Y, POLIA_Z, ALTO = 1.345, -0.10, 1.93, 2.39   # roldanas (±X), na linha dos ombros; coluna de 2,39 m
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
    joelhos com a flexão média JOELHO (como no tríceps francês unilateral na polia baixa). Devolve a altura do quadril."""
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

    # fim: o plano do braço que deixa os 2 pegadores a VAO_FIM um do outro, de lado a lado (as mãos quase se encostam, sem
    # cruzar): a distância com sinal (+ = sem cruzar) cai sempre que o plano aumenta
    para_esquerda = -eixos_tronco(rig)[1]

    def dist_fim(plano1):
        g = {lado: geometria(rig, lado, s, plano1) for lado, s in LADOS}
        return (vao(g["Left"], "Left", 1.0)[2] - vao(g["Right"], "Right", 1.0)[2]).dot(para_esquerda)

    plano1 = _bissecao(dist_fim, 80.0, 115.0, VAO_FIM)
    for lado, s in LADOS:
        geo[lado] = geometria(rig, lado, s, plano1)
        print("ARCO %s: de (%.0f°, %.0f°) a (%.0f°, %.1f°) | %.1f° em volta de (%.2f %.2f %.2f)" % (
            lado, ELEVA[0], PLANO0, ELEVA[1], plano1, geo[lado]["TH"], *geo[lado]["n"]))

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
        """t=0 braços abertos na horizontal, t=1 as mãos se encontram na frente do quadril."""
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
            pose.cabo[lado] = math.degrees(math.asin(max(-1.0, min(1.0, u.z))))
            pose.ante_cabo[lado] = math.degrees((E - W).angle(u))

    pose.dedos, pose.desvio, pose.cabo, pose.ante_cabo = {}, {}, {}, {}

    pose(0.5)                                     # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("CROSSOVER t=%.1f | cotovelo E %.0f° D %.0f° | ombro E %.0f° D %.0f° | vão E (%.3f %.3f %.3f) D (%.3f %.3f %.3f)"
              " | mãos a %.0f mm | cabo E %.1f° D %.1f° acima da horizontal | garfo E %.1f° D %.1f° | antebraço × cabo E %.0f°"
              " D %.0f° | técnica %s" % (
                  t, jt["cotoveloE"], jt["cotoveloD"], jt["ombroE"], jt["ombroD"], *juntas("Left", t)[2],
                  *juntas("Right", t)[2], vao_entre_maos() * 1000, pose.cabo["Left"], pose.cabo["Right"],
                  pol["Left"].giro, pol["Right"].giro, pose.ante_cabo["Left"], pose.ante_cabo["Right"],
                  ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))

    def info():
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | cabo E %.1f° D %.1f° acima da horizontal | "
                              "garfo E %.1f° D %.1f° | antebraço × cabo E %.0f° D %.0f° | cabo E %.3f D %.3f m | "
                              "polegar E %s D %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.cabo.get("Left", 0), pose.cabo.get("Right", 0),
            pol["Left"].giro, pol["Right"].giro, pose.ante_cabo.get("Left", 0), pose.ante_cabo.get("Right", 0),
            pol["Left"].comprimento, pol["Right"].comprimento, pose.dedos.get("Left", {}).get("Thumb"),
            pose.dedos.get("Right", {}).get("Thumb"))

    pegs = [(lado, ck.Barra(pux[lado].pegador, raio=RAIO, meio_compr=pux[lado].meia)) for lado, _ in LADOS]
    equip = []
    for lado, _ in LADOS:
        equip += pux[lado].raizes + [pol[lado].roldana, pol[lado].cabo]
    # As 2 torres (paradas, a mais de 0,4 m do corpo) vão em `apoios`, como a da elevação lateral na polia: a checagem do peso ×
    # corpo amostra a superfície de cada equipamento a cada 8 mm, e os triângulos compridos da carenagem da pilha (1,875 m, com
    # o chanfro) viram ~1 milhão de pontos por torre (3,3 min por quadro com as 2, sonda de 08/10/2026). Como apoio, o corpo é
    # medido contra elas só perto delas (corpo_no_apoio) e com afunda 0 mm: nada do corpo pode entrar nelas. A roldana que gira
    # e o cabo continuam equipamento (nada encosta neles).
    return Cena(pose, equip, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.1),
                camera_video=((2.6, -4.4, 1.6), (0, -0.2, 1.05), 50), info=info,
                apoios=[pol[lado].torre for lado, _ in LADOS], afunda_apoio_mm=0.0)
