# Rosca Concentrada com Halter — cena da fábrica 3D (lote 7, 09/10/2026; exercício dos treinos prontos do app).
# t = 0 braço direito quase esticado, o halter pendurado entre os pés · t = 1 cotovelo dobrado ao máximo (o "pico"), o
# halter na frente do ombro direito, perto do peito. O app faz a volta (desce até esticar de novo).
# Técnica (UM braço, o direito — o lado das descrições do ACE, do Yessis e da NFPT e do vídeo da ExRx):
#   • sentado na ponta do banco reto, pernas afastadas e pés chapados (Yessis, Concentration Curl: "Sit on the edge of an
#     exercise bench with your legs apart and feet flat on the floor"; NFPT: "sit on a flat bench, feet flat on the
#     floor"); o halter começa pendurado entre os pés (ExRx, Dumbbell Concentration Curl: "Grasp dumbbell between feet";
#     ACE, Build Your Biceps Workout: "allow the dumbbell to hang between your legs");
#   • tronco inclinado à frente pelo quadril (Yessis: "Bend over"; NFPT: "Lean forward"), costas retas;
#   • a parte de trás do braço encostada na parte de dentro da coxa do mesmo lado, perto do joelho (ExRx: "Place back of
#     upper arm to inner thigh. Lean into leg to raise elbow slightly."; ACE: "Place the back
#     of your right upper arm against the inside of your inner right thigh"; NFPT: "Rest your right elbow against the
#     inside of your right thigh (just inside your knee)"); o braço fica parado assim o movimento todo (ACE: "all while
#     keeping the upper arm in contact with the inner thigh"; NFPT: "If you allow your elbow to rise up as you raise the
#     dumbbell, you will be using your shoulder"); o estudo do ACE (Young et al. 2014) explica o isolamento por isso:
#     "the humerus is pressed against the leg and does not allow the upper arm to sway";
#   • a outra mão apoiada na outra perna (Yessis: "place the elbow or hand of the left arm on the left thigh for support";
#     no vídeo da ExRx a mão esquerda fica em cima do joelho esquerdo);
#   • pegada supinada (Yessis: "underhand (supinated) grip"; ACE: "With the palm facing forward" embaixo), punho reto;
#   • só o cotovelo mexe: sobe o halter pra frente do ombro (ExRx: "Raise dumbbell to front of shoulder"; Yessis: "so that
#     it comes close to touching the chest"; NFPT: "Raise the dumbbell up at a right angle to your thigh") e desce até
#     esticar o braço (ExRx: "Lower dumbbell until arm is fully extended"; o Yessis prefere parar um pouco antes:
#     "Start with the elbow bent approximately 160-170").
# Montagem: o boneco senta com o joelho em cima do tornozelo e os pés virados um pouco pra fora (o polo do joelho fica do
# lado do joelho calculado: com os pés afastados o polo "pra cima" da rosca punho deixava o joelho 5 cm pra dentro do pé);
# o tronco inclina INCLINA graus em volta das articulações do quadril e a cabeça fica na linha dele; a mão esquerda segura
# o joelho esquerdo por cima (a palma na patela, os dedos descendo pela frente dela) com o cotovelo dobrado pra trás; a
# cintura escapular direita desce e vai à frente (ESCAPULA) e o braço direito fica PARADO, com o cotovelo à frente do ombro
# (ALFA) e pra dentro o quanto a pele do braço encosta na da coxa (busca em beta, AFUNDA): a parte de trás do braço, ~10 cm
# acima do cotovelo, apoia na borda de dentro e de cima da coxa e o cotovelo e o antebraço ficam soltos por dentro dela.
# O antebraço gira num plano fixo (o do cotovelo), do quase esticado ao dobrado ao máximo, e a palma acompanha
# (supinada: virada pro lado em que o antebraço sobe). Contas e tentativas: sondas em
# physiqcalc-scratch/lote4/rosca_concentrada_com_halter/exp/.
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

TRABALHA, LIVRE = "Right", "Left"
ASSENTO = 0.44           # topo do banco reto (m), igual aos outros bancos da fábrica
LARGURA = 0.30           # largura do estofado
FRENTE = 0.20            # borda da frente do banco à frente da articulação do quadril (m): glúteo e começo das coxas no
                         # banco, joelhos e pernas pra fora dele (a ponta do banco)
PE_X = 0.30              # tornozelos a 30 cm do meio (m): pernas afastadas, o halter passa entre os pés
PE_GIRO = 15.0           # pontas dos pés viradas pra fora (graus): o joelho fica na linha do pé
INCLINA = 41.0           # tronco à frente da vertical, em volta das articulações do quadril (graus): junto com a cintura
                         # escapular abaixada (ESCAPULA), o ombro desce até o braço alcançar a parte de dentro da coxa; o
                         # quadril fica em ~126°, dentro dos 130° do limites.py (com 45° passava de 130)
PESCOCO = 10.0           # pescoço estendido (graus) em relação ao repouso: a cabeça fica na linha do tronco (o repouso
                         # do boneco tem a cabeça 11° pra frente) e o rosto sai de cima do halter em cima
ALFA = 8.0               # braço (ombro → cotovelo) à frente da vertical (graus): o cotovelo um pouco à frente do ombro;
                         # o braço encosta na coxa a ~75% do quadril até o joelho
RHO = 5.0                # direção em que o antebraço sobe, vista de cima: da frente (0) pro meio do corpo (90) (graus).
                         # Sobe quase reto pra frente: em cima o halter fica na frente do ombro (ExRx); com 10° ou mais
                         # a anilha de dentro chegava no rosto (sonda de 09/10/2026)
COTOVELO = (8.0, 135.0)  # flexão do cotovelo: quase esticado embaixo (t=0) → o máximo em cima (t=1)
AFUNDA = 0.001           # pele do braço encostando na pele da coxa: afunda até isso (m)
ESCAPULA = (10.0, 12.0)  # cintura escapular direita (graus): depressão e protração — o ombro desce ~3,6 cm quando o braço se
                         # apoia na coxa ("Lean into leg"). Sem isso o cotovelo só alcançava a borda de cima da coxa e o
                         # antebraço pendurado embaixo entrava 1–2 cm nela (sonda de 09/10/2026); com o ombro mais baixo a
                         # parte de trás do braço, ~10 cm acima do cotovelo, encosta na borda de dentro e de cima da coxa e
                         # o cotovelo e o antebraço ficam soltos por dentro dela, sem mudar o contato com a dobra
MAO_APOIO = 45.0         # mão de apoio: dedos descendo pela frente da patela, graus abaixo da horizontal
POLO_APOIO = (0.25, 0.5, -0.3)  # polo do cotovelo de apoio (pra fora, pra trás, pra cima; m): cotovelo dobrado pra trás
RAIO = 0.0145            # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13          # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
PERNA_D = ("RightUpLeg", "RightLeg")
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


def _mais_perto(bvh, pts):
    """Como _distancia, mas devolve também o ponto do corpo mais perto e o da superfície."""
    menor, par = 1e9, None
    for p in pts:
        v = Vector(p)
        loc, nor, idx, dist = bvh.find_nearest(v)
        if loc is None:
            continue
        d = -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist
        if d < menor:
            menor, par = d, (v, loc)
    return menor, par


def montar(bon):
    pg.usar_polegar("volta")                           # polegar dando a volta no halter (exercícios novos, 05/10/2026)
    rig = bon.rig
    PB = rig.pose.bones
    Lb = (p3.cabeca(rig, TRABALHA + "ForeArm") - p3.cabeca(rig, TRABALHA + "Arm")).length      # braço
    La = (p3.cabeca(rig, TRABALHA + "Hand") - p3.cabeca(rig, TRABALHA + "ForeArm")).length     # antebraço
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    tornozelo_z = p3.cabeca(rig, "LeftFoot").z                                     # pé chapado em pé

    # ── pernas por IK (alvos nascem no tornozelo de repouso: alvo = polo dá NaN) e pés chapados, virados pra fora ────
    tornozelos, polos_j, pernas = {}, {}, {}
    for lado, s in dt.LADOS:
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos_j[lado] = p3.vazio("polo_joelho_" + lado, p3.cabeca(rig, lado + "Leg") + Vector((s * 0.04, -0.6, 0.3)))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos_j[lado])
        rot = p3.travar_rotacao(rig, lado + "Foot")
        rot.matrix_world = Matrix.Rotation(math.radians(s * PE_GIRO), 4, "Z") @ rot.matrix_world
    # ── braços por IK (o direito trabalha, o esquerdo descansa) ─────────────────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, -0.5)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    pivo0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    y_frente = pivo0.y - FRENTE

    def _sentar(inclina):
        """Tronco inclinado `inclina` graus à frente em volta das articulações do quadril, joelho bem em cima do tornozelo
        (canela em pé) com os tornozelos a PE_X do meio, e a pele do glúteo e das coxas em cima do banco afundando 2 mm
        no estofado."""
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), pivo=pivo0)
        for volta in range(25):
            for lado, s in dt.LADOS:
                q = p3.cabeca(rig, lado + "UpLeg")
                dz = q.z - (tornozelo_z + canela)
                dx = s * PE_X - q.x
                dy = math.sqrt(max(coxa ** 2 - dz ** 2 - dx ** 2, 1e-6))
                K = Vector((s * PE_X, q.y - dy, tornozelo_z + canela))     # joelho em cima do tornozelo
                tz = Vector((s * PE_X, q.y - dy, tornozelo_z))
                tornozelos[lado].location = tz
                eixo = (tz - q).normalized()                                 # polo do lado do joelho calculado
                fora = (K - q) - eixo * (K - q).dot(eixo)
                polos_j[lado].location = K + fora.normalized() * 0.5
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

    def _mao_no_angulo(lado, graus, palma0):
        """Mão `lado` com o punho dobrado `graus` (+ flexão, pro lado da palma) a partir da mão alinhada com o antebraço
        (3º metacarpo na linha do antebraço) e a palma virada pra `palma0` (⟂ antebraço)."""
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        a = (f1 - f0).normalized()
        n0 = (palma0 - a * palma0.dot(a)).normalized()
        g = math.radians(graus)
        _mao_quadro(lado, a * math.cos(g) + n0 * math.sin(g), n0 * math.cos(g) - a * math.sin(g))

    def _mao_no_joelho(lado):
        """Braço que não trabalha (Yessis: "place the elbow or hand of the left arm on the left thigh for support"; no vídeo
        da ExRx a mão fica em cima do joelho): a mão segura o joelho por cima — a palma em cima da patela, virada pra baixo
        e pra trás, e os dedos descendo pela frente dela (MAO_APOIO graus abaixo da horizontal, ao longo da coxa) —, com o
        cotovelo dobrado pra trás e um pouco pra fora (o polo POLO_APOIO). O punho vai por IK até a palma encostar na pele
        (−AFUNDA) no topo da patela; depois cada dedo cai até encostar e o polegar encosta na lateral."""
        s = 1 if lado == "Left" else -1
        H, K = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Leg")
        t = (K - H).normalized()
        _, co, nomes, dono = _bvh_de(bon, PERNA)
        P = co[np.array([n in (lado + "UpLeg", lado + "Leg") for n in nomes] + [False])[dono]]
        sk = (P - np.array(K)) @ np.array(t)
        perto = P[np.abs(sk) < 0.04]
        topo = Vector(perto[np.argmax(perto[:, 2])])                     # topo da patela
        horiz = Vector((t.x, t.y, 0)).normalized()
        tr = math.radians(MAO_APOIO)
        dq = (horiz * math.cos(tr) + Vector((0, 0, -1)) * math.sin(tr)).normalized()     # dedos descendo pela patela
        pq = (Vector((0, 0, -1)) * math.cos(tr) - horiz * math.sin(tr)).normalized()     # palma pra baixo e pra trás
        alvo = topo + horiz * 0.01
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.6)
        p3.fechar_mao(rig, lado, angulos=(6, 8, 4), polegar=(10, 20, 15))       # mão relaxada: dedos quase retos
        bvh = _bvh_de(bon, PERNA)[0]
        S = p3.cabeca(rig, lado + "Arm")
        W = alvo - dq * 0.07 + Vector((0, 0, 0.05))
        dz = 0.0
        for volta in range(16):
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + lado + n].matrix_basis = Matrix()
            polos[lado].location = (S + W) / 2 + Vector((s * POLO_APOIO[0], POLO_APOIO[1], POLO_APOIO[2]))
            iks[lado].mute = False
            punhos[lado].location = W
            p3.atualizar()
            if volta == 0:
                p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            _congelar(lado)
            _girar_antebraco(lado, pq)
            _mao_quadro(lado, dq, pq)
            co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
            Pm = co[np.array([n == lado + "Hand" for n in nomes] + [False])[dono]]
            prof = Pm @ np.array(-pq)                                      # o lado da palma
            apoio = Pm[prof > prof.max() - 0.008].mean(axis=0)
            dz = _distancia(bvh, Pm) + AFUNDA
            lateral = alvo - Vector(apoio)
            lateral -= pq * lateral.dot(pq)
            mexe = lateral + pq * dz
            if mexe.length < 0.0007:
                break
            W = W + mexe
        _dedos_encostando(lado, bvh)
        pol = _polegar_encostando(lado, bvh)
        return dz - AFUNDA, pol

    # ── sentado, tronco inclinado ─────────────────────────────────────────────────────────────────────────────────
    _sentar(INCLINA)
    if PESCOCO:
        p3.girar_osso(rig, "Neck", p3.rot_x(-PESCOCO))
    zq = ((p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2).z
    jt = ck.medir_juntas(rig)
    print("SENTADO: tronco %.1f° à frente | quadril z %.3f | quadril E %.0f° D %.0f° | joelho E %.0f° D %.0f° | joelho D "
          "(%.3f %.3f %.3f) tornozelo D (%.3f %.3f %.3f)" % (
              INCLINA, zq, jt["quadrilE"], jt["quadrilD"], jt["joelhoE"], jt["joelhoD"],
              *p3.cabeca(rig, "RightLeg"), *p3.cabeca(rig, "RightFoot")), flush=True)

    # ── braço esquerdo em descanso: mão solta apoiada em cima da coxa esquerda, perto do joelho ──────────────────────
    palma_l, pol_l = _mao_no_joelho(LIVRE)
    jt = ck.medir_juntas(rig)
    print("APOIO: mão esquerda no joelho, palma %+.1f mm da pele | polegar %s | juntas: cotovelo E %.0f° punho E %.0f° ombro E "
          "%.0f° | cotovelo E (%.3f %.3f %.3f)" % (palma_l * 1000, tuple(round(float(x), 3) for x in pol_l), jt["cotoveloE"],
                                                  jt["punhoE"], jt["ombroE"], *p3.cabeca(rig, LIVRE + "ForeArm")), flush=True)
    ossos_livre = sorted((pb.name for pb in PB if pb.name[len(p3.P):].startswith((LIVRE + "Arm", LIVRE + "ForeArm",
                                                                                     LIVRE + "Hand"))),
                         key=lambda n: len(PB[n].parent_recursive))
    livre_mats = [(n, PB[n].matrix.copy()) for n in ossos_livre]

    # ── braço direito: a cintura escapular desce e vai à frente (ESCAPULA); o braço fica PARADO, com o cotovelo à frente
    # do ombro (ALFA) e pra dentro o quanto a pele do braço encosta na da coxa direita (busca em beta); o antebraço sobe no
    # plano que tem o braço e a direção RHO (vista de cima) ─────────────────────────────────────────────────────────────
    cima = (p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).normalized()
    lado_t = p3.cabeca(rig, "RightShoulder") - p3.cabeca(rig, "LeftShoulder")
    lado_t = (lado_t - cima * lado_t.dot(cima)).normalized()
    frente_t = cima.cross(lado_t).normalized()                   # tecnica3d: frente = cima × (esquerdo → direito)
    S0 = p3.cabeca(rig, TRABALHA + "Arm")
    dep, prot = (math.radians(x) for x in ESCAPULA)
    sd = 1.0 if TRABALHA == "Right" else -1.0                    # o ombro direito desce girando em volta da frente
    p3.girar_osso(rig, TRABALHA + "Shoulder", Matrix.Rotation(sd * dep, 3, frente_t) @ Matrix.Rotation(sd * prot, 3, cima))
    S = p3.cabeca(rig, TRABALHA + "Arm")
    print("ESCÁPULA D: depressão %.0f° protração %.0f° → ombro anda (%+.0f %+.0f %+.0f) mm" % (
        *ESCAPULA, *((S - S0) * 1000)), flush=True)
    sm = 1.0 if TRABALHA == "Right" else -1.0         # +X é pro meio do corpo pro braço direito

    def _u(beta):
        a, b = math.radians(ALFA), math.radians(beta)
        return Vector((sm * math.sin(b), -math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b))).normalized()

    def _a0(u):
        r = math.radians(RHO)
        h = Vector((sm * math.sin(r), -math.cos(r), 0.0))
        return (h - u * h.dot(u)).normalized()

    def _antebraco(u, a0, fi):
        """Direção do antebraço (cotovelo → punho) e da palma (supinada) com o cotovelo dobrado `fi` graus."""
        f = math.radians(fi)
        return u * math.cos(f) + a0 * math.sin(f), -u * math.sin(f) + a0 * math.cos(f)

    def _por_braco(E, u, a0, fi):
        """Braço por IK com o cotovelo em E e o punho no círculo do antebraço; congelado e supinado."""
        d, palma = _antebraco(u, a0, fi)
        W = E + d * La
        for n in ("Arm", "ForeArm", "Hand"):            # o IK parte sempre do repouso: o quadro não depende do anterior
            PB[p3.P + TRABALHA + n].matrix_basis = Matrix()
        iks[TRABALHA].mute = False
        punhos[TRABALHA].location = W
        eixo = (W - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        polos[TRABALHA].location = E + fora.normalized() * 0.4
        p3.atualizar()
        if not _por_braco.acertado:
            p3.acertar_polo(rig, iks[TRABALHA], TRABALHA + "ForeArm", TRABALHA + "Arm", TRABALHA + "Hand")
            _por_braco.acertado = True
        _congelar(TRABALHA)
        _girar_antebraco(TRABALHA, palma)
        return palma

    _por_braco.acertado = False

    def _contato(beta, fi, partes=(TRABALHA + "Arm",)):
        u = _u(beta)
        a0 = _a0(u)
        _por_braco(S + u * Lb, u, a0, fi)
        bvh, co, nomes, dono = _bvh_de(bon, PERNA_D)
        A = co[np.array([n in partes for n in nomes] + [False])[dono]]
        return _mais_perto(bvh, A)

    lo = hi = None                                      # beta: varre de dentro pra fora até a pele entrar e afina
    for b in np.arange(40.0, -40.1, -5.0):
        if _contato(b, COTOVELO[0])[0] > -AFUNDA:
            lo = b
        else:
            hi = b
            break
    if lo is None or hi is None:
        raise RuntimeError("o braço direito não encosta na coxa")
    for _ in range(18):
        meio = (lo + hi) / 2
        if _contato(meio, COTOVELO[0])[0] > -AFUNDA:
            lo = meio
        else:
            hi = meio
    BETA = (lo + hi) / 2
    U = _u(BETA)
    A0 = _a0(U)
    E = S + U * Lb
    d, (p_braco, p_coxa) = _contato(BETA, COTOVELO[0])
    Hd, Kd = p3.cabeca(rig, "RightUpLeg"), p3.cabeca(rig, "RightLeg")
    t_coxa = (Kd - Hd).normalized()
    rel = p_coxa - Hd
    f_coxa = rel.dot(t_coxa) / coxa
    radial = rel - t_coxa * rel.dot(t_coxa)
    n_t = Vector((0, 0, 1)).cross(t_coxa).normalized()
    if n_t.x * sm < 0:
        n_t.negate()
    b_t = t_coxa.cross(n_t).normalized()
    if b_t.z < 0:
        b_t.negate()
    delta = math.degrees(math.atan2(radial.dot(b_t), radial.dot(n_t)))
    ao_braco = (p_braco - E) - U * (p_braco - E).dot(U)
    lado_braco = math.degrees(math.atan2(ao_braco.dot(U.cross(A0)), ao_braco.dot(-A0)))
    print("BRAÇO D: beta %+.2f° (pra dentro) | cotovelo (%.3f %.3f %.3f), ombro (%.3f %.3f %.3f) | encosta %+.1f mm na coxa a "
          "%.0f%% do quadril até o joelho, %.0f° acima da horizontal de dentro (z %.3f) | o ponto do braço fica a %.0f mm do "
          "cotovelo, %.0f° da parte de trás dele (+ = pro lado do polegar)" % (
              BETA, *E, *S, d * 1000, f_coxa * 100, delta, p_coxa.z, (p_braco - E).length * 1000, lado_braco), flush=True)
    for fi in np.linspace(COTOVELO[0], COTOVELO[1], 5):
        print("   cotovelo %.0f°: braço × coxa %+.1f mm | antebraço × coxa %+.1f mm" % (
            fi, _contato(BETA, fi)[0] * 1000, _contato(BETA, fi, (TRABALHA + "ForeArm",))[0] * 1000), flush=True)

    # ── banco reto debaixo do glúteo e do começo das coxas ─────────────────────────────────────────────────────────
    banco = e3.banco("banco", y_frente, y_frente + 1.20, topo=ASSENTO, largura=LARGURA)

    # ── mão direita: vão da mão de referência guardado no espaço do osso da mão (a mão não muda de forma) ───────────
    halter = e3.halter("halter", pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA)
    _por_braco(E, U, A0, COTOVELO[0])
    pg.mao_de_referencia(rig, TRABALHA)
    g0, _ = pg.ponto_na_mao(bon, TRABALHA, RAIO)
    furo = p3.mundo_osso(rig, TRABALHA + "Hand").inverted() @ g0

    def _restaurar_livre():
        iks[LIVRE].mute = True
        for n, M in livre_mats:
            PB[n].matrix = M
            p3.atualizar()

    def pose(t):
        """t=0 braço quase esticado (halter entre os pés), t=1 cotovelo dobrado ao máximo (halter na frente do ombro)."""
        _restaurar_livre()
        _por_braco(E, U, A0, p3.lerp(*COTOVELO, t))
        pg.mao_de_referencia(rig, TRABALHA)
        g = p3.mundo_osso(rig, TRABALHA + "Hand") @ furo
        eixo = pg._base(rig, TRABALHA)[1]                      # o halter fica na linha dos nós dos dedos
        halter.rotation_mode = "QUATERNION"
        halter.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
        halter.location = g
        p3.atualizar()
        antes = pose.dedos.get("Thumb") if t > 0 else None    # polegar perto do quadro anterior (sem salto)
        pose.dedos = pg.fechar_em_volta(bon, TRABALHA, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    def info():
        j = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        bvh, co, nomes, dono = _bvh_de(bon, PERNA)
        m = lambda *ps: co[np.array([n in ps for n in nomes] + [False])[dono]]
        braco = _distancia(bvh, m(TRABALHA + "Arm"))
        antebraco = _distancia(bvh, m(TRABALHA + "ForeArm"))
        dedos_l = ["%sHand%s%d" % (LIVRE, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)]
        mao_l = _distancia(bvh, m(LIVRE + "Hand", *dedos_l))
        antebraco_l = _distancia(bvh, m(LIVRE + "ForeArm"))
        hz = min(float(ck._avaliar_simples(o)[0][:, 2].min()) for o in [halter] + list(halter.children_recursive)
                 if o.type == "MESH")
        u = (p3.cabeca(rig, TRABALHA + "ForeArm") - p3.cabeca(rig, TRABALHA + "Arm")).normalized()
        f = (p3.cabeca(rig, TRABALHA + "Hand") - p3.cabeca(rig, TRABALHA + "ForeArm")).normalized()
        k = u.cross(f)
        sup = float("nan")
        if k.length > 1e-6:
            frente = k.normalized().cross(f)                  # pra onde o antebraço vai quando o cotovelo dobra
            sup = math.degrees(pg._base(rig, TRABALHA)[0].angle(frente))
        pol = pose.dedos.get("Thumb")
        vao = pol[8] if isinstance(pol, tuple) and len(pol) > 8 else float("nan")
        Sg = p3.cabeca(rig, TRABALHA + "Arm")
        return ("cotovelo D %.0f° | braço D × coxa %+.1f mm, antebraço D %+.1f mm | apoio: antebraço E × coxa "
                "%+.1f mm, mão E × joelho %+.1f mm | halter: chão %+.0f mm, centro − ombro "
                "(%+.0f %+.0f %+.0f) mm | palma × lado em que o antebraço sobe %.0f° | polegar × falange média %.1f mm | "
                "punho D %+.0f°" % (
                    jt["cotoveloD"], braco * 1000, antebraco * 1000, antebraco_l * 1000, mao_l * 1000, hz * 1000, *((halter.location - Sg) * 1000), sup, vao,
                    tc.punho_flexao(j)[1]))

    pegs = [(TRABALHA, ck.Barra(halter, raio=RAIO, meio_compr=PEGADA_H / 2))]
    return Cena(pose, [halter], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.3, 0.6),
                camera_video=((-2.0, -3.0, 1.1), (-0.05, -0.3, 0.6), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
