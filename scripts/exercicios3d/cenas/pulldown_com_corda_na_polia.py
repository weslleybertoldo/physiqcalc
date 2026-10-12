# Pulldown com Corda na Polia — cena da fábrica 3D (lote 13, 12/10/2026; o "Rope Straight-Arm Pulldown" do catálogo, em pé de frente
# pra polia ALTA, com a corda e as 2 mãos).
# t = 0 começo: base escalonada, o tronco inclinado à frente e parado, os braços quase esticados lá em cima, na frente da cabeça, as 2
# mãos juntas segurando as pontas da corda (pegada neutra) · t = 1 fim: os braços desceram em arco pela frente do corpo, girando SÓ no
# ombro, com os cotovelos quase esticados e parados, até as mãos chegarem nas coxas, com as pontas da corda abertas.
# Técnica: free-exercise-db, Rope Straight-Arm Pulldown (o fonte_en do catálogo): "Attach a rope to a high pulley and make your weight
# selection. Stand a couple feet back from the pulley with your feet staggered and take the rope with both hands. Lean forward from the
# hip, keeping your back straight, with your arms extended up in front of you." / "Keeping your arms straight, extend the shoulder to
# pull the rope down to your thighs." / "Pause at the bottom of the motion, squeezing your lats." free-exercise-db, Straight-Arm
# Pulldown (a barra, na mesma lista): "Bend your torso forward at the waist by around 30-degrees". ExRx, Cable Bent-over Pullover ("Also
# known as Straight Arm Pulldown"): "Place one foot slightly back and bend over at hip until shoulder is fully flexed (upper arms at
# sides of head)." / "With elbows fixed approximately 30°, pull cable attachment down until upper arms are to sides." Motra, Cable Rope
# Straight Arm Pull Down: "grasp the rope with a neutral grip, and step back slightly while hinging at the hips with arms extended
# overhead." / "Keep elbows slightly bent but locked in a fixed position." / "Depress shoulder blades and drive the rope down towards
# your thighs." / "Pull the rope ends apart at the bottom to maximize lat contraction." / "Maintain a neutral spine and braced core
# throughout."
# Como o rig faz: pé esquerdo à frente e direito atrás (Y_PE), cada um embaixo do seu quadril, os 2 chapados; joelhos dobrados JOELHO°
# (média) e o tronco INCLINA° à frente dobrando no quadril (coluna neutra, cabeça na linha do tronco), tudo parado (as pernas e o tronco
# do Tríceps Francês com Corda na Polia). Os 2 braços descem juntos girando no ombro (extensão do ombro), de PHI0° de flexão (medida no
# tronco) até TH1° da vertical do mundo (as mãos nas coxas); o cotovelo fica parado a COTOVELO°, dobrando pro lado do cabo, e o braço
# fecha pra dentro o que for preciso pras mãos ficarem na largura pedida (LARG: juntas em cima, abrindo embaixo — a corda de 27" não
# deixa passar de ~35 cm entre as entradas, e as mãos não chegam do lado do quadril: param na frente das coxas). A mão segue o antebraço: pegada neutra (palmas uma pra outra) em cima, punho desviado
# DESVIO° pro lado do mínimo lá em cima (a corda sai da mão pro gancho, mais pra frente que o antebraço) e, enquanto as pontas abrem
# embaixo, a palma gira PRONA° pra trás (com a palma parada pro meio o batente, do lado do mínimo, entrava na coxa). A corda entra em
# cada mão pelo lado do indicador (vem do gancho, em cima e na frente) e o batente fica do lado do mínimo; polegar dando a volta na corda
# (o polegar novo). A mão direita é o ESPELHO da esquerda (corda e cabo simétricos, no plano da roldana). As escápulas sobem ELEVA0° com
# o braço lá em cima e descem até DEPRIME° (abaixadas) na puxada (Motra: "Depress shoulder blades").
# Polia alta na frente da pessoa, na linha dela (a do Pulldown com Braços Estendidos, mais longe): o engate da corda fica sempre do lado
# da pessoa do eixo da roldana (FOLGA_ROLDANA, como no Tríceps Corda na Polia) — no meio do arco as mãos chegam bem na frente.
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

RAIO = 0.014                   # corda de 28 mm (equip3d.corda_polia)
LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
X_PE = 0.12                    # tornozelos a ±12 cm do meio do corpo: cada pé embaixo do seu quadril
Y_PE = {"Left": -0.10, "Right": 0.10}     # tornozelos (m; o boneco olha pra −Y): pé esquerdo à frente, direito atrás (20 cm)
JOELHO = 15.0                  # flexão média dos joelhos (graus), parada
RECUA = 0.0                    # articulações do quadril em y = RECUA (no meio da base: os 2 joelhos dobram igual)
INCLINA = 30.0                 # tronco à frente da vertical (graus), dobrando no quadril (coluna neutra), parado
COTOVELO = 12.0                # flexão do cotovelo, parada o movimento todo (graus): quase estendido
PHI0 = 160.0                   # começo: flexão do ombro medida no tronco (graus) — braços lá em cima, na frente da cabeça
TH1 = -9.0                     # fim: braço a TH1 graus da vertical do MUNDO (+ = à frente, − = pra trás): a mão do lado do pé da
                               # frente encosta de leve na coxa (medido: −8,5° = 6,4 mm; −9,0° = 0,8 mm; −9,5° = −4,0 mm, entrando);
                               # a outra fica ~5 cm na frente da coxa de trás (a base escalonada deixa a coxa direita mais atrás)
LARG = (0.13, 0.345)           # distância entre os vãos das mãos (m): juntas em cima → abertas embaixo (com 0,32 o braço fechava
                               # 2° pra dentro no fim e entrava 3,6 mm no tronco, a 18 cm do ombro; com 0,345 fica a 0,4 mm, medido)
JANELA_ABRE = (0.40, 1.0)      # trecho do caminho (0 = em cima, 1 = embaixo) em que as pontas da corda abrem
PRONA = 60.0                   # palma girando pra trás (pronação, graus a partir da pegada neutra) no fim, junto com a abertura:
                               # com a mão encostando na coxa o batente ficava a −13 mm (dentro dela) com 0°, −3 mm com 30°, 12 mm
                               # com 60° e a perna da corda a 19 mm do corpo com 90° (medido)
JANELA_PRONA = (0.50, 1.0)
DESVIO = 10.0                  # punho desviado pro lado do mínimo lá em cima (graus), voltando a reto no meio do caminho: com o
                               # punho reto a perna da corda saía encostada no indicador (−0,1 mm), com 10° fica a ~5 mm (medido)
JANELA_DESVIO = (0.0, 0.50)
ELEVA0 = 10.0                  # clavícula subida (graus) com o braço lá em cima (a do Pulldown com Braços Estendidos; Ludewig 2009:
                               # a clavícula sobe com o braço levantado — "clavicular elevation, retraction, and posterior axial rotation")
DEPRIME = -3.0                 # clavícula abaixada (graus) embaixo (Motra: "Depress shoulder blades")
JANELA_ESC = (0.0, 0.70)
DESLIZA = 0.003                # a corda escorrega isso pro lado da entrada: o batente fica encostado no mínimo (m)
POLIA_Z, ALTO = 2.22, 2.47     # eixo da roldana alta e altura da coluna
FOLGA_ROLDANA = 0.012          # o engate fica sempre pelo menos isso do lado da pessoa do eixo da roldana (m)
MARGEM_ROLDANA = 0.05          # e a roldana fica mais isso à frente do engate mais à frente do movimento (m)
NQ_ROLDANA = 33                # quadros do arco usados pra pôr a roldana (amostra; a MARGEM_ROLDANA cobre o que fica entre eles)
CORPO = ("Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "LeftUpLeg", "RightUpLeg", "LeftArm", "RightArm",
         "LeftForeArm", "RightForeArm")
CABECA = ("Head", "Neck")
COXAS = ("LeftUpLeg", "RightUpLeg")


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


def _fase(u, janela):
    """0 → 1 dentro da janela do caminho (ease seno), parado fora dela."""
    u0, u1 = janela
    return p3.suave(min(1.0, max(0.0, (u - u0) / (u1 - u0))))


def _espelho(v):
    return Vector((-v.x, v.y, v.z))


def pernas_e_tronco(bon):
    """Base escalonada (pé esquerdo à frente) com os 2 pés chapados: pernas por IK (alvos nascem no tornozelo de repouso — alvo = polo
    dá NaN —, polos à frente dos joelhos), tronco inclinado no quadril e o quadril na altura que deixa os joelhos com a flexão média
    JOELHO (a do Tríceps Francês com Corda na Polia). Devolve a altura do quadril."""
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
    print("PERNAS quadril z %.3f | joelho E %.1f° D %.1f° | quadril E %.0f° D %.0f° | tronco %.1f°" % (
        z_q, j["joelhoE"], j["joelhoD"], j["quadrilE"], j["quadrilD"], ck.angulo_chave(rig, {"medida": "tronco"})[0]), flush=True)
    return z_q


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)    # mão de referência da corda de 28 mm (antes do Maos)
    pg.usar_polegar("volta")         # polegar dando a volta na corda (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    pernas_e_tronco(bon)

    def cab(n):
        return p3.cabeca(rig, n)

    tt = cab("Neck") - cab("Hips")
    lam = math.degrees(math.atan2(-tt.y, tt.z))                    # inclinação do tronco que ficou (graus, + = à frente)
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço

    # ── escápulas: a clavícula sobe ELEVA0° com o braço lá em cima e desce até DEPRIME° na puxada ───────────────────────────────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)

    def escapulas(u):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        g = ELEVA0 + (DEPRIME - ELEVA0) * _fase(u, JANELA_ESC)
        if g:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * g), 3, frente0))

    S_rep = cab("LeftArm")
    for u_ in (0.0, 1.0):
        escapulas(u_)
        d_ = cab("LeftArm") - S_rep
        print("ESCÁPULAS u=%.0f | ombro E %+.1f mm pra cima, %+.1f mm pra frente, %+.1f mm pra fora" % (
            u_, d_.dot(cima0) * 1000, d_.dot(frente0) * 1000, d_.dot(-lado0) * 1000), flush=True)
    escapulas(0.0)

    # ── braço esquerdo: ombro → cotovelo → punho, com o braço a th graus da vertical do mundo (à frente) e `abre` graus pro lado ─────
    def segmentos(th_, abre):
        """Braço e antebraço (unitários) do lado esquerdo com o braço a `th_` graus da vertical do mundo (+ = à frente) e `abre` graus
        aberto pro lado (− = fechando pro meio); o antebraço vai junto pro lado (componente de lado = a do braço) e dobra COTOVELO graus
        pro lado do cabo (pra frente embaixo, pra cima e pra trás em cima): o plano do cotovelo fica parado em relação ao braço (o úmero
        não gira). Devolve (braço, antebraço)."""
        sa, ca = math.sin(math.radians(abre)), math.cos(math.radians(abre))
        cb = (math.cos(math.radians(COTOVELO)) - sa * sa) / (ca * ca)
        b = math.degrees(math.acos(max(-1.0, min(1.0, cb))))
        r1, r2 = math.radians(th_), math.radians(th_ + b)
        return (Vector((sa, -math.sin(r1) * ca, -math.cos(r1) * ca)),
                Vector((sa, -math.sin(r2) * ca, -math.cos(r2) * ca)))

    def orientar(f, prona, desvio):
        """Dedos, palma e lado da mão esquerda com o antebraço f: palma pro meio (−X) ⟂ ao antebraço (pegada neutra), girada `prona`
        graus pra trás em volta do antebraço (pronação) e o punho desviado `desvio` graus pro lado do mínimo (ulnar), em volta da
        palma. Sem o desvio, os dedos seguem o antebraço (punho reto)."""
        med = Vector((-1.0, 0.0, 0.0))
        pn = (med - f * med.dot(f)).normalized()
        pq = (Matrix.Rotation(math.radians(prona), 3, f) @ pn).normalized()   # esquerda: + em volta dos dedos = pronação
        dq = f.copy()
        if desvio:
            mn = dq.cross(pq).normalized()                 # da palma: dedos × palma (o lado do mínimo ou do indicador)
            if mn.dot(NOS_REF[0] * dq + NOS_REF[1] * pq + NOS_REF[2] * dq.cross(pq)) < 0:
                mn = -mn                                   # pro lado do mínimo
            eixo = dq.cross(mn).normalized()               # girar dq pro mn em volta deste eixo
            dq = (Matrix.Rotation(math.radians(desvio), 3, eixo) @ dq).normalized()
            pq = (pq - dq * pq.dot(dq)).normalized()
        return dq, pq, dq.cross(pq)

    def polo(S, Ec, W):
        eixo = (W - S).normalized()
        fora = (Ec - S) - eixo * (Ec - S).dot(eixo)
        if fora.length < 1e-6:
            fora = Vector((0.0, 0.0, -1.0))
        return Ec + fora.normalized() * 0.4

    maos = Maos(bon, RAIO, polegar_modo="volta")
    # vão − punho e linha dos nós dos dedos (indicador → mínimo: por onde a corda passa na mão) no referencial da mão ESQUERDA (dedos,
    # palma, dedos × palma), fixos o movimento todo, medidos com o braço a 60° da vertical. A direita é o ESPELHO da esquerda.
    NOS_REF = (0.0, 0.0, 1.0)
    S0 = cab("LeftArm")
    a_r, f_r = segmentos(60.0, -5.0)
    E_r = S0 + a_r * Lb
    W_r = E_r + f_r * La
    dq_r, pq_r, lat_r = orientar(f_r, 0.0, 0.0)
    maos.segurar("Left", W_r + dq_r * 0.09, dq_r, pq_r, polo=polo(S0, E_r, W_r), zerar=True)
    off = (W_r + dq_r * 0.09) - cab("LeftHand")
    OFF = (off.dot(dq_r), off.dot(pq_r), off.dot(lat_r))
    nos = pg._base(rig, "Left")[1]
    NOS_REF = (nos.dot(dq_r), nos.dot(pq_r), nos.dot(lat_r))
    print("REF Left: vão − punho no referencial da mão (%.3f %.3f %.3f) | nós dos dedos (%.3f %.3f %.3f) | erro do vão %.1f mm" % (
        *OFF, *NOS_REF, maos.erro["Left"] * 1000), flush=True)

    def mao_esquerda(th_, u):
        """Escápulas no lugar e a mão esquerda no quadro: dict com ombro S, cotovelo E, punho W, vão g, linha dos nós (indicador →
        mínimo), dedos, palma, o braço aberto `abre` e a pronação/desvio do quadro. O braço fecha pra dentro (bisseção) até o vão cair
        na meia largura pedida."""
        escapulas(u)
        S = cab("LeftArm")
        meia = (LARG[0] + (LARG[1] - LARG[0]) * _fase(u, JANELA_ABRE)) / 2
        prona = PRONA * _fase(u, JANELA_PRONA)
        desvio = DESVIO * (1.0 - _fase(u, JANELA_DESVIO))

        def montar_mao(abre):
            a, f = segmentos(th_, abre)
            E = S + a * Lb
            W = E + f * La
            dq, pq, lat = orientar(f, prona, desvio)
            g = W + dq * OFF[0] + pq * OFF[1] + lat * OFF[2]
            n_ = (dq * NOS_REF[0] + pq * NOS_REF[1] + lat * NOS_REF[2]).normalized()
            return dict(S=S, E=E, W=W, g=g, nos=n_, dq=dq, pq=pq, abre=abre, prona=prona, desvio=desvio, meia=meia)

        abre = _bissecao(lambda x: montar_mao(x)["g"].x, -35.0, 25.0, meia)
        return montar_mao(abre)

    def maos_no_quadro(th_, u):
        m = mao_esquerda(th_, u)
        d = {k: (_espelho(v) if isinstance(v, Vector) else v) for k, v in m.items()}
        return {"Left": m, "Right": d}

    th0 = PHI0 - lam

    def th_de(t):
        return p3.lerp(th0, TH1, t)

    def u_de(th_):
        return (th0 - th_) / (th0 - TH1)

    # ── a polia: a roldana na frente, na linha da pessoa, em y tal que o engate fique sempre FOLGA_ROLDANA + MARGEM_ROLDANA do lado da
    #    pessoa do eixo da roldana (no meio do arco as mãos chegam bem na frente) ─────────────────────────────────────────────────────
    corda = e3.corda_polia("corda", raio=RAIO)
    raio_rold = 0.045
    trajeto = []
    for k in range(NQ_ROLDANA + 1):
        th_ = th_de(p3.suave(k / NQ_ROLDANA))
        trajeto.append(maos_no_quadro(th_, u_de(th_)))

    def pegadas_de(m):
        gL = m["Left"]["g"] - m["Left"]["nos"] * DESLIZA
        return {1: (gL, m["Left"]["nos"]), -1: (_espelho(gL), _espelho(m["Left"]["nos"]))}

    y_rold = min(m["Left"]["g"].y for m in trajeto) - 0.10
    for _ in range(400):
        teste = e3.Polia(None, None, Vector((0.0, y_rold, POLIA_Z)), raio_rold, Vector((0, 1, 0)))
        engs = [corda.por(pegadas_de(m), teste.direcao) for m in trajeto]
        if min(e.y for e in engs) - y_rold >= FOLGA_ROLDANA + MARGEM_ROLDANA:
            break
        y_rold -= 0.002
    pol = e3.polia("polia", x=0.0, y=y_rold, altura=POLIA_Z, frente=(0, 1, 0), alto=ALTO)
    print("POLIA | roldana y %.3f z %.3f | engate y de %.3f a %.3f (folga mínima %.0f mm), z de %.3f a %.3f | trilho na frente em y %.3f"
          % (y_rold, POLIA_Z, min(e.y for e in engs), max(e.y for e in engs), (min(e.y for e in engs) - y_rold) * 1000,
             min(e.z for e in engs), max(e.z for e in engs), y_rold - 0.075), flush=True)

    p3.atualizar()
    BAT = {}                                # batente (malha com o chanfro) no referencial da ponta: mão × batente medida à parte
    for s_ in (1, -1):
        bo = [o for o in corda.pontas[s_].children if "batente" in o.name][0]
        co_b, tri_b = ck._avaliar_simples(bo)
        Mi = np.array(corda.pontas[s_].matrix_world.inverted())
        loc_b = co_b @ Mi[:3, :3].T + Mi[:3, 3]
        BAT[s_] = (BVHTree.FromPolygons([tuple(v) for v in loc_b], [tuple(f) for f in tri_b]), float(loc_b[:, 0].min()),
                   float(loc_b[:, 0].max()), float(np.linalg.norm(loc_b[:, 1:], axis=1).max()))

    def folgas_cena():
        """Pernas da corda, gancho, batentes e cabo → pele da cabeça/pescoço + cabelo e → tronco/coxas/braços (m)."""
        co, _, (nomes, dono) = _malha(bon)
        cabeca = co[_grupo(nomes, dono, CABECA)]
        cab_co = ck._avaliar_simples(bon.cabelo)[0]
        todos = np.concatenate([cabeca, cab_co])
        corpo = co[_grupo(nomes, dono, CORPO)]
        J, Ent = corda.juncao, corda.entradas
        A = pol.saida
        u = (A - J).normalized()
        pernas = min(float(_dist_segmento(todos, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        pernas_c = min(float(_dist_segmento(corpo, J, Ent[s]).min()) for s in (1, -1)) - RAIO
        gancho = float(_dist_segmento(todos, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        gancho_c = float(_dist_segmento(corpo, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        cabo = float(_dist_segmento(todos, J + u * corda.engate, A).min()) - 0.003
        cabo_c = float(_dist_segmento(corpo, J + u * corda.engate, A).min()) - 0.003
        bat = 1e9                           # batente: do fim da corda na mão até o fim do batente (eixo da ponta), raio 21 mm
        for s in (1, -1):
            M = corda.pontas[s].matrix_world
            c0 = M @ Vector((corda.meia + 0.003, 0, 0))
            c1 = M @ Vector((corda.meia + 0.003 + 0.045, 0, 0))
            bat = min(bat, float(_dist_segmento(np.concatenate([todos, corpo]), c0, c1).min()) - 0.021)
        return pernas, pernas_c, gancho, gancho_c, cabo, cabo_c, bat

    def mao_x_corda():
        """Pele de cada mão → a perna da corda dela, fora da pegada (da entrada na mão até a junção), mm: − = a corda entrou."""
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
            d_ = 20.0
            for v in L_[perto]:
                loc, nor, _, dist = bvh.find_nearest(Vector(v))
                if loc is not None:
                    d_ = min(d_, (dist if (Vector(v) - loc).dot(nor) > 0 else -dist) * 1000)
            out.append(d_)
        return out

    def mao_x_coxa():
        """Pele de cada mão → pele das coxas (mm, sem sinal; a checagem mede com sinal no contato da ficha)."""
        co, _, (nomes, dono) = _malha(bon)
        coxas = co[_grupo(nomes, dono, COXAS)]
        out = []
        for lado, _ in LADOS:
            m = np.array([n.startswith(lado + "Hand") for n in nomes] + [False])[dono]
            out.append(min(float(np.linalg.norm(coxas - p, axis=1).min()) for p in co[m][::3]) * 1000)
        return out

    def mao_x_gancho_cabo():
        """Pele das 2 mãos → gancho (da junção até o começo do cabo, raio 20 mm), → cabo (até a roldana) e uma mão → a outra (mm)."""
        co, _, (nomes, dono) = _malha(bon)
        mE = np.array([n.startswith("LeftHand") for n in nomes] + [False])[dono]
        mD = np.array([n.startswith("RightHand") for n in nomes] + [False])[dono]
        P = np.concatenate([co[mE], co[mD]])
        J, A = corda.juncao, pol.saida
        u = (A - J).normalized()
        gancho = float(_dist_segmento(P, J - u * 0.025, J + u * corda.engate).min()) - 0.020
        cabo = float(_dist_segmento(P, J + u * corda.engate, A).min()) - 0.003
        entre = min(float(np.linalg.norm(co[mD] - p, axis=1).min()) for p in co[mE][::3])
        return gancho * 1000, cabo * 1000, entre * 1000

    def gancho_roldana():
        """Bola do cabo (em cima do gancho) → flange da roldana (mm): o gancho não chega na roldana."""
        u = (pol.saida - corda.juncao).normalized()
        bola = corda.juncao + u * (corda.engate + 0.007)
        return ((bola - pol.centro).length - (raio_rold + 0.007) - 0.012) * 1000

    def pose(t):
        """t=0 braços lá em cima, na frente da cabeça (mãos juntas); t=1 braços embaixo, as mãos nas coxas (pontas da corda abertas)."""
        th_ = th_de(t)
        u = u_de(th_)
        m = maos_no_quadro(th_, u)
        for lado, _ in LADOS:
            x = m[lado]
            maos.segurar(lado, x["g"], x["dq"], x["pq"], polo=polo(x["S"], x["E"], x["W"]), zerar=True)
        peg = pegadas_de(m)
        eng = corda.por(peg, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        for lado, s in LADOS:                     # dedos e polegar fecham até a pele encostar na corda
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, m[lado]["g"], peg[s][1], RAIO, polegar_antes=antes)
        pose.m = m
        pose.th = th_
        pose.desvio = {l: (cab(l + "ForeArm") - m[l]["E"]).length * 1000 for l, _ in LADOS}
        pose.maos = (m["Left"]["g"] - m["Right"]["g"]).length * 1000
        pose.entradas = (corda.entradas[1] - corda.entradas[-1]).length * 1000
        uc = pol.direcao(corda.juncao)
        pose.cabo = math.degrees(math.asin(max(-1.0, min(1.0, uc.z))))
        pose.nos_d = math.degrees(peg[-1][1].angle(pg._base(rig, "Right")[1]))   # corda × nós da mão direita (graus)

    pose.dedos = {}
    pose.desvio = {}
    pose.m = None
    pose.th = pose.maos = pose.entradas = pose.cabo = pose.nos_d = 0.0

    def info():
        jj = ck.posicoes(rig)
        juntas_ = ck.medir_juntas(rig)
        f = folgas_cena()
        mL = pose.m["Left"] if pose.m else {}
        pol_ = " ".join("%s %s" % (l[0], pose.dedos.get(l, {}).get("Thumb")) for l, _ in LADOS)
        return ("braço %.1f° do mundo (%.1f° no tronco) | braço aberto %.1f° | pronação %.0f° | desvio %.0f° | tronco %.1f° | cotovelo "
                "%.0f/%.0f° | braco_frente %s | braco_plano %s | cotovelo_tronco %s | cabeca_tronco %.0f | punho %.0f/%.0f° | punho_desvio "
                "%s | palma pro meio %s° | palma_frente %s | pegada_largura %.2f | vãos a %.0f mm | entradas a %.0f mm | pernas da corda → "
                "cabeça/cabelo %.0f mm, → corpo %.0f | gancho → cabeça %.0f, → corpo %.0f | cabo → cabeça %.0f, → corpo %.0f | batente → "
                "cabeça/corpo %.0f | mão → corda %s | mão → batente %s | mão → coxa %s | mãos → gancho %.0f, → cabo %.0f | mão × mão %.0f "
                "mm | gancho → roldana %.0f mm | cabo %.1f° acima da horizontal | junção (%.3f %.3f %.3f) | cabo %.3f m | cotovelo fora do "
                "calculado E %.1f D %.1f mm | corda × nós da mão D %.1f° | %s | polegar %s" % (
                    pose.th, pose.th + lam, mL.get("abre", 0.0), mL.get("prona", 0.0), mL.get("desvio", 0.0),
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], juntas_["cotoveloE"], juntas_["cotoveloD"],
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)), tc.cabeca_tronco(jj)[0], juntas_["punhoE"],
                    juntas_["punhoD"], "/".join("%.0f" % v for v in tc.punho_desvio(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                    tc.pegada_largura(jj)[0], pose.maos, pose.entradas, f[0] * 1000, f[1] * 1000, f[2] * 1000, f[3] * 1000,
                    f[4] * 1000, f[5] * 1000, f[6] * 1000, "/".join("%.1f" % v for v in mao_x_corda()),
                    "/".join("%.1f" % v for v in mao_x_batente()), "/".join("%.0f" % v for v in mao_x_coxa()),
                    *mao_x_gancho_cabo(), gancho_roldana(), pose.cabo, *corda.juncao, pol.comprimento,
                    pose.desvio.get("Left", 0), pose.desvio.get("Right", 0), pose.nos_d, maos.info(), pol_))

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("PULLDOWN CORDA t=%.2f | %s" % (t, info()), flush=True)
    co, _, (nomes, dono) = _malha(bon)
    pes = co[_grupo(nomes, dono, ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))]
    print("BASE | ponta do pé da frente y %.3f, calcanhar de trás y %.3f | roldana → ponta do pé da frente %.3f m (na horizontal) | "
          "técnica %s" % (pes[:, 1].min(), pes[:, 1].max(), pes[:, 1].min() - y_rold, tc.texto(tc.medir(ck.posicoes(rig)))),
          flush=True)
    pose(0.0)

    pegs = [(l, ck.Barra(corda.pontas[s], raio=RAIO, meio_compr=corda.meia)) for l, s in LADOS]
    return Cena(pose, corda.raizes + pol.raizes, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.3, 1.1),
                camera_video=((3.6, -2.4, 1.4), (0, -0.35, 1.05), 50), info=info)
