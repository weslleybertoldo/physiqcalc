# Face Pull na Polia — cena da fábrica 3D (lote 6, 08/10/2026; exercício dos treinos prontos do app, 3 usos).
# t = 0 começo: braços esticados à frente do rosto, apontando pra roldana, cotovelos virados pros lados, escápulas soltas ·
# t = 1 fim: cotovelos altos e abertos (na altura dos ombros), escápulas aproximadas, ombros girados pra fora (antebraços
# apontando pra cima), mãos dos lados do rosto e o meio da corda perto do rosto.
# Técnica (NSCA, Exercise Technique Manual for Resistance Training, 3ª ed., Face Pull (Machine)): de frente pra polia, corda
# com pegada pronada fechada, palmas viradas pro chão ("grasp a rope handle with a closed, pronated grip and the palms facing
# the floor"); longe o bastante pro cabo ficar tenso com os braços esticados na frente do rosto e os cotovelos virados pros
# lados ("arms are fully extended in front of the face with the elbows pointing out to the sides"); pés paralelos e joelhos
# dobrados ("parallel foot stance with flexed knees"); cabeça na linha da coluna e tronco ereto. Começa aproximando as
# escápulas com os cotovelos ainda esticados ("first retracting the scapulae with the elbows still fully extended"), puxa
# pro rosto abrindo os braços na horizontal e dobrando os cotovelos e, quando o braço chega perto do plano dos ombros, gira o
# ombro pra fora até o meio da corda chegar perto do rosto ("externally rotate the upper arms and continue the backward
# movement until the center clasp of the handle comes close to the face"); volta pelo mesmo caminho. ExRx (Cable Standing
# Rear Delt Row, with rope): cotovelos na altura dos ombros e braço perpendicular ao tronco ("keeping elbows at shoulder
# height"; "Keep upper arms perpendicular to trunk"), tronco sem ir à frente da vertical.
# Montagem: roldana na altura do rosto (eixo a 1,65 m, um pouco acima dos olhos), na frente da pessoa e na linha dela, a 1,35 m
# do meio do corpo (o cabo fica livre: no começo o gancho fica a ~0,45 m da roldana). Corda de tríceps comum (equip3d.corda_polia,
# 27"): a corda entra na mão pelo lado do polegar e o batente fica do lado do dedo mínimo (pegada pronada, como no tríceps na
# polia alta); polegar dando a volta na corda (o polegar novo). A corda de 27" não deixa as mãos se afastarem mais que ~41 cm
# (vão a vão): no fim as mãos ficam dos lados do rosto e o braço termina um pouco à frente do plano dos ombros.
# Braço: a direção do braço sai de 2 ângulos no referencial do tronco (HORIZ: 0 = pra frente, 90 = pro lado; ELEVA: acima da
# horizontal); o antebraço dobra no plano que gira junto com o braço (começo: pra dentro — cotovelo virado pra fora; meio:
# pra frente) e, com a rotação externa (GIRO), esse plano gira em volta do braço pra cima. A flexão do cotovelo sai de uma
# conta (bisseção) que põe o vão de cada mão na meia largura pedida (LARG) — a corda segura as mãos.
# Pernas como no crucifixo invertido com halteres (pés na largura do quadril, joelhos levemente dobrados, pés chapados), sem
# inclinar o tronco; escápulas como no crucifixo invertido (giro da clavícula em volta do eixo do tronco).
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

RAIO = 0.014                   # corda de 28 mm (equip3d.corda_polia)
JOELHO = 15.0                  # joelhos dobrados (graus), parados o movimento todo
PES_X = 0.14                   # tornozelos a ±PES_X do meio (m): pés na largura do quadril
ESCAPULA = (4.0, -8.0)         # giro da escápula (graus): + protração (braços esticados) → − retração (escápulas aproximadas)
HORIZ = (-5.0, 75.0)           # braço no plano horizontal do tronco (graus): 0 = pra frente, 90 = pro lado, − = cruzando
ELEVA = (12.0, 0.0)            # braço acima da horizontal do tronco (graus): no começo aponta pra roldana
GIRO = (0.0, 55.0)             # rotação externa do ombro (graus): 0 = antebraço no plano horizontal do braço, 90 = pra cima
COTOVELO0 = 5.0                # flexão do cotovelo no começo (graus): esticado sem travar
LARG_FIM = 0.20                # meia largura entre os vãos das mãos no fim (m)
JANELA_ESC = (0.0, 0.40)       # trechos de t em que cada parte mexe: escápulas primeiro (NSCA), depois a puxada, e a
JANELA_REMADA = (0.05, 0.85)   # rotação externa no fim
JANELA_GIRO = (0.40, 1.0)
POLIA_Y, POLIA_Z, ALTO = -1.35, 1.65, 2.15   # eixo da roldana (na frente da pessoa) e altura da coluna
LADOS = (("Left", 1), ("Right", -1))
CABECA_PARTES = ("Head", "Neck")


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def fase(t, janela):
    """0 → 1 dentro da janela de t (ease seno), parado fora dela."""
    t0, t1 = janela
    return p3.suave(min(1.0, max(0.0, (t - t0) / (t1 - t0))))


def pernas(bon):
    """Pés na largura do quadril e joelhos levemente dobrados com os pés chapados (crucifixo invertido, sem inclinar o
    tronco): tornozelos parados a ±PES_X, o quadril desce o que precisar pra flexão pedida."""
    rig = bon.rig
    iks = {}
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.ponta(rig, "LeftLeg") - p3.cabeca(rig, "LeftLeg")).length
    tornoz = p3.ponta(rig, "LeftLeg")
    q = p3.cabeca(rig, "LeftUpLeg")
    for lado, s in LADOS:
        tz = p3.ponta(rig, lado + "Leg")
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * PES_X, tz.y, tz.z)))
        polo_j = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        iks[lado] = p3.ik(rig, lado + "Leg", alvo, polo_j)
        p3.travar_rotacao(rig, lado + "Foot")
    th_j = math.radians(JOELHO)
    d_j = math.sqrt(coxa ** 2 + canela ** 2 + 2 * coxa * canela * math.cos(th_j))     # quadril → tornozelo
    desce = tornoz.z + math.sqrt(max(d_j ** 2 - (q.x - PES_X) ** 2 - (q.y - tornoz.y) ** 2, 0.01)) - q.z
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, desce)))
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)
    j = ck.medir_juntas(rig)
    print("JOELHOS quadril desceu %.1f mm | joelho E %.0f° D %.0f°" % (-desce * 1000, j["joelhoE"], j["joelhoD"]))


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                # mão de referência da corda de 28 mm (antes do Maos)
    rig = bon.rig
    PB = rig.pose.bones
    pernas(bon)
    c = lambda n: p3.cabeca(rig, n)
    # referencial do tronco (parado: só as escápulas mexem) — cima, lado (esquerda → direita) e frente
    cima = (c("Neck") - c("Hips")).normalized()
    lado_v = c("RightArm") - c("LeftArm")
    lado_v = (lado_v - cima * lado_v.dot(cima)).normalized()
    frente = cima.cross(lado_v)
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length

    def escapulas(g):
        """As duas escápulas giram juntas em volta do eixo do tronco: + protração (afastam), − retração (aproximam)."""
        for lado, _ in LADOS:
            PB[p3.P + lado + "Shoulder"].matrix_basis = Matrix()
        p3.atualizar()
        if g:
            for lado, s in LADOS:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))

    def direcoes(s, th, ep, fi):
        """Braço a (ombro → cotovelo), plano do antebraço d (⟂ a) e palma do lado s, com o braço a th graus no plano
        horizontal do tronco (0 = frente, 90 = lado), ep graus acima da horizontal e a rotação externa fi. Sem girar o úmero,
        o plano do antebraço acompanha a abertura horizontal: d0 = pra dentro com o braço pra frente, pra frente com o braço
        pro lado; a rotação externa gira d em volta de a, pra cima. Palma (pegada pronada) = normal do plano (a, d): pro
        chão com o antebraço na horizontal, pra frente com ele em pé."""
        fora = -lado_v * s
        th_, ep_, fi_ = math.radians(th), math.radians(ep), math.radians(fi)
        h = frente * math.cos(th_) + fora * math.sin(th_)
        a = (h * math.cos(ep_) + cima * math.sin(ep_)).normalized()
        d0 = (-fora * math.cos(th_) + frente * math.sin(th_)).normalized()
        e = (d0.cross(a) * s).normalized()
        d = (d0 * math.cos(fi_) + e * math.sin(fi_)).normalized()
        palma = (a.cross(d) * s).normalized()
        return a, d, palma

    def antebraco(a, d, b):
        r = math.radians(b)
        return (a * math.cos(r) + d * math.sin(r)).normalized()

    def polo(S, Ec, W):
        eixo = (W - S).normalized()
        fora = (Ec - S) - eixo * (Ec - S).dot(eixo)
        if fora.length < 1e-6:
            fora = Vector((0, 0, -1))
        return Ec + fora.normalized() * 0.4

    maos = Maos(bon, RAIO, polegar_modo="volta")
    # vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo), numa pose de referência (braço a 45° na
    # horizontal, cotovelo a 60°, sem rotação externa)
    escapulas(0.0)
    off_local = {}
    for lado, s in LADOS:
        S = c(lado + "Arm")
        a, d, palma = direcoes(s, 45.0, 5.0, 0.0)
        f = antebraco(a, d, 60.0)
        E = S + a * Lb
        W = E + f * La
        pq = (palma - f * palma.dot(f)).normalized()
        maos.segurar(lado, W + f * 0.09, f, pq, polo=polo(S, E, W))
        off = (W + f * 0.09) - c(lado + "Hand")
        off_local[lado] = (off.dot(f), off.dot(pq), off.dot(f.cross(pq)))
        print("REF %s: vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão %.1f mm" % (
            lado, *off_local[lado], maos.erro[lado] * 1000))

    def geometria(lado, s, S, th, ep, fi, b):
        """Cotovelo E, punho W, vão da mão, dedos e palma do lado s com a flexão do cotovelo b."""
        a, d, palma = direcoes(s, th, ep, fi)
        f = antebraco(a, d, b)
        E = S + a * Lb
        W = E + f * La
        pq = (palma - f * palma.dot(f)).normalized()
        o = off_local[lado]
        g = W + f * o[0] + pq * o[1] + f.cross(pq) * o[2]
        return E, W, g, f, pq

    def flexao_para(lado, s, S, th, ep, fi, w):
        """Flexão do cotovelo (graus) que põe o vão da mão a w m do meio do corpo (a corda segura as mãos)."""
        fx = lambda b: s * geometria(lado, s, S, th, ep, fi, b)[2].x - w   # > 0: mão longe do meio (falta dobrar)
        lo, hi = 0.0, 150.0
        if fx(lo) < 0 or fx(hi) > 0:
            raise ValueError("face pull: sem flexão do cotovelo que ponha a mão %s a %.3f m do meio (th %.0f ep %.0f fi %.0f)"
                             % (lado, w, th, ep, fi))
        for _ in range(40):
            m = (lo + hi) / 2
            if fx(m) > 0:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    # meia largura das mãos no começo: a do braço esticado (COTOVELO0) apontando pra roldana
    escapulas(ESCAPULA[0])
    LARG0 = geometria("Left", 1, c("LeftArm"), HORIZ[0], ELEVA[0], GIRO[0], COTOVELO0)[2].x
    print("LARGURA das mãos (vão a vão): começo %.0f mm → fim %.0f mm" % (LARG0 * 2000, LARG_FIM * 2000))

    pol = e3.polia("polia", x=0.0, y=POLIA_Y, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)
    corda = e3.corda_polia("corda", raio=RAIO)

    # pontos da cabeça pras folgas (a cabeça e o pescoço não mexem no exercício)
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    cab_pts = co0[np.array([n in CABECA_PARTES for n in nomes0] + [False])[dono0]]
    cab_co, cab_tri = ck._avaliar_simples(bon.cabelo)
    todos_cab = np.concatenate([cab_pts, cab_co])
    bvh_cabelo = BVHTree.FromPolygons([tuple(x) for x in cab_co], [tuple(t) for t in cab_tri], all_triangles=True)
    braco_mao = {l + n for l, _ in LADOS for n in ["ForeArm", "Hand"] + ["Hand%s%d" % (d_, i) for d_ in (
        "Thumb", "Index", "Middle", "Ring", "Pinky") for i in (1, 2, 3)]}
    nariz = Vector(cab_pts[np.argmin(cab_pts[:, 1])])            # ponta do nariz (o ponto mais à frente da cabeça)

    def mao_cabelo():
        """Antebraços e mãos → cabelo (m, sem sinal: o cabelo é uma casca aberta)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = np.array([n in braco_mao for n in nomes] + [False])[dono]
        return min(bvh_cabelo.find_nearest(Vector(v))[3] for v in co[m])

    def folgas_cena():
        """Corda (pernas e gancho) e cabo → pele da cabeça/pescoço + cabelo (m)."""
        J, Ent = corda.juncao, corda.entradas
        pernas_ = min(float(_dist_segmento(todos_cab, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        A = pol.saida
        u = (A - J).normalized()
        gancho_ = float(_dist_segmento(todos_cab, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        cabo_cab = float(_dist_segmento(todos_cab, J + u * corda.engate, A).min()) - 0.003
        return pernas_, gancho_, cabo_cab

    def maos_vao(lado):
        """Vão da mão no quadro (o ponto da corda no meio da mão), tirado do osso da mão já posto."""
        return p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]

    def pose(t):
        """t=0 braços esticados à frente do rosto, t=1 cotovelos altos, ombros girados pra fora e a corda perto do rosto."""
        fe, fr, fg = fase(t, JANELA_ESC), fase(t, JANELA_REMADA), fase(t, JANELA_GIRO)
        escapulas(p3.lerp(*ESCAPULA, fe))
        th, ep, fi = p3.lerp(*HORIZ, fr), p3.lerp(*ELEVA, fr), p3.lerp(*GIRO, fg)
        w = p3.lerp(LARG0, LARG_FIM, fr)
        peg, calc = {}, {}
        for lado, s in LADOS:
            S = c(lado + "Arm")
            b = flexao_para(lado, s, S, th, ep, fi, w)
            E, W, g, f, pq = geometria(lado, s, S, th, ep, fi, b)
            maos.segurar(lado, g, f, pq, polo=polo(S, E, W))
            calc[lado] = (E, b)
        for lado, s in LADOS:                     # corda no vão de cada mão, ao longo dos nós dos dedos (indicador → mínimo):
            peg[s] = (maos_vao(lado), pg._base(rig, lado)[1])  # entra do lado do polegar, o batente fica no mínimo
        eng = corda.por(peg, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        for lado, s in LADOS:                     # dedos e polegar fecham até a pele encostar na corda
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, peg[s][0], peg[s][1], RAIO, polegar_antes=antes)
        pose.desvio = {l: (c(l + "ForeArm") - calc[l][0]).length * 1000 for l, _ in LADOS}
        pose.flexao = {l: calc[l][1] for l, _ in LADOS}
        pose.angulos = (th, ep, fi, w)
        pose.folgas = [x * 1000 for x in folgas_cena()]
        pose.maos = (peg[1][0] - peg[-1][0]).length * 1000
        pose.nariz = (nariz - corda.juncao).length * 1000

    pose.dedos = {}
    pose.desvio = {}
    pose.flexao = {}
    pose.angulos = (0, 0, 0, 0)
    pose.folgas = [0.0] * 3
    pose.maos = pose.nariz = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        u = pol.direcao(corda.juncao)
        print("FACE PULL t=%.1f | horiz %.0f° eleva %.0f° giro %.0f° meia larg %.0f mm | flexão calculada E %.0f° D %.0f° | "
              "vãos a %.0f mm | junção (%.3f %.3f %.3f) a %.0f mm do nariz | cabo × horizontal %.1f° | pernas da corda → "
              "cabeça %.0f mm | gancho → cabeça %.0f mm | cabo → cabeça %.0f mm" % (
                  t, *pose.angulos[:3], pose.angulos[3] * 1000, pose.flexao["Left"], pose.flexao["Right"], pose.maos,
                  *corda.juncao, pose.nariz, math.degrees(math.asin(max(-1.0, min(1.0, u.z)))), *pose.folgas))
        print("    técnica %s" % ck.tc.texto(ck.tc.medir(ck.posicoes(rig))))

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        txt = []
        for lado, _ in LADOS:
            S, E, W = c(lado + "Arm"), c(lado + "ForeArm"), c(lado + "Hand")
            ld = lado[0]
            txt.append("%s: cotovelo %+.0f mm acima do ombro, punho %+.0f mm acima do cotovelo" % (
                ld, (E.z - S.z) * 1000, (W.z - E.z) * 1000))
        return maos.info() + " | " + " | ".join(txt) + (
            " | horiz %.0f° eleva %.0f° giro %.0f° | cotovelo fora do calculado E %.1f D %.1f mm | vãos a %.0f mm | junção a "
            "%.0f mm do nariz | pernas da corda → cabeça %.0f mm | gancho → cabeça %.0f mm | cabo → cabeça %.0f mm | "
            "antebraço/mão → cabelo %.0f mm | cabo %.3f m | polegar %s") % (
            *pose.angulos[:3], pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.maos, pose.nariz, *pose.folgas,
            mao_cabelo() * 1000, pol.comprimento, pol_)

    pegs = [(l, ck.Barra(corda.pontas[s], raio=RAIO, meio_compr=corda.meia)) for l, s in LADOS]
    return Cena(pose, corda.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.3),
                camera_video=((2.7, 3.6, 1.9), (0, -0.3, 1.25), 50), info=info)
