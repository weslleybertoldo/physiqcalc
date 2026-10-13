# Crucifixo Invertido na Polia — cena da fábrica 3D (lote 12, 11/10/2026; exercício novo do banco, troca equivalente em 4 treinos
# prontos). t = 0 começo: em pé, os braços na frente, na altura dos ombros, os cotovelos quase retos e apontando pros lados, as
# mãos na frente do peito (pegada neutra, polegar pra cima) e os 2 cabos, que vêm das polias do lado OPOSTO, se cruzando na frente
# delas · t = 1 fim: os braços abertos em "T", as mãos na linha dos ombros (palmas pra frente), as escápulas aproximadas; os cabos
# se cruzam na frente do rosto.
# Técnica: free-exercise-db, Cable Rear Delt Fly (o fonte_en do catálogo, domínio público): polias acima da cabeça ("The pulleys
# should be above your head."), cabos cruzados ("Grab the left pulley with your right hand and the right pulley with your left hand,
# crossing them in front of you. This will be your starting position."), os braços vão pra trás e pra fora quase retos ("Initiate
# the movement by moving your arms back and outward, keeping your arms straight as you execute the movement.") e param no fim
# ("Pause at the end of the motion before returning the handles to the start position."). ACE, Reverse Fly (nº 353): em pé no meio
# das 2 polias, cabos cruzados ("stand so that each pulley is on either side of the body. With the left hand, grab the handle from
# the pulley on the right side of the body. With the right hand, grab the pulley on the left"), costas retas e pés no chão ("Keep
# the back straight, press the feet into the floor"), abre até os braços ficarem em linha reta ("spread both arms apart until they
# are in a straight line") e volta devagar ("Pause before slowly returning to the starting position."). ExRx, Cable Reverse Fly
# (CBStandingReverseFly; na cópia de 2026, Cable Isolateral Reverse Fly): puxador de alça em cada mão ("Grasp stirrup cable
# attachment in each hand."), cotovelos pros lados, braços retos ou levemente dobrados ("Point elbows outward with arms straight or
# slightly bent."), cotovelo parado ("maintaining stiff elbow position throughout exercise") e o braço na horizontal, na altura do
# ombro ("Upper arms should travel in horizontal path at shoulder height (not downward) to minimize Latissimus Dorsi
# involvement."). ACE, Incline Reverse Fly (nº 34): escápulas juntas no fim ("Squeeze your scapulae (shoulder blades) together as
# you reach the end position."). Pegada neutra: Schoenfeld e colegas 2013 (J Strength Cond Res 27(10):2644-9: "performing exercise
# on the reverse fly machine with a neutral hand position significantly increases activity of the posterior deltoid and
# infraspinatus muscles compared with a PRO hand position"); ACE, Kneeling Reverse Fly (nº 128, no cabo): "Grip the handles with a
# closed, neutral grip (thumbs wrapped around the handles and palms facing each other)". Postura em pé: NSCA (Achievable CSCS,
# Dumbbell lateral raise): "Stand with feet shoulder- or hip-width apart, knees slightly flexed, torso erect, shoulders back, and
# eyes focused ahead."
# Montagem: a estação do Cross-over na Polia (cenas/cross_over_na_polia.py): 2 polias com o garfo que gira (equip3d.polia(gira=
# True)), uma de cada lado, a ±1,345 m do meio, com a coluna de 2,39 m e o carrinho na posição mais ALTA da Life Fitness Signature
# Series Adjustable Cable Crossover (76" = 1,93 m, ~20 cm acima do topo da cabeça), viradas pro meio (`frente`); a pessoa fica no
# meio e ATRÁS da linha das roldanas (POLIA_Y: as roldanas 1,3 m à frente dos ombros, o "Take a large step backwards" da
# Physitrack): as ferragens dos 2 puxadores se cruzam num "X" aberto na frente das mãos no começo e os cabos na frente do rosto no
# fim (≥ 24 cm dele); mais perto da linha, o aro e o mosquetão de uma mão encostavam nos da outra no começo da abertura. Um puxador D (equip3d.puxador_polia, pegador de 25 mm) em cada mão — a mão DIREITA no cabo da polia
# ESQUERDA e vice-versa —, com o polegar novo em volta do pegador; o aro gira em volta do pegador e fica no plano do cabo.
# Corpo: em pé, pés paralelos na largura do quadril (cada pé embaixo do seu quadril), chapados, joelhos levemente dobrados (JOELHO°)
# e o tronco ereto (INCLINA°), tudo parado. Cada braço é UMA peça (como no Crucifixo Invertido na Máquina): o braço BAIXA° abaixo da
# horizontal, o antebraço dobrado COTOVELO° pro lado em que o braço fecha (no mesmo plano), a palma virada pra esse lado (pegada
# neutra), e o braço todo gira em volta da vertical do ombro, de PSI0 (na frente: as mãos a VAO0 uma da outra) a PSI1 (as mãos na
# linha dos ombros). As escápulas fecham no fim (clavícula girando RETRAI° pra trás em volta da vertical, como na Máquina). A mão
# direita fica ~5 cm mais alta que a esquerda o movimento todo (BAIXA de cada lado): escolha da cena — com as 2 na mesma altura os 2
# cabos, que se cruzam bem no meio, se encostariam (e, no começo, os mosquetões); nenhuma fonte manda.
import math
import numpy as np
import bpy
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
OUTRO = {"Left": "Right", "Right": "Left"}
X_PE = 0.11                    # tornozelos a ±11 cm do meio: cada pé embaixo do seu quadril (pés na largura do quadril)
Y_PE = -0.01                   # tornozelos (m), os 2 na mesma linha: base paralela
JOELHO = 8.0                   # flexão média dos joelhos (graus), parada ("knees slightly flexed", NSCA)
INCLINA = 0.0                  # tronco ereto (graus à frente da vertical), parado ("torso erect", NSCA; "Keep the back straight", ACE)
RECUA = 0.0                    # articulações do quadril em y = 0 (m), em cima da base
COTOVELO = 10.0                # flexão do cotovelo (graus), parada ("keeping your arms straight", fonte_en; "arms straight or
                               # slightly bent" + "stiff elbow position", ExRx)
BAIXA = {"Left": 5.0, "Right": 0.0}   # braço inteiro abaixo da horizontal (graus): na altura do ombro ("horizontal path at shoulder
                                      # height", ExRx); a mão direita ~5 cm mais alta que a esquerda: logo no começo da abertura a
                                      # bola do cabo da mão de baixo passa por baixo do mosquetão da de cima (com ~4 cm encostavam)
VAO0 = 0.28                    # começo: distância de lado a lado entre os eixos dos 2 pegadores (m) — com 0,26 o aro de uma mão
                               # encostava no mosquetão da outra (o aro e o mosquetão de cada mão apontam pro meio)
RETRAI = 6.0                   # fim: clavícula RETRAI° pra trás em volta da vertical — as escápulas aproximam (ACE, Incline
                               # Reverse Fly: "Squeeze your scapulae (shoulder blades) together as you reach the end position.")
POLIA_X, POLIA_Y, POLIA_Z, ALTO = 1.345, -1.30, 1.93, 2.39  # roldanas (±X), 1,3 m à frente dos ombros (a pessoa um passo largo
                                                            # atrás da linha delas: "Take a large step backwards", Physitrack)
MAO = {L: tuple([L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]) for L, _ in LADOS}
Z = Vector((0.0, 0.0, 1.0))


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


def escapula_do_quadro(t):
    """Quanto as escápulas fecharam no quadro t (0 → 1): mais no fim (o "squeeze" no fim da abertura, ACE)."""
    return t * t


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _segmentos(p1, q1, p2, q2):
    """Menor distância (m) entre os segmentos p1–q1 e p2–q2 (amostrando um deles a cada 2 mm)."""
    p1, q1 = np.array(p1), np.array(q1)
    n = max(2, int(np.linalg.norm(q1 - p1) / 0.002))
    pts = p1 + np.outer(np.linspace(0.0, 1.0, n), q1 - p1)
    return float(_dist_segmento(pts, p2, q2).min())


def pernas_e_tronco(bon):
    """Base paralela com os 2 pés chapados, cada um embaixo do seu quadril: pernas por IK (alvos nascem no tornozelo de repouso —
    alvo = polo dá NaN —, polos à frente dos joelhos), tronco INCLINA° no quadril e o quadril na altura que deixa os joelhos com a
    flexão média JOELHO (como no Cross-over na Polia). Devolve a altura do quadril."""
    rig = bon.rig
    PB = rig.pose.bones
    pernas, tornozelos = {}, {}
    for lado, s in LADOS:
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo = p3.vazio("polo_joelho_" + lado, (s * (X_PE + 0.03), Y_PE - 1.0, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polo)
        p3.travar_rotacao(rig, lado + "Foot")              # pés chapados, apontando pra frente
    z_tz = p3.cabeca(rig, "LeftFoot").z
    alvo = {lado: Vector((s * X_PE, Y_PE, z_tz)) for lado, s in LADOS}

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

    z_q = 0.92
    for _ in range(2):
        _pernas(z_q)
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            print("polo joelho", lado, "erro %.3f ang %d" % e)
        z_q = _bissecao(_joelho_medio, 0.85, 0.935, JOELHO)
    _pernas(z_q)
    j = ck.medir_juntas(rig)
    print("PERNAS quadril z %.3f | joelho E %.1f° D %.1f° | tronco %.1f°" % (
        z_q, j["joelhoE"], j["joelhoD"], ck.angulo_chave(rig, {"medida": "tronco"})[0]))
    return z_q


def modelo(s, psi, baixa):
    """Braço, antebraço e palma (unitários, mundo) do lado s com o braço girado psi graus em volta da vertical do ombro (0 = pro
    lado, 90 = pra frente, > 90 = cruzando um pouco pra dentro), o braço todo `baixa` graus abaixo da horizontal: o antebraço dobra
    COTOVELO° pro lado em que o braço fecha, no mesmo plano, e a palma fica virada pra esse lado (⟂ ao antebraço) — pegada neutra,
    o polegar pra cima."""
    lat, fr = Vector((s, 0.0, 0.0)), Vector((0.0, -1.0, 0.0))
    ps, eb, fi = math.radians(psi), math.radians(baixa), math.radians(COTOVELO)
    h = lat * math.cos(ps) + fr * math.sin(ps)          # braço visto de cima
    f = -lat * math.sin(ps) + fr * math.cos(ps)         # pra onde o braço anda fechando (horizontal, ⟂ a h)
    b = h * math.cos(eb) - Z * math.sin(eb)
    a = b * math.cos(fi) + f * math.sin(fi)
    p = -b * math.sin(fi) + f * math.cos(fi)
    return b, a, p


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                 # mão de referência do pegador de 25 mm (antes do Maos)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    pernas_e_tronco(bon)
    maos = Maos(bon, RAIO, polegar_modo="volta")  # polegar novo: dá a volta no pegador
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length
    pol, pux = {}, {}
    for lado, s in LADOS:                         # polia de cada lado (a do lado esquerdo, +X, vai pra mão DIREITA)
        sg = SIGLA[lado]
        pol[lado] = e3.polia("polia_" + sg, x=s * POLIA_X, y=POLIA_Y, altura=POLIA_Z, frente=(-s, 0, 0), alto=ALTO, gira=True)
        pux[lado] = e3.puxador_polia("puxador_" + sg, raio=RAIO)   # puxador da mão `lado`

    # ── escápulas: cada clavícula gira em volta da vertical que passa na base dela (+ = pra trás: aproxima as escápulas) ──────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}

    def escapulas(graus):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        if graus:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * graus), 3, "Z"))

    escapulas(RETRAI)
    S1 = {L: c(L + "Arm") for L, _ in LADOS}      # articulação do ombro com as escápulas fechadas (fim)
    jj = ck.posicoes(rig)
    esc1 = ck.tc.escapula_frente(jj)
    escapulas(0.0)
    S0 = {L: c(L + "Arm") for L, _ in LADOS}
    print("ESCÁPULAS | soltas %s mm | fechadas %.0f°: %s mm, o ombro E anda (%.1f %.1f %.1f) mm" % (
        "/".join("%.1f" % v for v in ck.tc.escapula_frente(ck.posicoes(rig))), RETRAI, "/".join("%.1f" % v for v in esc1),
        *((S1["Left"] - S0["Left"]) * 1000)), flush=True)

    def juntas_braco(L, s, psi, S):
        b, a, p = modelo(s, psi, BAIXA[L])
        E = S + b * Lb
        return b, a, p, E, E + a * La

    def polo(S, E, W):
        eixo = (W - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        return E + fora.normalized() * 0.4

    # vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo: punho reto) — sai da mão, não do modelo
    off_local = {}
    for L, s in LADOS:
        b, a, p, E, W = juntas_braco(L, s, 45.0, S0[L])
        maos.segurar(L, W + a * 0.09, a, p, polo=polo(S0[L], E, W))
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.segurar(L, W + a * 0.09, a, p, polo=polo(S0[L], E, W))
        off = (p3.mundo_osso(rig, L + "Hand") @ maos.furo[L]) - c(L + "Hand")   # o vão de verdade (não o alvo pedido)
        lat = a.cross(p)
        off_local[L] = (off.dot(a), off.dot(p), off.dot(lat))
        print("REF %s | polo do cotovelo erro %.3f ang %d | vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão "
              "%.1f mm" % (L, e[0], e[1], *off_local[L], maos.erro[L] * 1000), flush=True)

    def vao(L, s, psi, S):
        b, a, p, E, W = juntas_braco(L, s, psi, S)
        o = off_local[L]
        return W + a * o[0] + p * o[1] + a.cross(p) * o[2], a, p, E, W

    # começo: o giro em que os 2 pegadores ficam a VAO0 um do outro, de lado a lado (escápulas soltas)
    PSI0 = {L: _bissecao(lambda psi: s * vao(L, s, psi, S0[L])[0].x, 60.0, 130.0, VAO0 / 2) for L, s in LADOS}
    # fim: o giro em que o pegador fica na linha do ombro (escápulas fechadas): "until they are in a straight line" (ACE)
    PSI1 = {L: _bissecao(lambda psi: vao(L, s, psi, S1[L])[0].y - S1[L].y, -40.0, 30.0, 0.0) for L, s in LADOS}
    for L, _ in LADOS:
        print("ARCO %s: de %.1f° a %.1f° (%.1f°) em volta da vertical do ombro, braço %.0f° abaixo da horizontal" % (
            L, PSI0[L], PSI1[L], PSI0[L] - PSI1[L], BAIXA[L]), flush=True)

    def pose(t):
        """t=0 braços na frente (as mãos a VAO0 uma da outra), t=1 braços abertos em "T" (as mãos na linha dos ombros)."""
        escapulas(RETRAI * escapula_do_quadro(t))
        for L, s in LADOS:
            S = c(L + "Arm")
            psi = PSI0[L] + (PSI1[L] - PSI0[L]) * t
            gv, a, p, E, W = vao(L, s, psi, S)
            maos.segurar(L, gv, a, p, polo=polo(S, E, W))
            eixo = pg._base(rig, L)[1]                # pegador ao longo dos nós dos dedos (indicador → mínimo)
            P = pol[OUTRO[L]]                         # cabos cruzados: a mão L puxa o cabo da polia do outro lado
            eng = pux[L].por(gv, eixo, P.direcao)
            P.ligar(eng)
            p3.atualizar()
            antes = pose.dedos.get(L, {}).get("Thumb") if t > 0 else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, gv, eixo, RAIO, polegar_antes=antes)
            pose.desvio[L] = (c(L + "ForeArm") - E).length * 1000
            pose.psi[L] = psi
            u = P.direcao(pux[L].ponto_engate)
            pose.cabo[L] = math.degrees(math.asin(max(-1.0, min(1.0, u.z))))
            pose.ante_cabo[L] = math.degrees((E - W).angle(u))

    pose.dedos, pose.desvio, pose.psi, pose.cabo, pose.ante_cabo = {}, {}, {}, {}, {}

    def saida(L):
        """Polia do lado L: de que lado da roldana o cabo sai (ângulo da saída medido do ponto mais baixo da roldana, + = pro
        lado do engate, − = pro lado do cabo que desce pelo trilho) e a folga do cabo até as chapas e a ponte do garfo (mm)."""
        P = pol[L]
        n = (P.saida - P.centro) / P.raio
        f = P.centro - P.eixo_giro
        f = Vector((f.x, f.y, 0.0)).normalized()
        ang = math.degrees(math.atan2(n.dot(f), -n.z))
        lado = abs(n.dot(f.cross(Z)))
        eng = pux[OUTRO[L]].ponto_engate
        pts = np.concatenate([ck._amostras(*ck._avaliar_simples(bpy.data.objects["polia_%s%s" % (SIGLA[L], k)]), 0.002)
                              for k in ("_chapa+1", "_chapa-1", "_ponte")])
        folga = float(_dist_segmento(pts, P.saida, eng).min()) * 1000 - 3.0
        return ang, lado * 1000, folga

    def info():
        jt = ck.medir_juntas(rig)
        cab = {L: (pol[L].saida, pux[OUTRO[L]].ponto_engate) for L, _ in LADOS}
        cxc = (_segmentos(*cab["Left"], *cab["Right"]) - 0.006) * 1000
        sd = {L: saida(L) for L, _ in LADOS}
        return maos.info() + (" | braço %.1f/%.1f° (0 = pro lado) | cotovelo %.1f/%.1f° fora do calculado %.1f/%.1f mm | cabo da "
                              "mão E %.1f° D %.1f° acima da horizontal | antebraço × cabo E %.0f° D %.0f° | cabo × cabo %.1f mm | "
                              "garfo E %.1f° D %.1f° | saída do cabo E %+.1f° D %+.1f° do fundo da roldana (fora do plano %.2f/%.2f "
                              "mm) | cabo × garfo E %.1f D %.1f mm | cabo E %.3f D %.3f m | polegar E %s D %s") % (
            pose.psi.get("Left", 0), pose.psi.get("Right", 0), jt["cotoveloE"], jt["cotoveloD"], pose.desvio.get("Left", 0),
            pose.desvio.get("Right", 0), pose.cabo.get("Left", 0), pose.cabo.get("Right", 0), pose.ante_cabo.get("Left", 0),
            pose.ante_cabo.get("Right", 0), cxc, pol["Left"].giro, pol["Right"].giro, sd["Left"][0], sd["Right"][0],
            sd["Left"][1], sd["Right"][1], sd["Left"][2], sd["Right"][2], pol["Left"].comprimento, pol["Right"].comprimento,
            pose.dedos.get("Left", {}).get("Thumb"), pose.dedos.get("Right", {}).get("Thumb"))

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

    pose(0.5)                                     # polo certo do cotovelo no meio do movimento
    for L, _ in LADOS:
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jj = ck.posicoes(rig)
        print("CRUCIFIXO INVERTIDO t=%.1f | mãos a %.0f mm | pegadores E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) | escápula %s mm | %s | "
              "técnica %s" % (t, vao_entre_maos() * 1000, *pux["Left"].pegador.matrix_world.to_translation(),
                              *pux["Right"].pegador.matrix_world.to_translation(),
                              "/".join("%.1f" % v for v in ck.tc.escapula_frente(jj)), info(), ck.tc.texto(ck.tc.medir(jj))),
              flush=True)

    pegs = [(L, ck.Barra(pux[L].pegador, raio=RAIO, meio_compr=pux[L].meia)) for L, _ in LADOS]
    equip = []
    for L, _ in LADOS:
        equip += pux[L].raizes + [pol[L].roldana, pol[L].cabo]
    # As 2 torres (paradas, longe do corpo) vão em `apoios`, como no Cross-over na Polia: a checagem do peso × corpo amostra a
    # superfície de cada equipamento a cada 8 mm e a carenagem da pilha vira ~1 milhão de pontos por torre; como apoio, o corpo é
    # medido contra elas só perto delas (corpo_no_apoio), com afunda 0 mm. A roldana que gira e o cabo continuam equipamento.
    montar.pose, montar.pol, montar.pux, montar.maos = pose, pol, pux, maos      # pra sonda (exp/) medir à parte
    return Cena(pose, equip, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.3, 1.2),
                camera_video=((2.4, 3.6, 2.0), (0, -0.35, 1.25), 50), info=info,
                apoios=[pol[L].torre for L, _ in LADOS], afunda_apoio_mm=0.0)
