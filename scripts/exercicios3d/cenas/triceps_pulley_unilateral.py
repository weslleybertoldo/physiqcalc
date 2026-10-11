# Tríceps Pulley Unilateral — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do banco: 0 usos nos treinos prontos, 6 como
# troca equivalente). Sem peça nova: a estação de polia ALTA do Tríceps Pulley (equip3d.polia) e o puxador D (equip3d.puxador_polia,
# pegador de 25 mm) numa mão só, a ESQUERDA (TRABALHA, como nas outras cenas de 1 braço na polia).
# t = 0 começo: o cotovelo esquerdo bem dobrado, o antebraço inclinado pra cima e o puxador seguro POR BAIXO (palma pra cima) na altura do
# peito, na frente do ombro · t = 1 fim: o cotovelo estendido (sem travar), o braço esticado do lado da coxa, um pouco à frente dela, a
# palma virada pra frente. O app faz a volta (sobe devagar até o puxador chegar no peito de novo).
# Técnica (as frases e os links ficam na ficha):
#   • free-exercise-db, Cable One Arm Tricep Extension (o fonte_en do catálogo — é o pushdown de 1 braço, NÃO a extensão acima da
#     cabeça): "With your right hand, grasp a single handle attached to the high-cable pulley using a supinated (underhand; palms facing
#     up) grip. You should be standing directly in front of the weight stack." / "Now pull the handle down so that your upper arm and
#     elbow are locked in to the side of your body. Your upper arm and forearm should form an acute angle (less than 90-degrees). You can
#     keep the other arm by the waist [...]" / "move the single handle attachment down to your side until your arm is straight" / "Tip:
#     Only the forearms should move. Your upper arms should remain stationary at all times.";
#   • ExRx, Cable One Arm Pushdown: "Grasp dumbbell cable attachment with underhand grip. Position elbow to side." / "Extend arm down.
#     Return until forearm is close to upper arm." / "Step close to cable to provide resistance at top of motion.";
#   • ACE, Triceps Pushdowns (que vale com 1 braço: "This exercise can also be performed unilaterally"): tronco na vertical, o braço junto
#     do lado, o punho reto, estende sem travar e volta "around upper chest level";
#   • NSCA (CSCS, Achievable), Triceps pushdown (machine) — o de 2 braços, base do Tríceps Pulley: "Stand erect with feet shoulder-width
#     apart and knees slightly flexed."; "Stand close enough to the machine that the cable hangs straight down in the starting position.";
#     "Keep the torso erect and the upper arms stationary."; "Don’t forcefully lock out the elbows.".
# Montagem: as pernas, o tronco e a polia do Tríceps Pulley Pegada Supinada (cenas/triceps_pulley_pegada_supinada.py) — joelhos a JOELHO°
# com os pés chapados na largura dos ombros, tronco ereto, a roldana alta (POLIA_Z) na frente e perto, o cabo descendo quase na vertical
# no começo (o engate do puxador FRENTE_RODA à frente do eixo da roldana). O braço esquerdo fica PARADO junto da lateral do tronco (ABRE°
# aberto, FRENTE° à frente) e só o cotovelo mexe: o antebraço gira num plano vertical de frente pra trás (o do braço), do antebraço ACIMA°
# acima da horizontal (o puxador na altura do peito, na frente do ombro) até o cotovelo a COTOVELO_FIM°. Com 1 mão o antebraço não precisa
# vir pro meio (não há barra): a mão desce do lado da coxa, na linha do ombro, e a roldana fica bem na frente dela. A mão é a supinada do
# Tríceps Pulley Pegada Supinada: palma pro lado em que o antebraço sobe (pra cima no começo, pra frente embaixo), o punho reto pra frente e
# pra trás e de lado (a mão gira em volta da palma até o 3º metacarpo ficar na linha do antebraço); o pegador do puxador fica ao longo dos
# nós dos dedos (como no Tríceps Francês Unilateral na Polia Baixa e na Remada Baixa Unilateral na Polia), um pouco oblíquo, o aro gira em
# volta dele até o plano do cabo e o mosquetão sai na linha do cabo (equip3d.Puxador.por); o aro leva o engate uns cm pro lado conforme
# o antebraço gira e a roldana (fixa, sem o garfo que gira) fica no x que deixa o cabo até ~2° fora do plano dela; o cabo sai sempre por
# trás da roldana, no plano dela (_PoliaNoPlano). Os dedos e o polegar ("volta") fecham uma vez, no começo, e a mão fica rígida no
# pegador. Mão direita parada na cintura (a mão livre do Tríceps
# Francês Unilateral na Polia Baixa, pela função da Abdução de Quadril na Polia, que recebe o lado).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena
from abducao_de_quadril_na_polia import mao_na_cintura     # mão livre na cintura (palma no flanco), com o lado de parâmetro

RAIO = 0.0125                  # pegador do puxador D de 25 mm (equip3d.puxador_polia, Synergee Single D Handle)
TRABALHA, LIVRE = "Left", "Right"
LADOS = (("Left", 1), ("Right", -1))
S_T = 1                        # lado (sinal de x) do braço que trabalha
JOELHO = 15.0                  # joelhos levemente dobrados (graus), parados (como no Tríceps Pulley e no Supinado)
ABRE = 1.5                     # braço aberto pro lado (graus), parado: o cotovelo junto da lateral do tronco (como no Supinado)
FRENTE = 15.0                  # braço à frente da vertical (graus), parado (como no Supinado)
ACIMA = 40.0                   # começo: antebraço acima da horizontal (graus)
COTOVELO_FIM = 8.0             # fim: flexão do cotovelo (graus) — estendido sem travar
POLIA_Z, ALTO = 2.05, 2.30     # eixo da roldana alta e altura da coluna (as do Tríceps Pulley)
FRENTE_RODA = 0.015            # no começo o engate do puxador (onde o cabo começa) fica 1,5 cm à frente do eixo da roldana, pro lado do
                               # corpo (no Tríceps Pulley o engate da barra fica ~1 cm à frente dele): o cabo sai por trás da roldana e
                               # desce quase na vertical (~7°); com o engate atrás do eixo o cabo sairia pelo lado errado da roldana
B_REF = 60.0                   # antebraço da referência da mão (graus da vertical pra baixo)
MAO = lambda L: [L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky") for i in (1, 2, 3)]
TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")
PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")


def _malha(bon, partes):
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    return co[np.array([n in partes for n in nomes] + [False])[dono]]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _distancia(bvh, P, lim=0.30):
    """Menor distância com sinal (m) dos pontos P até a malha fechada do bvh (− = dentro; normal contra e, perto, paridade do raio)."""
    menor = lim
    for p in P:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is None:
            continue
        if d < 0.03 and (v - loc).dot(nor) < 0 and ck._dentro(bvh, v):
            d = -d
        menor = min(menor, d)
    return menor


def _saida_no_plano(centro, frente, raio, p):
    """Saída do cabo da roldana fixa (o ponto em que ele fica tangente) e a normal (eixo → saída), no plano VERTICAL da roldana (o da
    `frente`), com o ponto p projetado nele — a conta da Polia.tangente, sem virar o plano pro ponto."""
    cima = Vector((0.0, 0.0, 1.0))
    v = Vector(p) - centro
    vf, vc = v.dot(frente), v.dot(cima)
    dist = math.hypot(vf, vc)
    if dist <= raio * 1.01:
        raise ValueError("polia: ponto %s dentro da roldana" % (tuple(p),))
    a = math.atan2(vc, vf) + math.asin(raio / dist)
    n = frente * math.sin(a) - cima * math.cos(a)
    return centro + n * raio, n


class _PoliaNoPlano(e3.Polia):
    """A Polia da fábrica (equip3d.polia, sem o garfo que gira), com o cabo saindo sempre da roldana no plano dela: a Polia.tangente vira
    o plano pro ponto do cabo e, com o engate quase embaixo da roldana — aqui no meio do movimento a mão vai ~9 cm pra frente e o engate
    passa uns cm pra trás da linha em que o cabo desce —, a saída pulava pro outro lado da roldana (e o garfo que gira dava meia-volta). O
    cabo vai reto da saída até o engate (o engate anda até ~2,5 cm pro lado do plano: o cabo fica até ~2° fora dele)."""

    def tangente(self, p):
        T, n = _saida_no_plano(self.centro, self.frente, self.raio, p)
        return T, (Vector(p) - T).normalized(), n

    def ligar(self, engate):
        T, d, n = self.tangente(engate)
        L = (Vector(engate) - T).length
        y = (n - d * n.dot(d)).normalized()                    # Y local do cabo: ⟂ a ele, pro lado da normal da saída
        R = Matrix((y.cross(d), y, d)).transposed()            # colunas: X, Y, Z = cabo (o cilindro fica a `raio` no Y local)
        self.cabo.matrix_world = Matrix.Translation(T - y * self.raio) @ R.to_4x4() @ Matrix.Diagonal((1.0, 1.0, L, 1.0))
        self.saida, self.comprimento = T, L
        return L


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
    pg.usar_cilindro(RAIO * 2000)                # mão de referência do pegador de 25 mm (antes do Maos)
    pg.usar_polegar("volta")                     # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    pernas(bon)
    cab = lambda n: p3.cabeca(rig, n)
    maos = Maos(bon, RAIO, polegar_modo="volta")
    maos.iks[LIVRE].mute = True                  # o braço livre é posto uma vez só, abaixo (mão na cintura)
    S = cab(TRABALHA + "Arm")
    Lb = (cab(TRABALHA + "ForeArm") - S).length                       # braço
    La = (cab(TRABALHA + "Hand") - cab(TRABALHA + "ForeArm")).length  # antebraço
    a_, f_ = math.radians(ABRE), math.radians(FRENTE)
    braco = Vector((S_T * math.sin(a_), -math.sin(f_) * math.cos(a_), -math.cos(f_) * math.cos(a_)))
    E = S + braco * Lb                           # cotovelo parado o movimento todo

    def antebraco(th):
        """Direção do antebraço (cotovelo → punho) a `th` graus da vertical pra baixo, girando pra frente no plano vertical de frente pra
        trás que passa pelo cotovelo."""
        a = math.radians(th)
        return Vector((0.0, -math.sin(a), -math.cos(a)))

    def mao_sagital(th):
        """Dedos (na linha do antebraço) e palma (supinada) com o antebraço a `th` graus da vertical pra baixo: th = 0 dedos pra baixo e
        palma pra frente, th = 90 dedos pra frente e palma pra cima, th = 130 palma pra cima e um pouco pro corpo."""
        a = math.radians(th)
        return antebraco(th), Vector((0.0, -math.cos(a), math.sin(a)))

    def polo(Ec, W):
        eixo = (W - S).normalized()
        fora = (Ec - S) - eixo * (Ec - S).dot(eixo)
        return Ec + fora.normalized() * 0.4

    # ── referência (antebraço a B_REF° da vertical): (1) giro da mão em volta da palma pro 3º metacarpo (punho → base do dedo médio) ficar
    # na linha do antebraço — o punho reto também de lado (no boneco, com o osso da mão na linha do antebraço, o metacarpo desvia ~8° pro
    # lado do polegar); o pegador fica ao longo dos nós dos dedos, que ficam um pouco oblíquos (a pegada de força: o pegador atravessa a
    # palma na diagonal); (2) o vão da mão e a linha dos nós dos dedos no referencial da mão (fixos o movimento todo: a mão é rígida e só gira
    # junto com o antebraço em volta do x)
    dq, pq = mao_sagital(B_REF)
    W = E + dq * La
    maos.segurar(TRABALHA, W + dq * 0.09, dq, pq, polo=polo(E, W))
    desvio0 = tc.punho_desvio(ck.posicoes(rig))[0]
    m = cab(TRABALHA + "HandMiddle1") - cab(TRABALHA + "Hand")
    m = (m - pq * m.dot(pq)).normalized()
    giro = math.atan2(m.cross(dq).dot(pq), m.dot(dq))
    dq2 = Matrix.Rotation(giro, 3, pq) @ dq
    maos.segurar(TRABALHA, W + dq2 * 0.09, dq2, pq, polo=polo(E, W))
    h0 = cab(TRABALHA + "Hand")
    lat2 = dq2.cross(pq)
    off = p3.mundo_osso(rig, TRABALHA + "Hand") @ maos.furo[TRABALHA] - h0
    off_local = (off.dot(dq2), off.dot(pq), off.dot(lat2))
    nos2 = pg._base(rig, TRABALHA)[1]
    nos_local = (nos2.dot(dq2), nos2.dot(pq), nos2.dot(lat2))
    print("REF: giro da mão %.1f° | desvio do punho antes %.1f° depois %.1f° | nós dos dedos × x %.1f° | vão − punho no referencial da mão "
          "(%.3f %.3f %.3f) | erro do vão %.1f mm" % (
              math.degrees(giro), desvio0, tc.punho_desvio(ck.posicoes(rig))[0],
              math.degrees(min(nos2.angle(Vector((1, 0, 0))), nos2.angle(Vector((-1, 0, 0))))), *off_local, maos.erro[TRABALHA] * 1000))

    def mao(th):
        """Dedos (o giro da referência em volta da palma), palma e o lado da mão com o antebraço a `th` graus da vertical."""
        dq, pq = mao_sagital(th)
        dq = Matrix.Rotation(giro, 3, pq) @ dq
        return dq, pq, dq.cross(pq)

    def juntas(th):
        """Punho W, vão da mão g (eixo do pegador no meio da mão), dedos e palma com o antebraço a `th` graus da vertical pra baixo."""
        W = E + antebraco(th) * La
        dq, pq, lat = mao(th)
        return W, W + dq * off_local[0] + pq * off_local[1] + lat * off_local[2], dq, pq

    def flexao(th):
        """Ângulo do cotovelo (braço × antebraço, graus) com o antebraço a `th` graus da vertical pra baixo."""
        return math.degrees(braco.angle(antebraco(th)))

    # começo: antebraço ACIMA graus acima da horizontal; fim: cotovelo a COTOVELO_FIM graus (o antebraço à frente do braço)
    th0 = 90.0 + ACIMA
    cf = math.cos(math.radians(COTOVELO_FIM)) / math.cos(a_)
    if cf >= 1.0:
        raise ValueError("cotovelo não estica até %.1f° com o braço aberto %.1f°" % (COTOVELO_FIM, ABRE))
    th1 = FRENTE + math.degrees(math.acos(cf))
    c0, c1 = juntas(th0)[1], juntas(th1)[1]

    # ── mão livre na cintura (uma vez só: o braço livre não mexe)
    mao_livre = mao_na_cintura(bon, maos, LIVRE)

    # polia alta de frente pro corpo (a torre fica na frente da pessoa, em −Y), bem na frente da mão que trabalha. O pegador fica ao longo
    # dos nós dos dedos, um pouco oblíquo, e o aro (que gira em volta dele até o plano do cabo) leva o engate uns cm pro lado conforme o
    # antebraço gira: o x da roldana é o que deixa o cabo o mais perto possível do plano dela no movimento todo (o maior ângulo de lado o
    # menor possível); no começo o engate fica FRENTE_RODA à frente do eixo da roldana (a conta do equip3d.Puxador.por com a saída no
    # plano da roldana, repetida até parar)
    raio_rold = 0.045
    FRENTE_P = Vector((0.0, 1.0, 0.0))
    amostras = [p3.lerp(th0, th1, k / 10) for k in range(11)]

    def engate_em(th, xc, yc):
        """Engate do puxador (começo do cabo) e comprimento do cabo reto com o antebraço a `th` graus e a roldana em (xc, yc)."""
        cen = Vector((xc, yc, POLIA_Z))
        c = juntas(th)[1]
        dq, pq, lat = mao(th)
        xh = (dq * nos_local[0] + pq * nos_local[1] + lat * nos_local[2]).normalized()   # eixo do pegador
        direcao = lambda q: (_saida_no_plano(cen, FRENTE_P, raio_rold, q)[0] - Vector(q)).normalized()
        u = direcao(c)
        for _ in range(5):                       # o laço do Puxador.por
            O = c + (u - xh * u.dot(xh)).normalized() * 0.1275
            u = direcao(O + u * 0.075)
        eng = O + u * 0.075
        return eng, (eng - _saida_no_plano(cen, FRENTE_P, raio_rold, eng)[0]).length

    xc, yc = c0.x, c0.y - 0.04
    for _ in range(6):
        for _ in range(20):                      # y: o engate do começo FRENTE_RODA à frente do eixo da roldana
            novo = engate_em(th0, xc, yc)[0].y - FRENTE_RODA
            if abs(novo - yc) < 1e-7:
                break
            yc = novo
        pts = [engate_em(th, xc, yc) for th in amostras]
        xs = [xc + k * 0.0005 for k in range(-120, 121)]
        xc = min(xs, key=lambda x_: max(abs(e.x - x_) / L for e, L in pts))
    lado_max = max(math.degrees(math.atan2(abs(e.x - xc), L)) for e, L in [engate_em(th, xc, yc) for th in amostras])
    pol = e3.polia("polia", x=xc, y=yc, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)
    pol.__class__ = _PoliaNoPlano                # o cabo sai no plano da roldana (acima)
    print("POLIA roldana (%.3f %.3f %.3f) | engate do começo %.1f mm à frente do eixo | cabo até %.1f° fora do plano da roldana" % (
        xc, yc, POLIA_Z, (engate_em(th0, xc, yc)[0].y - yc) * 1000, lado_max))
    pux = e3.puxador_polia("puxador", raio=RAIO)

    # pontos do corpo pras folgas (pernas e tronco não mexem)
    tronco_pts = _malha(bon, TRONCO)
    pernas_pts = _malha(bon, PERNAS)
    cabelo = ck._avaliar_simples(bon.cabelo)[0]
    co0, tri0, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    coxa_t = _grupo(nomes0, dono0, (TRABALHA + "UpLeg", "Hips"))
    bvh_coxa = ck._bvh(co0, tri0[coxa_t[tri0].all(axis=1)])
    tr_ = _grupo(nomes0, dono0, ("Hips", "Spine", "Spine1", "Spine2"))
    bvh_tronco = ck._bvh(co0, tri0[tr_[tri0].all(axis=1)])
    PEGA = ("puxador_cano",)

    def cabo_seg():
        return pol.saida, pux.ponto_engate

    def folgas_corpo():
        """Cabo → tronco/cabeça, → cabelo e → pernas; braço que trabalha: mão e antebraço → tronco e → coxa (m)."""
        co, tri_, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        a, b = cabo_seg()
        cabo_t = float(_dist_segmento(tronco_pts, a, b).min()) - 0.003
        cabo_c = float(_dist_segmento(cabelo, a, b).min()) - 0.003
        cabo_p = float(_dist_segmento(pernas_pts, a, b).min()) - 0.003
        mao_pts = co[_grupo(nomes, dono, tuple(MAO(TRABALHA)))]
        ant_pts = co[_grupo(nomes, dono, (TRABALHA + "ForeArm",))]
        return (cabo_t, cabo_c, cabo_p, _distancia(bvh_tronco, mao_pts), _distancia(bvh_tronco, ant_pts),
                _distancia(bvh_coxa, mao_pts), _distancia(bvh_coxa, ant_pts))

    def folgas_maos():
        """Mão esquerda × puxador fora do pegador (aro, parafusos, mosquetão, bola: m, − = entrou, e a peça), mão × cabo (m) e aro/engate →
        antebraço/braço que trabalha (m, − = entrou)."""
        co, tri_, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        bvh = ck._bvh(co, tri_)
        mao_ = _grupo(nomes, dono, tuple(MAO(TRABALHA)))
        braco_ = _grupo(nomes, dono, (TRABALHA + "ForeArm", TRABALHA + "Arm"))
        bvh_b = ck._bvh(co, tri_[braco_[tri_].all(axis=1)])
        menor_m, onde, pts = 1e9, "", []
        for raiz in (pux.alca, pux.engate):
            for ob in ck._malhas(raiz):
                if ob.name in PEGA:
                    continue
                eco, etri = ck._avaliar_simples(ob)
                for p in ck._amostras(eco, etri, 0.004):
                    pts.append(p)
                    v = Vector(p)
                    loc, nor, idx, dist = bvh.find_nearest(v)
                    if loc is None:
                        continue
                    d_ = -dist if (v - loc).dot(nor) < 0 else dist
                    if mao_[tri_[idx][0]] and d_ < menor_m:
                        menor_m, onde = d_, ob.name
        a, b = cabo_seg()
        cabo_m = float(_dist_segmento(co[mao_], a, b).min()) - 0.003
        return menor_m, onde, cabo_m, _distancia(bvh_b, pts)

    DEDOS = {}

    def pose(t):
        """t=0 cotovelo dobrado (o puxador no peito, palma pra cima), t=1 braço esticado do lado da coxa (palma pra frente)."""
        th = p3.lerp(th0, th1, t)
        W, g, dq, pq = juntas(th)
        maos.segurar(TRABALHA, g, dq, pq, polo=polo(E, W))
        eixo = pg._base(rig, TRABALHA)[1]        # pegador ao longo dos nós dos dedos (indicador → mínimo)
        eng = pux.por(g, eixo, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        if DEDOS:                                # dedos e polegar: fechados UMA vez (no começo) e iguais em todo quadro
            for n, M in DEDOS.items():
                PB[n].matrix_basis = M.copy()
        else:
            pose.dedos = pg.fechar_em_volta(bon, TRABALHA, g, eixo, RAIO)
        p3.atualizar()
        pose.th, pose.g = th, g
        pose.desvio = (cab(TRABALHA + "ForeArm") - E).length * 1000
        u = pol.direcao(pux.ponto_engate)
        pose.cabo = math.degrees(u.angle(Vector((0, 0, 1))))
        pose.cabo_lado = math.degrees(math.asin(max(-1.0, min(1.0, u.x))))

    pose.dedos = {}
    pose.th, pose.g, pose.desvio, pose.cabo, pose.cabo_lado = 0.0, Vector(), 0.0, 0.0, 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    maos.iks[TRABALHA].mute = False
    e_ = p3.acertar_polo(rig, maos.iks[TRABALHA], TRABALHA + "ForeArm", TRABALHA + "Arm", TRABALHA + "Hand")
    print("polo cotovelo %s erro %.3f ang %d" % (TRABALHA, *e_), flush=True)
    pose(0.0)                                    # os dedos e o polegar fecham no começo e ficam assim
    DEDOS.update({pb.name: pb.matrix_basis.copy() for pb in PB
                  if pb.name[len(p3.P):].startswith(TRABALHA + "Hand") and pb.name[len(p3.P):] != TRABALHA + "Hand"})
    print("DEDOS %s | %s" % (TRABALHA, pose.dedos), flush=True)

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        fc = folgas_corpo()
        fm = folgas_maos()
        return ("antebraço %.1f° da vertical | cotovelo E %.0f° | cotovelo fora do calculado %.1f mm | vão (%.3f %.3f %.3f) | olhal "
                "(%.3f %.3f %.3f) | cabo × vertical %.1f° (de lado %.1f°) | cabo → tronco/cabeça %.0f, → cabelo %.0f, → pernas %.0f mm | mão E → tronco "
                "%.1f, → coxa/quadril %.1f mm | antebraço E → tronco %.1f, → coxa/quadril %.1f mm | mão × aro/engate %.1f mm (%s) | mão × "
                "cabo %.0f mm | aro/engate → braço/antebraço %.1f mm | braço à frente %.1f° | cotovelo × tronco %.1f° | punho flexão %.0f° "
                "desvio %.0f° | palma pra cima %.0f° pra frente %.0f° pro meio %.0f° | cabo %.3f m | %s | mão livre %s") % (
            pose.th, jt["cotoveloE"], pose.desvio, *pose.g, *pux.ponto_olhal, pose.cabo, pose.cabo_lado, fc[0] * 1000, fc[1] * 1000, fc[2] * 1000,
            fc[3] * 1000, fc[5] * 1000, fc[4] * 1000, fc[6] * 1000, fm[0] * 1000, fm[1], fm[2] * 1000, fm[3] * 1000,
            tc.braco_frente(jj)[0], tc.cotovelo_tronco(jj)[0], tc.punho_flexao(jj)[0], tc.punho_desvio(jj)[0], tc.palma_cima(jj)[0],
            tc.palma_frente(jj)[0], tc.palma_dentro(jj)[0], pol.comprimento, maos.info(), mao_livre)

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("UNILATERAL t=%.1f | %s | técnica %s" % (t, info(), ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))), flush=True)
    print("BRAÇO ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f) | braço %.3f antebraço %.3f m | antebraço de %.1f° a %.1f° da "
          "vertical | cotovelo %.1f° → %.1f° | vão começo (%.3f %.3f %.3f) fim (%.3f %.3f %.3f) | roldana (%.3f %.3f %.3f)" % (
              *S, *E, Lb, La, th0, th1, flexao(th0), flexao(th1), *c0, *c1, *pol.centro), flush=True)
    pose(0.0)

    pegs = [(TRABALHA, ck.Barra(pux.pegador, raio=RAIO, meio_compr=pux.meia))]
    return Cena(pose, pux.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.2, 1.1),
                camera_video=((3.6, 1.2, 1.4), (0, -0.2, 1.05), 50), info=info)
