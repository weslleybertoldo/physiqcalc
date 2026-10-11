# Stiff com Halteres — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos treinos
# prontos, 5 vezes como troca equivalente; "fonte_en": "Stiff-Legged Dumbbell Deadlift"). Sem peça nova: 2 halteres de 29 mm
# (e3.halter, o pegador da mão de referência) com o polegar novo dando a volta.
# t = 0 em pé, um halter em cada mão na frente das coxas · t = 1 tronco inclinado, os halteres na frente das canelas. O app faz a volta.
# Técnica (as frases das fontes, com a referência, ficam na ficha):
#   • um halter em cada mão NA FRENTE das coxas, o cabo atravessado e as palmas viradas pro corpo (pegada pronada), os braços esticados
#     e soltos: as 2 fotos do free-exercise-db (o fonte_en) mostram isso e a ACE 2025 manda adaptar a barra "along the front of the
#     thighs" com a pegada pronada pra "one dumbbell in each hand" (o texto do free-exercise-db e o do ExRx dizem "by your side": fica
#     como nota na ficha);
#   • pés na largura do quadril, pontas pra frente (ACE 2025 "hip-width"; free-exercise-db e ExRx "shoulder width or narrower");
#   • joelhos levemente dobrados e PARADOS no mesmo ângulo (free-exercise-db "slightly bent" + "Keeping the knees stationary"; NSCA
#     "remain in this position"; ACE 2025 "maintain a slight bend"; McAllister 2014 "near full extension"); o catálogo diz "pernas
#     estendidas": quase estendidas;
#   • o quadril vai pra trás e o tronco inclina com a coluna neutra; o peso sai do meio do pé rumo ao calcanhar (NSCA, Exercise
#     Technique Manual: "The balance of the foot (center of mass) starts in the midfoot and, as the bar is lowered, begins to move toward
#     the heel"); os ombros ficam em cima ou à frente dos halteres (NSCA: "remain directly over, or in front of, the bar");
#   • os halteres descem RENTES às pernas, sem encostar (ExRx "Keep dumbbells close to legs"; NSCA "as close as possible to the body");
#   • cabeça na linha da coluna, olhando o chão (ACE 2025: "chin tucked", "neck in a neutral position and look toward the floor");
#   • escápulas um pouco pra trás e pra baixo (ACE 2025: "pull the shoulder blades down toward the back pockets"; NSCA, stiff-leg
#     deadlift: "keep the shoulders retracted");
#   • até LOGO ABAIXO DOS JOELHOS (NSCA: "Lower the bar just below the knees to the tibial tuberosity, or until a neutral spine cannot be
#     maintained"; ACE 2025: "about knee height"): com o joelho quase esticado, o limite é o posterior da coxa (ExRx: "Do not lower
#     weight beyond mild stretch"); o meio da canela da foto do free-exercise-db pedia, neste boneco, o tronco além da horizontal (~93°)
#     e o quadril dobrado ~105° a partir de em pé, bem além dos 80 ± 16° que o Lee 2018 mediu no RDL descendo até onde dava (com o
#     joelho a 34°, que solta o posterior da coxa).
# Montagem (as contas do Bom Dia com Barra e do Levantamento Terra Romeno (Stiff)):
#   - pés: tornozelos parados no chão a ±X_PE do meio, sola chapada na orientação do repouso (pontas pra frente); joelhos por IK, com o
#     polo na frente (na direção do pé).
#   - tronco: a pelve e o tronco giram juntos (coluna neutra) em volta das articulações do quadril, TRONCO graus da vertical (em linha
#     reta no tempo; o t já vem suave do exportador); a cabeça volta PESCOCO × a inclinação (fica na linha da coluna).
#   - joelhos: a flexão vai de JOELHO[0] a JOELHO[1] (o mesmo ângulo); a altura do quadril sai dela (distância quadril → tornozelo).
#   - equilíbrio: em cada quadro o quadril vai pra trás até o centro de massa do corpo (volume da malha posada, densidade uniforme) +
#     os 2 halteres (M_HALTER cada) ficar em cima do meio do pé (em pé) e RUMO_CALCANHAR atrás dele (embaixo).
#   - braços: cada um pendurado do ombro como um pêndulo quase esticado (cotovelo a COTOVELO graus, a mão na linha do antebraço — o
#     alcance ombro → vão da mão sai de uma bisseção no montar(), feita de novo depois de acertar o polo do cotovelo), até o halter,
#     que fica a ±GX do meio e RENTE às pernas: o centro do halter vem da frente até a anilha (ou a mão em volta do pegador, um
#     cilindro de R_MAO) ficar a FOLGA da pele das pernas e do quadril, medida na malha posada do quadro (a conta exata de cada
#     cilindro × cada ponto da pele); a altura sai do comprimento do braço. Depois um passo de refino mede a folga de verdade (o
#     halter no giro real da mão e a pele da mão) e anda o alvo em y até ela dar FOLGA. A palma fica virada pras pernas (pegada
#     pronada), o halter no vão da mão, na linha dos nós dos dedos, e o polegar novo dá a volta no pegador.
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

LADOS = (("Left", 1), ("Right", -1))

# ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_PE = 0.14                # tornozelos a ±14 cm do meio: base de 28 cm, cada pé embaixo do seu quadril (largura do quadril)

# ── movimento ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TRONCO = (2.0, 74.0)       # tronco à frente da vertical (graus): em pé → embaixo. Com 74° o centro dos halteres fica ~7 cm abaixo do centro
                           # do joelho (logo abaixo dos joelhos) e o quadril dobra ~85° a partir de em pé; com 78° (1ª sonda) ia a ~89°
                           # com o halter a 11 cm, e com 68° o halter ficava na altura do joelho (varredura de 11/10/2026)
JOELHO = (12.0, 12.0)      # flexão dos joelhos (graus): em pé → embaixo, o mesmo ângulo (joelhos parados); o boneco em pé já mede ~7°:
                           # quase estendido ("near full extension", Lee 2018). Com o quadril ~19 cm pra trás, a perna inteira inclina
                           # ~10° pra trás embaixo (o tornozelo vai ~13° pra flexão plantar, dentro dos 50° normais)
PESCOCO = 0.10             # quanto a cabeça volta (fração da inclinação do tronco): na linha da coluna, olhando o chão
RETRAI = 6.0               # escápulas pra trás (graus em volta do eixo do tronco), postas uma vez
RUMO_CALCANHAR = 0.02      # m: o centro de massa sai do meio do pé (em pé) e termina 2 cm atrás dele (embaixo)
M_HALTER = 10.0            # kg de cada halter (só entra no centro de massa)
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo

# ── halteres e mãos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
GX = 0.16                  # centro de cada halter (meio da mão) a ±GX do meio do corpo (m)
FOLGA = 0.010              # anilha (ou mão) → pele das pernas (m): rente, sem encostar (a checagem mede 7,7–10,6 mm)
R_MAO = 0.036              # a mão fechada em volta do pegador, como um cilindro (m) — conta só pra folga das pernas
MEIA_MAO = 0.045           # meia largura da mão ao longo do pegador (m)
COTOVELO = 8.0             # flexão do cotovelo (graus): braço esticado, sem travar
POLO = Vector((0.25, 0.50, 0.0))   # polo do cotovelo a partir do ombro (mundo; x pra fora): o cotovelo aponta pra trás e pra fora
RAIO = 0.0145              # pegador do halter: 29 mm, o cilindro da mão de referência (sem usar_cilindro)
PEGADA_H = 0.13            # pegador entre as anilhas (m)
RAIO_ANILHA = 0.055
LARG_ANILHA = 0.05         # as do e3.halter() das outras cenas com 2 halteres
PALMA_Q = Vector((0.0, 1.0, 0.0))    # palma virada pras pernas (pegada pronada)
PELE_RENTE = ("Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")


def _pele(bon, niveis=1):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def sdf_halter(P, M):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até o halter (pegador + 2 anilhas: 3 cilindros) com a matriz de mundo
    M da raiz (eixo local X); devolve (pegador, anilhas) — a conta do Tríceps Testa com Halteres."""
    M = np.array(M)
    c0, w = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c0
    a = d @ w
    rho = np.linalg.norm(d - np.outer(a, w), axis=1)

    def cil(a0, meia, R):
        qx, qy = rho - R, np.abs(a - a0) - meia
        return np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))

    ma = PEGADA_H / 2 + LARG_ANILHA / 2
    eixo = cil(0.0, (PEGADA_H + 2 * LARG_ANILHA + 0.02) / 2, RAIO)
    anilhas = np.minimum(cil(-ma, LARG_ANILHA / 2, RAIO_ANILHA), cil(ma, LARG_ANILHA / 2, RAIO_ANILHA))
    return eixo, anilhas


def y_rente(P, gx, z, folga):
    """Maior y do centro do halter (eixo X, em (gx, y, z)) com todos os pontos P a pelo menos `folga` das 2 anilhas e da mão em
    volta do pegador (cilindro R_MAO): o halter vem da frente (−y) até ficar rente. Conta exata por cilindro: um ponto a `da` m além
    da ponta do cilindro (ao longo do eixo) fica a `folga` dele com o raio R + √(folga² − da²)."""
    a = P[:, 0] - gx
    dz = P[:, 2] - z
    ma = PEGADA_H / 2 + LARG_ANILHA / 2
    melhor = math.inf
    for a0, meia, R in ((-ma, LARG_ANILHA / 2, RAIO_ANILHA), (ma, LARG_ANILHA / 2, RAIO_ANILHA), (0.0, MEIA_MAO, R_MAO)):
        da = np.maximum(np.abs(a - a0) - meia, 0.0)
        Re = R + np.sqrt(np.maximum(folga * folga - da * da, 0.0))
        ok = (da < folga) & (np.abs(dz) < Re)
        if ok.any():
            melhor = min(melhor, float((P[ok, 1] - np.sqrt(Re[ok] ** 2 - dz[ok] ** 2)).min()))
    return melhor


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no halter (padrão dos exercícios novos); halter de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2              # meio das articulações do quadril no repouso
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")                                         # tornozelo no repouso (altura e y)
    print("STIFF repouso: coxa %.3f canela %.3f | quadril (meio) %s, meia %.3f | tornozelo %s | ombros x %.3f/%.3f" % (
        lt, ls, tuple(round(x, 3) for x in meio0), meia_quadril, tuple(round(x, 3) for x in tz0), c("LeftArm").x,
        c("RightArm").x), flush=True)

    # ── pés: tornozelos parados a ±X_PE do meio, sola chapada (orientação do repouso), joelhos pro polo na frente ─────────────────
    pernas = {}
    for lado, s in LADOS:
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * X_PE, tz0.y, tz0.z)))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    p3.atualizar()

    # meio do pé: no meio entre o calcanhar (pele mais atrás) e a base dos dedos (cabeça do ToeBase) — o alvo do centro de massa
    co, _, nomes, dono = _pele(bon)
    y_meio = []
    pes = {}
    for lado, s in LADOS:
        P = co[_mascara(nomes, dono, lambda nm, L=lado: nm in (L + "Foot", L + "ToeBase"))]
        A = c(lado + "Foot")
        calc, ponta, base = float(P[:, 1].max()), float(P[:, 1].min()), c(lado + "ToeBase").y
        pes[lado] = dict(A=A.copy(), calc=calc, ponta=ponta, base=base)
        y_meio.append((calc + base) / 2)
    Y_ALVO = sum(y_meio) / 2
    print("STIFF pé: calcanhar y %.3f, base dos dedos y %.3f, ponta y %.3f | meio do pé y %.4f (tornozelo y %.4f)" % (
        pes["Left"]["calc"], pes["Left"]["base"], pes["Left"]["ponta"], Y_ALVO, tz0.y), flush=True)

    def z_quadril(y, flexao):
        """Altura do meio das articulações do quadril com o meio delas em y e os joelhos dobrados `flexao` graus (a distância quadril →
        tornozelo sai da flexão, lei dos cossenos)."""
        d = math.sqrt(lt * lt + ls * ls + 2 * lt * ls * math.cos(math.radians(flexao)))
        dx, dy = meia_quadril - X_PE, y - tz0.y
        return tz0.z + math.sqrt(max(d * d - dx * dx - dy * dy, 1e-4))

    estado = {}

    def corpo(t, y, z, inc):
        """Pelve e tronco (giram juntos: coluna neutra) com o meio das articulações do quadril em (0, y, z) e a cabeça na linha do
        tronco; os joelhos, por IK, pro lado do polo."""
        for nome in ("Hips", "Neck", "Head"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inc), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        if PESCOCO:
            p3.girar_osso(rig, "Neck", p3.rot_x(-inc * PESCOCO))
        estado.update(t=t, inc=inc, y=y, z=z)

    # ── em pé (1º palpite: quadril no y do repouso) e as escápulas pra trás (uma vez: vão junto com o tronco) ─────────────────────
    y_cima = meio0.y
    corpo(0.0, y_cima, z_quadril(y_cima, JOELHO[0]), TRONCO[0])
    if RETRAI:
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima))

    maos = Maos(bon, RAIO, polegar_modo="volta")
    halteres = {L: e3.halter("halter_" + L, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA, larg_anilha=LARG_ANILHA)
                for L, _ in LADOS}
    for h in halteres.values():
        h.rotation_mode = "QUATERNION"
    alcance = {}

    def pele_rente():
        co_, _, nomes_, dono_ = _pele(bon, 1)
        return co_[_mascara(nomes_, dono_, lambda nm: nm in PELE_RENTE)]

    def alvo_halter(L, s, P):
        """Centro do halter do lado L: a ±GX, rente à pele P (pernas e quadril), na altura que o braço alcança."""
        S = c(L + "Arm")
        gx = s * GX
        R = alcance[L]
        z = S.z - R
        y = S.y
        for _ in range(5):
            y = y_rente(P, gx, z, FOLGA)
            h2 = R * R - (y - S.y) ** 2 - (gx - S.x) ** 2
            z = S.z - math.sqrt(max(h2, 1e-4))
        return Vector((gx, y, z)), S

    def pegar(L, s, g, S):
        """Mão L com o vão em g, os dedos na linha ombro → mão (braço pendurado), a palma pras pernas (o IK parte do braço de
        repouso: a checagem e a captura saem iguais)."""
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + L + n].matrix_basis = Matrix()
        p3.atualizar()
        dedos = (g - S).normalized()
        maos.segurar(L, g, dedos, PALMA_Q, polo=S + Vector((s * POLO.x, POLO.y, POLO.z)), alinhar=1.0)

    def cotovelo(L):
        return ck.medir_juntas(rig)["cotovelo" + ("E" if L == "Left" else "D")]

    def calibrar(rotulo):
        """Alcance ombro → vão da mão com o cotovelo a COTOVELO graus: bisseção com o braço pendurado em pé (um pouco à frente). Roda
        2 vezes: antes e depois de acertar o polo do cotovelo (antes dele o IK pode dobrar o cotovelo pro lado errado)."""
        for L, s in LADOS:
            S = c(L + "Arm")
            d = Vector((s * GX - S.x, -0.15, -0.60)).normalized()
            lo, hi = 0.45, 0.72
            for _ in range(22):
                m = (lo + hi) / 2
                pegar(L, s, S + d * m, S)
                if cotovelo(L) > COTOVELO:
                    lo = m                  # cotovelo dobrado demais: o vão está perto do ombro, afasta
                else:
                    hi = m
            alcance[L] = (lo + hi) / 2
            pegar(L, s, S + d * alcance[L], S)
            print("STIFF alcance (%s) ombro → vão da mão %s %.4f m (cotovelo %.1f°, vão a %.1f mm do alvo)" % (
                rotulo, L, alcance[L], cotovelo(L), maos.erro[L] * 1000), flush=True)

    calibrar("1ª")

    def por_halter(L):
        """O halter no vão da mão de referência, na linha dos nós dos dedos (a mão já posta com segurar)."""
        g, _ = pg.ponto_na_mao(bon, L, RAIO)
        eixo = pg._base(rig, L)[1]
        h = halteres[L]
        h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
        h.location = g
        p3.atualizar()
        return g, eixo

    def dist_pontos(A, B):
        """Menor distância (m) entre os pontos A e os pontos B (só os de B perto da caixa de A; 6 cm se nenhum)."""
        lo, hi = A.min(axis=0) - 0.06, A.max(axis=0) + 0.06
        B = B[((B >= lo) & (B <= hi)).all(axis=1)]
        if not len(B):
            return 0.06
        d2 = (A * A).sum(axis=1)[:, None] + (B * B).sum(axis=1)[None, :] - 2.0 * (A @ B.T)
        return math.sqrt(max(float(d2.min()), 0.0))

    def folga_real(L, P, co_, nomes_, dono_):
        """Folga de verdade (m) do lado L: o halter (anilhas e pegador, na posição e no giro reais) e a pele da mão (dedos na mão de
        referência) até a pele P das pernas e do quadril — o que for menor, e qual."""
        e_, a_ = sdf_halter(P, halteres[L].matrix_world)
        d_h = float(np.minimum(e_, a_).min())
        mao = co_[_mascara(nomes_, dono_, lambda nm: nm.startswith(L + "Hand"))][::2]
        d_m = dist_pontos(mao, P)
        return (d_h, "halter") if d_h <= d_m else (d_m, "mão")

    def bracos(t, dedos=True):
        """Braços pendurados, halteres rentes às pernas. dedos=False (só pro centro de massa): o halter fica no alvo (o vão da mão fica
        a < 2 mm dele). dedos=True: o halter no vão da mão, a folga refinada pela medida de verdade (1 passo) e as mãos fechadas
        (polegar novo) no halter."""
        P = pele_rente()
        alvos = {L: alvo_halter(L, s, P) for L, s in LADOS}
        for L, s in LADOS:
            pegar(L, s, *alvos[L])
        if not dedos:
            for L, _ in LADOS:
                halteres[L].location = alvos[L][0]
            p3.atualizar()
            return
        gs = {L: por_halter(L) for L, _ in LADOS}
        # o alvo saiu do halter deitado no X e da mão como um cilindro: a folga de verdade (o halter no giro da mão, a pele da mão) volta
        # pra FOLGA andando o alvo em y (o braço continua com o mesmo alcance)
        co_, _, nomes_, dono_ = _pele(bon, 1)
        for L, s in LADOS:
            d, quem = folga_real(L, P, co_, nomes_, dono_)
            if abs(d - FOLGA) > 0.0005:
                g, S = alvos[L]
                R = alcance[L]
                y = g.y + (d - FOLGA)
                z = S.z - math.sqrt(max(R * R - (y - S.y) ** 2 - (g.x - S.x) ** 2, 1e-4))
                alvos[L] = (Vector((g.x, y, z)), S)
                pegar(L, s, *alvos[L])
                gs[L] = por_halter(L)
            estado.setdefault("refino", {})[L] = (d * 1000, quem)
        for L, s in LADOS:
            g, eixo = gs[L]
            antes = pose.dedos.get(L, {}).get("Thumb") if t > 0 else None
            pose.dedos[L] = pg.fechar_em_volta(bon, L, g, eixo, RAIO, polegar_antes=antes)
        estado["alvos"] = {L: alvos[L][0].copy() for L, _ in LADOS}

    def centro_de_massa():
        """Centro de massa do corpo (volume da malha posada, densidade uniforme) + os 2 halteres; devolve (sistema, corpo, massa)."""
        co_, tri_, _ = ck._avaliar(bon.corpo, 0)
        v0, v1, v2 = co_[tri_[:, 0]], co_[tri_[:, 1]], co_[tri_[:, 2]]
        vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)) / 6.0
        V = float(vol.sum())
        cc = Vector(((v0 + v1 + v2) / 4.0 * vol[:, None]).sum(axis=0) / V)
        m = V * DENSIDADE
        ch = halteres["Left"].matrix_world.to_translation() + halteres["Right"].matrix_world.to_translation()
        return (cc * m + ch * M_HALTER) / (m + 2 * M_HALTER), cc, m

    def alvo_cm(t):
        return Y_ALVO + RUMO_CALCANHAR * t

    def y_equilibrio(t, flexao, inc, y0):
        """y do meio das articulações do quadril que deixa o centro de massa (corpo + halteres) em cima do alvo_cm(t) (secante), com a
        altura do quadril tirada da flexão dos joelhos e os braços pendurados com os halteres rentes às pernas."""
        def erro(y):
            corpo(t, y, z_quadril(y, flexao), inc)
            bracos(t, dedos=False)
            return centro_de_massa()[0].y - alvo_cm(t)
        ya, ea = y0, erro(y0)
        yb = y0 + 0.01
        eb = erro(yb)
        for _ in range(12):
            if abs(eb) < 2e-5 or abs(eb - ea) < 1e-9:
                break
            yn = yb - eb * (yb - ya) / (eb - ea)
            ya, ea = yb, eb
            yb, eb = yn, erro(yn)
        estado["erro_cm"] = eb
        return yb

    pose_dedos = {}

    def pose(t):
        """t=0 em pé, t=1 tronco inclinado. O tronco inclina e os joelhos dobram em linha reta no tempo (o t já vem suave do
        exportador); o y do quadril sai do equilíbrio e a altura, da flexão dos joelhos."""
        inc = TRONCO[0] + (TRONCO[1] - TRONCO[0]) * t
        fl = JOELHO[0] + (JOELHO[1] - JOELHO[0]) * t
        y0 = estado.get("y_eq", y_cima) if t > 0 else estado.get("y_cima", y_cima)
        y = y_equilibrio(t, fl, inc, y0)
        corpo(t, y, z_quadril(y, fl), inc)
        bracos(t, dedos=True)
        estado.update(y_eq=y, t=t)

    pose.dedos = pose_dedos
    pose.estado = estado

    # ── polos: joelhos e cotovelos acertados embaixo (o joelho/cotovelo no plano do polo, do lado dele) ─────────────────────────────
    y_baixo = y_equilibrio(1.0, JOELHO[1], TRONCO[1], y_cima + 0.15)
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho %s erro %.3f ang %d" % (lado, *e), flush=True)
    corpo(1.0, y_baixo, z_quadril(y_baixo, JOELHO[1]), TRONCO[1])
    bracos(1.0, dedos=False)
    for lado, _ in LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        maos.iks[lado].mute = True
        print("polo cotovelo %s erro %.3f ang %d" % (lado, *e), flush=True)
    corpo(0.0, y_cima, z_quadril(y_cima, JOELHO[0]), TRONCO[0])
    calibrar("2ª")                      # o alcance de novo, com o polo do cotovelo certo
    y_baixo = y_equilibrio(1.0, JOELHO[1], TRONCO[1], y_baixo)
    y_cima = y_equilibrio(0.0, JOELHO[0], TRONCO[0], y_cima)
    estado["y_cima"] = y_cima
    print("STIFF quadril (meio): em pé y %+.4f z %.4f (repouso y %+.4f z %.4f) → embaixo y %+.4f z %.4f | recua %.3f m" % (
        y_cima, z_quadril(y_cima, JOELHO[0]), meio0.y, meio0.z, y_baixo, z_quadril(y_baixo, JOELHO[1]), y_baixo - y_cima), flush=True)

    # ── medidas à parte (a checagem não vê): equilíbrio, canela, halteres × pernas/corpo/chão, halter × halter, mão × anilhas, mão ×
    #    pernas, altura dos halteres na canela, polegar ──────────────────────────────────────────────────────────────────────────────
    def halter_x_halter():
        """Menor distância (mm) entre as superfícies dos 2 halteres (vértices de um × superfície do outro)."""
        def malha(lado):
            cos, tris, n = [], [], 0
            for o in ck._malhas(halteres[lado]):
                eco, etri = ck._avaliar_simples(o)
                cos.append(eco)
                tris.append(etri + n)
                n += len(eco)
            return np.concatenate(cos), np.concatenate(tris)
        coE, _ = malha("Left")
        coD, triD = malha("Right")
        bvh = BVHTree.FromPolygons([tuple(p) for p in coD], [tuple(t) for t in triD], all_triangles=True)
        return min(bvh.find_nearest(Vector(p))[3] for p in coE) * 1000

    def info():
        inc = estado.get("inc", 0.0)
        cm, cc, m = centro_de_massa()
        j = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        y_, z_ = estado.get("y", 0.0), estado.get("z", 0.0)
        txt = ["tronco %.1f° | quadril y %+.4f z %.4f (recuou %.0f mm) | centro de massa (corpo %.0f kg + halteres %.0f kg) %+.1f mm do "
               "meio do pé (alvo %+.1f; + = atrás; calcanhar %+.0f, base dos dedos %+.0f, ponta %+.0f)" % (
                   inc, y_, z_, (y_ - estado.get("y_cima", y_)) * 1000, m, 2 * M_HALTER, (cm.y - Y_ALVO) * 1000,
                   (alvo_cm(estado.get("t", 0)) - Y_ALVO) * 1000, (pes["Left"]["calc"] - Y_ALVO) * 1000,
                   (pes["Left"]["base"] - Y_ALVO) * 1000, (pes["Left"]["ponta"] - Y_ALVO) * 1000)]
        can = []
        for lado, s in LADOS:
            K, A, H = j[lado + "Leg"], j[lado + "Foot"], j[lado + "UpLeg"]
            can.append("%s canela %+.1f° (joelho %+.0f mm à frente do tornozelo), quadril %+.0f mm atrás do tornozelo" % (
                lado[0], math.degrees(math.atan2(A[1] - K[1], K[2] - A[2])), (A[1] - K[1]) * 1000, (H[1] - A[1]) * 1000))
        txt.append(" | ".join(can))
        co_, _, nomes_, dono_ = _pele(bon, 1)
        for lado, s in LADOS:
            P = co_[_mascara(nomes_, dono_, lambda nm, L=lado: nm in (L + "Foot", L + "ToeBase"))]
            tras = P[P[:, 1] > np.median(P[:, 1])]
            txt.append("pé %s: planta %+.1f mm, calcanhar %+.1f mm" % (lado[0], P[:, 2].min() * 1000, tras[:, 2].min() * 1000))
        fora_mao = np.where(_mascara(nomes_, dono_, lambda nm: not nm.startswith(("LeftHand", "RightHand"))))[0]
        pernas_i = np.where(_mascara(nomes_, dono_, lambda nm: nm in ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")))[0]
        hs = []
        for L, s in LADOS:
            M = halteres[L].matrix_world
            hc = M.to_translation()
            pts = np.concatenate([ck._amostras(*ck._avaliar_simples(o), 0.01) for o in ck._malhas(halteres[L])])
            mao = _mascara(nomes_, dono_, lambda nm, L=L: nm.startswith(L + "Hand"))
            _, an_mao = sdf_halter(co_[mao], M)
            e_c, a_c = sdf_halter(co_[fora_mao], M)
            dd = np.minimum(e_c, a_c)
            i = int(np.argmin(dd))
            e_p, a_p = sdf_halter(co_[pernas_i], M)
            dp = np.minimum(e_p, a_p)
            ip = int(np.argmin(dp))
            # mão × pernas: pele da mão até a pele das pernas (ponto a ponto, amostrado)
            mv = co_[mao][::3]
            pv = co_[pernas_i][::2]
            mp = float(np.sqrt(((mv[:, None, :] - pv[None, :, :]) ** 2).sum(axis=2)).min()) if len(mv) and len(pv) else 9.9
            # antebraço × tronco/pernas (a checagem não olha esse par)
            av = co_[_mascara(nomes_, dono_, lambda nm, L=L: nm == L + "ForeArm")][::3]
            tv = co_[_mascara(nomes_, dono_, lambda nm: nm in ("Hips", "Spine", "LeftUpLeg", "RightUpLeg"))][::3]
            ap = float(np.sqrt(((av[:, None, :] - tv[None, :, :]) ** 2).sum(axis=2)).min()) if len(av) and len(tv) else 9.9
            K, A = j[L + "Leg"], j[L + "Foot"]
            frac = (K[2] - hc.z) / max(K[2] - A[2], 1e-6)
            S = j[L + "Arm"]
            hs.append("halter %s: centro (x %+.3f y %+.3f z %.3f) a %.2f da canela (0 = joelho, 1 = tornozelo), ombro %+.0f mm à frente dele | "
                      "× pernas %+.1f mm (%s) | × corpo (fora as mãos) %+.1f mm (%s) | × chão %.0f mm | mão × anilhas %+.1f mm | mão × "
                      "pernas %.0f mm | antebraço × tronco/coxas %.0f mm" % (
                          L[0], hc.x, hc.y, hc.z, frac, (hc.y - S[1]) * 1000, float(dp[ip]) * 1000, nomes_[dono_[pernas_i[ip]]],
                          float(dd[i]) * 1000, nomes_[dono_[fora_mao[i]]], pts[:, 2].min() * 1000, float(an_mao.min()) * 1000, mp * 1000,
                          ap * 1000))
        txt.append(" | ".join(hs))
        pol = {L: pose.dedos.get(L, {}).get("Thumb") for L, _ in LADOS}
        volta = {L: isinstance(p, tuple) and len(p) > 10 and p[0] == "volta" and p[10] for L, p in pol.items()}
        vao = {L: (p[8] if volta[L] else float("nan")) for L, p in pol.items()}
        ref = estado.get("refino", {})
        eixos_h = {L: halteres[L].matrix_world.to_3x3() @ Vector((1, 0, 0)) for L, _ in LADOS}
        txt.append("refino (folga antes do passo): E %.1f mm (%s) D %.1f mm (%s) | eixo do halter E (%+.2f %+.2f %+.2f) D (%+.2f %+.2f %+.2f)" % (
            *ref.get("Left", (float("nan"), "-")), *ref.get("Right", (float("nan"), "-")), *eixos_h["Left"], *eixos_h["Right"]))
        txt.append("halter × halter %.0f mm | polegar em volta E %s D %s, × falange média E %.1f D %.1f mm | palma dentro %s | braço à "
                   "frente %s | cabeça × tronco %.0f° | joelho %.0f/%.0f° | quadril %.0f/%.0f° | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | "
                   "tornozelo %s | %s" % (
                       halter_x_halter(), "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO", vao["Left"],
                       vao["Right"], "/".join("%.0f" % v for v in tc.palma_dentro(j)),
                       "/".join("%.0f" % v for v in tc.braco_frente(j)), tc.cabeca_tronco(j)[0], juntas["joelhoE"],
                       juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"], juntas["cotoveloE"], juntas["cotoveloD"],
                       juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.tornozelo(j)), maos.info()))
        return " | ".join(txt)

    for t in (0.0, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(halteres[L], raio=RAIO, meio_compr=PEGADA_H / 2)) for L, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.0, 0.75),
                camera_video=((3.8, -2.4, 1.1), (0, 0.0, 0.70), 50), info=info)
