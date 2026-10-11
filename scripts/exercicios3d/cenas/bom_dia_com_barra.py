# Bom Dia com Barra — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos nos treinos
# prontos, 5 vezes como troca equivalente; "fonte_en": "Good Morning"). Sem peça nova: a barra nas costas do Agachamento Sumô com Barra
# (e3.barra, eixo de 29 mm, apoiada em cima do trapézio) e o quadril pra trás do Levantamento Terra Romeno (Stiff).
# t = 0 em pé · t = 1 tronco perto da horizontal. O app faz a volta (subida).
# É o Levantamento Terra Romeno (Stiff) com a barra nas costas em vez de nas mãos (McAllister 2014: o RDL "was mechanically similar to the
# good morning, with the difference being the resting position of the barbell"). Técnica (as frases das fontes estão na ficha):
#   • barra ALTA, em cima do trapézio, na base do pescoço: NSCA ("on the upper back and shoulders above the posterior deltoids at the base of
#     the neck"), Vigotsky 2015 ("high bar position"), McAllister 2014 ("rested on the superior aspect of the trapezius") e Ross 2024 (aceita
#     a alta e a baixa). O free-exercise-db (o fonte_en) fala da baixa ("as you would a power squat"), mas a foto dele mostra a barra na base
#     do pescoço;
#   • pegada fechada e pronada, "only slightly wider than shoulder-width" (NSCA; NASM), escápulas juntas e cotovelos pra baixo (Ross: o
#     "T position"; free-exercise-db: "shoulder blades pinched together");
#   • pés na largura dos ombros, pontas um pouco pra fora (NSCA; Vigotsky), chapados no chão;
#   • joelhos levemente dobrados, ~20°, no mesmo ângulo o movimento todo (Ross: "~20°" e "maintain the same knee joint angle"; NSCA:
#     "slightly flexed" nas 2 fases; Vigotsky mediu 17–25° no fundo);
#   • o quadril vai pra trás ("The buttocks should move straight back", NSCA) e o tronco inclina com a coluna neutra até perto da horizontal
#     (NSCA "approximately parallel"; free-exercise-db "near parallel"), limitado pelo posterior da coxa (ExRx "Do not lower weight beyond
#     mild stretch through hamstrings"; Ross); a cabeça na linha da coluna, um pouco levantada (free-exercise-db "cervical spine in proper
#     alignment"; NSCA "Tilt the head slightly up");
#   • o peso vai do meio do pé rumo aos calcanhares na descida e a barra fica à frente do pé (Ross).
# Montagem:
#   - pés: tornozelos parados no chão a ±X_TORNOZELO, cada pé girado PONTA graus pra fora em volta da vertical (sola chapada); os
#     joelhos dobram pro lado do polo (na frente, na direção do pé) — a conta do Stiff, sem o joelho_no_plano_do_pe do sumô (com o
#     joelho quase esticado, forçar o joelho pro plano vertical do pé o jogava pra fora).
#   - tronco: a pelve e o tronco giram juntos (coluna neutra) em volta das articulações do quadril, TRONCO graus da vertical, em pé →
#     embaixo (em linha reta no tempo; o t já vem suave do exportador); a cabeça fica CABECA graus acima do repouso em todo quadro.
#   - joelhos: a flexão vai de JOELHO[0] (em pé) a JOELHO[1] (embaixo); a altura do quadril sai dela (distância quadril → tornozelo).
#   - equilíbrio: em cada quadro o quadril vai pra trás (ou pra frente) até o centro de massa do corpo (volume da malha posada,
#     densidade uniforme) + barra (M_BARRA) ficar em cima do meio do pé (em pé) e RUMO_CALCANHAR atrás dele (embaixo), como no
#     Agachamento Sumô com Barra. Com o peso nas costas, longe do quadril, o quadril recua ~34 cm (no Stiff, com a barra rente às pernas,
#     0,22 m) e a canela vai ~11° pra trás (flexão plantar: a Tabela 2 do Vigotsky mede o tornozelo em "Ankle plantar flexion" no fundo).
#   - barra: rígida com o tronco (BARRA_NO_TRAPEZIO a partir da base do pescoço, a do Agachamento Sumô com Barra): não escorrega das
#     costas pro pescoço entre os quadros. Os braços e as mãos (maos3d.Maos + pegada3d com o polegar novo dando a volta = pegada
#     fechada, na postura fixa POLEGAR_VOLTA do Agachamento no Smith) são postos UMA vez no montar() e vão junto com o tronco.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena
from agachamento_no_smith import POLEGAR_VOLTA, _polegar_nos_angulos
from agachamento_sumo_com_barra import sdf_barra, polegar_nos_dedos

LADOS = (("Left", 1), ("Right", -1))

# ── barra nas costas: a do Agachamento Sumô com Barra (lote 8), com a mesma barra (as medidas do sdf_barra dele) ────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (o da e3.barra): a mão padrão, sem usar_cilindro
R_ANILHA = 0.225           # anilha de 45 cm (a das anilhas de para-choque)
MEIA_TRAVAS = 0.66         # e3.barra(pegada=1.32), como em todas as cenas com barra
M_BARRA = 40.0             # kg: barra de 20 kg + uma anilha de 10 kg de cada lado (a do Afundo com Barra) — só entra no centro de massa
                           # (com 25 kg o quadril recua só 2 cm a menos: o peso do próprio corpo manda)
BARRA_NO_TRAPEZIO = Vector((0.0, 0.075, -0.041))   # centro da barra a partir da base do pescoço, no referencial do tronco (o do Sumô)
GRIP_X = 0.38              # meio da mão a 38 cm do meio da barra: 76 cm entre as mãos, ~1,9× a distância entre os ombros (0,40 m) e a
                           # borda de dentro da mão ~8 cm por fora do deltoide — a pegada "only slightly wider than shoulder-width" da
                           # NSCA, a mais fechada que o boneco faz: com 0,36 (cotovelo a 141°) o braço entrava no tronco (11 mm a 19 cm
                           # do ombro) e o antebraço no bíceps (11 mm a 13 cm do cotovelo); a do agachamento (0,43) é mais aberta
DEDOS_Q = Vector((0.0, 0.12, 1.0)).normalized()    # (tronco) dedos pra cima, um pouco pra trás: a mão atrás da barra
PALMA_Q = Vector((0.0, -1.0, 0.12)).normalized()   # (tronco) palma pra frente, de frente pra barra
ALINHA = 0.15              # quanto os dedos seguem o antebraço (a mão do Agachamento no Smith, onde a POLEGAR_VOLTA foi achada)
POLO_COTOVELO = Vector((0.30, 0.35, -0.40))         # (tronco, a partir do ombro; x pra fora) cotovelos pra baixo, pra trás e pra fora
RETRAI = 8.0               # escápulas pra trás (graus em volta do eixo do tronco), postas uma vez antes dos braços
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo pro centro de massa (o do Sumô)
RUMO_CALCANHAR = 0.02      # m: o centro de massa sai do meio do pé (em pé) e termina 2 cm atrás dele, rumo aos calcanhares (embaixo) —
                           # Ross 2024: "bodyweight should shift posteriorly from the mid-foot in upright position, towards the heels"

# ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.19         # tornozelo a 19 cm do meio: base de 0,38 m, a do repouso do boneco (~ a largura dos ombros, 0,40 m entre as
                           # cabeças do úmero; NSCA "shoulder-width apart (or wider)"; Vigotsky "feet about shoulder width apart")
PONTA = 8.0                # ponta de cada pé virada pra fora (graus; NSCA "with the toes pointed slightly outward")

# ── movimento ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TRONCO = (2.0, 75.0)       # tronco à frente da vertical (graus): em pé → embaixo, 15° acima da horizontal (NSCA "approximately parallel";
                           # free-exercise-db "near parallel"). Com a coluna neutra e o quadril bem atrás (equilíbrio), 75° já põe a coxa ×
                           # tronco a ~106° (80° daria 111°): o limite é o posterior da coxa (ExRx, Ross), não a barra
JOELHO = (18.0, 20.0)      # flexão dos joelhos (graus): em pé → embaixo — quase o mesmo ângulo (Ross: "~20°", "maintain the same knee
                           # joint angle throughout the lift and minimise any increase"; Vigotsky: 17–20° a 50–70% de 1RM)
PESCOCO = 0.0              # quanto a cabeça volta com a inclinação do tronco (fração): 0 = a cabeça vai junto com o tronco
CABECA = 8.0               # a cabeça levantada (graus, pra trás) em relação ao repouso, igual em todos os quadros: cabeça × tronco −3°
                           # (repouso −11°) — NSCA "Tilt the head slightly up", free-exercise-db "cervical spine in proper alignment";
                           # mais que isso aproxima a nuca da barra com o tronco deitado


def _pele(bon, niveis=0):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos); barra de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda nome: p3.cabeca(rig, nome)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2              # meio das articulações do quadril no repouso
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")                                         # tornozelo no repouso (altura e y)
    print("BOM DIA repouso: coxa %.3f canela %.3f | quadril (meio) %s, meia %.3f | tornozelo %s" % (
        lt, ls, tuple(round(x, 3) for x in meio0), meia_quadril, tuple(round(x, 3) for x in tz0)), flush=True)

    # ── pés: tornozelos no lugar, sola chapada e ponta virada PONTA graus pra fora; joelhos dobrando pro polo, na frente ──────────
    pes, pernas, polos, tornozelos = {}, {}, {}, {}
    for lado, s in LADOS:
        th = math.radians(PONTA)
        f = Vector((s * math.sin(th), -math.cos(th), 0.0))
        A = Vector((s * X_TORNOZELO, tz0.y, tz0.z))
        pes[lado] = dict(A=A, f=f)
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))   # nasce no tornozelo (alvo ≠ polo)
        meio_x = s * (meia_quadril + X_TORNOZELO) / 2
        polos[lado] = p3.vazio("polo_joelho_" + lado, Vector((meio_x, tz0.y, 0.55)) + f * 1.2)
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos[lado])
        b = rig.data.bones[p3.P + lado + "Foot"]
        rot = p3.vazio("rot_" + lado + "Foot")
        rot.matrix_world = Matrix.Rotation(s * th, 4, "Z") @ (rig.matrix_world @ b.matrix_local)
        cn = PB[p3.P + lado + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = rot
        tornozelos[lado].location = A
    p3.atualizar()

    # meio do pé: no meio entre o calcanhar (pele mais atrás, ao longo do pé) e a base dos dedos (cabeça do ToeBase) — o alvo do
    # centro de massa (a conta do Agachamento Sumô com Barra)
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
    print("BOM DIA pé ao longo do tornozelo: calcanhar %.3f, base dos dedos %.3f, ponta %.3f m | meio do pé y %.4f (tornozelo y "
          "%.4f)" % (pes["Left"]["calc"], pes["Left"]["base"], pes["Left"]["ponta"], Y_ALVO, tz0.y), flush=True)

    def z_quadril(y, flexao):
        """Altura do meio das articulações do quadril com o meio delas em y e os joelhos dobrados `flexao` graus: a distância quadril
        → tornozelo sai da flexão (lei dos cossenos, como no Stiff)."""
        d = math.sqrt(lt * lt + ls * ls + 2 * lt * ls * math.cos(math.radians(flexao)))
        A = pes["Left"]["A"]
        dx, dy = meia_quadril - A.x, y - A.y
        return A.z + math.sqrt(max(d * d - dx * dx - dy * dy, 1e-4))

    estado = {}

    def corpo(t, y, z, inc):
        """Pelve e tronco (giram juntos: coluna neutra) com o meio das articulações do quadril em (0, y, z) e a cabeça na linha do
        tronco. Os braços (filhos do tronco) vão junto, parados em relação a ele; os joelhos, por IK, pro lado do polo."""
        for nome in ("Hips", "Neck", "Head"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inc), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        if PESCOCO or CABECA:
            p3.girar_osso(rig, "Neck", p3.rot_x(-inc * PESCOCO - CABECA))
        estado.update(t=t, inc=inc, y=y, z=z)

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

    def alvo_cm(t):
        """y onde o centro de massa (corpo + barra) fica no instante t: em cima do meio do pé em pé, indo RUMO_CALCANHAR pra trás até
        embaixo (o peso vai do meio do pé rumo aos calcanhares na descida)."""
        return Y_ALVO + RUMO_CALCANHAR * t

    def y_equilibrio(t, flexao, inc, y0):
        """y do meio das articulações do quadril que deixa o centro de massa (corpo + barra) em cima do alvo_cm(t) (secante), com a
        altura do quadril tirada da flexão dos joelhos."""
        def erro(y):
            corpo(t, y, z_quadril(y, flexao), inc)
            return centro_de_massa(inc)[0].y - alvo_cm(t)
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

    # ── em pé (1º palpite: quadril no y do repouso), a barra nas costas e as mãos na barra (uma vez: vão junto com o tronco) ──────
    y_cima = meio0.y
    corpo(0.0, y_cima, z_quadril(y_cima, JOELHO[0]), TRONCO[0])
    if RETRAI:                         # escápulas pra trás (o corpo() não mexe no osso Shoulder: fica assim em todos os quadros)
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima))
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=2 * MEIA_TRAVAS)
    for o in barra.children:           # o eixo de 2 m em anéis (mesma forma e nomes): a checagem fica ~10× mais rápida (README)
        if o.name == "barra_eixo":
            e3._em_aneis(o)
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
    for lado, _ in LADOS:              # polo certo do cotovelo (o cotovelo dobra pro lado do polo)
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        maos.iks[lado].mute = True
        print("polo cotovelo %s erro %.3f ang %d" % (lado, *e), flush=True)
    pegar()
    # os 4 dedos fecham até a pele encostar na barra; o polegar é o NOVO, dando a volta por baixo da barra (pegada fechada), na
    # postura fixa POLEGAR_VOLTA do Agachamento no Smith — a mesma pegada (mão atrás da barra nas costas) do Sumô e do Afundo com Barra.
    dedos = {}
    for lado, _ in LADOS:
        dedos[lado] = pg.fechar_em_volta(bon, lado, centro, eixo, RAIO_BARRA, polegar_modo="busca")
        _polegar_nos_angulos(bon, lado, POLEGAR_VOLTA)
        dedos[lado]["Thumb"] = ("volta fixo",) + POLEGAR_VOLTA
        print("DEDOS %s %s" % (lado, dedos[lado]), flush=True)
    p3.atualizar()
    # o vão de cada mão em relação ao centro da barra, no referencial do tronco (tem que ficar igual em todo quadro: nada escorrega)
    estado["mao_ref"] = {lado: R.transposed() @ (p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado] - centro) for lado, _ in LADOS}

    # ── embaixo: o polo dos joelhos (o joelho no plano quadril–tornozelo–polo, do lado do polo); depois o equilíbrio em pé e embaixo ─
    y_baixo = y_equilibrio(1.0, JOELHO[1], TRONCO[1], y_cima + 0.25)
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho %s erro %.3f ang %d" % (lado, *e), flush=True)
    y_baixo = y_equilibrio(1.0, JOELHO[1], TRONCO[1], y_baixo)
    y_cima = y_equilibrio(0.0, JOELHO[0], TRONCO[0], y_cima)
    estado["y"] = y_cima
    print("BOM DIA quadril (meio): em pé y %+.4f z %.4f (repouso y %+.4f z %.4f) → embaixo y %+.4f z %.4f | recua %.3f m" % (
        y_cima, z_quadril(y_cima, JOELHO[0]), meio0.y, meio0.z, y_baixo, z_quadril(y_baixo, JOELHO[1]), y_baixo - y_cima), flush=True)

    def pose(t):
        """t=0 em pé, t=1 tronco perto da horizontal. O tronco inclina e os joelhos dobram em linha reta no tempo (o t já vem suave do
        exportador); o y do quadril sai do equilíbrio e a altura, da flexão dos joelhos."""
        inc = TRONCO[0] + (TRONCO[1] - TRONCO[0]) * t
        fl = JOELHO[0] + (JOELHO[1] - JOELHO[0]) * t
        y0 = estado.get("y", y_cima) if t > 0 else y_cima
        y = y_equilibrio(t, fl, inc, y0)
        corpo(t, y, z_quadril(y, fl), inc)
        R = p3.rot_x(inc)
        barra.location = centro_da_barra(inc)
        barra.rotation_euler = R.to_euler()
        p3.atualizar()
        estado["t"] = t

    pose.estado = estado

    # ── medidas à parte (a checagem não vê): equilíbrio, canela, barra × pescoço/cabeça/cabelo, a mão fora da pegada ──────────────
    def info():
        inc = estado.get("inc", 0.0)
        R = p3.rot_x(inc)
        M = np.array(barra.matrix_world)
        cm, cc, m = centro_de_massa(inc)
        j = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        txt = ["tronco %.1f° | quadril y %+.4f z %.4f (recuou %.0f mm) | centro de massa (corpo %.0f kg + barra %.0f kg) %+.1f mm do "
               "meio do pé (alvo %+.1f; corpo %+.0f mm, barra %+.0f mm; + = atrás; calcanhar %+.0f, base dos dedos %+.0f, ponta %+.0f)" % (
                   inc, estado.get("y", 0), estado.get("z", 0), (estado.get("y", 0) - y_cima) * 1000, m, M_BARRA,
                   (cm.y - Y_ALVO) * 1000, (alvo_cm(estado.get("t", 0)) - Y_ALVO) * 1000, (cc.y - Y_ALVO) * 1000,
                   (barra.location.y - Y_ALVO) * 1000, (pes["Left"]["A"].y - pes["Left"]["calc"] - Y_ALVO) * 1000,
                   (pes["Left"]["A"].y - pes["Left"]["base"] - Y_ALVO) * 1000, (pes["Left"]["A"].y - pes["Left"]["ponta"] - Y_ALVO) * 1000)]
        can = []
        for lado, s in LADOS:
            K, A, H = j[lado + "Leg"], j[lado + "Foot"], j[lado + "UpLeg"]
            can.append("%s canela %+.1f° (joelho %+.0f mm à frente do tornozelo), quadril %+.0f mm atrás do tornozelo" % (
                lado[0], math.degrees(math.atan2(A[1] - K[1], K[2] - A[2])), (A[1] - K[1]) * 1000, (H[1] - A[1]) * 1000))
        txt.append(" | ".join(can))
        co, _, nomes, dono = _pele(bon, 1)
        for lado, s in LADOS:
            P = co[_mascara(nomes, dono, lambda nm, L=lado: nm in (L + "Foot", L + "ToeBase"))]
            tras = P[P[:, 1] > np.median(P[:, 1])]
            txt.append("pé %s: planta %+.1f mm, calcanhar %+.1f mm" % (lado[0], P[:, 2].min() * 1000, tras[:, 2].min() * 1000))
        Rt = R.transposed()
        rel = Rt @ (barra.location - c("Neck"))
        eixo_d, pontas_d = sdf_barra(co, M)
        partes = []
        for nome, pred in (("pescoço", lambda nm: nm == "Neck"), ("cabeça", lambda nm: nm == "Head"),
                           ("trapézio/ombros", lambda nm: nm in ("Spine2", "LeftShoulder", "RightShoulder")),
                           ("braços", lambda nm: nm in ("LeftArm", "RightArm")),
                           ("antebraços", lambda nm: nm in ("LeftForeArm", "RightForeArm"))):
            mk = _mascara(nomes, dono, pred)
            partes.append("%s %+.1f" % (nome, float(eixo_d[mk].min()) * 1000))
        cab = getattr(bon, "cabelo", None)
        if cab is not None:
            hc, _ = ck._avaliar_simples(cab)
            partes.append("cabelo %+.1f" % (float(sdf_barra(hc, M)[0].min()) * 1000))
        txt.append("barra no tronco %+.1f/%+.1f/%+.1f mm | barra (eixo) × pele (mm, − = entra): %s" % (
            *(x * 1000 for x in rel), " ".join(partes)))
        co0, _, nomes0, dono0 = _pele(bon, 0)
        eixo0 = sdf_barra(co0, M)[0]
        c0, ux = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
        for lado, s in LADOS:
            mk = _mascara(nomes, dono, lambda nm, L=lado: nm.startswith(L + "Hand"))
            agora = Rt @ (p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado] - barra.location)
            # a mão fora da pegada: a pele a mais de 3,5 cm do meio da mão, ao longo da barra (as beiradas da mão)
            d = co[mk] - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO_BARRA
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else 0.0
            longe = np.abs(a - a_c) > 0.035
            pol = _mascara(nomes0, dono0, lambda nm, L=lado: nm.startswith(L + "HandThumb"))
            polpa = _mascara(nomes0, dono0, lambda nm, L=lado: nm == L + "HandThumb3")
            pele = pg.pele_do_polegar(bon, lado)
            txt.append("mão %s: pele mais funda na barra %+.1f mm, fora da pegada %+.1f mm, × travas/anilhas %+.0f mm, o vão andou %.2f "
                       "mm na barra | polegar %s: pele × barra %+.1f mm (polpa %+.1f), entra nos dedos %.1f mm, pele da base %.2f× com "
                       "%d triângulos do avesso" % (
                           lado[0], float(eixo_d[mk].min()) * 1000, float(rad[longe].min()) * 1000 if longe.any() else 9e3,
                           float(pontas_d[mk].min()) * 1000, (agora - estado["mao_ref"][lado]).length * 1000, dedos[lado]["Thumb"][0],
                           float(eixo0[pol].min()) * 1000, float(eixo0[polpa].min()) * 1000, polegar_nos_dedos(bon, lado) * 1000,
                           pele["alonga_max"], pele["viradas"]))
        perto = []
        for lado, s in LADOS:
            mv = co[_mascara(nomes, dono, lambda nm, L=lado: nm.startswith(L + "Hand"))]
            for nome, pred in (("ombro", lambda nm, L=lado: nm in (L + "Arm", L + "Shoulder")),
                               ("cabeça", lambda nm: nm in ("Head", "Neck"))):
                Q = co[_mascara(nomes, dono, pred)]
                dist = np.sqrt(((mv[::4, None, :] - Q[None, ::4, :]) ** 2).sum(axis=2)).min()
                perto.append("%s×%s %.0f" % (lado[0], nome, dist * 1000))
        nao_mao = _mascara(nomes, dono, lambda nm: not nm.startswith(("LeftHand", "RightHand")))
        i = int(np.argmin(np.where(nao_mao, pontas_d, 1e9)))
        txt.append("mão × ombro/cabeça (mm, ponto a ponto): %s | travas/anilhas × corpo (fora as mãos) %+.0f mm (%s) | anilhas a %.0f mm "
                   "do chão" % (" ".join(perto), float(pontas_d[i]) * 1000, nomes[dono[i]] if dono[i] >= 0 else "?",
                                (barra.location.z - R_ANILHA) * 1000))
        txt.append("joelho %.0f/%.0f° | quadril %.0f/%.0f° | pescoço %.0f° | cotovelo %.0f/%.0f° | ombro %.0f/%.0f° | %s" % (
            juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"], juntas["pescoco"], juntas["cotoveloE"],
            juntas["cotoveloD"], juntas["ombroE"], juntas["ombroD"], maos.info()))
        return " | ".join(txt)

    for t in (0.0, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=4.0, foco_luz=(0, 0.1, 0.8),
                camera_video=((3.6, -2.4, 1.1), (0, 0.1, 0.80), 50), info=info)
