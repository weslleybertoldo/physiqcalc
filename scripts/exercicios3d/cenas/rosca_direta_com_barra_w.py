# Rosca Direta com Barra W — cena da fábrica 3D (lote 13, 12/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos
# treinos prontos, 6 como troca equivalente). Peça NOVA: a barra W livre com anilhas (e3.barra_w, bloco "Barra W" do lib/equip3d.py).
# t = 0 em pé, os braços quase esticados e a barra W segura por baixo nas pegadas de FORA (os pedaços inclinados mais abertos), na
# frente das coxas, com as palmas pra frente e um pouco viradas pra dentro (pegada semi-supinada) · t = 1 os cotovelos dobrados, a
# barra na altura dos ombros, na frente deles. O app faz a volta (desce até quase esticar de novo).
# Técnica (as fontes, com a frase exata, ficam na ficha):
#   • free-exercise-db, EZ-Bar Curl (o "fonte_en" do catálogo): "Stand up straight while holding an EZ curl bar at the wide outer
#     handle. The palms of your hands should be facing forward and slightly tilted inward due to the shape of the bar. Keep your elbows
#     close to your torso." / "while keeping your upper arms stationary, exhale and curl the weights forward while contracting the
#     biceps. Focus on only moving your forearms." / "Continue to raise the weight until your biceps are fully contracted and the bar
#     is at shoulder level."
#   • ExRx, Barbell Curl (demonstrada com a barra W: "Movement with cambered bar as shown above is also known as EZ Barbell Curl"):
#     "Grasp bar with shoulder width underhand grip." / "With elbows to side, raise bar until forearms are vertical. Lower until arms
#     are fully extended." / "When elbows are fully flexed, they can travel forward slightly allowing forearms to be no more than
#     vertical."
#   • Marcolin et al. 2018 (PeerJ 6:e5165): "in the EZ barbell curl they assume an intermediate position very close to a semiproned
#     position" (o antebraço); "A standing posture was maintained"; amplitude do cotovelo "EZ = 119.9° ± 13.7°".
#   • NSCA (Essentials, rosca com barra reta): "Stand with your feet shoulder-width apart and your knees slightly flexed." / "Keep your
#     torso and upper arms stationary." / "Avoid bouncing the bar on your thighs."
# Montagem (a da Rosca Inversa com Barra, lote 10, com a pegada da barra W): em pé na pose de repouso (pés chapados na largura dos
# ombros, joelhos soltos), as escápulas um pouco pra trás (RETRAI). Braço e antebraço calculados (ALFA, TETA): o punho na largura da
# pegada (PEGADA, acertada pra mão cair no MEIO da pegada de fora da barra) e o cotovelo junto do tronco, ~2,7 cm pra fora do ombro,
# quase na reta ombro → punho vista de frente (LARG_COT_MIN); o braço fica parado em ALFA[0] até o antebraço passar de VOLTA_TOPO
# graus da vertical e só então vai um pouco à frente, até ALFA[1] em cima (ExRx: "they can travel forward slightly"). Em todo quadro o
# braço, o antebraço e a mão partem do repouso (o zerar do maos3d.Maos.segurar, conserto 120b243: nada de giro do antebraço passando
# de um quadro pro outro). A mão fica na linha do antebraço (o punho do repouso, reto) e o antebraço gira em volta do próprio eixo o
# tanto que a pegada inclinada pede: no quadro em que a mão fecha (t = 0,5), até a linha dos nós dos dedos (indicador → mínimo) ficar
# a DOBRA graus da linha da barra, com a palma virada um pouco pro meio (semi-supinada, não pra fora); nos outros quadros, o giro que
# deixa a linha da barra (presa na mão) atravessada no corpo, de um lado ao outro — a barra só rola com os antebraços e o giro do
# antebraço × braço anda liso de −59° a −71° (medir_giro.py do conserto 120b243, 12/10/2026: sem deriva; a mão × antebraço fica a do
# repouso). A mão fecha UMA vez no pedaço inclinado (dedos + polegar dando a volta, pg.usar_polegar("volta")) e depois a mão e a barra
# andam presas no antebraço: a barra é a média das 2 mãos (a pose dela guardada no osso de cada mão).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
ALFA = (8.0, 16.0)        # braço (ombro → cotovelo) à frente da vertical, graus: parado embaixo, um pouco à frente em cima (o mesmo
                          # das outras roscas com barra)
TETA_MIN = 18.0           # antebraço (cotovelo → punho) à frente da vertical embaixo, graus: o de verdade (TETA0) é o 1º, daqui pra
                          # cima, em que a barra inteira fica FOLGA_COXA na frente das coxas (o fundo dos V da barra W fica do lado
                          # do corpo, mais perto das coxas que a linha da barra)
FOLGA_COXA = 0.008        # embaixo a barra para 8 mm na frente das coxas (a checagem pede ≥ 3 mm de qualquer peça até o corpo)
TETA_MAX = 150.0          # antebraço em cima, graus da vertical: o de verdade (TETA1) é o maior, daqui pra baixo, em que a pele do
                          # antebraço não entra na do braço além do vinco (ck.corpo_x_corpo ≤ PELE_MAX)
PELE_MAX = 1.0            # mm: antebraço × braço fora do vinco do cotovelo (a checagem falha com 2 mm, ck.PENETRA_MM)
VOLTA_TOPO = 95.0         # o braço só sai de ALFA[0] depois que o antebraço passa dessa inclinação (graus da vertical)
# Cotovelo pra fora do ombro (encostado no tronco): na reta ombro → punho vista de frente (o montar() acerta com o punho), e nunca
# menos que LARG_COT_MIN (com a pegada de fora da barra W fica nele: ~1 mm pra fora da reta). Medido em 12/10/2026: com o cotovelo 3
# cm pra fora e o punho só ~3,7 cm (numa pegada mais fechada), o plano ombro–cotovelo–punho do braço quase esticado embaixo virava
# ~23° em volta da vertical e o antebraço girava ~19° no próprio eixo entre t = 0 e t = 0,5 pra barra ficar atravessada; na reta o
# plano fica de lado (sagital) e o giro quase não muda — mas com o cotovelo a 1,8 cm o braço entrava 2–3 mm no tronco (a 18 cm do
# ombro).
LARG_COT_MIN = 0.027
PEGADA0 = 0.255           # meia distância entre os punhos pra começar; o montar() acerta até a mão cair no meio da pegada de fora
RETRAI = 4.0              # escápulas um pouco pra trás (graus de giro da clavícula), como na Rosca Inversa com Barra
DOBRA = 30.0              # pedaços inclinados da barra W a 30° da linha dela (Dymeck 1950: "25 to 35"; e3.barra_w)
RAIO = 0.014              # eixo de 28 mm (Eleiko Curl Bar: "28 mm Bar Diameter"): mais fino que o de 29 mm da mão de referência
                          # padrão — sem pg.usar_cilindro (só pra pegador mais GROSSO); os dedos fecham até encostar
X = Vector((1.0, 0.0, 0.0))


def _ss(x):
    """Rampa suave 0 → 1 (smoothstep) com x preso em [0, 1]."""
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _bvh(vs, ts):
    return BVHTree.FromPolygons([tuple(p) for p in vs], [tuple(t) for t in ts], all_triangles=True)


def _menor(bvh, pts, lim):
    """Menor distância (m) dos pontos até a malha, até `lim` (mais longe = lim)."""
    m = lim
    for p in pts:
        r = bvh.find_nearest(Vector(p), lim)
        if r[0] is not None and r[3] < m:
            m = r[3]
    return m


def _com_sinal(bvh, pts, lim=0.5):
    """Menor distância com sinal dos pontos até a superfície (− = dentro), até `lim`."""
    menor = lim
    for p in pts:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is not None:
            menor = min(menor, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
    return menor


def _giro(rig, pai, filho):
    """Giro do osso filho em volta do próprio eixo em relação ao pai, graus (a conta do medir_giro.py do conserto 120b243)."""
    Ra = rig.pose.bones[p3.P + pai].matrix.to_3x3()
    Rb = rig.pose.bones[p3.P + filho].matrix.to_3x3()
    q = (Ra.inverted() @ Rb).to_quaternion()
    return math.degrees(2 * math.atan2(q.y, q.w))


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (exercícios novos, 05/10/2026)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    for L, _ in LADOS:                 # pés chapados (a pose de repouso já é em pé, pés na largura dos ombros, joelhos soltos)
        p3.travar_rotacao(rig, L + "Foot")

    # ── 1) escápulas um pouco pra trás, paradas o movimento todo ──────────────────────────────────────────────────────────────────
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    ombro_antes = cab("LeftArm")
    for L, s in LADOS:
        p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
    print("ESCÁPULAS | retração %.0f° | ombro E andou %.1f mm pra trás" % (RETRAI, (cab("LeftArm") - ombro_antes).y * 1000), flush=True)

    # ── 2) braços: IK até o punho calculado (cotovelo junto do tronco, punho na largura da pegada) ─────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for L, _ in LADOS:                 # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punhos[L] = p3.vazio("punho_" + L, p3.ponta(rig, L + "ForeArm"))
        polos[L] = p3.vazio("polo_cotovelo_" + L, cab(L + "ForeArm") + Vector((0, 0.6, 0)))
        iks[L] = p3.ik(rig, L + "ForeArm", punhos[L], polos[L])
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço
    bw = e3.barra_w("barra_w", dobra=DOBRA, raio=RAIO, pegada="fora")
    med = bw.medidas
    print("BARRA W | %s" % " ".join("%s %.4g" % kv for kv in med.items()), flush=True)
    estado = {"giro": {}, "cot": {}, "twist": {}, "fechada": False}
    par = {"teta0": TETA_MIN, "teta1": TETA_MAX, "pegada": PEGADA0}     # saem das buscas dos passos 3 e 4
    par["larg_cot"] = max(LARG_COT_MIN, (PEGADA0 - S["Left"].x) * Lb / (Lb + La))    # cotovelo na reta ombro → punho (o passo 3 acerta)
    a_mao, T = {}, {}                  # linha da barra (+X dela) e pose da barra, no osso de cada mão (guardadas quando a mão fecha)

    def _teta(t):
        return p3.lerp(par["teta0"], par["teta1"], t)

    def _topo(teta_g):
        """0 até o antebraço passar de VOLTA_TOPO graus da vertical, 1 em cima (suave nas 2 pontas)."""
        return _ss((teta_g - VOLTA_TOPO) / (par["teta1"] - VOLTA_TOPO))

    def _alvos(t):
        """Alvos do IK: cotovelo e punho calculados (braço e antebraço com o comprimento exato)."""
        teta_g = _teta(t)
        teta = math.radians(teta_g)
        alfa = math.radians(p3.lerp(*ALFA, _topo(teta_g)))
        cots = {}
        for L, s in LADOS:
            E = S[L] + Vector((s * par["larg_cot"], -math.sin(alfa) * Lb, -math.cos(alfa) * Lb)).normalized() * Lb
            dx = s * par["pegada"] - E.x
            rho = math.sqrt(La ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[L].mute = False
            punhos[L].location = W
            eixo = (W - S[L]).normalized()
            fora = (E - S[L]) - eixo * (E - S[L]).dot(eixo)
            polos[L].location = E + fora.normalized() * 0.4
            cots[L] = E
        p3.atualizar()
        return teta, cots

    def _zerar():
        """Braço, antebraço e mão de volta pro repouso antes do quadro (o zerar do Maos.segurar, conserto 120b243)."""
        for L, _ in LADOS:
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + L + n].matrix_basis = Matrix.Identity(4)
        p3.atualizar()

    def _giro_nos(L, s, ax):
        """Giro do antebraço (rad, em volta de ax) que deixa a linha dos nós (indicador → mínimo) a DOBRA graus da linha da barra (pro
        meio do corpo, −s·X), com a palma virada um pouco pro meio (semi-supinada) — o quadro em que a mão fecha."""
        palma, u = pg._base(rig, L)[:2]
        w = -s * X
        c0 = u.dot(ax) * ax.dot(w)
        up = u - ax * u.dot(ax)
        A1, A2 = up.dot(w), ax.cross(up).dot(w)
        A = math.hypot(A1, A2)
        f0 = math.atan2(A2, A1)
        c = max(-1.0, min(1.0, (math.cos(math.radians(DOBRA)) - c0) / A))
        melhor = None
        for f in (f0 + math.acos(c), f0 - math.acos(c)):
            pr = Matrix.Rotation(f, 3, ax) @ palma
            if melhor is None or pr.dot(w) > melhor[0]:      # palma pro meio do corpo (a outra raiz vira a palma pra fora)
                melhor = (pr.dot(w), f)
        return melhor[1]

    def _giro_barra(L, ax):
        """Giro do antebraço (rad, em volta de ax) que deixa a linha da barra presa na mão o mais atravessada no corpo possível (+X)."""
        v = p3.mundo_osso(rig, L + "Hand").to_3x3() @ a_mao[L]
        vp = v - ax * v.dot(ax)
        xp = X - ax * X.dot(ax)
        return math.atan2(vp.cross(xp).dot(ax), vp.dot(xp))

    def _braco(t):
        """Braço e antebraço no quadro t (do repouso; IK congelado em FK) e o antebraço girado pra pegada da barra W."""
        _zerar()
        teta, cots = _alvos(t)
        for L, s in LADOS:
            nomes = (L + "Arm", L + "ForeArm")
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[L].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            ax = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
            ang = _giro_barra(L, ax) if estado["fechada"] else _giro_nos(L, s, ax)
            p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(ang, 3, ax))
            estado["giro"][L] = math.degrees(ang)
            estado["cot"][L] = (cab(L + "ForeArm") - cots[L]).length
            estado["twist"][L] = _giro(rig, L + "Arm", L + "ForeArm")
        return teta

    def _barra_nas_maos():
        """Barra = média das poses que as 2 mãos carregam (guardadas quando a mão fechou)."""
        Ms = [p3.mundo_osso(rig, L + "Hand") @ T[L] for L, _ in LADOS]
        loc = (Ms[0].to_translation() + Ms[1].to_translation()) / 2
        q = Ms[0].to_quaternion().slerp(Ms[1].to_quaternion(), 0.5)
        bw.raiz.matrix_world = Matrix.Translation(loc) @ q.to_matrix().to_4x4()
        p3.atualizar()
        estado["desencontro"] = ((Ms[0].to_translation() - Ms[1].to_translation()).length * 1000,
                                 math.degrees(Ms[0].to_quaternion().rotation_difference(Ms[1].to_quaternion()).angle))

    def pose(t):
        """t=0 braços quase esticados (barra na frente das coxas), t=1 cotovelos dobrados (barra na altura dos ombros)."""
        _braco(t)
        _barra_nas_maos()
        estado["t"] = t

    _alvos(0.5)                         # polo certo do cotovelo no meio do movimento
    for L, _ in LADOS:
        e = p3.acertar_polo(rig, iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo", L, "erro %.3f ang %d" % e, flush=True)

    # ── 3) as 2 mãos fecham UMA vez na barra (no meio do movimento, longe do corpo), no meio da pegada de fora: o punho (PEGADA) anda
    #    até o vão da mão de referência cair a x_fora do meio da barra; a barra passa pelos 2 vãos com cada pedaço inclinado ao longo
    #    da linha dos nós da mão; a pose da barra fica guardada no osso de cada mão ─────────────────────────────────────────────────
    tg = math.tan(math.radians(DOBRA))
    for volta in range(6):
        par["larg_cot"] = max(LARG_COT_MIN, (par["pegada"] - S["Left"].x) * Lb / (Lb + La))    # na reta ombro → punho, de frente
        _braco(0.5)
        for L, _ in LADOS:
            pg.mao_de_referencia(rig, L)
        g, nos = {}, {}
        for L, _ in LADOS:
            g[L] = pg.ponto_na_mao(bon, L, RAIO)[0]
            nos[L] = pg._base(rig, L)[1]
        gx = (g["Left"] - g["Right"]).length / 2
        erro = med["x_fora"] - gx
        print("PEGADA volta %d | punho %.4f m | cotovelo %.1f mm pra fora do ombro | vão da mão a %.4f m do meio (meio da pegada de fora "
              "%.4f) | erro %.1f mm" % (volta, par["pegada"], par["larg_cot"] * 1000, gx, med["x_fora"], erro * 1000), flush=True)
        if abs(erro) < 0.0005:
            break
        par["pegada"] += erro
    Xb = (g["Left"] - g["Right"]).normalized()
    ys = []
    for L, s in LADOS:                 # o pedaço de fora vai pra fora ao longo de −(indicador → mínimo)
        f = -nos[L]
        ys.append((f - Xb * f.dot(Xb)).normalized())
    Yb = (ys[0] + ys[1]).normalized()
    Yb = (Yb - Xb * Yb.dot(Xb)).normalized()
    Zb = Xb.cross(Yb)
    y_g = -med["fundo"] + (gx - med["x_fundo"]) * tg       # o vão da mão na linha do pedaço de fora (y local)
    O = (g["Left"] + g["Right"]) / 2 - Yb * y_g
    bw.raiz.matrix_world = Matrix.Translation(O) @ Matrix((Xb, Yb, Zb)).transposed().to_4x4()
    p3.atualizar()
    dedos = {}
    for L, s in LADOS:
        p_, e_ = bw.mundo(s)
        dedos[L] = pg.fechar_em_volta(bon, L, g[L], e_, RAIO)
        ang_nos = math.degrees(nos[L].angle(-e_))
        print("MÃO %s | linha dos nós × pedaço da barra %.1f° | vão × meio da pegada %.1f mm" % (L, ang_nos, (g[L] - p_).length * 1000),
              flush=True)
    for L, _ in LADOS:
        T[L] = p3.mundo_osso(rig, L + "Hand").inverted() @ bw.raiz.matrix_world
        a_mao[L] = (T[L].to_3x3() @ X).normalized()
    estado["fechada"] = True
    pol = {L: dedos[L].get("Thumb") for L, _ in LADOS}
    print("MÃOS | vão a vão %.1f mm | base do dedo médio a %.1f/%.1f mm do meio, ombros a %.1f/%.1f mm | dedos E %s | D %s | polegar E "
          "%s | D %s" % ((g["Left"] - g["Right"]).length * 1000, cab("LeftHandMiddle1").x * 1000, -cab("RightHandMiddle1").x * 1000,
                         S["Left"].x * 1000, -S["Right"].x * 1000,
        {k: v for k, v in dedos["Left"].items() if k != "Thumb"}, {k: v for k, v in dedos["Right"].items() if k != "Thumb"},
        pol["Left"], pol["Right"]), flush=True)

    # ── 4) até onde o cotovelo estica embaixo e dobra em cima ─────────────────────────────────────────────────────────────────────
    pecas = {o.name: o for o in bw.raiz.children if o.type == "MESH"}
    M0i = np.array(bw.raiz.matrix_world.inverted())
    pts = np.concatenate([ck._amostras(*ck._avaliar_simples(pecas["barra_w_eixo"]), 0.01)] + [
        ck._avaliar_simples(o)[0] for nm, o in pecas.items() if nm != "barra_w_eixo"])
    pts_loc = pts @ M0i[:3, :3].T + M0i[:3, 3]           # pontos da barra no referencial dela
    eixo_loc = ck._amostras(*ck._avaliar_simples(pecas["barra_w_eixo"]), 0.003) @ M0i[:3, :3].T + M0i[:3, 3]

    def _pb():
        Mb = np.array(bw.raiz.matrix_world)
        return pts_loc @ Mb[:3, :3].T + Mb[:3, 3]

    def folga_barra_corpo():
        """Menor distância com sinal (m) da barra (todas as peças) até o corpo sem as mãos — o que a checagem mede (peso × corpo)."""
        co, tri, (nomes, dono) = _malha(bon)
        mao = np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes] + [False])[dono]
        bvh = _bvh(co, tri[~mao[tri].any(axis=1)])
        return _com_sinal(bvh, _pb(), 0.2)

    #    embaixo: o antebraço desce de TETA_MIN pra cima até a barra ficar FOLGA_COXA na frente das coxas
    par["teta0"] = TETA_MIN
    while True:
        pose(0.0)
        fb = folga_barra_corpo()
        if fb >= FOLGA_COXA or par["teta0"] >= 45.0:
            break
        par["teta0"] += 0.5
    print("EMBAIXO | antebraço a %.1f° da vertical (cotovelo %.1f°) | barra a %.1f mm do corpo" % (
        par["teta0"], ck.medir_juntas(rig)["cotoveloE"], fb * 1000), flush=True)

    #    em cima: o antebraço sobe de TETA_MAX pra baixo até a pele dele não entrar na do braço além do vinco (PELE_MAX)
    par["teta1"] = TETA_MAX
    while True:
        pose(1.0)
        co, tri, (nomes, dono) = _malha(bon)
        ck.posicoes_das_juntas(rig)
        cxc = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
        pele = max(cxc.get("antebracoE×bracoE", 0.0), cxc.get("antebracoD×bracoD", 0.0))
        if pele <= PELE_MAX or par["teta1"] <= 120.0:
            break
        par["teta1"] -= 0.5
    print("EM CIMA | antebraço a %.1f° da vertical (cotovelo %.1f°) | antebraço × braço fora do vinco %.1f mm" % (
        par["teta1"], ck.medir_juntas(rig)["cotoveloE"], pele), flush=True)

    # ── 5) medidas à parte (a checagem ignora o que fica DENTRO da mão) ─────────────────────────────────────────────────────────────

    def folgas_extra():
        """Folgas (mm, até 300): barra × coxas, × tronco, × rosto/pescoço, × antebraços e × cabelo; mão × o resto do eixo da barra
        (as curvas e os outros pedaços: o eixo a mais de 2 mm do cilindro do pedaço da própria mão); mãos × colares, luvas, anilhas,
        miolos e travas; mãos × peito, ombros, pescoço e rosto (+ cabelo); mãos × coxas."""
        co, tri, (nomes, dono) = _malha(bon)
        pb = _pb()
        out = {}
        for chave, partes in (("coxas", ("LeftUpLeg", "RightUpLeg")), ("tronco", ("Hips", "Spine", "Spine1", "Spine2")),
                              ("rosto", ("Head", "Neck")), ("antebracos", ("LeftForeArm", "RightForeArm"))):
            m = _grupo(nomes, dono, partes)
            out[chave] = _menor(_bvh(co, tri[m[tri].all(axis=1)]), pb[::2], 0.30) * 1000
        bvh_cabelo = ck._bvh(*ck._avaliar_simples(bon.cabelo))
        out["cabelo"] = _menor(bvh_cabelo, pb[::2], 0.30) * 1000
        Mb = np.array(bw.raiz.matrix_world)
        ex = eixo_loc @ Mb[:3, :3].T + Mb[:3, 3]
        m_peito = _grupo(nomes, dono, ("Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"))
        bvh_peito = _bvh(co, tri[m_peito[tri].all(axis=1)])
        m_coxa = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "Hips"))
        bvh_coxa = _bvh(co, tri[m_coxa[tri].all(axis=1)])
        curvas, pontas, peito, cabelo, coxa = [], [], [], [], []
        for L, s in LADOS:
            mv = co[np.array([nm.startswith(L + "Hand") for nm in nomes] + [False])[dono]]
            c, u = (np.array(v) for v in bw.mundo(s))
            d = ex - c
            rad = np.linalg.norm(d - np.outer(d @ u, u), axis=1)
            longe = ex[rad > RAIO + 0.002]                   # eixo fora do cilindro do pedaço desta mão (curvas, outros pedaços)
            kd = KDTree(len(longe))
            for i, v in enumerate(longe):
                kd.insert(Vector(v), i)
            kd.balance()
            curvas.append(min(kd.find(Vector(v))[2] for v in mv) * 1000)
            tv = [ck._avaliar_simples(pecas["barra_w_%s%+d" % (k, s)]) for k in ("colar", "luva", "anilha", "miolo", "trava")]
            pontas.append(min(_com_sinal(_bvh(*t_), mv[::2]) for t_ in tv) * 1000)
            peito.append(_com_sinal(bvh_peito, mv[::2]) * 1000)
            cabelo.append(_menor(bvh_cabelo, mv[::3], 0.30) * 1000)
            coxa.append(_com_sinal(bvh_coxa, mv[::2]) * 1000)
        out.update(curvas=curvas, pontas=pontas, peito=peito, cabelo_mao=cabelo, coxa_mao=coxa)
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        bc = bw.raiz.matrix_world.to_translation()
        Sm = (S["Left"] + S["Right"]) / 2
        f = folgas_extra()
        return ("cotovelo %.1f/%.1f° | braço à frente %s° | antebraço %s° da vertical | palma × frente %s° | palma pro meio %s° | punho "
                "%s° | desvio %s° | pegada %.2f | meio da barra %.0f mm acima e %.0f mm à frente dos ombros | barra × coxas %.0f, × tronco "
                "%.0f, × rosto/pescoço %.0f, × antebraços %.0f, × cabelo %.0f mm | mão × curvas/resto do eixo E %.1f D %.1f mm (com a "
                "pele que aperta: o eixo a ≥ 2 mm do cilindro da mão) | mão × colar/luva/anilha/trava E %.0f D %.0f mm | mão × "
                "peito/ombros/rosto E %.0f D %.0f mm, × cabelo E %.0f D %.0f mm | mão × coxas E %.0f D %.0f mm | giro aplicado no "
                "antebraço E %.1f D %.1f° | antebraço × braço (giro no próprio eixo) E %.1f D %.1f° | mãos × barra (desencontro) %.2f mm "
                "%.2f° | cotovelo fora do alvo E %.1f D %.1f mm"
                % (juntas["cotoveloE"], juntas["cotoveloD"], "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                   "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                   "/".join("%.0f" % v for v in tc.palma_dentro(jj)), "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                   "/".join("%.0f" % v for v in tc.punho_desvio(jj)), tc.pegada_largura(jj)[0], (bc.z - Sm.z) * 1000,
                   (Sm.y - bc.y) * 1000, f["coxas"], f["tronco"], f["rosto"], f["antebracos"], f["cabelo"], *f["curvas"], *f["pontas"],
                   *f["peito"], *f["cabelo_mao"], *f["coxa_mao"], estado["giro"]["Left"], estado["giro"]["Right"],
                   estado["twist"]["Left"], estado["twist"]["Right"], *estado["desencontro"],
                   estado["cot"]["Left"] * 1000, estado["cot"]["Right"] * 1000))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegadas = [(L, ck.Barra(bw.pegadores[s], RAIO, bw.meia)) for L, s in LADOS]
    return Cena(pose, [bw.raiz], pegadas=pegadas, apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((2.7, -4.0, 1.25), (0, 0, 1.0), 50), info=info)
