# Tríceps Testa na Polia Alta em Pé — cena da fábrica 3D (lote 3, 05/10/2026; exercício novo pedido pelo Weslley: "O que
# eu quero é esse que vou mandar" — a referência visual dele, 5 quadros).
# t = 0 começo: cotovelos dobrados, mãos com a corda atrás da cabeça · t = 1 fim: cotovelos estendidos (sem travar), braços
# esticados à frente, perto da horizontal.
# Técnica (ExRx, Cable Bent-over Triceps Extension with rope attachment): de COSTAS pra polia ("Turn body away from pulley
# apparatus and position turned rope attachment behind neck"), tronco inclinado ("Bend over downward"), base de passada
# ("Lunge forward with one leg"), o cabo puxa os cotovelos pra trás no começo ("Allow elbows to be pulled back under cable
# resistance"), estende pra frente até o cotovelo ficar reto ("Extend forearms forward until elbows are straight") e o
# ombro não mexe ("maintain degree of shoulder flexion"); ACE, Cable Rope Extension: "slightly hinge forward from the hips
# to maintain a neutral spine", "splitting the rope at full arm extension" (as mãos se afastam um pouco no fim).
# Montagem: roldana alta a 2,1 m, atrás da pessoa e na linha dela; pé esquerdo à frente, chapado, joelho a 55°; pé direito
# atrás, na ponta (calcanhar levantado, como na referência), joelho a 30°; tronco a 57° da vertical dobrando no quadril
# (o da referência), coluna neutra, cabeça na linha do tronco. Corda com pegada neutra (palmas uma pra outra), cada mão logo
# acima do batente (o polegar novo, em volta da corda); braços ao lado da cabeça apontando pra frente, PARADOS: só o
# cotovelo mexe, o antebraço gira num plano fixo um pouco inclinado pra dentro (as mãos ficam a ~21 cm uma da outra atrás da
# cabeça e a ~27 cm no fim), punho reto. O cabo desce da roldana até o gancho da corda, por cima da cabeça e das costas, em
# todo quadro (equip3d.polia + equip3d.corda_polia).
# Pernas como no afundo (cenas/afundo_com_halteres.py: pé de trás girando em volta da base dos dedos); braço parado e
# antebraço girando no cotovelo como nos tríceps na polia (cenas/triceps_testa_na_polia.py, cenas/triceps_pulley.py).
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
FRENTE, TRAS = "Left", "Right"
X_PE = 0.13                    # tornozelos a ±13 cm do meio do corpo: cada pé embaixo do seu quadril
Y_FRENTE = -0.36               # tornozelo da frente (m; o boneco olha pra −Y): canela da frente quase vertical
Y_DEDOS_TRAS = 0.48            # base dos dedos do pé de trás (m): mais perto, o calcanhar de trás desce (0,44 m: sola a 23°)
JOELHO_FRENTE = 55.0           # flexão do joelho da frente (graus), parada
JOELHO_TRAS = 30.0             # flexão do joelho de trás (graus), parada: a inclinação da sola de trás sai daqui
RECUA = 0.0                    # articulações do quadril atrás do y = 0 (m)
INCLINA = 57.0                 # tronco à frente da vertical (graus), dobrando no quadril (coluna neutra): o da referência
CABECA = 0.0                   # pescoço: + levanta o olhar (extensão), graus; 0 = cabeça na linha do tronco
OMBRO = 150.0                  # flexão do ombro (braço × tronco, tecnica3d.braco_frente), graus, parada: braço ~3° acima
                               # da horizontal, como na referência
FECHA = 4.0                    # braço fechando pra dentro, graus: cotovelos a ~37 cm (ombros a 40 cm; ACE: "elbows
                               # shoulder-width apart"); com 7° o antebraço/mão passava a 5 mm do cabelo no meio
DENTRO = 10.0                  # plano do antebraço inclinado pra dentro, graus (as mãos se aproximam quando o cotovelo
                               # dobra); a mão passa a ≥ 2 cm do cabelo por cima da cabeça
COTOVELO = (118.0, 6.0)        # flexão do cotovelo no começo → no fim (graus): no começo o antebraço fica ~59° acima da
                               # horizontal, pra trás (referência: ~50°), com a corda atrás da cabeça
POLIA_Y, POLIA_Z, ALTO = 0.85, 2.10, 2.35   # eixo da roldana (atrás da pessoa) e altura da coluna
LADOS = (("Left", 1), ("Right", -1))
CABECA_PARTES = ("Head", "Neck")


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def pernas_e_tronco(bon):
    """Base de passada (pernas por IK, como no afundo: alvos nascem no tornozelo de repouso — alvo = polo dá NaN —, polos
    à frente) e tronco inclinado no quadril. Devolve (altura do quadril, inclinação da sola de trás em graus)."""
    rig = bon.rig
    PB = rig.pose.bones
    pernas, tornozelos = {}, {}
    for lado, s in LADOS:
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        x_polo = s * (X_PE + 0.03 if lado == FRENTE else X_PE - 0.055)
        polo = p3.vazio("polo_joelho_" + lado, (x_polo, -1.2, 0.55 if lado == FRENTE else 0.30))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polo)
    p3.travar_rotacao(rig, FRENTE + "Foot")              # pé da frente chapado, apontando pra frente
    rot_pe_tras = p3.travar_rotacao(rig, TRAS + "Foot")  # pé de trás: gira em volta da base dos dedos
    M_pe_tras = rot_pe_tras.matrix_world.copy()
    p3.travar_rotacao(rig, TRAS + "ToeBase")             # dedos do pé de trás chapados no chão
    tz0 = p3.cabeca(rig, TRAS + "Foot")
    mtp0 = p3.cabeca(rig, TRAS + "ToeBase")
    v_pe = tz0 - mtp0                                     # base dos dedos → tornozelo, pé chapado
    dedos_tras = Vector((-X_PE + (mtp0.x - tz0.x), Y_DEDOS_TRAS, mtp0.z))
    tornozelo_frente = Vector((X_PE, Y_FRENTE, p3.cabeca(rig, FRENTE + "Foot").z))

    def _pernas(z, sola):
        """Articulações do quadril na altura z (RECUA atrás do y = 0), tronco inclinado INCLINA e a sola do pé de trás a
        `sola` graus do chão (o pé gira em volta da base dos dedos)."""
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo, mover=Vector((0, RECUA - pivo.y, z - pivo.z)))
        R = p3.rot_x(sola)
        tornozelos[FRENTE].location = tornozelo_frente
        tornozelos[TRAS].location = dedos_tras + R @ v_pe
        rot_pe_tras.matrix_world = R.to_4x4() @ M_pe_tras
        p3.atualizar()
        if CABECA:
            p3.girar_osso(rig, "Neck", p3.rot_x(-CABECA))

    def _joelhos():
        f = ck.medir_juntas(rig)
        return f["joelhoE" if FRENTE == "Left" else "joelhoD"], f["joelhoD" if TRAS == "Right" else "joelhoE"]

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

    # altura do quadril pela flexão do joelho da frente; sola de trás pela flexão do joelho de trás (2 voltas, com os polos
    # dos joelhos acertados na pose)
    z_q, sola = 0.80, 40.0
    for _ in range(2):
        _pernas(z_q, sola)
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            print("polo joelho", lado, "erro %.3f ang %d" % e)
        z_q = _bissecao(lambda z: (_pernas(z, sola), _joelhos()[0])[1], 0.60, 0.92, JOELHO_FRENTE)
        sola = _bissecao(lambda a: (_pernas(z_q, a), _joelhos()[1])[1], 2.0, 85.0, JOELHO_TRAS)
    _pernas(z_q, sola)
    jf, jt = _joelhos()
    print("PERNAS quadril z %.3f | sola de trás %.1f° | joelho frente %.1f° trás %.1f°" % (z_q, sola, jf, jt))
    return z_q, sola


def geometria_bracos(rig, ombro=None, fecha=None, dentro=None):
    """Braço parado e plano do antebraço, no referencial do tronco (tecnica3d.eixos_tronco), com o tronco já posto.
    Por lado: a = ombro → cotovelo (unitário), d = pra onde o antebraço dobra (⟂ a: pra trás da cabeça e um pouco pra
    dentro), E = cotovelo, palma = normal do plano do antebraço virada pro meio (pegada neutra). O antebraço com o cotovelo a
    b graus de flexão aponta pra a·cos b + d·sen b."""
    ombro = OMBRO if ombro is None else ombro
    fecha = FECHA if fecha is None else fecha
    dentro = DENTRO if dentro is None else dentro
    c = lambda n: p3.cabeca(rig, n)
    cima = (c("Neck") - c("Hips")).normalized()
    lado_v = c("RightArm") - c("LeftArm")
    lado_v = (lado_v - cima * lado_v.dot(cima)).normalized()
    frente = cima.cross(lado_v)
    g = dict(S={l: c(l + "Arm") for l, _ in LADOS}, Lb=(c("LeftForeArm") - c("LeftArm")).length,
             La=(c("LeftHand") - c("LeftForeArm")).length, a={}, d={}, E={}, palma={})
    fi, ka, ps = math.radians(ombro), math.radians(fecha), math.radians(dentro)
    for lado, s in LADOS:
        meio = lado_v * s                                 # pro meio do corpo
        sag = -cima * math.cos(fi) + frente * math.sin(fi)
        a = (sag * math.cos(ka) + meio * math.sin(ka)).normalized()
        q = -frente * math.cos(ps) + meio * math.sin(ps)
        d = (q - a * q.dot(a)).normalized()
        n = a.cross(d)
        g["a"][lado], g["d"][lado] = a, d
        g["palma"][lado] = n if n.dot(meio) > 0 else -n
        g["E"][lado] = g["S"][lado] + a * g["Lb"]         # cotovelo parado o movimento todo
    return g


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                # mão de referência da corda de 28 mm (antes do Maos)
    rig = bon.rig
    pernas_e_tronco(bon)
    c = lambda n: p3.cabeca(rig, n)
    g = geometria_bracos(rig)
    S, a, d, E, palma, Lb, La = g["S"], g["a"], g["d"], g["E"], g["palma"], g["Lb"], g["La"]

    def antebraco(lado, b):
        """Direção do antebraço (cotovelo → punho) com o cotovelo a `b` graus de flexão."""
        r = math.radians(b)
        return a[lado] * math.cos(r) + d[lado] * math.sin(r)

    def mao(lado, b):
        dq = antebraco(lado, b)                           # punho reto: dedos na linha do antebraço
        pq = (palma[lado] - dq * palma[lado].dot(dq)).normalized()
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
        dq, pq, lat = mao(lado, B_REF)
        W = E[lado] + dq * La
        maos.segurar(lado, W + dq * 0.09, dq, pq, polo=polo(lado, E[lado], W))
        off = (W + dq * 0.09) - c(lado + "Hand")
        off_local[lado] = (off.dot(dq), off.dot(pq), off.dot(lat))
        print("REF %s: vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão %.1f mm" % (
            lado, *off_local[lado], maos.erro[lado] * 1000))

    def juntas(b):
        out = {}
        for lado, _ in LADOS:
            dq, pq, lat = mao(lado, b)
            W = E[lado] + dq * La
            o = off_local[lado]
            out[lado] = (W, W + dq * o[0] + pq * o[1] + lat * o[2], dq, pq)
        return out

    pol = e3.polia("polia", x=0.0, y=POLIA_Y, altura=POLIA_Z, frente=(0, -1, 0), alto=ALTO)
    corda = e3.corda_polia("corda", raio=RAIO)

    # pontos do corpo pras folgas (o tronco e a cabeça não mexem no exercício)
    co0, _, (nomes0, dono0) = ck._avaliar(bon.corpo, 1)
    cab_pts = co0[np.array([n in CABECA_PARTES for n in nomes0] + [False])[dono0]]
    costas_pts = co0[np.array([n in ("Spine1", "Spine2", "LeftShoulder", "RightShoulder") for n in nomes0] + [False])[dono0]]
    cab_co, cab_tri = ck._avaliar_simples(bon.cabelo)
    todos_cab = np.concatenate([cab_pts, cab_co])
    bvh_cabelo = BVHTree.FromPolygons([tuple(x) for x in cab_co], [tuple(t) for t in cab_tri], all_triangles=True)
    braco_mao = {l + n for l, _ in LADOS for n in ["ForeArm", "Hand"] + ["Hand%s%d" % (d_, i) for d_ in (
        "Thumb", "Index", "Middle", "Ring", "Pinky") for i in (1, 2, 3)]}

    def mao_cabelo():
        """Antebraços e mãos → cabelo (m, sem sinal: o cabelo é uma casca aberta)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = np.array([n in braco_mao for n in nomes] + [False])[dono]
        return min(bvh_cabelo.find_nearest(Vector(v))[3] for v in co[m])

    def folgas_cena():
        """Corda (pernas e gancho) e cabo → pele da cabeça/pescoço + cabelo, e cabo → costas (m)."""
        J, Ent = corda.juncao, corda.entradas
        pernas_ = min(float(_dist_segmento(todos_cab, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        A = pol.saida
        u = (A - J).normalized()
        gancho_ = float(_dist_segmento(todos_cab, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        cabo_cab = float(_dist_segmento(todos_cab, J + u * corda.engate, A).min()) - 0.003
        cabo_costas = float(_dist_segmento(costas_pts, J + u * corda.engate, A).min()) - 0.003
        return pernas_, gancho_, cabo_cab, cabo_costas

    def pose(t):
        """t=0 cotovelos dobrados (mãos atrás da cabeça), t=1 braços estendidos à frente."""
        b = p3.lerp(*COTOVELO, t)
        j = juntas(b)
        for lado, _ in LADOS:
            W, g, dq, pq = j[lado]
            maos.segurar(lado, g, dq, pq, polo=polo(lado, E[lado], W))
        peg = {}
        for lado, s in LADOS:                     # corda no vão de cada mão, ao longo dos nós dos dedos (indicador → mínimo:
            peg[s] = (j[lado][1], pg._base(rig, lado)[1])     # a corda entra do lado do polegar e o batente fica no mínimo)
        eng = corda.por(peg, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        for lado, s in LADOS:                     # dedos e polegar fecham até a pele encostar na corda
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, peg[s][0], peg[s][1], RAIO, polegar_antes=antes)
        pose.desvio = {l: (c(l + "ForeArm") - E[l]).length * 1000 for l, _ in LADOS}
        pose.folgas = [x * 1000 for x in folgas_cena()]
        pose.maos = (peg[1][0] - peg[-1][0]).length * 1000

    pose.dedos = {}
    pose.desvio = {}
    pose.folgas = [0.0] * 4
    pose.maos = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 1.0):
        pose(t)
        u = pol.direcao(corda.juncao)
        print("POLIA ALTA t=%.0f | cotovelo E %.0f° | vãos das mãos a %.0f mm | junção (%.3f %.3f %.3f) | cabo × horizontal "
              "%.1f° | pernas → cabeça %.0f mm | gancho → cabeça %.0f mm | cabo → cabeça %.0f mm | cabo → costas %.0f mm" % (
                  t, ck.medir_juntas(rig)["cotoveloE"], pose.maos, *corda.juncao,
                  math.degrees(math.asin(max(-1.0, min(1.0, u.z)))), *pose.folgas))
    print("BRAÇO ombro E (%.3f %.3f %.3f) cotovelo E (%.3f %.3f %.3f) | técnica %s" % (
        *S["Left"], *E["Left"], ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))

    def info():
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return maos.info() + (" | cotovelo fora do calculado E %.1f D %.1f mm | vãos a %.0f mm | pernas da corda → cabeça "
                              "%.0f mm | gancho → cabeça %.0f mm | cabo → cabeça %.0f mm | cabo → costas %.0f mm | antebraço/"
                              "mão → cabelo %.0f mm | cabo %.3f m | polegar %s") % (
            pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.maos, *pose.folgas, mao_cabelo() * 1000,
            pol.comprimento, pol_)

    pegs = [(l, ck.Barra(corda.pontas[s], raio=RAIO, meio_compr=corda.meia)) for l, s in LADOS]
    return Cena(pose, corda.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.1, 1.1),
                camera_video=((4.3, -1.7, 1.45), (0, 0.0, 1.1), 50), info=info)
