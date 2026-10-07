# Rosca Punho com Halter — cena da fábrica 3D (lote 4, 06/10/2026).
# t = 0 punho estendido, o halter embaixo, na frente do joelho · t = 1 punho flexionado, os nós dos dedos pra cima.
# Sentado na ponta de um banco reto, pés chapados na largura do quadril, pernas paralelas e pontas dos pés pra frente;
# o tronco inclina à frente (pelo quadril, costas retas) até o cotovelo e o antebraço esquerdos deitarem em cima da coxa
# esquerda, com o punho logo depois do joelho e a palma pra cima (pegada supinada) — NSCA, Exercise Technique Manual,
# Wrist Curl: "Sit on one end of a flat bench and position the feet hip-width apart with the legs parallel to each other
# and the toes pointing straight ahead. Lean the torso forward to place the elbows and forearms on top of the thighs." /
# "Move the forearms forward until the wrists extend slightly beyond the patellae."; ExRx, Dumbbell Wrist Curl: "Sit and
# grasp dumbbell with underhand grip. Rest forearm on thigh with wrist just beyond knee."
# Só o punho mexe (ACE, Wrist Curl - Flexion: "without releasing your grip, extending your arms or leaning forward /
# backward"); a mão fica fechada no halter o movimento todo — o ACE desaconselha soltar a pegada e deixar o halter rolar
# pros dedos ("increases the risk of wrist injury and dropping the dumbbells"). Braço direito em descanso: mão solta
# apoiada em cima da coxa direita, perto do joelho, palma pra baixo e cotovelo dobrado pra fora.
import math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
import tecnica3d as tc
from cena import Cena

TRABALHA, LIVRE = "Left", "Right"
ASSENTO = 0.44           # topo do banco reto (m), igual aos bancos da fábrica (supinos, remada unilateral)
LARGURA = 0.30           # largura do estofado
FRENTE = 0.20            # borda da frente do banco à frente da articulação do quadril (m): glúteo e metade de trás das
                         # coxas em cima do banco, joelhos e pernas pra fora dele
PE_X = 0.12              # tornozelos pra fora do meio do corpo (m): pés na largura do quadril (articulações em ±0,106)
INCLINA0 = 17.85         # tronco à frente, graus da vertical (chute): a conta acerta até o cotovelo deitar na coxa
H0 = 0.0745              # punho acima do centro do joelho (m), chute da mesma conta
ALEM = 0.075             # punho além do centro do joelho, ao longo da coxa (m): logo depois da patela
AFUNDA = 0.001           # antebraço encostando na coxa: a pele afunda até isso (m)
EXT, FLEX = -55.0, 50.0  # punho (graus, + flexão): estendido embaixo (t=0) → flexionado em cima (t=1). Embaixo o
                         # halter desce estendendo o punho sem soltar a pegada (ACE); em cima flexiona "as high as
                         # possible" (ExRx) com a mão fechada — a AAOS dá 70° de extensão e 80° de flexão com a mão
                         # livre; fechada no halter os músculos dos dedos limitam as duas pontas (ExRx, Wrist Flexors:
                         # insuficiência passiva/ativa). A mão não muda de forma no movimento (só o punho dobra), então
                         # o polegar ("volta") fica na mesma postura do começo ao fim; com o punho flexionado a pele da
                         # base do polegar estica (LBS do punho) e com 60° a busca trocava de postura no meio da subida
                         # (a ponta do polegar saltava 56 mm em t=0,96): 50° fica dentro da trava (2,4×)
MAO_LIVRE = 0.80         # mão direita (descanso) apoiada em cima da coxa a 80% do quadril até o joelho
POLEGAR0 = ("volta", -22.0, 0.0, -27.0, 28.0, 0.7, 45.0)
                         # polegar ("volta") do começo (t=0), a semente da busca do pegada3d: postura que passa nas
                         # travas do polegar (pele da base esticando até 2,5×, polegar sem entrar na barra nem nos
                         # dedos) com o punho de −55° a +50°, achada numa busca com as duas pontas juntas (P3.buscar);
                         # a ponta fica a ~3 mm das falanges médias (do zero embaixo, a busca achava uma a 9 mm).
RAIO = 0.0145            # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13          # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
PERNA = ("LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg")


def _bvh_de(bon, partes):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    m = np.array([n in partes for n in nomes] + [False])[dono]
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True), co, nomes, dono


def _distancia(bvh, pts):
    """Menor distância com sinal dos pontos até a superfície (− = dentro), como o checagem3d.contatos."""
    menor = 1e9
    for p in pts:
        v = Vector(p)
        loc, nor, idx, dist = bvh.find_nearest(v)
        if loc is None:
            continue
        menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
    return menor


def montar(bon):
    pg.usar_polegar("volta")
    rig = bon.rig
    PB = rig.pose.bones
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    tornozelo_z = p3.cabeca(rig, "LeftFoot").z                                     # pé chapado em pé

    # ── pernas por IK (alvos nascem no tornozelo de repouso: alvo = polo dá NaN) e pés chapados ──────────────────────
    tornozelos, polos_j, pernas = {}, {}, {}
    for lado, s in dt.LADOS:
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos_j[lado] = p3.vazio("polo_joelho_" + lado, p3.cabeca(rig, lado + "Leg") + Vector((s * 0.04, -0.6, 0.3)))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos_j[lado])
        p3.travar_rotacao(rig, lado + "Foot")
    # ── braços por IK (o esquerdo trabalha, o direito descansa) ─────────────────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, -0.5)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    pivo0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    y_frente = pivo0.y - FRENTE

    def _sentar(inclina, z_quadril=None):
        """Tronco inclinado `inclina` graus à frente em volta das articulações do quadril, canelas em pé (joelho em
        cima do tornozelo) e a pele do glúteo e das coxas em cima do banco afundando 2 mm no estofado. z_quadril: a
        altura do quadril da conta anterior (começa dali; do zero, em pé, leva ~12 voltas)."""
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), pivo=pivo0)
        if z_quadril is not None:
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, z_quadril - pivo0.z)))
        for volta in range(20):
            for lado, s in dt.LADOS:
                q = p3.cabeca(rig, lado + "UpLeg")
                dz = q.z - (tornozelo_z + canela)
                dx = s * PE_X - q.x
                dy = math.sqrt(max(coxa ** 2 - dz ** 2 - dx ** 2, 1e-6))
                tz = Vector((s * PE_X, q.y - dy, tornozelo_z))
                tornozelos[lado].location = tz
                d = tz - q
                cima = Vector((0, -d.z, d.y)).normalized()
                if cima.z < 0:
                    cima.negate()
                polos_j[lado].location = (q + tz) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0))
            p3.atualizar()
            if volta == 0:
                for lado, _ in dt.LADOS:
                    p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            v = dt.malha(bon, ("Hips", "LeftUpLeg", "RightUpLeg"))
            v = v[(v[:, 1] > y_frente) & (np.abs(v[:, 0]) < LARGURA / 2)]
            desce = ASSENTO - 0.002 - v[:, 2].min()
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, desce)))
            if abs(desce) < 0.0003 and volta > 0:
                break

    def _congelar(lado):
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def _girar_antebraco(lado, quer):
        """Prona/supina o antebraço em volta do próprio eixo pra palma ir pra `quer` (projetado ⟂ antebraço)."""
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = (quer - ax * quer.dot(ax)).normalized()
        tem = pg._base(rig, lado)[0]
        tem = (tem - ax * tem.dot(ax)).normalized()
        ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
        p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))

    def _mao_quadro(lado, dq, pq):
        """Mão `lado` com o 3º metacarpo (punho → base do dedo médio) apontando pra `dq` e a palma pra `pq` (mundo),
        girando em volta do punho."""
        f1 = p3.cabeca(rig, lado + "Hand")
        d = (p3.cabeca(rig, lado + "HandMiddle1") - f1).normalized()
        n = pg._base(rig, lado)[0]
        n = (n - d * n.dot(d)).normalized()
        pq = (pq - dq * pq.dot(dq)).normalized()
        F_tem = Matrix((d, n, d.cross(n))).transposed()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())

    def _mao_no_angulo(lado, graus, palma0):
        """Mão `lado` com o punho dobrado `graus` (+ flexão, − extensão) em volta do eixo de flexão, a partir da mão
        alinhada com o antebraço (3º metacarpo na linha do antebraço) e a palma virada pra `palma0` (⟂ antebraço)."""
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        a = (f1 - f0).normalized()
        n0 = (palma0 - a * palma0.dot(a)).normalized()
        g = math.radians(graus)
        _mao_quadro(lado, a * math.cos(g) + n0 * math.sin(g), n0 * math.cos(g) - a * math.sin(g))   # + = flexão

    def _antebraco_na_coxa(lado, W, palma0):
        """Braço por IK até o punho W (cotovelo no ponto mais baixo que o braço deixa), congelado em FK e o antebraço
        girado pra palma ir pra `palma0`. Devolve a menor distância (com sinal) da pele do antebraço até a pele da
        perna: metade de trás (perto do cotovelo) e metade da frente (perto do punho)."""
        PB[p3.P + lado + "Hand"].matrix_basis = Matrix()
        iks[lado].mute = False
        punhos[lado].location = W
        S = p3.cabeca(rig, lado + "Arm")
        polos[lado].location = dt.polo_cotovelo_baixo(S, W, Lb, La)
        p3.atualizar()
        p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        _congelar(lado)
        _girar_antebraco(lado, palma0)
        bvh, co, nomes, dono = _bvh_de(bon, PERNA)
        A = co[np.array([n == lado + "ForeArm" for n in nomes] + [False])[dono]]
        E, Wr = np.array(p3.cabeca(rig, lado + "ForeArm")), np.array(p3.cabeca(rig, lado + "Hand"))
        u = (A - E) @ (Wr - E) / float((Wr - E) @ (Wr - E))
        return _distancia(bvh, A[(u > 0.15) & (u < 0.5)]), _distancia(bvh, A[(u >= 0.5) & (u < 0.92)])

    def _punho_alvo(lado, h, alem=ALEM):
        K, H = p3.cabeca(rig, lado + "Leg"), p3.cabeca(rig, lado + "UpLeg")
        return K + (K - H).normalized() * alem + Vector((0, 0, h))

    def _dedos_encostando(lado, bvh):
        """Cada dedo (fora o polegar) dobra as 3 juntas na proporção da mão de referência, do mais esticado pro mais
        dobrado, até a pele encostar na pele da perna (sem entrar)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        pos = {n: i for i, n in enumerate(nomes)}
        palma_n, eixo_nos = pg._base(rig, lado)[:2]
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
            pts = {o: co[dono == pos[o]] for o in ossos}
            cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
            ponta = np.array(p3.ponta(rig, ossos[-1]))
            f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma_n) > 0 else -1
            ref = pg.ANGULOS_REF[d]
            escolha = None
            for lam in np.arange(-0.10, 0.61, 0.02):
                angs = [lam * ref[k] * sinal for k in range(3)]
                pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, angs)
                dmin = _distancia(bvh, np.concatenate([pp[o] for o in ossos])[::2])
                if dmin < -0.0015:                               # entrou: fica no anterior
                    break
                escolha = angs
                if dmin < 0.001:                                 # encostou
                    break
            for k, o in enumerate(ossos):
                if escolha and escolha[k]:
                    p3.girar_osso(rig, o, p3.rot_eixo(escolha[k], eixo_nos))

    def _polegar_encostando(lado, bvh):
        """Polegar solto do lado do indicador: dobra (ou abre) até encostar na pele da perna sem entrar."""
        ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
        melhor = None
        for lam in np.arange(-1.5, 1.51, 0.1):
            for o in ossos:
                PB[p3.P + o].matrix_basis = Matrix()
            p3.atualizar()
            p3.fechar_mao(rig, lado, angulos=(0, 0, 0), polegar=tuple(lam * g for g in (10, 20, 15)))
            co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
            d = _distancia(bvh, co[np.array([n in ossos for n in nomes] + [False])[dono]])
            nota = abs(d - 0.0005) if d >= -0.0015 else 1 + abs(d)
            if melhor is None or nota < melhor[0]:
                melhor = (nota, lam, d)
        for o in ossos:
            PB[p3.P + o].matrix_basis = Matrix()
        p3.atualizar()
        p3.fechar_mao(rig, lado, angulos=(0, 0, 0), polegar=tuple(melhor[1] * g for g in (10, 20, 15)))
        return melhor

    def _mao_na_coxa(lado, frac, dentro):
        """Braço em descanso: mão solta apoiada em cima da coxa, palma pra baixo e dedos pra frente (`dentro` graus pra
        dentro), com o centro do apoio da palma em cima do fêmur a `frac` do quadril até o joelho e a pele afundando
        AFUNDA; o punho vai por IK (cotovelo dobrado pra fora e pra trás) e cada dedo cai até encostar."""
        s = 1 if lado == "Left" else -1
        H, K = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Leg")
        alvo = H.lerp(K, frac)
        a = math.radians(dentro)
        dq = Vector((-s * math.sin(a), -math.cos(a), 0))
        pq = Vector((0, 0, -1))
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.6)
        p3.fechar_mao(rig, lado, angulos=(6, 8, 4), polegar=(10, 20, 15))       # mão relaxada: dedos quase retos
        bvh = _bvh_de(bon, PERNA)[0]
        S = p3.cabeca(rig, lado + "Arm")
        W = alvo + Vector((0, 0.07, 0.12))
        polos[lado].location = (S + W) / 2 + Vector((s * 0.5, 0.35, 0.0))         # cotovelo pra fora e pra trás
        PB[p3.P + lado + "Hand"].matrix_basis = Matrix()
        for volta in range(10):
            iks[lado].mute = False
            punhos[lado].location = W
            p3.atualizar()
            if volta == 0:
                p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            _congelar(lado)
            _girar_antebraco(lado, pq)
            _mao_quadro(lado, dq, pq)
            co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
            P = co[np.array([n == lado + "Hand" for n in nomes] + [False])[dono]]
            baixo = P[P[:, 2] < P[:, 2].min() + 0.008].mean(axis=0)              # onde a palma apoia
            pol = co[np.array([n.startswith(lado + "HandThumb") for n in nomes] + [False])[dono]]
            dz = min(_distancia(bvh, P), _distancia(bvh, pol)) + AFUNDA          # a base do polegar também apoia
            mexe = Vector((alvo.x - baixo[0], alvo.y - baixo[1], -dz))
            if mexe.length < 0.0007:
                break
            W = W + mexe
        _dedos_encostando(lado, bvh)
        _polegar_encostando(lado, bvh)
        return dz - AFUNDA

    # ── tronco e braço esquerdo: o quanto o tronco inclina (altura do ombro) e a altura do punho até o antebraço
    # deitar na coxa (encostando perto do cotovelo e perto do punho) ───────────────────────────────────────────────
    inclina, h, zq = INCLINA0, H0, None
    for volta in range(9):
        _sentar(inclina, zq)
        zq = ((p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2).z
        tras, frente = _antebraco_na_coxa(TRABALHA, _punho_alvo(TRABALHA, h), Vector((0, 0, 1)))
        if (abs(tras + AFUNDA) < 0.0007 and abs(frente + AFUNDA) < 0.0007) or volta == 8:
            break                                          # a pose fica a do último quadro medido
        h -= (frente + AFUNDA) * 0.9
        inclina += (tras + AFUNDA) / 0.005 * 0.7
    E_, W_ = p3.cabeca(rig, TRABALHA + "ForeArm"), p3.cabeca(rig, TRABALHA + "Hand")
    print("SENTADO (%d voltas): tronco %.2f° à frente | quadril z %.3f | antebraço esquerdo × coxa: perto do cotovelo "
          "%+.1f mm, perto do punho %+.1f mm | punho %.1f mm acima do joelho | antebraço %.1f° abaixo da horizontal" % (
              volta + 1, inclina, zq, tras * 1000, frente * 1000, h * 1000,
              math.degrees(math.atan2(E_.z - W_.z, math.hypot(E_.x - W_.x, E_.y - W_.y)))), flush=True)
    ossos_trab = [TRABALHA + "Arm", TRABALHA + "ForeArm"]
    trab_mats = [(n, PB[p3.P + n].matrix.copy()) for n in ossos_trab]

    # ── braço direito em descanso: mão solta apoiada em cima da coxa direita, perto do joelho, palma pra baixo ─────
    palma_l = _mao_na_coxa(LIVRE, MAO_LIVRE, 10.0)
    print("DESCANSO: mão direita na coxa, palma %+.1f mm da pele | punho D %.0f° cotovelo D %.0f°" % (
        palma_l * 1000, ck.medir_juntas(rig)["punhoD"], ck.medir_juntas(rig)["cotoveloD"]), flush=True)
    ossos_livre = sorted((pb.name for pb in PB if pb.name[len(p3.P):].startswith((LIVRE + "Arm", LIVRE + "ForeArm",
                                                                                     LIVRE + "Hand"))),
                         key=lambda n: len(PB[n].parent_recursive))
    livre_mats = [(n, PB[n].matrix.copy()) for n in ossos_livre]

    # ── banco reto debaixo do glúteo e da metade de trás das coxas ───────────────────────────────────────────────
    banco = e3.banco("banco", y_frente, y_frente + 1.20, topo=ASSENTO, largura=LARGURA)

    # ── mão esquerda: vão da mão de referência guardado no espaço do osso da mão (a mão não muda de forma) ─────────
    halter = e3.halter("halter", pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA)
    pg.mao_de_referencia(rig, TRABALHA)
    _mao_no_angulo(TRABALHA, 0.0, Vector((0, 0, 1)))
    g0, _ = pg.ponto_na_mao(bon, TRABALHA, RAIO)
    furo = p3.mundo_osso(rig, TRABALHA + "Hand").inverted() @ g0

    def _restaurar():
        for n, M in trab_mats:
            PB[p3.P + n].matrix = M
            p3.atualizar()
        for n, M in livre_mats:
            PB[n].matrix = M
            p3.atualizar()

    def pose(t):
        """t=0 punho estendido (halter embaixo), t=1 punho flexionado (halter em cima)."""
        _restaurar()
        pg.mao_de_referencia(rig, TRABALHA)
        _mao_no_angulo(TRABALHA, p3.lerp(EXT, FLEX, t), Vector((0, 0, 1)))
        g = p3.mundo_osso(rig, TRABALHA + "Hand") @ furo
        eixo = pg._base(rig, TRABALHA)[1]                      # o halter fica na linha dos nós dos dedos
        halter.rotation_mode = "QUATERNION"
        halter.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
        halter.location = g
        p3.atualizar()
        antes = pose.dedos.get("Thumb") if t > 0 else POLEGAR0
        pose.dedos = pg.fechar_em_volta(bon, TRABALHA, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    def info():
        j = ck.posicoes(rig)
        bvh, co, nomes, dono = _bvh_de(bon, PERNA)
        m = lambda *ps: co[np.array([n in ps for n in nomes] + [False])[dono]]
        dedos = ["%sHand%s%d" % (TRABALHA, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)]
        mao = _distancia(bvh, m(TRABALHA + "Hand", *dedos))
        dedos_l = ["%sHand%s%d" % (LIVRE, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)]
        mao_l = _distancia(bvh, m(LIVRE + "Hand", *dedos_l))
        return ("punho E %+.0f° (sinal: + flexão) | palma E %.0f° da vertical | mão E × perna %+.1f mm | mão D × perna "
                "%+.1f mm | punho E %.0f mm além do joelho" % (
                    tc.punho_flexao(j)[0], tc.palma_cima(j)[0], mao * 1000, mao_l * 1000, tc.punho_alem_joelho(j)[0]))

    pegs = [(TRABALHA, ck.Barra(halter, raio=RAIO, meio_compr=PEGADA_H / 2))]
    return Cena(pose, [halter], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.3, 0.6),
                camera_video=((2.6, -2.7, 1.05), (0.05, -0.3, 0.6), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
