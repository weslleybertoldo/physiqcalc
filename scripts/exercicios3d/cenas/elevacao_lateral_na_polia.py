# Elevação Lateral na Polia — cena da fábrica 3D (lote 3, 06/10/2026; exercício do treino do Weslley).
# t = 0 começo: braço esquerdo quase estendido, pendurado um pouco à frente do corpo, com a mão e o puxador na frente da
# coxa, perto do quadril · t = 1 fim: cotovelo na altura do ombro, o braço do lado do corpo, um pouco à frente.
# Técnica (ExRx, Cable One Arm Lateral Raise): em pé de lado pra polia baixa, com o lado do braço que descansa virado pra
# ela ("Stand facing with side of resting arm toward low pulley") e a mão livre apoiada ("Grasp ballet bar if available" —
# aqui, pedido do Weslley: espalmada na torre); o braço de fora sobe pelo lado até o cotovelo chegar na altura do ombro
# ("raise arm to side away from low pulley until elbow is shoulder height"), com o cotovelo levemente dobrado e parado
# ("Maintain fixed elbow position (10° to 30° angle) throughout exercise") e sem girar o úmero ("Stirrup is raised by
# shoulder abduction, not external rotation"). ACE (Single-arm Lateral Raise): lado direito junto da máquina, mão esquerda
# no puxador, o cabo na frente do corpo ("lifting the left hand directly to the left (the cable should be passing in front
# of the body)"), tronco firme ("Keep the chest tall, the hips straight, and press the feet into the floor"); ACE (Lateral
# Raise, halteres): pegada neutra embaixo ("palms facing your body"), pés um pouco mais abertos que o quadril, punho reto.
# NSCA (Basics of Strength and Conditioning Manual, Lateral Raises): joelhos levemente dobrados ("Slightly flex knees"),
# pontas dos pés pra frente, palma pro chão em cima ("Keep palms facing the ground"). Coratella 2020, LR-neutral: o úmero sem
# girar, "thumbs forward" — o jeito em que o deltoide médio mais trabalhou.
# Montagem: polia baixa (0,20 m) do lado direito, 42 cm pro lado e 30 cm à frente do meio do corpo, com a roldana virada pra
# pessoa (+X) e o garfo que gira (equip3d.polia(gira=True); aqui gira só 0–7°: o cabo sai quase reto pra pessoa); o cabo
# cruza na frente das pernas e do quadril (≥ 12 cm) até o puxador D (equip3d.puxador_polia) na mão esquerda, com o polegar
# novo em volta do pegador. Pernas na pose de repouso (pés chapados, tornozelos a 39 cm, joelhos a 7°), tronco ereto e
# parado. Braço esquerdo: o úmero gira num plano só (eixo n = a0 × a1: sem girar no próprio eixo), de 13° da vertical (plano
# 78°, quase pra frente: a mão fica ~9 cm na frente da coxa, porque o aro do puxador desce na frente dela sem encostar) a
# 88° (plano 15°: pelo lado, um pouco à frente); cotovelo parado a 15°, dobrando pra frente (no fim, na horizontal, não pra
# cima); polegar pra frente o movimento todo (palma pro corpo embaixo, pro chão em cima). Mão direita espalmada na frente da
# carenagem da torre, a 1 m do chão: dedos juntos na direção do antebraço (punho dobrado ~35°), palma e eminência tenar
# encostando (afundam 1 mm); a torre é APOIO na Cena (o corpo não afunda nela mais que 2 mm), a roldana que gira e o cabo
# continuam equipamento. Braço como o da elevação lateral com halteres (cenas/elevacao_lateral_com_halteres.py), mão e
# puxador como no tríceps francês unilateral na polia baixa, mão de apoio como a mão na cintura dele.
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

RAIO = 0.0125                  # pegador do puxador D de 25 mm (equip3d.puxador_polia)
TRABALHA, LIVRE = "Left", "Right"
LADOS = (("Left", 1), ("Right", -1))
COTOVELO = 15.0                # flexão do cotovelo, parada o movimento todo (graus)
ELEVA = (13.0, 88.0)           # braço × vertical do tronco no começo → no fim (graus)
PLANO = (78.0, 15.0)           # pra onde o braço aponta, visto de cima, no começo → no fim (graus): 0 = pro lado, 90 = pra
                               # frente, > 90 = cruzando um pouco pra dentro
POLIA_X, POLIA_Y, POLIA_Z, ALTO = -0.42, -0.30, 0.20, 2.15   # eixo da roldana baixa (do lado direito, um pouco à frente)
FRENTE = Vector((0.0, -1.0, 0.0))    # o boneco olha pra −Y
TRAS = -FRENTE
# mão livre espalmada na frente da torre
MAO_TORRE = (-0.18, 1.00)      # centro da palma na frente da carenagem: y (m) e altura (m)
POLO_LIVRE = (-0.25, 0.40, 0.05)   # polo do cotovelo livre em relação ao ombro (m: x, y, z) — pra fora e pra trás
APERTA = 0.001                 # a palma livre afunda isso na carenagem (m)
INCLINA_PALMA = 3.0            # palma livre inclinada isso (graus): o pé da mão sai um pouco do painel e a pele do punho
                               # (que é do antebraço) fica a ~1 mm dele, sem entrar
POLEGAR_JUNTO = 12.0           # polegar da mão livre a isso do indicador, no plano da palma (graus)
LAMBDA_MAX = 1.0               # dedo da mão livre dobra até perfil × isso pra encostar na torre
AFUNDA_TORRE = 2.0             # a pele pode afundar isso na torre (mm): só a palma apoiada encosta (afunda APERTA)
MAO = lambda L: [L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]


def _dist_segmento(Q, a, b):
    """Distância (m) de cada ponto de Q (N×3) ao segmento a–b."""
    a, b = np.array(a), np.array(b)
    d = b - a
    s = np.clip(((Q - a) @ d) / max(d @ d, 1e-12), 0.0, 1.0)
    return np.linalg.norm(Q - (a + np.outer(s, d)), axis=1)


def _malha(bon, partes):
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    return co[np.array([n in partes for n in nomes] + [False])[dono]]


def _dir(th, ph, s=1):
    """Braço (unitário, mundo) a th graus da vertical, apontando ph graus à frente do lado (s = +1 esquerdo)."""
    t, p = math.radians(th), math.radians(ph)
    return Vector((s * math.sin(t) * math.cos(p), -math.sin(t) * math.sin(p), -math.cos(t)))


def geometria(rig):
    """Braço que trabalha: o úmero gira num plano só (em volta de n = a0 × a1, sem girar no próprio eixo — "abdução, não
    rotação externa"), do começo a0 ao fim a1; o antebraço dobra COTOVELO graus pra frente (a frente perpendicular ao
    braço: no fim, na horizontal, não pra cima); a mão segue o antebraço (punho reto) com o polegar pra frente. segmentos(t)
    devolve braço, antebraço e palma (unitários), cotovelo E e punho W no mundo."""
    s = 1 if TRABALHA == "Left" else -1
    a0, a1 = _dir(ELEVA[0], PLANO[0], s), _dir(ELEVA[1], PLANO[1], s)
    n = a0.cross(a1).normalized()
    TH = a0.angle(a1)
    c = lambda nm: p3.cabeca(rig, nm)
    S = c(TRABALHA + "Arm")
    Lb = (c(TRABALHA + "ForeArm") - S).length
    La = (c(TRABALHA + "Hand") - c(TRABALHA + "ForeArm")).length
    k = math.radians(COTOVELO)

    def segmentos(t):
        R = Matrix.Rotation(TH * t, 3, n)
        a = R @ a0
        d = (FRENTE - a * FRENTE.dot(a)).normalized()
        f = (a * math.cos(k) + d * math.sin(k)).normalized()
        # polegar pra frente o movimento todo (Coratella 2020, LR-neutral: "thumbs forward"): a linha dos nós dos dedos
        # (indicador → mínimo) fica pra trás, perpendicular ao antebraço, e a palma vira pro corpo embaixo e pro chão em cima
        nos = (TRAS - f * TRAS.dot(f)).normalized()
        p = (nos.cross(f) if TRABALHA == "Left" else f.cross(nos)).normalized()
        E = S + a * Lb
        W = E + f * La
        return a, f, p, E, W

    return dict(S=S, Lb=Lb, La=La, segmentos=segmentos, n=n, TH=math.degrees(TH))


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                # mão de referência do pegador de 25 mm (antes do Maos)
    rig = bon.rig
    for lado, _ in LADOS:                        # pés chapados (a pose de repouso já é em pé)
        p3.travar_rotacao(rig, lado + "Foot")
    c = lambda n: p3.cabeca(rig, n)
    g = geometria(rig)
    S, seg = g["S"], g["segmentos"]

    def polo(Ec, W):
        eixo = (W - S).normalized()
        fora = (Ec - S) - eixo * (Ec - S).dot(eixo)
        return Ec + fora.normalized() * 0.4

    maos = Maos(bon, RAIO, polegar_modo="volta")
    pol = e3.polia("polia", x=POLIA_X, y=POLIA_Y, altura=POLIA_Z, frente=(1, 0, 0), alto=ALTO, gira=True)
    pux = e3.puxador_polia("puxador", raio=RAIO)

    # ── mão livre espalmada na torre (uma vez só: o braço livre não mexe) ───────────────────────────────────────────
    mao_livre = mao_na_torre(bon, maos, bpy_obj("polia_pilha"))

    # vão da mão em relação ao punho, no referencial da mão (fixo o movimento todo), no meio do movimento
    a, f, p, E, W = seg(0.5)
    lat = f.cross(p)
    maos.segurar(TRABALHA, W + f * 0.09, f, p, polo=polo(E, W))
    off = (W + f * 0.09) - c(TRABALHA + "Hand")
    off_local = (off.dot(f), off.dot(p), off.dot(lat))
    print("REF: vão − punho no referencial da mão (%.3f %.3f %.3f) | erro do vão %.1f mm | arco do braço %.1f° em volta "
          "de (%.2f %.2f %.2f)" % (*off_local, maos.erro[TRABALHA] * 1000, g["TH"], *g["n"]))

    def juntas(t):
        a, f, p, E, W = seg(t)
        lat = f.cross(p)
        return E, W, W + f * off_local[0] + p * off_local[1] + lat * off_local[2], f, p

    # pontos do corpo pras folgas (pernas e tronco não mexem)
    pernas_pts = _malha(bon, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"))
    tronco_pts = _malha(bon, ("Hips", "Spine", "Spine1", "Spine2"))

    def folgas_cena():
        """Cabo reto → pele das pernas e do tronco (m)."""
        A_ = pol.saida
        Eng = pux.ponto_engate
        cabo_p = float(_dist_segmento(pernas_pts, Eng, A_).min()) - 0.003
        cabo_t = float(_dist_segmento(tronco_pts, Eng, A_).min()) - 0.003
        return cabo_p, cabo_t

    def pose(t):
        """t=0 braço pendurado com a mão na frente da coxa, t=1 braço na altura do ombro."""
        E, W, gv, dq, pq = juntas(t)
        maos.segurar(TRABALHA, gv, dq, pq, polo=polo(E, W))
        eixo = pg._base(rig, TRABALHA)[1]        # pegador ao longo dos nós dos dedos (indicador → mínimo)
        eng = pux.por(gv, eixo, pol.direcao)
        pol.ligar(eng)
        p3.atualizar()
        antes = pose.dedos.get("Thumb") if t > 0 else None
        pose.dedos = pg.fechar_em_volta(bon, TRABALHA, gv, eixo, RAIO, polegar_antes=antes)
        pose.desvio = (c(TRABALHA + "ForeArm") - E).length * 1000
        pose.folgas = [x * 1000 for x in folgas_cena()]
        u = pol.direcao(pux.ponto_engate)
        pose.cabo = math.degrees(math.asin(max(-1.0, min(1.0, -u.z))))

    pose.dedos = {}
    pose.desvio = 0.0
    pose.folgas = [0.0] * 2
    pose.cabo = 0.0

    pose(0.5)                                    # polo certo do cotovelo no meio do movimento
    maos.iks[TRABALHA].mute = False
    e = p3.acertar_polo(rig, maos.iks[TRABALHA], TRABALHA + "ForeArm", TRABALHA + "Arm", TRABALHA + "Hand")
    print("polo cotovelo", TRABALHA, "erro %.3f ang %d" % e)
    for t in (0.0, 0.5, 1.0):
        pose(t)
        jt = ck.medir_juntas(rig)
        print("LATERAL t=%.1f | cotovelo E %.0f° | ombro E %.0f° | vão (%.3f %.3f %.3f) | olhal (%.3f %.3f %.3f) | cabo %.1f° "
              "abaixo da horizontal | garfo %.1f° | cabo → pernas %.0f mm | cabo → tronco %.0f mm | técnica %s" % (
                  t, jt["cotoveloE"], jt["ombroE"], *juntas(t)[2], *pux.ponto_olhal, pose.cabo, pol.giro, *pose.folgas,
                  ck.tc.texto(ck.tc.medir(ck.posicoes(rig)))))
    print("MÃO LIVRE %s" % mao_livre)

    def info():
        return maos.info() + (" | cotovelo fora do calculado %.1f mm | cabo %.1f° abaixo da horizontal | garfo %.1f° | "
                              "cabo → pernas %.0f mm | cabo → tronco %.0f mm | cabo %.3f m | polegar %s | mão livre %s") % (
            pose.desvio, pose.cabo, pol.giro, *pose.folgas, pol.comprimento, pose.dedos.get("Thumb"), mao_livre)

    pegs = [(TRABALHA, ck.Barra(pux.pegador, raio=RAIO, meio_compr=pux.meia))]
    # a torre é APOIO (a mão livre espalmada nela): fica fora da folga do peso e o corpo não afunda nela mais que
    # AFUNDA_TORRE; a roldana que gira e o cabo continuam equipamento (nada encosta neles)
    return Cena(pose, pux.raizes + [pol.roldana, pol.cabo], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, -0.1, 1.1),
                camera_video=((1.2, -4.2, 1.4), (0, -0.1, 1.05), 50), info=info, apoios=[pol.torre],
                afunda_apoio_mm=AFUNDA_TORRE)


def bpy_obj(nome):
    import bpy
    return bpy.data.objects[nome]


def mao_na_torre(bon, maos, painel):
    """Mão livre (direita) espalmada na frente da carenagem da torre (painel = a caixa da pilha de pesos): palma no
    plano da frente dela, dedos juntos na direção do antebraço (o punho dobra o mínimo), polegar junto do indicador. O
    braço vai por IK até o punho e fica congelado (FK); o antebraço gira pra palma e o punho põe os dedos na direção; a
    palma afunda APERTA no painel e cada dedo dobra (ou estica) até a pele encostar nele. Devolve um texto com as medidas."""
    rig = bon.rig
    PB = rig.pose.bones
    L = LIVRE
    c = lambda n: p3.cabeca(rig, n)
    pco, ptri = ck._avaliar_simples(painel)
    bvh_p = BVHTree.FromPolygons([tuple(x) for x in pco], [tuple(t) for t in ptri], all_triangles=True)
    x_face = float(pco[:, 0].max())               # frente da carenagem (virada pra +X, pro boneco)
    alvo = Vector((x_face, MAO_TORRE[0], MAO_TORRE[1]))
    palma_n = Vector((-1.0, 0.0, 0.0))            # do painel pra dentro dele
    S_l = c(L + "Arm")

    def _congelar():
        nomes_ = (L + "Arm", L + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes_]
        maos.iks[L].mute = True
        for n, M in zip(nomes_, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def _orientar(dedos_q):
        f0, f1 = c(L + "ForeArm"), c(L + "Hand")
        ax = (f1 - f0).normalized()               # 1) antebraço gira pra palma
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, L)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))
        h0 = c(L + "Hand")                        # 2) o resto no punho
        y_m = (p3.ponta(rig, L + "Hand") - h0).normalized()
        n_m = pg._base(rig, L)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, L + "Hand", F_quer @ F_tem.transposed())

    def _esticar_dedos():
        """Dedos juntos, esticados e deitados no plano da palma; o polegar também, encostado no indicador."""
        p3.soltar_dedos(rig, L)
        pg.juntar_dedos(rig, L, 1.0)
        for d_ in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, L)[0]
                o = "%sHand%s%d" % (L, d_, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def _pele(partes):
        co_, _, (nomes_, dono_) = ck._avaliar(bon.corpo, 1)
        return co_, nomes_, dono_, co_[np.array([n in partes for n in nomes_] + [False])[dono_]]

    def _dist(P):
        """Menor distância com sinal (m) dos pontos P até o painel (− = dentro)."""
        menor = 1e9
        for p in P:
            v = Vector(p)
            loc, nor, idx, dist = bvh_p.find_nearest(v)
            if loc is None:
                continue
            menor = min(menor, -dist if (v - loc).dot(nor) < 0 else dist)
        return menor

    def _dobrar_ate_encostar(ossos, eixos, perfil, lam_min=-0.5):
        """Dobra a cadeia (falange 1 → 3) pro painel com os ângulos perfil × λ até a pele encostar nele (≤ 0,5 mm): a
        partir de λ = 0 (dedo no plano da palma); se já entra (< −1 mm), estica até sair (λ até −0,5)."""
        co_, nomes_, dono_, _ = _pele(ossos)
        pos = {n: i for i, n in enumerate(nomes_)}
        pts = {o: co_[dono_ == pos[o]] for o in ossos}
        cab = {o: np.array(c(o)) for o in ossos}
        ponta = np.array(p3.ponta(rig, ossos[-1]))

        def dist(lam):
            pp = pg._cadeia_pts(pts, cab, ponta, ossos, eixos, [lam * a for a in perfil])
            return _dist(np.concatenate([pp[o] for o in ossos]))

        escolha = 0.0
        if dist(0.0) < -0.001:
            for lam in np.arange(-0.02, lam_min - 0.0001, -0.02):
                escolha = float(lam)
                if dist(lam) >= -0.0005:
                    break
        else:
            for lam in np.arange(0.0, LAMBDA_MAX + 0.0001, 0.02):
                escolha = float(lam)
                if dist(lam) <= 0.0005:
                    break
        for k, o in enumerate(ossos):
            if escolha * perfil[k]:
                p3.girar_osso(rig, o, Matrix.Rotation(math.radians(escolha * perfil[k]), 3, Vector(eixos[k])))
        return escolha

    def _polegar_junto():
        palma = pg._base(rig, L)[0]
        o = L + "HandThumb1"
        t_ = p3.ponta(rig, L + "HandThumb3") - c(o)
        i_ = p3.ponta(rig, L + "HandIndex3") - c(L + "HandIndex1")
        t_ -= palma * t_.dot(palma)
        i_ -= palma * i_.dot(palma)
        ang = math.atan2(t_.cross(i_).dot(palma), t_.dot(i_))
        falta = ang - math.copysign(math.radians(POLEGAR_JUNTO), ang)
        if ang * falta > 0:
            p3.girar_osso(rig, o, Matrix.Rotation(falta, 3, palma))

    def _dedos_no_painel():
        palma, eixo_nos = pg._base(rig, L)[:2]
        lams = {}
        for d_ in p3.DEDOS:
            ossos = ["%sHand%s%d" % (L, d_, i) for i in (1, 2, 3)]
            f = (p3.ponta(rig, ossos[0]) - c(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1     # + = dobra pro lado da palma (pro painel)
            lams[d_] = _dobrar_ate_encostar(ossos, [np.array(eixo_nos * sinal)] * 3, (30.0, 25.0, 15.0))
        _polegar_junto()
        ossos = ["%sHand%s%d" % (L, "Thumb", i) for i in (1, 2, 3)]
        eixos = []
        for o in ossos:
            f = (p3.ponta(rig, o) - c(o)).normalized()
            eixos.append(np.array(f.cross(palma).normalized()))
        lams["Thumb"] = _dobrar_ate_encostar(ossos, eixos, (20.0, 10.0, 10.0), lam_min=-1.0)   # a base sai do painel
        return lams

    # dedos na direção do antebraço (o punho dobra o mínimo): o antebraço aponta do ombro pro alvo, no plano do painel
    ida = alvo - S_l
    dedos_p = Vector((0.0, ida.y, ida.z)).normalized()      # no plano do painel
    b = math.radians(INCLINA_PALMA)
    dedos_q = (dedos_p * math.cos(b) + palma_n * math.sin(b)).normalized()   # pontas um pouco pro painel
    palma_q = (palma_n * math.cos(b) - dedos_p * math.sin(b)).normalized()   # pé da mão um pouco pra fora
    W = alvo - dedos_q * 0.055 + Vector((0.02, 0, 0))
    maos.polos[L].location = S_l + Vector(POLO_LIVRE)
    for volta in range(10):
        maos.iks[L].mute = False
        maos.punhos[L].location = W
        p3.atualizar()
        if volta == 0:
            e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
            print("polo cotovelo livre erro %.3f ang %d" % e)
        _congelar()
        _orientar(dedos_q)
        _esticar_dedos()
        palma_pts = _pele((L + "Hand", L + "HandThumb1"))[3]   # palma + eminência tenar (base do polegar)
        palma_mao = pg._base(rig, L)[0]
        centro_mao = np.array(palma_pts.mean(axis=0))
        lado_palma = palma_pts[(palma_pts - centro_mao) @ np.array(palma_mao) > 0.004]
        centro_palma = Vector(lado_palma.mean(axis=0))
        dist = _dist(lado_palma)
        erro_alvo = alvo - centro_palma
        erro_alvo -= palma_n * erro_alvo.dot(palma_n)                      # no plano do painel: centro da palma no alvo
        W = W + erro_alvo + palma_n * (dist + APERTA)                     # e a palma encostando (afundando APERTA)
        print("MÃO LIVRE volta %d: palma → painel %.1f mm | centro da palma fora do alvo %.1f mm" % (
            volta, dist * 1000, erro_alvo.length * 1000))
        if abs(dist + APERTA) < 0.0004 and erro_alvo.length < 0.003:
            break
    lams = _dedos_no_painel()
    mao_pts = _pele(tuple(MAO(L)))[3]
    ante_pts = _pele((L + "ForeArm",))[3]
    jt = ck.medir_juntas(rig)
    return "punho D %.0f° cotovelo D %.0f° ombro D %.0f° | mão → torre %.1f mm | antebraço → torre %.1f mm | dedos λ %s" % (
        jt["punhoD"], jt["cotoveloD"], jt["ombroD"], _dist(mao_pts) * 1000, _dist(ante_pts) * 1000,
        " ".join("%s %.2f" % (k[0], v) for k, v in lams.items()))
