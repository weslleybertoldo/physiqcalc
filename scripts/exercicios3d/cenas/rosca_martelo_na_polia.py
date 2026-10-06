# Rosca Martelo na Polia — cena da fábrica 3D (lote 3, 05/10/2026; exercício do treino do Weslley).
# t = 0 começo: braços quase estendidos, mãos com a corda na frente das coxas · t = 1 fim: cotovelos dobrados, antebraços
# bem acima da horizontal, mãos na altura dos ombros.
# Técnica (ExRx, Cable Hammer Curl): corda com as palmas viradas uma pra outra ("Grasp cable rope with palms facing
# inward"), em pé com os braços estendidos ("Stand upright with arms straight down to sides"), cotovelos ao lado do corpo
# e a corda sobe pra frente e pra cima até o fim da flexão ("With elbows to side, raise rope forward and upward with both
# arms until forearms are vertical"), desce até os braços estenderem ("Lower until arms are fully extended"); de frente
# pra polia BAIXA, perto dela (ExRx, Cable Curl: "Grasp low pulley cable bar"; "Stand close to pulley"). Pés na largura
# dos ombros e joelhos um pouco dobrados (CSCS/NSCA, Hammer curl: "Stand with your feet shoulder-width apart and your knees
# slightly flexed"), tronco e braços parados (CSCS, Barbell biceps curl: "Keep your torso and upper arms stationary"),
# punho reto (ACE, Hammer Curl: "Maintain a neutral wrist position").
# Montagem: roldana baixa (0,22 m) na frente da pessoa e na linha dela, a 0,62 m do meio do corpo (as pontas dos pés a ~41 cm
# do eixo dela); o cabo sobe da roldana até o gancho da corda, entre as pernas e na frente delas. Braço PARADO junto da
# lateral do tronco (13° à frente e 1,5° aberto, pro cotovelo encostar na lateral sem entrar nela); só o cotovelo mexe, de
# 18° a 128°, punho reto. As mãos ficam a 28 cm uma da outra o movimento todo (na frente das coxas embaixo, presas pela
# corda): pra isso o braço gira um pouco em volta dele mesmo (rotação do ombro; o cotovelo não sai do lugar) — o plano do
# antebraço fica ~29–35° pra dentro embaixo e ~8–10° do meio pra cima.
# Corda com pegada neutra: a corda entra na mão pelo lado do dedo mínimo (vem do gancho, embaixo) e o batente fica do lado
# do POLEGAR, em cima da mão (equip3d.corda_polia com a direção da corda invertida em relação ao tríceps na polia alta);
# polegar dando a volta na corda (o polegar novo).
# Pernas como no tríceps pulley (cenas/triceps_pulley.py); braço parado e antebraço girando no cotovelo com a mão neutra
# como no tríceps na polia alta em pé (cenas/triceps_testa_na_polia_alta_em_pe.py); a pegada neutra é a da rosca martelo
# com halteres (cenas/rosca_martelo_com_halteres.py).
import math
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO = 0.014                   # corda de 28 mm (equip3d.corda_polia)
JOELHO = 15.0                  # joelhos levemente dobrados (graus), parados o movimento todo
BRACO_FRENTE = 13.0            # braço à frente da vertical do tronco (graus), parado: com 10–12° (e sem abrir) o braço
                               # entrava 3–6 mm no tronco perto da axila
ABRE = 1.5                     # braço aberto pro lado (graus), parado: o cotovelo encosta na lateral do tronco sem entrar
LARGURA = 0.28                 # distância entre os vãos das mãos (m), a mesma o movimento todo: a corda segura as duas mãos
                               # na frente das coxas embaixo, e elas sobem na mesma largura; o braço gira um pouco em volta
                               # dele mesmo pra isso (rotação do ombro: o cotovelo não sai do lugar) — o plano do antebraço
                               # fica inclinado pra dentro ~29–35° embaixo e ~8–10° do meio pra cima
COTOVELO = (18.0, 128.0)       # flexão do cotovelo no começo → no fim (graus): embaixo quase estendido, com as mãos na frente
                               # das coxas e a ponta da corda a ≥ 4 cm delas (com 16° e o braço a 10° ficava a 5 mm); em cima
                               # as mãos na altura das articulações dos ombros, antebraço ~50° acima da horizontal
POLIA_Y, POLIA_Z, ALTO = -0.62, 0.22, 2.15   # eixo da roldana baixa (na frente da pessoa) e altura da coluna
LADOS = (("Left", 1), ("Right", -1))


def pernas(bon):
    """Joelhos levemente dobrados com os pés chapados (como no tríceps pulley): tornozelos fixos, o quadril desce o que
    precisar pra flexão pedida."""
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


def geometria_bracos(rig, frente_g=None, abre=None):
    """Braço parado no referencial do tronco (tecnica3d.eixos_tronco), com as pernas já postas. Por lado: a = ombro →
    cotovelo (unitário) e E = cotovelo; plano(lado, dentro) = (d, palma): d = pra onde o antebraço dobra (⟂ a: pra frente
    e `dentro` graus pro meio) e palma = normal do plano do antebraço virada pro meio (pegada neutra). O antebraço com o
    cotovelo a b graus de flexão aponta pra a·cos b + d·sen b; o polegar fica do lado de −a·sen b + d·cos b (pra cima com
    o antebraço na horizontal). Mudar `dentro` = girar o braço em volta dele mesmo (o cotovelo fica no lugar)."""
    frente_g = BRACO_FRENTE if frente_g is None else frente_g
    abre = ABRE if abre is None else abre
    c = lambda n: p3.cabeca(rig, n)
    cima = (c("Neck") - c("Hips")).normalized()
    lado_v = c("RightArm") - c("LeftArm")
    lado_v = (lado_v - cima * lado_v.dot(cima)).normalized()
    frente = cima.cross(lado_v)
    g = dict(S={l: c(l + "Arm") for l, _ in LADOS}, Lb=(c("LeftForeArm") - c("LeftArm")).length,
             La=(c("LeftHand") - c("LeftForeArm")).length, a={}, E={}, meio={})
    fi, ka = math.radians(frente_g), math.radians(abre)
    for lado, s in LADOS:
        meio = lado_v * s                                 # pro meio do corpo
        sag = -cima * math.cos(fi) + frente * math.sin(fi)
        a = (sag * math.cos(ka) - meio * math.sin(ka)).normalized()
        g["a"][lado], g["meio"][lado] = a, meio
        g["E"][lado] = g["S"][lado] + a * g["Lb"]         # cotovelo parado o movimento todo

    def plano(lado, dentro):
        a, meio = g["a"][lado], g["meio"][lado]
        ps = math.radians(dentro)
        q = frente * math.cos(ps) + meio * math.sin(ps)
        d = (q - a * q.dot(a)).normalized()
        n = a.cross(d)
        return d, (n if n.dot(meio) > 0 else -n)

    g["plano"] = plano
    return g


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                # mão de referência da corda de 28 mm (antes do Maos)
    rig = bon.rig
    pernas(bon)
    c = lambda n: p3.cabeca(rig, n)
    g = geometria_bracos(rig)
    S, a, E, Lb, La, plano = g["S"], g["a"], g["E"], g["Lb"], g["La"], g["plano"]

    def mao(lado, b, dentro=None):
        """Dedos (na linha do antebraço: punho reto), palma e o lado da mão, com o cotovelo a `b` graus de flexão e o plano
        do antebraço `dentro` graus pra dentro (padrão: o que deixa as mãos na LARGURA, dentro_em)."""
        d, palma = plano(lado, dentro_em(lado, b) if dentro is None else dentro)
        r = math.radians(b)
        dq = a[lado] * math.cos(r) + d * math.sin(r)
        pq = (palma - dq * palma.dot(dq)).normalized()
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
        dq, pq, lat = mao(lado, B_REF, dentro=10.0)
        W = E[lado] + dq * La
        maos.segurar(lado, W + dq * 0.09, dq, pq, polo=polo(lado, E[lado], W))
        off = (W + dq * 0.09) - c(lado + "Hand")
        off_local[lado] = (off.dot(dq), off.dot(pq), off.dot(lat))
        print("REF %s: vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão %.1f mm" % (
            lado, *off_local[lado], maos.erro[lado] * 1000))

    def vao(lado, b, dentro):
        """Punho W e vão da mão (ponto do eixo da corda no meio da mão) com o cotovelo a `b` graus e o plano do antebraço
        `dentro` graus pra dentro."""
        dq, pq, lat = mao(lado, b, dentro)
        W = E[lado] + dq * La
        o = off_local[lado]
        return W, W + dq * o[0] + pq * o[1] + lat * o[2]

    def dentro_em(lado, b):
        """Inclinação do plano do antebraço pra dentro (graus) que põe o vão da mão a LARGURA/2 do meio do corpo."""
        s = 1 if lado == "Left" else -1
        alvo = s * LARGURA / 2
        f = lambda x: s * (vao(lado, b, x)[1].x - alvo)        # > 0: mão longe do meio (falta inclinar pra dentro)
        lo, hi = -10.0, 70.0
        if f(lo) < 0 or f(hi) > 0:
            raise ValueError("rosca martelo: sem inclinação que ponha a mão %s a %.3f m do meio com o cotovelo a %.0f°"
                             % (lado, LARGURA / 2, b))
        for _ in range(40):
            m = (lo + hi) / 2
            if f(m) > 0:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    def juntas(b):
        out = {}
        for lado, _ in LADOS:
            dq, pq, lat = mao(lado, b)
            W = E[lado] + dq * La
            o = off_local[lado]
            out[lado] = (W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq)
        return out

    pol = e3.polia("polia", x=0.0, y=POLIA_Y, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)
    corda = e3.corda_polia("corda", raio=RAIO)

    def pose(t):
        """t=0 braços quase estendidos (mãos na frente das coxas), t=1 cotovelos dobrados (mãos na altura dos ombros)."""
        b = p3.lerp(*COTOVELO, t)
        j = juntas(b)
        for lado, _ in LADOS:
            W, g_, dq, pq = j[lado]
            maos.segurar(lado, g_, dq, pq, polo=polo(lado, E[lado], W))
        peg = {}
        for lado, s in LADOS:                     # corda no vão de cada mão, ao longo dos nós dos dedos do mínimo pro
            peg[s] = (j[lado][1], -pg._base(rig, lado)[1])    # indicador: entra pelo lado do mínimo (vem do gancho, embaixo)
        eng = corda.por(peg, pol.direcao)         # e o batente fica do lado do polegar
        pol.ligar(eng)
        p3.atualizar()
        for lado, s in LADOS:                     # dedos e polegar fecham até a pele encostar na corda
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, peg[s][0], peg[s][1], RAIO, polegar_antes=antes)
        pose.desvio = {l: (c(l + "ForeArm") - E[l]).length * 1000 for l, _ in LADOS}
        pose.maos = (peg[1][0] - peg[-1][0]).length * 1000
        pose.entradas = (corda.entradas[1] - corda.entradas[-1]).length * 1000
        u = pol.direcao(corda.juncao)
        pose.cabo = math.degrees(u.angle(Vector((0, 0, -1))))

    pose.dedos = {}
    pose.desvio = {}
    pose.maos = pose.entradas = pose.cabo = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        b = p3.lerp(*COTOVELO, t)
        jt = ck.medir_juntas(rig)
        print("ROSCA MARTELO NA POLIA t=%.1f | plano do antebraço pra dentro E %.1f° D %.1f° | cotovelo E %.0f° D %.0f° | "
              "vãos das mãos a %.0f mm | entradas da corda a %.0f mm | junção (%.3f %.3f %.3f) | cabo × vertical %.1f° | "
              "vão E (%.3f %.3f %.3f) | cotovelo fora do calculado E %.1f D %.1f mm" % (
                  t, dentro_em("Left", b), dentro_em("Right", b), jt["cotoveloE"], jt["cotoveloD"], pose.maos,
                  pose.entradas, *corda.juncao, pose.cabo, *juntas(b)["Left"][1], pose.desvio["Left"],
                  pose.desvio["Right"]))
    print("BRAÇO ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f) | técnica %s" % (
        *S["Left"], *E["Left"], ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | vãos a %.0f mm | entradas da corda a %.0f mm "
                              "| cabo × vertical %.1f° | cabo %.3f m | polegar %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.maos, pose.entradas, pose.cabo,
            pol.comprimento, pol_)

    pegs = [(l, ck.Barra(corda.pontas[s], raio=RAIO, meio_compr=corda.meia)) for l, s in LADOS]
    return Cena(pose, corda.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.0),
                camera_video=((3.6, -2.6, 1.3), (0, -0.25, 1.0), 50), info=info)
