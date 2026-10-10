# Agachamento Sumô com Barra — cena da fábrica 3D (lote 8, 09/10/2026; 0 usos nos treinos prontos do app, 22 vezes como troca
# equivalente). t = 0 em pé · t = 1 embaixo (coxas paralelas ao chão). O app faz a volta (subida).
# É o agachamento de costas com a base larga (wide stance barbell squat): a barra apoiada em cima do trapézio, como no Agachamento
# Livre com Barra, com a base do Agachamento Sumô com Halteres (pés bem afastados, pontas ~45° pra fora, joelho em cima do pé).
# Técnica (as frases das fontes estão na ficha):
#   NSCA, Basics of Strength and Conditioning Manual (2012), 1a. Barbell Back Squat: a barra "on top of the trapezius muscles near the
#     base of the neck" (high bar), pegada "closed, pronated"; a base larga "works adductor, gluteus, and outer quadriceps"; calcanhares
#     no chão; tronco "between 35 and 45° from vertical" ("Less than 35°, you are too upright"); "Keep knees behind the balls of the
#     feet"; canela o mais em pé possível; desce até "mid-thigh is parallel to the floor"; cabeça e olhos à frente; o peso do corpo
#     entre a base dos dedos e o calcanhar.
#   ACE, Back Squat: a barra "behind the neck across the top of the back", as mãos "wider than shoulder-width apart", peito alto e costas
#     retas; ACE (Antoian 2016), Dumbbell Sumo Squat: as pontas dos pés "about 45 degrees" pra fora (a base do sumô do app).
#   ExRx, Barbell Squat: "knees pointed same direction as feet", "equal distribution of weight throughout forefoot and heel"; ExRx,
#     Squat Variations: com a base de sumô o quadril não vai tão pra trás com o tronco à frente.
#   Escamilla et al. 2001 (Med Sci Sports Exerc 33:984): base larga = 169 ± 12% da largura dos ombros, canela 5–9° mais em pé, pés 6°
#     mais virados e o tronco sem diferença entre as bases. Paoli 2009, McCaw & Melrose 1999 e Coratella 2021: os músculos.
# Montagem:
#   - pés: tornozelos parados no chão a ±X_TORNOZELO, cada pé girado PONTA graus pra fora em volta da vertical (sola chapada); cada
#     joelho entra, suave, no plano vertical do próprio pé até T_ALINHA e fica nele até embaixo (joelho_no_plano_do_pe, a conta do
#     sumô com halteres); em pé, com a perna quase esticada, ele não alcança esse plano e fica o mais pra fora que dá.
#   - tronco: a pelve e o tronco giram juntos (coluna neutra) TRONCO graus da vertical, em pé → embaixo; a cabeça volta PESCOCO da
#     inclinação (olhar à frente).
#   - equilíbrio: a altura do quadril sai do joelho (em pé) e da coxa paralela (embaixo); em cada quadro o quadril vai pra frente ou
#     pra trás até o centro de massa do corpo (volume da malha posada, densidade uniforme) + barra (M_BARRA) ficar em cima do meio do
#     pé (no meio entre o calcanhar e a base dos dedos): o peso "throughout forefoot and heel" do ExRx. Em pé isso inclina o corpo
#     inteiro ~2° à frente nos tornozelos (a barra fica em cima do pé, não atrás do calcanhar).
#   - barra: rígida com o tronco (BARRA_NO_TRAPEZIO a partir da base do pescoço, a mesma do Agachamento Livre): não escorrega entre os
#     quadros. Os braços e as mãos (maos3d.Maos + pegada3d com o polegar novo dando a volta = pegada fechada) são postos UMA vez no
#     montar() e vão junto com o tronco: a pegada é a mesma em todos os quadros.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena
from agachamento_sumo_com_halteres import joelho_no_plano_do_pe
from agachamento_no_smith import POLEGAR_VOLTA, _polegar_nos_angulos

LADOS = (("Left", 1), ("Right", -1))

# ── barra ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (o da e3.barra)
R_ANILHA = 0.225           # anilha de 45 cm: a do Levantamento Terra (lote 7), o diâmetro da anilha grande de competição
L_ANILHA = 0.05            # largura da anilha da e3.barra (o padrão dela)
MEIA_TRAVAS = 0.66         # metade da distância entre as travas da e3.barra (pegada=1.32, como em todas as cenas com barra)
M_BARRA = 60.0             # kg: barra de 20 kg + uma anilha de 20 kg (45 cm) de cada lado, como no desenho
BARRA_NO_TRAPEZIO = Vector((0.0, 0.075, -0.041))   # centro da barra a partir da base do pescoço (cabeça do osso Neck), no
                                                   # referencial do tronco: a do Agachamento Livre com Barra (0,075/−0,039), 2 mm
                                                   # mais baixa — lá a pele do trapézio ficava a 2,9 mm da barra; aqui encosta
GRIP_X = 0.43              # meio da mão a 43 cm do meio da barra: 86 cm entre as mãos, ~2,1× a distância entre os ombros (0,40 m)
DEDOS_Q = Vector((0.0, 0.12, 1.0)).normalized()    # (tronco) dedos pra cima, um pouco pra trás: a mão atrás da barra
PALMA_Q = Vector((0.0, -1.0, 0.12)).normalized()   # (tronco) palma pra frente, de frente pra barra
ALINHA = 0.15              # quanto os dedos seguem o antebraço (maos3d.Maos.segurar, alinhar): a mão do Agachamento no Smith, onde
                           # a postura fixa do polegar novo (POLEGAR_VOLTA) foi achada e medida
POLO_COTOVELO = Vector((0.30, 0.35, -0.40))         # (tronco, a partir do ombro; x pra fora) cotovelos pra baixo, pra trás e pra fora

# ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.37         # tornozelo a 37 cm do meio: base de 0,74 m (a do sumô com halteres; 1,85 × os 0,40 m entre os ombros —
                           # Escamilla 2001: base larga de 169 ± 12% da largura dos ombros; Coratella 2021: o dobro da base normal)
PONTA = 45.0               # ponta de cada pé virada pra fora (graus; ACE: "about 45 degrees"; Lorenzetti 2018: com a base larga e o
                           # pé a 0° ou 21° o joelho entrou, a 42° não)
T_ALINHA = 0.35            # até esse t o joelho entra, suave, no plano do pé (em pé ele não alcança: a perna está quase esticada)

# ── movimento ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
JOELHO_CIMA = 6.0          # flexão do joelho em pé (graus): pernas esticadas sem travar
COXA_BAIXO = 1.5           # coxa embaixo, graus abaixo da horizontal: coxas paralelas ao chão
TRONCO = (2.0, 36.0)       # tronco à frente da vertical, em pé → embaixo (graus): NSCA "between 35 and 45° from vertical" — com a
                           # base de sumô, perto do mais em pé da faixa (ExRx: o quadril não vai tão pra trás); com 36° e o centro
                           # de massa no meio do pé, o joelho fica atrás da base dos dedos (NSCA: "Keep knees behind the balls of the
                           # feet")
P_TRONCO = 1.6             # o tronco inclina mais no começo da descida: 1 − (1 − t)^P (NSCA: "Push hips back" e "Simultaneously flex knees
                           # while pushing hips back" no começo, depois "Maintain torso angle throughout lift"); com o tronco em linha
                           # reta no tempo o joelho ia 15 mm à frente e voltava no fim da descida
PESCOCO = 0.75             # quanto a cabeça volta (fração da inclinação do tronco): olhar à frente (NSCA: "Head and eyes are
                           # positioned forward"), como no Agachamento Livre com Barra
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo (~74 kg) pro centro de massa
RETRAI = 8.0               # escápulas pra trás (graus em volta do eixo do tronco, osso Shoulder; ACE: "Lift the chest up and squeeze
                           # the shoulder blades together"), postas uma vez antes dos braços: vão junto com o tronco


def _cil(a, rho, a0, meia, R):
    """Distância com sinal (m) até um cilindro de raio R e meia largura `meia` centrado em a0 no eixo (a, rho: coordenadas axial
    e radial dos pontos)."""
    qx, qy = rho - R, np.abs(a - a0) - meia
    return np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))


def sdf_barra(P, M):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até o eixo da barra e até as pontas (travas, anilhas e miolos), pela
    matriz de mundo M da raiz (eixo da barra = X local), com as medidas da e3.barra. Devolve (eixo, pontas)."""
    M = np.asarray(M, float)
    c, u = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c
    a = d @ u
    rho = np.linalg.norm(d - np.outer(a, u), axis=1)
    eixo = _cil(a, rho, 0.0, 1.0, RAIO_BARRA)
    pontas = np.full(len(a), 1e9)
    xa = MEIA_TRAVAS + 0.03 + L_ANILHA / 2
    for s in (-1, 1):
        pontas = np.minimum(pontas, _cil(a, rho, s * xa, L_ANILHA / 2, R_ANILHA))               # anilha
        pontas = np.minimum(pontas, _cil(a, rho, s * xa, (L_ANILHA + 0.012) / 2, 0.03))        # miolo
        pontas = np.minimum(pontas, _cil(a, rho, s * (MEIA_TRAVAS + 0.012), 0.015, 0.026))    # trava
    return eixo, pontas


def _pele(bon, niveis=0):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def polegar_nos_dedos(bon, lado):
    """Quanto a pele do polegar da mão `lado` entra nos outros dedos e na palma (m, 0 = nada entra) — a medida "entra" do
    pg.polegar_em_volta: os vértices do polegar sem peso da mão, da base do indicador nem do antebraço, contra os triângulos dos
    dedos e da palma que o polegar não puxa."""
    from mathutils.bvhtree import BVHTree
    pesos = pg._pele(bon)["pesos"]
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    pos = {nm: i for i, nm in enumerate(nomes)}
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    idx = np.array(sorted(i for i, gs in pesos.items() if any(o in gs for o in ossos)))
    tem = np.zeros(len(co), bool)
    tem[idx] = True
    ok = {pos[lado + "Hand"]} | {pos["%sHand%s%d" % (lado, d, i)] for d in p3.DEDOS for i in (1, 2, 3)}
    t_ok = tri[np.isin(dono[tri], list(ok)).all(axis=1) & ~tem[tri].any(axis=1)]
    bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in t_ok], all_triangles=True)
    d_pol = [pos[o] for o in ossos]
    teste = [int(i) for i in idx if dono[i] in d_pol and not any(
        nm in pesos[int(i)] for nm in (lado + "Hand", lado + "HandIndex1", lado + "ForeArm"))]
    fundo = 0.0
    for v in co[teste]:
        vv = Vector(v)
        loc, nor, _, dist = bvh.find_nearest(vv)
        if loc is not None and dist < 0.03 and (vv - loc).dot(nor) < 0:
            fundo = max(fundo, dist)
    return fundo


def montar(bon):
    pg.usar_polegar("volta")
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2              # meio das articulações do quadril no repouso
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")                                         # tornozelo no repouso (altura e y)

    # ── pés: tornozelos no lugar, sola chapada e ponta virada PONTA graus pra fora (em volta da vertical) ─────────────────────
    pes, pernas, polos, tornozelos = {}, {}, {}, {}
    for lado, s in LADOS:
        th = math.radians(PONTA)
        f = Vector((s * math.sin(th), -math.cos(th), 0.0))
        n = Vector((s * math.cos(th), math.sin(th), 0.0))
        A = Vector((s * X_TORNOZELO, tz0.y, tz0.z))
        pes[lado] = dict(A=A, f=f, n=n)
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))   # nasce no tornozelo (alvo ≠ polo)
        polos[lado] = p3.vazio("polo_joelho_" + lado, (s * 0.6, -1.0, 0.5))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos[lado])
        b = rig.data.bones[p3.P + lado + "Foot"]
        rot = p3.vazio("rot_" + lado + "Foot")
        rot.matrix_world = Matrix.Rotation(s * th, 4, "Z") @ (rig.matrix_world @ b.matrix_local)
        cn = PB[p3.P + lado + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = rot
        tornozelos[lado].location = A
    p3.atualizar()

    # meio do pé: no meio entre o calcanhar (pele mais atrás, ao longo do pé) e a base dos dedos (cabeça do ToeBase) — o alvo do
    # centro de massa (ExRx: "equal distribution of weight throughout forefoot and heel")
    co, _, nomes, dono = _pele(bon)
    y_alvo = []
    for lado, s in LADOS:
        A, f = pes[lado]["A"], pes[lado]["f"]
        P = co[_mascara(nomes, dono, lambda nm, L=lado: nm in (L + "Foot", L + "ToeBase"))]
        ao_longo = (P[:, :2] - np.array(A[:2])) @ np.array(f[:2])
        calc, base = float(ao_longo.min()), (c(lado + "ToeBase") - A).dot(f)
        pes[lado].update(calc=calc, base=base, ponta=float(ao_longo.max()))
        y_alvo.append((A + f * ((calc + base) / 2)).y)
    Y_ALVO = sum(y_alvo) / 2
    print("SUMO BARRA pé ao longo do tornozelo: calcanhar %.3f, base dos dedos %.3f, ponta %.3f m | meio do pé y %.4f "
          "(tornozelo y %.4f)" % (pes["Left"]["calc"], pes["Left"]["base"], pes["Left"]["ponta"], Y_ALVO, tz0.y), flush=True)

    def quadris(y, z):
        """Articulações do quadril (E, D) com o meio delas em (0, y, z): a pelve gira em volta da reta que passa por elas."""
        meio = Vector((0.0, y, z))
        return {lado: meio + Vector((s * meia_quadril, 0.0, 0.0)) for lado, s in LADOS}

    alinha = {"topo": None}

    def joelhos(y, z, t):
        """Joelhos com o quadril em (y, z) no instante t: em pé, o mais pra fora que dá; daí entram suave no plano do pé até
        t = T_ALINHA e ficam nele (joelho em cima do pé)."""
        Hs = quadris(y, z)
        if alinha["topo"] is None:
            alvo = {lado: None for lado, _ in LADOS}
        else:
            k = min(1.0, t / T_ALINHA)
            alvo = {lado: alinha["topo"][lado] * (1.0 - k * k * (3 - 2 * k)) for lado, _ in LADOS}
        return {lado: joelho_no_plano_do_pe(Hs[lado], pes[lado]["A"], pes[lado]["f"], pes[lado]["n"], lt, ls, alvo[lado])
                for lado, _ in LADOS}, Hs

    def flexao_joelho(y, z, t):
        K, Hs = joelhos(y, z, t)
        k, H, A = K["Left"][0], Hs["Left"], pes["Left"]["A"]
        return math.degrees((k - H).angle(A - k))

    def coxa_inclinacao(y, z, t):
        K, Hs = joelhos(y, z, t)
        d = K["Left"][0] - Hs["Left"]
        return math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y)))

    def bissecao(fn, lo, hi, alvo, voltas=50):
        flo = fn(lo) - alvo
        for _ in range(voltas):
            m = (lo + hi) / 2
            fm = fn(m) - alvo
            if (fm > 0) == (flo > 0):
                lo, flo = m, fm
            else:
                hi = m
        return (lo + hi) / 2

    estado = {}

    def corpo(t, y, z, inc):
        """Pelve e tronco (giram juntos: coluna neutra) com o meio das articulações do quadril em (0, y, z), joelhos (IK com o polo
        no lugar do joelho) e a cabeça olhando à frente. Os braços (filhos do tronco) vão junto, parados em relação a ele."""
        for nome in ("Hips", "Neck", "Head"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inc), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        K, Hs = joelhos(y, z, t)
        for lado, _ in LADOS:
            Kj, C, _ = K[lado]
            v = Kj - C
            polos[lado].location = Kj + (v.normalized() if v.length > 1e-6 else pes[lado]["f"]) * 0.6
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inc * PESCOCO))
        estado.update(K=K, inc=inc, y=y, z=z)

    def centro_da_barra(inc):
        return c("Neck") + p3.rot_x(inc) @ BARRA_NO_TRAPEZIO

    def centro_de_massa(inc):
        """Centro de massa do corpo (volume da malha posada, densidade uniforme) + barra; devolve (sistema, corpo, massa do corpo)."""
        co, tri, _ = ck._avaliar(bon.corpo, 0)
        v0, v1, v2 = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
        vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)) / 6.0
        V = float(vol.sum())
        cc = Vector(((v0 + v1 + v2) / 4.0 * vol[:, None]).sum(axis=0) / V)
        m = V * DENSIDADE
        return (cc * m + centro_da_barra(inc) * M_BARRA) / (m + M_BARRA), cc, m

    def y_equilibrio(t, zfun, inc, y0):
        """y do meio das articulações do quadril que deixa o centro de massa (corpo + barra) em cima do meio do pé (secante), com a
        altura do quadril z = zfun(y)."""
        def erro(y):
            corpo(t, y, zfun(y), inc)
            return centro_de_massa(inc)[0].y - Y_ALVO
        ya, ea = y0, erro(y0)
        yb = y0 + 0.01
        eb = erro(yb)
        for _ in range(10):
            if abs(eb) < 2e-5 or abs(eb - ea) < 1e-9:
                break
            yn = yb - eb * (yb - ya) / (eb - ea)
            ya, ea = yb, eb
            yb, eb = yn, erro(yn)
        estado["erro_cm"] = eb
        return yb

    # ── em pé (1º palpite: quadril no y do repouso), a barra nas costas e as mãos na barra (uma vez: vão junto com o tronco) ──────
    y_cima = meio0.y
    z_cima = bissecao(lambda z: flexao_joelho(y_cima, z, 0.0), 0.70, 0.98, JOELHO_CIMA)
    corpo(0.0, y_cima, z_cima, TRONCO[0])
    if RETRAI:                         # escápulas pra trás (o corpo() não mexe no osso Shoulder: fica assim em todos os quadros)
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima))
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=2 * MEIA_TRAVAS)
    for o in barra.children:           # o eixo de 2 m em anéis (mesma forma e nomes): a checagem espalhava ~1 milhão de pontos nos
        if o.name == "barra_eixo":     # triângulos compridos dele e levava ~3,5 min por quadro (README: "passe a malha por
            e3._em_aneis(o)            # equip3d._em_aneis(obj)")
    barra.rotation_mode = "XYZ"
    R = p3.rot_x(TRONCO[0])
    centro = centro_da_barra(TRONCO[0])
    barra.location = centro
    barra.rotation_euler = R.to_euler()
    p3.atualizar()
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    eixo = (R @ Vector((1.0, 0.0, 0.0))).normalized()

    def pegar():
        for lado, s in LADOS:
            g = centro + eixo * (s * GRIP_X)
            polo = c(lado + "Arm") + R @ Vector((s * POLO_COTOVELO.x, POLO_COTOVELO.y, POLO_COTOVELO.z))
            maos.segurar(lado, g, R @ DEDOS_Q, R @ PALMA_Q, polo=polo, alinhar=ALINHA)

    pegar()
    for lado, _ in LADOS:                              # polo certo do cotovelo (o cotovelo dobra pro lado do polo)
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        maos.iks[lado].mute = True
        print("polo cotovelo %s erro %.3f ang %d" % (lado, *e), flush=True)
    pegar()
    # os 4 dedos fecham até a pele encostar na barra; o polegar é o NOVO, dando a volta por baixo da barra (pegada fechada: NSCA
    # "closed, pronated grip"), na postura fixa POLEGAR_VOLTA do Agachamento no Smith — a mesma pegada (mão atrás da barra nas
    # costas, punho estendido): lá a busca do pg.polegar_em_volta ficou na beirada do viável e na mão direita não achava nunca;
    # aqui também não achou (1ª checagem, 09/10: as 2 mãos caíram no polegar de hoje, esticado). A pegada é a mesma em todos os
    # quadros (as mãos vão junto com o tronco), então a postura é posta uma vez e medida no info().
    dedos = {}
    for lado, _ in LADOS:
        dedos[lado] = pg.fechar_em_volta(bon, lado, centro, eixo, RAIO_BARRA, polegar_modo="busca")
        _polegar_nos_angulos(bon, lado, POLEGAR_VOLTA)
        dedos[lado]["Thumb"] = ("volta fixo",) + POLEGAR_VOLTA
        print("DEDOS %s %s" % (lado, dedos[lado]), flush=True)
    p3.atualizar()
    # o vão de cada mão em relação ao centro da barra, no referencial do tronco (tem que ficar igual em todo quadro: nada escorrega)
    estado["mao_ref"] = {lado: R.transposed() @ (p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado] - centro)
                         for lado, _ in LADOS}

    def polo_dos_joelhos(y, z):
        """pole_angle do IK de cada perna (o joelho no plano quadril–tornozelo–polo, do lado do polo), em 0,5°, embaixo."""
        corpo(1.0, y, z, TRONCO[1])
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            melhor = (1e9, None)
            for k in range(-10, 11):
                ang = e[1] + k * 0.5
                pernas[lado].pole_angle = math.radians(ang)
                p3.atualizar()
                melhor = min(melhor, ((c(lado + "Leg") - estado["K"][lado][0]).length, ang))
            pernas[lado].pole_angle = math.radians(melhor[1])
            p3.atualizar()
            print("polo joelho %s %.1f° | joelho a %.1f mm do alvo" % (lado, melhor[1], melhor[0] * 1000), flush=True)

    # ── em pé e embaixo, com o equilíbrio: o y do quadril e a altura (joelho em pé, coxa paralela embaixo) andam juntos. O polo dos
    # joelhos vem antes (com o joelho fora do lugar o centro de massa sai outro) e é refeito no lugar final ───────────────────────
    y_baixo = y_cima + 0.20
    z_baixo = bissecao(lambda z: coxa_inclinacao(y_baixo, z, 1.0), 0.30, 0.75, COXA_BAIXO)
    for volta in range(2):
        polo_dos_joelhos(y_baixo, z_baixo)
        alinha["topo"] = None
        z_em_pe = lambda y: bissecao(lambda z: flexao_joelho(y, z, 0.0), 0.70, 0.98, JOELHO_CIMA)
        y_cima = y_equilibrio(0.0, z_em_pe, TRONCO[0], y_cima)
        z_cima = z_em_pe(y_cima)
        alinha["topo"] = {lado: joelhos(y_cima, z_cima, 0.0)[0][lado][2] for lado, _ in LADOS}   # em pé: o mais pra fora que dá
        z_paralela = lambda y: bissecao(lambda z: coxa_inclinacao(y, z, 1.0), 0.30, 0.75, COXA_BAIXO)
        y_baixo = y_equilibrio(1.0, z_paralela, TRONCO[1], y_baixo)
        z_baixo = z_paralela(y_baixo)
    JOELHO_BAIXO = flexao_joelho(y_baixo, z_baixo, 1.0)
    print("SUMO BARRA quadril (meio): em pé y %+.4f z %.4f (repouso y %+.4f) → embaixo y %+.4f z %.4f | coxa embaixo %.1f° | "
          "joelho em pé %.1f° → embaixo %.1f° | joelho em pé a %.0f mm do plano do pé" % (
              y_cima, z_cima, meio0.y, y_baixo, z_baixo, coxa_inclinacao(y_baixo, z_baixo, 1.0),
              flexao_joelho(y_cima, z_cima, 0.0), JOELHO_BAIXO, alinha["topo"]["Left"] * 1000), flush=True)

    def pose(t):
        """t=0 em pé, t=1 embaixo (coxas paralelas). O joelho dobra em linha reta no tempo (o t já vem suave do exportador) — com
        a altura do quadril em linha reta, a perna quase esticada dobrava 6–7° por quadro no começo e o joelho pulava 2–3 cm —; a
        altura do quadril sai do joelho e o y dele, do equilíbrio."""
        inc = TRONCO[0] + (TRONCO[1] - TRONCO[0]) * (1.0 - (1.0 - t) ** P_TRONCO)
        fi = JOELHO_CIMA + (JOELHO_BAIXO - JOELHO_CIMA) * t
        zfun = lambda y: bissecao(lambda z: flexao_joelho(y, z, t), 0.30, 0.98, fi)
        y = y_equilibrio(t, zfun, inc, estado.get("y", p3.lerp(y_cima, y_baixo, t)) if t > 0 else y_cima)
        z = zfun(y)
        corpo(t, y, z, inc)
        R = p3.rot_x(inc)
        barra.location = centro_da_barra(inc)
        barra.rotation_euler = R.to_euler()
        p3.atualizar()
        estado["t"] = t

    pose.estado = estado

    def info():
        inc = estado.get("inc", 0.0)
        R = p3.rot_x(inc)
        M = np.array(barra.matrix_world)
        cm, cc, m = centro_de_massa(inc)
        txt = ["tronco %.1f° | quadril y %+.4f z %.4f | centro de massa (corpo %.0f kg + barra %.0f kg) %+.1f mm do meio do pé "
               "(corpo %+.0f mm, barra %+.0f mm; + = atrás)" % (
                   inc, estado.get("y", 0), estado.get("z", 0), m, M_BARRA, (cm.y - Y_ALVO) * 1000, (cc.y - Y_ALVO) * 1000,
                   (barra.location.y - Y_ALVO) * 1000)]
        for lado, s in LADOS:
            A, f, n = pes[lado]["A"], pes[lado]["f"], pes[lado]["n"]
            K = c(lado + "Leg")
            txt.append("joelho %s: %+.0f mm do plano do pé, %.0f mm à frente do tornozelo ao longo do pé (base dos dedos %.0f)" % (
                lado[0], n.dot(K - A) * 1000, f.dot(K - A) * 1000, pes[lado]["base"] * 1000))
        Rt = R.transposed()
        rel = Rt @ (barra.location - c("Neck"))
        txt.append("barra no tronco (a partir da base do pescoço) %+.1f/%+.1f/%+.1f mm" % tuple(x * 1000 for x in rel))
        co, _, nomes, dono = _pele(bon, 1)
        eixo_d, pontas_d = sdf_barra(co, M)
        partes = []
        for nome, pred in (("pescoço", lambda nm: nm == "Neck"), ("cabeça", lambda nm: nm == "Head"),
                           ("trapézio/ombros", lambda nm: nm in ("Spine2", "LeftShoulder", "RightShoulder")),
                           ("braços", lambda nm: nm in ("LeftArm", "RightArm")),
                           ("antebraços", lambda nm: nm in ("LeftForeArm", "RightForeArm"))):
            mk = _mascara(nomes, dono, pred)
            partes.append("%s %+.1f" % (nome, float(eixo_d[mk].min()) * 1000))
        txt.append("barra (eixo) × pele (mm, − = entra): " + " ".join(partes))
        co0, tri0, nomes0, dono0 = _pele(bon, 0)
        eixo0 = sdf_barra(co0, M)[0]
        for lado, s in LADOS:
            mk = _mascara(nomes, dono, lambda nm, L=lado: nm.startswith(L + "Hand"))
            agora = Rt @ (p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado] - barra.location)
            pol = _mascara(nomes0, dono0, lambda nm, L=lado: nm.startswith(L + "HandThumb"))
            polpa = _mascara(nomes0, dono0, lambda nm, L=lado: nm == L + "HandThumb3")
            pele = pg.pele_do_polegar(bon, lado)
            txt.append("mão %s: pele mais funda na barra %+.1f mm, × travas/anilhas %+.0f mm, o vão da mão andou %.2f mm na barra | "
                       "polegar %s: pele × barra %+.1f mm (polpa %+.1f), entra nos dedos %.1f mm, pele da base %.2f× com %d "
                       "triângulos do avesso" % (
                           lado[0], float(eixo_d[mk].min()) * 1000, float(pontas_d[mk].min()) * 1000,
                           (agora - estado["mao_ref"][lado]).length * 1000, dedos[lado]["Thumb"][0],
                           float(eixo0[pol].min()) * 1000, float(eixo0[polpa].min()) * 1000,
                           polegar_nos_dedos(bon, lado) * 1000, pele["alonga_max"], pele["viradas"]))
        nao_mao = _mascara(nomes, dono, lambda nm: not nm.startswith(("LeftHand", "RightHand")))
        i = int(np.argmin(np.where(nao_mao, pontas_d, 1e9)))
        txt.append("travas/anilhas × corpo (fora as mãos) %+.0f mm (%s) | anilhas a %.0f mm do chão" % (
            float(pontas_d[i]) * 1000, nomes[dono[i]] if dono[i] >= 0 else "?", (barra.location.z - R_ANILHA) * 1000))
        juntas = ck.medir_juntas(rig)
        txt.append("joelho %.0f/%.0f° | quadril %.0f/%.0f° | cotovelo %.0f/%.0f° | ombro %.0f/%.0f° | %s" % (
            juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"], juntas["cotoveloE"],
            juntas["cotoveloD"], juntas["ombroE"], juntas["ombroD"], maos.info()))
        return " | ".join(txt)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=4.0, foco_luz=(0, 0.0, 0.75),
                camera_video=((3.4, -3.0, 1.1), (0, 0.0, 0.80), 50), info=info)
