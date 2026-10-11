# Abdominal na Polia — cena da fábrica 3D (lote 12, 11/10/2026; o "Cable Crunch" do catálogo, ajoelhado na polia alta com a corda).
# t = 0 em cima: ajoelhado no colchonete de frente pra torre, embaixo da roldana alta, os joelhos e as canelas no colchonete e os dedos
# dos pés dobrados nele (o calcanhar pra cima), o quadril pra trás e dobrado (as coxas inclinadas pra trás, o glúteo acima dos
# calcanhares, sem sentar), o tronco inclinado à frente com a lombar arqueada pelo peso, as mãos segurando as 2 pontas da corda dos
# lados da cabeça (os punhos encostando de leve nela, acima das orelhas) e os cotovelos dobrados na frente do corpo · t = 1 embaixo:
# com o quadril parado, a coluna enrola (as costelas descem na direção da pelve) e os cotovelos descem na direção do meio das coxas;
# a cabeça acompanha, com o queixo um pouco pra dentro. Os braços não puxam: ficam parados em relação à cabeça e ao tórax.
# Técnica: free-exercise-db, Cable Crunch (o fonte_en do catálogo): "Kneel below a high pulley that contains a rope attachment." /
# "Grasp cable rope attachment and lower the rope until your hands are placed next to your face." / "Flex your hips slightly and allow
# the weight to hyperextend the lower back. This will be your starting position." / "With the hips stationary, flex the waist as you
# contract the abs so that the elbows travel towards the middle of the thighs." ExRx, Cable Kneeling Crunch: "Kneel below high pulley.
# Grasp cable rope attachment with both hands. Place wrists against head. Position hips back and flex hips, allowing resistance on cable
# pulley to lift torso upward so spine is hyperextended." / "With hips stationary, flex waist so elbows travel toward middle of thighs." /
# "Note movement occurs in waist, not hips." / "Hyperextension of spine at top of motion is achieved by anterior rotation of pelvis with
# hips flexed." / "Certain individuals may need to keep their neck in neutral position with space between their chin and sternum."
# ACE, Standing Crunch (em pé, de costas pra polia; só a mão e a corda): "hold the rope with the right hand by the right ear and the
# left hand by the left ear. Elbows should be tucked in along the front of the body."
# Como o rig faz: ajoelhado como a Flexão Nórdica (cenas/flexao_nordica.py: canela girada pra trás no joelho até o joelho apoiar, pé
# quase em pé e os dedos deitados no colchonete); daí o corpo do joelho pra cima inclina pra trás COXA graus em volta dos joelhos (as
# canelas não saem do lugar) e a pelve inclina pra frente PELVE graus em volta das articulações do quadril (as coxas não saem do
# lugar): o quadril dobrado e a pelve em anteversão (o ângulo da canela é procurado com essa pose inteira, pra pele do joelho apoiar).
# No pose(t) só a coluna (Spine, Spine1 e Spine2, cada um em volta da sua base, como no Abdominal na Máquina) e o pescoço giram; a pelve
# e as pernas ficam paradas (quadril parado). A mão esquerda fica PARADA no referencial da cabeça (vão em MAO) e a direita é o espelho
# dela; o cotovelo fica no círculo que o braço deixa, na direção PSI (no tórax: da frente pro lado). A pegada saiu de uma busca
# (rascunho, sonda5/sonda6): com os cotovelos na frente e a mão parada na cabeça, a direção da corda na mão gira ~105° no movimento (a
# cabeça gira ~94° e o cabo fica quase vertical) e a junção fica sempre do lado das pontas dos dedos — com a palma pro meio e o punho
# reto a perna da corda passava por dentro dos dedos no começo. A palma girada GIRO em volta do antebraço, o punho desviado DESVIO pro
# lado do mínimo e a corda escorregada DESLIZA pro lado da entrada (o batente encostado no mínimo) deixam a corda sair da mão do lado do
# indicador, sem encostar nos dedos, do começo ao fim; a mão acima da orelha deixa o cotovelo a ~125° (com a mão na altura da orelha
# ele ia a 140° e o antebraço entrava no braço). Polia alta (a do Tríceps Corda na Polia, equip3d.polia + equip3d.corda_polia) na
# frente da pessoa.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
RAIO = 0.014                  # corda de 28 mm (equip3d.corda_polia)
TOPO = 0.012                  # colchonete de 12 mm (o dos abdominais no chão)
AFUNDA_JOELHO = 0.003         # pele do joelho/canela dentro do colchonete
AFUNDA_DEDOS = 0.001          # dedos dos pés apertando o colchonete
TORNOZELO = 92                # canela × pé (tecnica3d.tornozelo; em pé ~76°): os dedos dobrados no chão, o pé quase em pé (Nórdica)
COXA = 22.0                   # coxa inclinada pra trás da vertical (graus): o quadril atrás dos joelhos (ExRx: "Position hips back")
PELVE = 75.0                  # a pelve inclina pra frente em volta do quadril (graus, a partir do ajoelhado ereto): quadril dobrado
COLUNA = (("Spine", -8.0, 22.0), ("Spine1", -6.0, 30.0), ("Spine2", 0.0, 26.0))   # (osso, giro em cima, giro embaixo), graus: + =
                              # flexão. Em cima a lombar fica arqueada (extensão) pelo peso; embaixo a coluna enrolada
PESCOCO = (0.0, 5.0)          # flexão do pescoço em cima → embaixo (graus): a cabeça acompanha, o queixo um pouco pra dentro
MAO = (0.125, 0.140, -0.060)  # vão da mão esquerda no referencial do osso Head (x pro lado, y pra cima, z pra frente), m
PSI = 10.0                    # cotovelo: direção no tórax, da frente (0) pro lado (graus): cotovelos na frente do corpo
GIRO = 90.0                   # palma girada em volta do antebraço a partir de "virada pro meio" (graus)
DESVIO = -15.0                # desvio do punho (graus; − = ulnar, pro lado do mínimo; a faixa normal vai a 30)
DESLIZA = 0.003               # a corda escorrega isso pro lado da entrada: o batente fica encostado no mínimo (m)
POLIA_Z, ALTO = 2.05, 2.30    # eixo da roldana alta e altura da coluna (as do Tríceps Corda na Polia)
FOLGA_ROLDANA = 0.012         # o engate fica sempre pelo menos isso do lado da pessoa do eixo da roldana (sem no_plano)
FOLGA_TORRE = 0.06            # cabeça/cabelo/mãos no mínimo isso atrás da frente da torre (o trilho), em todo quadro (m)
COLCH = (0.62, -0.30, 0.55)   # colchonete: largura, y da frente, y de trás (m)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _espelho(v):
    return Vector((-v.x, v.y, v.z))


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)    # mão de referência da corda de 28 mm (antes do Maos)
    pg.usar_polegar("volta")         # polegar dando a volta na corda (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) ajoelhado (Flexão Nórdica): canela deitada no colchonete, pé quase em pé, dedos dobrados no colchonete ──────────────
    dedos_repouso = {L: p3.mundo_osso(rig, L + "ToeBase").to_3x3() for L, _ in LADOS}
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    canela = (cab("LeftFoot") - cab("LeftLeg")).length

    def ajoelhar(beta, ajuste=None):
        """Canelas subindo `beta` graus pra trás (+ `ajuste[lado]` em cada uma), pés quase em pé e dedos deitados no colchonete."""
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for lado, _ in LADOS:
            b = beta + (ajuste or {}).get(lado, 0.0)
            v = cab(lado + "Foot") - cab(lado + "Leg")
            p3.girar_osso(rig, lado + "Leg", p3.rot_x(b - math.degrees(math.atan2(v.z, v.y))))
            f = cab(lado + "ToeBase") - cab(lado + "Foot")
            p3.girar_osso(rig, lado + "Foot", p3.rot_x(b - TORNOZELO - math.degrees(math.atan2(f.z, f.y))))
            p3.girar_osso(rig, lado + "ToeBase", dedos_repouso[lado] @ p3.mundo_osso(rig, lado + "ToeBase").to_3x3().inverted())
        dedos = pele(("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA_DEDOS - float(dedos[:, 2].min()))))

    def contato_joelho():
        """Pele mais baixa da canela perto do joelho (onde ele apoia no colchonete)."""
        K = cab("LeftLeg")
        P = pele(("LeftLeg", "RightLeg"))
        return float(P[P[:, 1] < K.y + 0.15][:, 2].min())

    def montar_pernas(beta, ajuste=None):
        """Ajoelhado com as canelas subindo `beta` graus; o corpo do joelho pra cima inclina COXA graus pra trás em volta dos joelhos
        (as canelas ficam) e a pelve inclina PELVE graus pra frente em volta das articulações do quadril (as coxas ficam). A pele do
        joelho muda um pouco com a coxa inclinada: por isso o beta é procurado com a pose inteira."""
        ajoelhar(beta, ajuste)
        K_ = (cab("LeftLeg") + cab("RightLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(-COXA), pivo=K_)
        for L, _ in LADOS:
            p3.girar_osso(rig, L + "Leg", p3.rot_x(COXA))
        H_ = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(PELVE), pivo=H_)
        for L, _ in LADOS:
            p3.girar_osso(rig, L + "UpLeg", p3.rot_x(-PELVE))
        return K_, H_

    beta = 10.0
    for _ in range(12):                     # beta até o joelho apoiar no colchonete (com os dedos nele), com a pose inteira
        montar_pernas(beta)
        erro = contato_joelho() + AFUNDA_JOELHO - TOPO
        if abs(erro) < 0.0003:
            break
        beta += math.degrees(erro / (canela * math.cos(math.radians(beta))))
    ajuste = {lado: 0.0 for lado, _ in LADOS}
    for _ in range(3):                      # cada pé com os dedos no colchonete (o boneco não é simétrico ao milímetro)
        montar_pernas(beta, ajuste)
        for lado, _ in LADOS:
            z = float(pele((lado + "Foot", lado + "ToeBase"))[:, 2].min()) + AFUNDA_DEDOS - TOPO
            ajuste[lado] -= math.degrees(z / (canela * math.cos(math.radians(beta))))
    K, H = montar_pernas(beta, ajuste)
    jj = ck.medir_juntas(rig)
    jl = ck.posicoes(rig)
    print("AJOELHADO | canela sobe %.1f° (ajuste E %+.2f° D %+.2f°) | joelho %.0f/%.0f° | tornozelo %s | quadril (%.3f %.3f %.3f) | "
          "joelhos (%.3f %.3f %.3f) | contato do joelho %.4f | dedos E %.4f D %.4f" % (
              beta, ajuste["Left"], ajuste["Right"], jj["joelhoE"], jj["joelhoD"], "/".join("%.0f" % a for a in tc.tornozelo(jl)),
              *H, *K, contato_joelho(), *(float(pele((L + "Foot", L + "ToeBase"))[:, 2].min()) for L, _ in LADOS)), flush=True)

    # ── 4) a coluna: em cima a lombar estendida, embaixo enrolada; cada osso gira em volta da sua base (pelve parada) ────────────────
    OSSOS_C = ("Spine", "Spine1", "Spine2", "Neck")
    base_c = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_C}

    def curvar(t):
        for n in OSSOS_C:
            PB[p3.P + n].matrix_basis = base_c[n].copy()
        p3.atualizar()
        for n, a0, a1 in COLUNA:
            p3.girar_osso(rig, n, p3.rot_x(a0 + (a1 - a0) * t))
        p3.girar_osso(rig, "Neck", p3.rot_x(PESCOCO[0] + (PESCOCO[1] - PESCOCO[0]) * t))

    # ── 5) mãos: vão parado no referencial da cabeça, palma girada GIRO e punho desviado DESVIO; cotovelo no círculo do braço ───────
    curvar(0.0)
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, -0.5, 0), polegar_modo="volta")
    # vão − punho e linha dos nós dos dedos (indicador → mínimo: por onde a corda passa na mão) no referencial da mão ESQUERDA (dedos,
    # palma, dedos × palma), fixos: medidos uma vez com a mão ao lado da cabeça
    Hm = p3.mundo_osso(rig, "Head")
    Rh = Hm.to_3x3().normalized()
    dq_r = (Rh @ Vector((0, 1, 0))).normalized()
    pq_r = (Rh @ Vector((-1, 0, 0))).normalized()
    g_r = Hm @ Vector(MAO)
    maos.segurar("Left", g_r, dq_r, pq_r, polo=S["Left"] + Vector((0.3, -0.5, -0.3)))
    lat_r = dq_r.cross(pq_r)
    off = g_r - cab("LeftHand")
    nos = pg._base(rig, "Left")[1]
    OFF = (off.dot(dq_r), off.dot(pq_r), off.dot(lat_r))
    NOS = (nos.dot(dq_r), nos.dot(pq_r), nos.dot(lat_r))
    print("REF mão E | vão − punho (dedos, palma, lado) %.3f %.3f %.3f | nós %.3f %.3f %.3f | erro do vão %.1f mm" % (
        *OFF, *NOS, maos.erro["Left"] * 1000), flush=True)

    def orientar(f, med):
        """Dedos, palma e lado da mão esquerda a partir do antebraço f: palma pro meio (med) girada GIRO em volta do antebraço e o
        punho desviado DESVIO em volta da palma (+ = pro lado do indicador)."""
        dq = f.copy()
        pq = (med - dq * med.dot(dq)).normalized()
        pq = Matrix.Rotation(math.radians(GIRO), 3, dq) @ pq
        lat = dq.cross(pq)
        nos_ = dq * NOS[0] + pq * NOS[1] + lat * NOS[2]        # indicador → mínimo
        sd = 1.0 if (Matrix.Rotation(math.radians(1), 3, pq) @ dq - dq).dot(-nos_) > 0 else -1.0
        dq = (Matrix.Rotation(math.radians(DESVIO * sd), 3, pq) @ dq).normalized()
        return dq, pq, dq.cross(pq).normalized()

    def alvo_esquerda():
        """Mão esquerda no quadro atual: vão g, dedos dq, palma pq, punho W, cotovelo E, linha dos nós e o centro/eixo/raio do
        círculo do cotovelo (a mão PARADA no referencial da cabeça; o punho com o desvio DESVIO e a palma girada GIRO)."""
        Hm = p3.mundo_osso(rig, "Head")
        Rh = Hm.to_3x3().normalized()
        Rt = p3.mundo_osso(rig, "Spine2").to_3x3().normalized()
        g = Hm @ Vector(MAO)
        med = (Rh @ Vector((-1, 0, 0))).normalized()
        pref = (Rt @ Vector((math.sin(math.radians(PSI)), 0.0, math.cos(math.radians(PSI))))).normalized()
        f = (Rh @ Vector((0, 1, 0))).normalized()
        S_ = cab("LeftArm")                 # o ombro anda junto com o tórax
        for _ in range(30):
            dq, pq, lat = orientar(f, med)
            W = g - (dq * OFF[0] + pq * OFF[1] + lat * OFF[2])
            d = W - S_
            u = d.normalized()
            a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
            rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
            Cc = S_ + u * a
            e = (pref - u * pref.dot(u)).normalized()
            E = Cc + e * rho
            f = (W - E).normalized()
        n_ = (dq * NOS[0] + pq * NOS[1] + lat * NOS[2]).normalized()
        return dict(g=g, dq=dq, pq=pq, W=W, E=E, nos=n_, Cc=Cc, u=u, rho=rho, e=e)

    def alvos():
        a = alvo_esquerda()
        b = {k: (_espelho(v) if isinstance(v, Vector) else v) for k, v in a.items()}
        return {"Left": a, "Right": b}

    def por_maos(al, acertar=False):
        for L, _ in LADOS:
            x = al[L]
            maos.segurar(L, x["g"], x["dq"], x["pq"], polo=x["Cc"] + x["e"] * (x["rho"] + 0.4))
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, x["g"], x["dq"], x["pq"], polo=x["Cc"] + x["e"] * (x["rho"] + 0.4))
            if L in DEDOS:                  # mão rígida na corda: os dedos e o polegar fecham UMA vez (a corda não gira na mão)
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    DEDOS = {}
    # ── 6) a polia: a roldana na frente, em y tal que a cabeça, o cabelo e as mãos fiquem FOLGA_TORRE atrás da frente da torre (o
    #    trilho fica 7,5 cm à frente do eixo da roldana) em todos os quadros, e o engate do lado da pessoa (ou no_plano) ─────────────
    corda = e3.corda_polia("corda", raio=RAIO)
    p3.atualizar()
    BAT = {}                                # batente (malha com o chanfro) no referencial da ponta: mão × batente medida à parte
    for s_ in (1, -1):
        bo = [o for o in corda.pontas[s_].children if "batente" in o.name][0]
        co_b, tri_b = ck._avaliar_simples(bo)
        Mi = np.array(corda.pontas[s_].matrix_world.inverted())
        loc_b = co_b @ Mi[:3, :3].T + Mi[:3, 3]
        BAT[s_] = (BVHTree.FromPolygons([tuple(v) for v in loc_b], [tuple(f) for f in tri_b]), float(loc_b[:, 0].min()),
                   float(loc_b[:, 0].max()), float(np.linalg.norm(loc_b[:, 1:], axis=1).max()))
    raio_rold = 0.045
    trajeto = []
    for k in range(25):
        t = p3.suave(k / 24)
        curvar(t)
        al = alvos()
        co, _, (nomes, dono) = _malha(bon)
        frente = float(min(co[_grupo(nomes, dono, ("Head", "Neck"))][:, 1].min(), ck._avaliar_simples(bon.cabelo)[0][:, 1].min()))
        trajeto.append((t, al, frente))
    y_cabeca = min(f for _, _, f in trajeto)                                     # cabeça/cabelo mais à frente no movimento
    y_maos = min(min(a[L]["g"].y for L, _ in LADOS) for _, a, _ in trajeto) - 0.06   # o punho fechado vai até ~6 cm à frente do vão
    y_rold = min(y_cabeca, y_maos) - FOLGA_TORRE + 0.075                         # o trilho fica 7,5 cm à frente do eixo da roldana
    teste = e3.Polia(None, None, Vector((0.0, y_rold, POLIA_Z)), raio_rold, Vector((0, 1, 0)))
    engs = []
    for t, al, _ in trajeto:
        gL = al["Left"]["g"] - al["Left"]["nos"] * DESLIZA
        engs.append(corda.por({1: (gL, al["Left"]["nos"]), -1: (_espelho(gL), _espelho(al["Left"]["nos"]))}, teste.direcao))
    cruza = min(e.y for e in engs) - y_rold < FOLGA_ROLDANA
    pol = e3.polia("polia", x=0.0, y=y_rold, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO, no_plano=cruza)
    print("POLIA | roldana y %.3f (cabeça/cabelo mais à frente %.3f, mãos ~%.3f) | engate y de %.3f a %.3f, z de %.3f a %.3f | %s" % (
        y_rold, y_cabeca, y_maos, min(e.y for e in engs), max(e.y for e in engs), min(e.z for e in engs),
        max(e.z for e in engs), "no_plano (o engate passa pro lado da torre)" if cruza else "engate sempre do lado da pessoa"),
        flush=True)

    # ── 7) colchonete embaixo dos joelhos, das canelas e dos dedos dos pés ────────────────────────────────────────────────────────
    colchonete = e3.caixa("colchonete", (0.0, (COLCH[1] + COLCH[2]) / 2, TOPO / 2), (COLCH[0], COLCH[2] - COLCH[1], TOPO),
                          e3.mat_estofado(), chanfro=0.004)

    def folgas_cena():
        """Pernas da corda, gancho, batentes e cabo → pele da cabeça/pescoço + cabelo e → tronco/braços (m), e cabo × vertical."""
        co, _, (nomes, dono) = _malha(bon)
        cabeca = co[_grupo(nomes, dono, ("Head", "Neck"))]
        cab_co = ck._avaliar_simples(bon.cabelo)[0]
        todos = np.concatenate([cabeca, cab_co])
        tronco = co[_grupo(nomes, dono, ("Spine2", "Spine1", "Spine", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
                                         "LeftForeArm", "RightForeArm"))]
        J, Ent = corda.juncao, corda.entradas
        A = pol.saida
        u = (A - J).normalized()
        pernas = min(float(_dist_segmento(todos, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        pernas_t = min(float(_dist_segmento(tronco, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        gancho = float(_dist_segmento(todos, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        gancho_t = float(_dist_segmento(tronco, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        cabo = float(_dist_segmento(np.concatenate([todos, tronco]), J + u * corda.engate, A).min()) - 0.003
        # batente: do fim da corda na mão até o fim do batente (eixo da ponta), raio 21 mm
        bat = 1e9
        for s in (1, -1):
            M = corda.pontas[s].matrix_world
            c0 = M @ Vector((corda.meia + 0.003, 0, 0))
            c1 = M @ Vector((corda.meia + 0.003 + 0.045, 0, 0))
            bat = min(bat, float(_dist_segmento(np.concatenate([todos, tronco]), c0, c1).min()) - 0.021)
        return pernas, pernas_t, gancho, gancho_t, cabo, bat

    def mao_x_corda():
        """Pele de cada mão → a perna da corda dela, fora da pegada (da entrada na mão até a junção), mm: − = a corda entrou na pele."""
        co, _, (nomes, dono) = _malha(bon)
        out = []
        for lado, s in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            out.append((float(_dist_segmento(co[m], corda.entradas[s], corda.juncao).min()) - RAIO) * 1000)
        return out

    def mao_x_batente():
        """Pele de cada mão × o batente da ponta dela (malha com o chanfro), mm com sinal (− = o batente entrou na mão)."""
        co, _, (nomes, dono) = _malha(bon)
        out = []
        for lado, s_ in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            Mi = np.array(corda.pontas[s_].matrix_world.inverted())
            L_ = co[m] @ Mi[:3, :3].T + Mi[:3, 3]
            bvh, x0, x1, r_ = BAT[s_]
            perto = (L_[:, 0] > x0 - 0.02) & (L_[:, 0] < x1 + 0.02) & (np.linalg.norm(L_[:, 1:], axis=1) < r_ + 0.02)
            d = 20.0
            for v in L_[perto]:
                loc, nor, _, dist = bvh.find_nearest(Vector(v))
                if loc is not None:
                    d = min(d, (dist if (Vector(v) - loc).dot(nor) > 0 else -dist) * 1000)
            out.append(d)
        return out

    def mao_x_cabeca():
        """Pele de cada mão → pele da cabeça/pescoço e cabelo (mm, sem sinal)."""
        co, _, (nomes, dono) = _malha(bon)
        cab_ = co[_grupo(nomes, dono, ("Head", "Neck"))]
        cab_co = ck._avaliar_simples(bon.cabelo)[0]
        alvo = np.concatenate([cab_, cab_co])
        out = []
        for lado, _ in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            P = co[m]
            d = min(float(np.linalg.norm(alvo - p, axis=1).min()) for p in P[::4])
            out.append(d * 1000)
        return out

    def pose(t):
        """t=0 em cima (lombar arqueada, tronco inclinado), t=1 embaixo (coluna enrolada, cotovelos perto do meio das coxas)."""
        curvar(t)
        al = alvos()
        por_maos(al)
        pose.E = {L: al[L]["E"] for L, _ in LADOS}
        nos_e = pg._base(rig, "Left")[1]
        gL = al["Left"]["g"] - nos_e * DESLIZA     # a corda escorregada DESLIZA pro lado da entrada (o batente encosta no mínimo)
        peg = {1: (gL, nos_e), -1: (_espelho(gL), _espelho(nos_e))}
        pose.nos_d = math.degrees(peg[-1][1].angle(pg._base(rig, "Right")[1]))
        eng = corda.por(peg, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        pose.cabo = math.degrees(pol.direcao(corda.juncao).angle(Vector((0, 0, 1))))
        pose.saida = (pol.saida.y - pol.centro.y) * 1000      # + = a saída do cabo do lado da pessoa (mm)

    pose.nos_d = pose.cabo = pose.saida = 0.0
    pose.E = {}
    curvar(0.0)
    por_maos(alvos(), acertar=True)
    pose(0.0)
    for L, s in LADOS:                     # dedos e polegar fecham UMA vez (a corda não gira na mão)
        nos_ = pg._base(rig, "Left")[1] if L == "Left" else _espelho(pg._base(rig, "Left")[1])
        g_ = alvos()[L]["g"]
        pose.dedos = getattr(pose, "dedos", {})
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g_, nos_, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        lomb = jj["Spine1"] - jj["Hips"]
        torx = jj["Neck"] - jj["Spine1"]
        sag = lambda v: math.degrees(math.atan2(-v[1], v[2]))
        pelve = p3.ponta(rig, "Hips") - cab("Hips")
        f = folgas_cena()
        # cotovelo → coxa: a menor distância da pele do braço perto do cotovelo até a pele das coxas, e onde (0 = quadril, 1 = joelho)
        cox = G(("LeftUpLeg", "RightUpLeg"))
        cot = {}
        for L, s in LADOS:
            E = np.array(cab(L + "ForeArm"))
            d = np.linalg.norm(cox - E, axis=1)
            i = int(np.argmin(d))
            h, k = np.array(cab(L + "UpLeg")), np.array(cab(L + "Leg"))
            pos = float(np.clip((cox[i] - h) @ (k - h) / ((k - h) @ (k - h)), 0, 1))
            cot[L] = (d[i] - 0.045, pos)
        frente_corpo = float(min(G(("Head", "Neck"))[:, 1].min(), ck._avaliar_simples(bon.cabelo)[0][:, 1].min(),
                                 min(G((L + "Hand",))[:, 1].min() for L, _ in LADOS)))
        return ("tronco %.1f° | lombar %.1f° tórax %.1f° da vertical (torax_chao %.1f) | coluna %.1f° (com sinal %+.1f) | pelve %.1f° | "
                "quadril %.0f/%.0f° | joelho %.0f/%.0f° | cabeça %.0f° (cabeca_tronco %.0f, pescoço %.0f) | cotovelo %.0f/%.0f° | ombro "
                "%.0f/%.0f° | punho %.0f/%.0f° (flexão %s) | palma pro meio %s° | cotovelo → coxa E %.0f mm (%.2f) D %.0f mm (%.2f) | "
                "cabeça z %.0f mm | peito z %.0f mm | pernas da corda → cabeça/cabelo %.0f mm, → tronco/braços %.0f | gancho → cabeça %.0f, "
                "→ tronco %.0f | cabo → corpo %.0f | batente → cabeça/corpo %.0f | mão → corda %s | mão → batente %s | mão → cabeça %s | cabo × vertical "
                "%.1f° | saída do cabo %+.0f mm | corda × nós D %.1f° | corpo mais à frente y %.3f (trilho %.3f) | cotovelo fora do "
                "calculado E %.1f D %.1f mm | %s" % (
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], sag(lomb), sag(torx), tc.torax_chao(jj)[0], tc.coluna(jj)[0],
                    sag(torx) - sag(lomb), math.degrees(math.atan2(-pelve.y, pelve.z)), juntas["quadrilE"], juntas["quadrilD"],
                    juntas["joelhoE"], juntas["joelhoD"], sag(jj["Head"] - jj["Neck"]), tc.cabeca_tronco(jj)[0], juntas["pescoco"],
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["ombroE"], juntas["ombroD"], juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    cot["Left"][0] * 1000, cot["Left"][1], cot["Right"][0] * 1000, cot["Right"][1],
                    G(("Head",))[:, 2].min() * 1000, G(("Spine2",))[:, 2].min() * 1000, f[0] * 1000, f[1] * 1000, f[2] * 1000,
                    f[3] * 1000, f[4] * 1000, f[5] * 1000, "/".join("%.1f" % v for v in mao_x_corda()),
                    "/".join("%.1f" % v for v in mao_x_batente()),
                    "/".join("%.0f" % v for v in mao_x_cabeca()), pose.cabo, pose.saida, pose.nos_d, frente_corpo,
                    pol.centro.y - 0.075, *((cab(L + "ForeArm") - pose.E[L]).length * 1000 if L in pose.E else 0.0 for L, _ in LADOS),
                    maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(corda.pontas[s], raio=RAIO, meio_compr=corda.meia)) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, corda.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.3, 0.6),
                camera_video=((3.4, yq - 2.4, 1.2), (0, yq - 0.3, 0.6), 50), info=info, apoios=[colchonete],
                afunda_apoio_mm=20)
