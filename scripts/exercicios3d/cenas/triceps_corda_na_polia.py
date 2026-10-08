# Tríceps Corda na Polia — cena da fábrica 3D (lote 6, 08/10/2026; exercício dos treinos prontos do app).
# t = 0 começo: cotovelos dobrados, antebraços um pouco acima da horizontal, mãos juntas na frente da parte de baixo do peito
# com a corda em pegada neutra · t = 1 fim: cotovelos estendidos (sem travar), mãos afastadas nos lados das coxas, palmas
# viradas pra trás.
# Técnica (ExRx, Cable Pushdown (with rope attachment)): de frente pra polia ALTA, corda com as mãos lado a lado e as palmas
# viradas uma pra outra ("Face high pulley and grasp rope attachment with clinched hands side by side (palms in)"), cotovelos
# ao lado do corpo ("Position elbows to side"), estende pra baixo ("Extend arms down") e vira as palmas pra baixo no fim
# ("Turn palms down at bottom"). Stoppani (Encyclopedia of Muscle & Strength, Human Kinetics), Rope Triceps Pressdown: afasta
# as pontas da corda enquanto estica ("spread the ends of the rope apart for a greater contraction"), girando o antebraço até
# as palmas ficarem pra trás ("pronating the forearms so the palms face back"); começa com a corda na altura do peito e os
# cotovelos colados ("hold the rope at chest level with your elbows tight against your sides"). CSCS/NSCA (com a barra):
# tronco ereto, pés na largura dos ombros e joelhos um pouco dobrados, perto da polia, braços parados e o antebraço paralelo
# ao chão ou um pouco acima no começo; ACE: estende até o fim sem travar, punho neutro.
# Montagem: pernas e tronco como no Tríceps Pulley (cenas/triceps_pulley.py: joelhos a 15°, pés na largura dos ombros, tronco
# ereto); braço PARADO junto da lateral do tronco, um pouco à frente; só o cotovelo mexe, com o antebraço girando num plano
# fixo inclinado pra dentro (as mãos ficam juntas no começo, com o antebraço perto da horizontal, e se afastam sozinhas na
# 2ª metade da extensão, quando o antebraço desce — no fim ficam nos lados das coxas). O antebraço vai da pegada neutra até
# PRONA graus pronado na 2ª metade (as palmas terminam viradas pra trás). A corda entra em cada mão pelo lado do indicador (vem
# do gancho, em cima) e o batente fica do lado do mínimo (o mesmo sentido do Tríceps Testa na Polia Alta em Pé; na Rosca
# Martelo na Polia, com o cabo vindo de baixo, é o contrário); polegar dando a volta na corda (o polegar novo). A mão direita é
# o ESPELHO da esquerda (corda e cabo simétricos, no plano da roldana). Polia alta na frente da pessoa, o mais perto possível
# com o engate da corda sempre atrás do eixo da roldana: o cabo desce a ~11° da vertical no começo e a ~5° no meio.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO = 0.014                   # corda de 28 mm (equip3d.corda_polia)
JOELHO = 15.0                  # joelhos levemente dobrados (graus), parados o movimento todo
BRACO_FRENTE = 14.0            # braço à frente da vertical do tronco (graus), parado: o cotovelo fica ao lado do tronco
ABRE = 2.0                     # braço aberto pro lado (graus), parado: o cotovelo encosta na lateral do tronco sem entrar
COTOVELO = (100.0, 10.0)       # flexão do cotovelo no começo → no fim (graus): começo com o antebraço ~22° acima da
                               # horizontal; fim estendido sem travar
LARGURA0 = 0.13                # distância entre os vãos das mãos no começo (m): as mãos juntas, com ~5 cm entre os punhos
ABRE_DE = 75.0                 # o antebraço começa a girar (pronar) quando o cotovelo passa desse ângulo (graus)
PRONA = 65.0                   # pronação no fim (graus, a partir da pegada neutra): somada aos ~20° do plano inclinado, a
                               # palma termina virada pra trás
POLIA_Z, ALTO = 2.05, 2.30     # eixo da roldana alta e altura da coluna
FOLGA_ROLDANA = 0.012          # o engate da corda fica sempre pelo menos isso atrás do eixo da roldana (m): o cabo sai
                               # sempre do mesmo lado dela (equip3d.Polia.tangente troca de lado se o engate passar do eixo)
DESVIO_SAIDA = 0.002           # a saída do cabo anda no máximo isso de lado na roldana (m): o equip3d.Polia vira o plano do
                               # cabo pro engate, e com o engate quase embaixo do eixo um engate 6 mm fora do meio virava o
                               # plano ~27° e o cabo entrava na flange e no garfo da roldana (medido 08/10/2026)
LADOS = (("Left", 1), ("Right", -1))
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head")
PERNAS = ("LeftUpLeg", "RightUpLeg")


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _suave(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


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
    """Braço parado no referencial do tronco (tecnica3d.eixos_tronco), com as pernas já postas (como na rosca martelo na
    polia). Por lado: a = ombro → cotovelo (unitário) e E = cotovelo; plano(lado, dentro) = (d, palma): d = pra onde o
    antebraço dobra (⟂ a: pra frente e `dentro` graus pro meio) e palma = normal do plano do antebraço virada pro meio
    (pegada neutra). O antebraço com o cotovelo a b graus de flexão aponta pra a·cos b + d·sen b."""
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
    S, a, E, La, plano = g["S"], g["a"], g["E"], g["La"], g["plano"]

    def pronacao(b):
        """Pronação do antebraço (graus a partir da pegada neutra) com o cotovelo a `b` graus de flexão: começa em ABRE_DE e
        chega em PRONA no fim, suave."""
        return PRONA * _suave((ABRE_DE - b) / (ABRE_DE - COTOVELO[1]))

    def mao(lado, b, dentro, prona):
        """Dedos (na linha do antebraço: punho reto), palma e o lado da mão, com o cotovelo a `b` graus, o plano do
        antebraço `dentro` graus pra dentro e o antebraço `prona` graus pronado a partir da pegada neutra (a palma sai de
        virada pro meio e vai pra trás)."""
        d, palma = plano(lado, dentro)
        r = math.radians(b)
        dq = a[lado] * math.cos(r) + d * math.sin(r)
        pn = (palma - dq * palma.dot(dq)).normalized()
        s = 1 if lado == "Left" else -1               # pronação: +giro em volta dos dedos na esquerda, − na direita
        pq = Matrix.Rotation(math.radians(s * prona), 3, dq) @ pn
        return dq, pq, dq.cross(pq)

    def polo(lado, Ec, W):
        eixo = (W - S[lado]).normalized()
        fora = (Ec - S[lado]) - eixo * (Ec - S[lado]).dot(eixo)
        return Ec + fora.normalized() * 0.4

    maos = Maos(bon, RAIO, polegar_modo="volta")
    # vão da mão e linha dos nós dos dedos (indicador → mínimo: por onde a corda passa na mão) no referencial da mão ESQUERDA,
    # fixos o movimento todo, medidos com o cotovelo a 60°. A direita é o ESPELHO da esquerda (x → −x): as mãos do boneco não
    # são espelho perfeito uma da outra (1–3 mm) e, com a corda torta, o engate saía 1–6 mm do plano da roldana — o
    # equip3d.Polia vira o plano do cabo pro engate e, com o engate quase embaixo do eixo dela, o plano virava até ~27° e o
    # cabo entrava na flange e no garfo da roldana (medido 08/10/2026). Com a corda simétrica, o cabo fica no plano dela.
    B_REF = 60.0
    dq, pq, lat = mao("Left", B_REF, 10.0, 0.0)
    W = E["Left"] + dq * La
    maos.segurar("Left", W + dq * 0.09, dq, pq, polo=polo("Left", E["Left"], W))
    off = (W + dq * 0.09) - c("LeftHand")
    off_local = (off.dot(dq), off.dot(pq), off.dot(lat))
    nos = pg._base(rig, "Left")[1]
    nos_local = (nos.dot(dq), nos.dot(pq), nos.dot(lat))
    print("REF Left: vão − punho no referencial da mão (%.3f %.3f %.3f) | nós dos dedos (%.3f %.3f %.3f) | erro do vão "
          "%.1f mm" % (*off_local, *nos_local, maos.erro["Left"] * 1000))

    def espelho(v):
        return Vector((-v.x, v.y, v.z))

    def vao(b, dentro, prona):
        """Mão esquerda: punho W, vão g (ponto do eixo da corda no meio da mão), linha dos nós dos dedos (indicador →
        mínimo), dedos e palma."""
        dq, pq, lat = mao("Left", b, dentro, prona)
        W = E["Left"] + dq * La
        o, n = off_local, nos_local
        return W, W + dq * o[0] + pq * o[1] + lat * o[2], (dq * n[0] + pq * n[1] + lat * n[2]).normalized(), dq, pq

    def dentro_em(b, meia):
        """Inclinação do plano do antebraço pra dentro (graus) que põe o vão da mão a `meia` m do meio do corpo, com o
        antebraço sem pronar."""
        f = lambda x: vao(b, x, 0.0)[1].x - meia      # > 0: mão longe do meio (falta inclinar pra dentro)
        lo, hi = -20.0, 60.0
        if f(lo) < 0 or f(hi) > 0:
            raise ValueError("tríceps corda: sem inclinação que ponha a mão a %.3f m do meio com o cotovelo a %.0f°"
                             % (meia, b))
        for _ in range(40):
            m = (lo + hi) / 2
            if f(m) > 0:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    # o plano do antebraço fica PARADO (o braço não gira em volta dele mesmo): a inclinação que junta as mãos no começo
    dentro = dentro_em(COTOVELO[0], LARGURA0 / 2)
    print("PLANO do antebraço pra dentro %.1f°" % dentro)

    def estado(b):
        """Pronação e, por lado, (punho W, vão g, nós dos dedos, dedos, palma) com o cotovelo a `b` graus (a direita é o
        espelho da esquerda)."""
        prona = pronacao(b)
        esq = vao(b, dentro, prona)
        return prona, {"Left": esq, "Right": tuple(espelho(v) for v in esq)}

    corda = e3.corda_polia("corda", raio=RAIO)
    raio_rold = 0.045

    def engates(y_rold):
        """Engate do cabo (onde ele começa, em cima do gancho da corda) em cada quadro, com a roldana em y = y_rold."""
        teste = e3.Polia(None, None, Vector((0.0, y_rold, POLIA_Z)), raio_rold, Vector((0, 1, 0)))
        out = []
        for k in range(25):
            st = estado(p3.lerp(*COTOVELO, p3.suave(k / 24)))[1]
            out.append(corda.por({s: (st[l][1], st[l][2]) for l, s in LADOS}, teste.direcao))
        return out

    # polia alta de frente pro corpo (a torre fica na frente da pessoa, em −Y), o mais perto possível: o cabo sai sempre do
    # mesmo lado da roldana (o engate nunca passa pra frente do eixo dela) e no começo desce quase reto (CSCS: "Stand close
    # enough to the machine that the cable hangs straight down in the starting position")
    def desvio(eng, y):
        """Quanto a saída do cabo anda de lado na roldana (m): o plano do cabo vira pro engate."""
        return max(raio_rold * abs(e.x) / math.hypot(e.x, e.y - y) for e in eng)

    y_rold = estado(COTOVELO[0])[1]["Left"][1].y
    for _ in range(300):
        eng = engates(y_rold)
        if min(e.y for e in eng) - y_rold >= FOLGA_ROLDANA and desvio(eng, y_rold) <= DESVIO_SAIDA:
            break
        y_rold -= 0.001
    pol = e3.polia("polia", x=0.0, y=y_rold, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)
    print("POLIA roldana y %.3f | engate mais à frente %.3f (folga %.0f mm) | engate x de %.4f a %.4f | saída do cabo "
          "anda de lado até %.2f mm | engate no começo (%.3f %.3f %.3f)" % (
              y_rold, min(e.y for e in eng), (min(e.y for e in eng) - y_rold) * 1000, min(e.x for e in eng),
              max(e.x for e in eng), desvio(eng, y_rold) * 1000, *eng[0]))

    # pontos do corpo pras folgas (o corpo, fora os braços, não mexe)
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    m_corpo = np.array([n in TRONCO + PERNAS for n in nomes0] + [False])[dono0]
    corpo_pts = co0[m_corpo]
    corpo_dono = [nomes0[i] for i in dono0[m_corpo]]
    cabelo = ck._avaliar_simples(bon.cabelo)[0]

    def mao_x_corda():
        """Pele de cada mão → a perna da corda dela, fora da pegada (da entrada na mão até a junção), mm: − = a corda entrou
        na pele (a checagem ignora o que fica dentro da mão)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        out = []
        for lado, s in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            out.append((float(_dist_segmento(co[m], corda.entradas[s], corda.juncao).min()) - RAIO) * 1000)
        return out

    def perto(Q, a_, b_, menos):
        d = _dist_segmento(Q, a_, b_)
        i = int(np.argmin(d))
        return float(d[i]) - menos, i

    def folgas_cena():
        """Pernas da corda, gancho e cabo → pele do tronco/cabeça/coxas, e cabo → cabelo (m); e onde é o mais perto."""
        J, Ent = corda.juncao, corda.entradas
        A = pol.saida
        u = (A - J).normalized()
        pr = min(perto(corpo_pts, J, Ent[s], RAIO) for s in (1, -1))
        ga = perto(corpo_pts, J - u * 0.025, J + u * corda.engate, 0.020)
        cb = perto(corpo_pts, J + u * corda.engate, A, 0.003)
        cab = perto(cabelo, J + u * corda.engate, A, 0.003)
        onde = "%s (%.3f %.3f %.3f)" % (corpo_dono[pr[1]], *corpo_pts[pr[1]])
        return [pr[0], ga[0], cb[0], cab[0]], onde

    def pose(t):
        """t=0 cotovelos dobrados (mãos juntas na frente da parte de baixo do peito), t=1 braços estendidos (mãos nos lados
        das coxas)."""
        b = p3.lerp(*COTOVELO, t)
        prona, st = estado(b)
        for lado, _ in LADOS:
            W, g_, nos_, dq_, pq_ = st[lado]
            maos.segurar(lado, g_, dq_, pq_, polo=polo(lado, E[lado], W))
        # corda no vão de cada mão, ao longo da linha dos nós dos dedos da esquerda (indicador → mínimo: a corda entra do
        # lado do indicador, vinda do gancho em cima, e o batente fica do lado do mínimo) e do espelho dela na direita
        nos_e = pg._base(rig, "Left")[1]
        peg = {1: (st["Left"][1], nos_e), -1: (st["Right"][1], espelho(nos_e))}
        pose.nos_d = math.degrees(peg[-1][1].angle(pg._base(rig, "Right")[1]))   # corda × nós da mão direita (graus)
        eng_ = corda.por(peg, pol.direcao)
        pol.ligar(eng_)
        p3.atualizar()
        for lado, s in LADOS:                     # dedos e polegar fecham até a pele encostar na corda
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, peg[s][0], peg[s][1], RAIO, polegar_antes=antes)
        pose.desvio = {l: (c(l + "ForeArm") - E[l]).length * 1000 for l, _ in LADOS}
        f, pose.onde = folgas_cena()
        pose.folgas = [x * 1000 for x in f]
        pose.maos = (peg[1][0] - peg[-1][0]).length * 1000
        pose.entradas = (corda.entradas[1] - corda.entradas[-1]).length * 1000
        pose.prona = prona
        u = pol.direcao(corda.juncao)
        pose.cabo = math.degrees(u.angle(Vector((0, 0, 1))))
        pose.saida = (pol.saida.x - pol.centro.x) * 1000      # a saída do cabo andando de lado na roldana (mm)

    pose.dedos = {}
    pose.desvio = {}
    pose.folgas = [0.0] * 4
    pose.onde = ""
    pose.maos = pose.entradas = pose.prona = pose.cabo = pose.saida = pose.nos_d = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("TRICEPS CORDA t=%.2f | cotovelo E %.0f° D %.0f° | pronação %.0f° | vãos a %.0f mm | entradas a %.0f mm | "
              "junção (%.3f %.3f %.3f) | cabo × vertical %.1f° | pernas da corda → corpo %.0f mm (%s) | gancho → corpo %.0f "
              "mm | cabo → corpo %.0f mm | cabo → cabelo %.0f mm | vão E (%.3f %.3f %.3f) | cotovelo fora do calculado E "
              "%.1f D %.1f mm | mão → perna da corda E %.1f D %.1f mm | técnica %s" % (
                  t, jt["cotoveloE"], jt["cotoveloD"], pose.prona, pose.maos, pose.entradas, *corda.juncao, pose.cabo,
                  pose.folgas[0], pose.onde, *pose.folgas[1:], *corda.pontas[1].matrix_world.to_translation(),
                  pose.desvio["Left"], pose.desvio["Right"], *mao_x_corda(), ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))
    print("BRAÇO ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f)" % (*S["Left"], *E["Left"]))

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | pronação %.0f° | vãos a %.0f mm | entradas "
                              "da corda a %.0f mm | pernas da corda → corpo %.0f mm (%s) | gancho → corpo %.0f mm | cabo → "
                              "corpo %.0f mm | cabo → cabelo %.0f mm | mão → perna da corda E %.1f D %.1f mm | cabo × "
                              "vertical %.1f° | saída do cabo de lado na roldana %.1f mm | corda × nós da mão D %.1f° | cabo "
                              "%.3f m | polegar %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.prona, pose.maos, pose.entradas,
            pose.folgas[0], pose.onde, *pose.folgas[1:], *mao_x_corda(), pose.cabo, pose.saida, pose.nos_d,
            pol.comprimento, pol_)

    pegs = [(l, ck.Barra(corda.pontas[s], raio=RAIO, meio_compr=corda.meia)) for l, s in LADOS]
    return Cena(pose, corda.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.05),
                camera_video=((3.4, -2.6, 1.35), (0, -0.2, 1.0), 50), info=info)
