# Levantamento Terra Sumô com Barra — cena da fábrica 3D (lote 11, 11/10/2026; um dos 61 novos do scripts/conteudo/novos_61.json: 0 usos
# nos treinos prontos, 5 vezes como troca equivalente; "fonte_en": "Sumo Deadlift"). Sem peça nova: a e3.barra com as anilhas de 45 cm do
# Levantamento Terra (lote 7) e a base de sumô do Agachamento Sumô com Barra (lote 8).
# t = 0 barra no chão, com as anilhas apoiadas (começa do chão, como o Levantamento Terra) · t = 1 em pé, barra na frente das coxas.
# O app faz a volta. As frases das fontes estão na ficha (referências e checagens); o resumo da técnica:
#   • base BEM larga e pontas pra fora: ~70 cm entre os centros dos tornozelos e os pés ~42° pra fora (Escamilla 2000: "employed a wider
#     stance (70 ± 11 cm vs 32 ± 8 cm), turned their feet out more (42 ± 8° vs 14 ± 6°)"; ExRx "very wide stance"; free-exercise-db "very
#     wide") — o Levantamento Terra usa 24 cm e 10°;
#   • a barra em cima do meio dos pés, rente às canelas (free-exercise-db "the bar intersects the middle of the feet"; ExRx "keep bar close to
#     body");
#   • as mãos POR DENTRO das pernas, pegada pronada nas 2 mãos (free-exercise-db "inside the legs, and you can use a pronated grip"; Hanen
#     2025 "an overhand grip was consistently used"), ~47 cm entre os centros das mãos (Escamilla 2000: "47 ± 4 cm vs 55 ± 10 cm"; ExRx
#     "shoulder width"; free-exercise-db "directly below the shoulders") — o Levantamento Terra usa 56 cm, por fora;
#   • começo com o quadril baixo, a coxa perto da horizontal, a canela mais em pé e o tronco mais em pé que no convencional (Escamilla 2000:
#     "at LO the sumo group maintained a more upright trunk, positioned the thigh closer to the horizontal, and positioned the shank closer to
#     the vertical"; "5–10° greater vertical trunk"; ExRx "chest high, hips low, and back straight"), braços esticados e ombros por cima da
#     barra (free-exercise-db "The arms should be directly below the shoulders"), olhar à frente;
#   • joelhos na direção das pontas dos pés o tempo todo (ExRx "knees pointed out same direction as feet"); na subida joelho e quadril estendem
#     juntos, o joelho sem o "estender cedo" do convencional (Escamilla 2000: "the knees and hips extended approximately 12° more for the
#     conventional group" até a barra passar o joelho; "At KP ... the sumo group had greater hip and knee flexion"; ExRx "Extend knees when bar
#     passes knees"); o peito sobe desde o começo (ExRx "Pull bar up by driving feet outward, while pulling chest up");
#   • fim em pé, joelhos travados, quadril estendido e ombros pra trás, SEM inclinar pra trás (IPF "Failure to stand erect with the shoulders
#     back", "the knees shall be locked in a straight position"; Escamilla 2000 "upright position with the knees and hips fully extended and the
#     shoulders pulled back"; Hanen 2025 "a straight torso"; ExRx "when torso is upright, drive shoulders back and chest up").
# Montagem (a do Levantamento Terra, com a base do sumô):
#   - pés: tornozelos parados no chão a ±X_TORNOZELO, cada pé girado PONTA graus pra fora em volta da vertical (sola chapada); cada joelho no
#     plano vertical do próprio pé (joelho_no_plano_do_pe, a conta do sumô; JOELHO_FORA pra fora dele) enquanto está bem dobrado; depois de
#     T_FORA[0] o alvo dele entra, suave, até FORA_FIM: com a perna quase esticada e a base larga o joelho não alcança o plano do pé (fica entre
#     o quadril e o tornozelo) e a canela inclina pro calcanhar no plano do pé — a flexão plantar do sumô no fim (Hanen 2025, Tabela 1).
#   - a pose sai do joelho (flexão), do tronco (da vertical) e do caminho do quadril no tempo: a flexão do joelho dá a distância quadril →
#     tornozelo (a altura do quadril); o quadril começa no y em que a canela fica CANELA0 graus à frente da vertical (vista de lado, busca no
#     y), fica atrás até T_Y e vem à frente, suave, até Y_FIM atrás dos tornozelos em pé (no começo o quadril só sobe; depois que a barra passa
#     os joelhos ele vem até a barra). A pelve e o tronco giram juntos em volta das articulações do quadril (coluna neutra), a cabeça volta
#     PESCOCO da inclinação (olhar à frente) e as escápulas vão um pouco pra trás no fim (RETRAI).
#   - a barra fica rente às pernas (FOLGA da pele, medida na malha posada a cada quadro) e pendurada nos braços esticados (o alcance ombro →
#     vão da mão é medido no montar() com o braço todo esticado; quando a mão não chega, a barra sobe o que falta); da metade da subida em
#     diante as mãos ficam na frente das coxas e o polegar e os dedos passam entre a barra e a coxa: a mão fechada é medida contra as pernas
#     a cada quadro e, se chegar a menos de MAO_MIN, a barra vai o que falta pra frente. Em t = 0 o joelho é o que deixa a barra exatamente
#     no chão (busca no montar()).
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
from levantamento_terra import joelho_no_plano_do_pe, _suave

LADOS = (("Left", 1), ("Right", -1))
DEDOS = ("Thumb", "Index", "Middle", "Ring", "Pinky")
OSSOS_MAO = {L: [L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in DEDOS for i in (1, 2, 3)] for L in ("Left", "Right")}

# ── barra (a do Levantamento Terra) ─────────────────────────────────────────────────────────────────────────────────────────────
RAIO_BARRA = 0.0145        # eixo de 29 mm (IPF: 28–29 mm): a mão padrão, sem usar_cilindro
R_ANILHA = 0.225           # anilha de 45 cm (IWF 450 ± 1 mm; IPF ≤ 45 cm): eixo a 22,5 cm do chão com as anilhas apoiadas
MEIA_TRAVAS = 0.66         # e3.barra(pegada=1.32): 1,32 m entre as travas (IPF 1,31–1,32 m)
L_ANILHA = 0.05            # largura da anilha da e3.barra (o padrão dela)
FOLGA = 0.006              # pele das pernas → superfície da barra (m): rente, sem encostar (a checagem pede ≥ 3 mm)
MAO_MIN = 0.002            # pele das mãos → pele das pernas (m): da metade da subida em diante as mãos ficam na frente das coxas e o polegar
                           # (que dá a volta por trás da barra) e os dedos ficam entre a barra e a coxa — medido a cada quadro com a mão
                           # fechada; se chegar a menos que isso, a barra vai o que falta pra frente (a mão vai junto)

# ── base ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_TORNOZELO = 0.35         # tornozelo a 35 cm do meio: 70 cm entre os centros dos tornozelos (Escamilla 2000: 70 ± 11 cm, medido "between
                           # the left and right ankle centers"); o Agachamento Sumô com Barra usa 0,37
PONTA = 42.0               # ponta de cada pé virada pra fora (graus; Escamilla 2000: 42 ± 8°, "40–45° for the sumo group")
JOELHO_FORA = 0.005        # centro do joelho 5 mm pra fora do plano vertical do pé (ExRx: "knees pointed out same direction as feet")

# ── pegada ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
GRIP_X = 0.235             # meio da mão a 23,5 cm do meio: 47 cm entre as mãos (Escamilla 2000: 47 ± 4 cm), por dentro dos joelhos
PALMA_Q = Vector((0, 1, 0))      # pegada pronada nas 2 mãos: palma virada pro corpo
DEDOS_Q = Vector((0, 0, -1))
FOLGA_BRACO = 0.0015       # o alcance dos braços é medido no começo com o braço todo esticado; a barra fica 1,5 mm mais perto (cotovelo
                           # quase reto, ~8°: "arms straight") — com 0,3 mm (o do Levantamento Terra) o cotovelo direito pulava 0° ↔ 10° em
                           # pé (o IK no limite do alcance) e o antebraço saltava 30 mm entre 2 quadros; quando a mão não chega, a barra sobe
POLO_COTOVELO = Vector((0.25, 0.5, 0.2))   # polo do IK do braço a partir do ombro (pra fora, pra trás, pra cima; m): cotovelo pra fora/trás
M_BARRA = 60.0             # kg: barra de 20 kg + uma anilha de 20 kg (45 cm) de cada lado, como no desenho — só pro centro de massa medido
DENSIDADE = 1000.0         # kg/m³: o volume da malha do boneco × isso = a massa do corpo (~74 kg; a conta do Agachamento Sumô com Barra)

# ── movimento ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CANELA0 = 4.0              # canela à frente da vertical no começo, VISTA DE LADO (o joelho à frente do tornozelo), graus: com o pé a 42° e
                           # o joelho em cima dele, 4° de lado = ~5,7° no plano do pé (o Levantamento Terra começa com 15°: Escamilla 2000,
                           # "positioned the shank closer to the vertical"); dá o y do quadril no começo (busca, joelho no plano do pé)
Y_FIM = 0.05               # em pé, as articulações do quadril 5 cm atrás dos tornozelos (as pernas quase em pé, vistas de lado; o centro
                           # de massa do corpo + barra fica em cima do meio do pé — medido no info())
T_Y = 0.10                 # o quadril fica atrás (só sobe) até aqui; daí vem à frente, suave, até em pé (smoothstep^P_Y)
P_Y = 1.0
T_FORA = (0.45, 1.0)       # o joelho fica no plano do pé (JOELHO_FORA) até T_FORA[0] (dobrado ≥ ~50°) e daí entra, suave, até FORA_FIM em
FORA_FIM = -0.075          # T_FORA[1]: com a perna quase esticada e a base larga ele não alcança o plano (fica entre o quadril e o
                           # tornozelo; a canela inclina pro calcanhar no plano do pé — Hanen 2025: o sumô vai pra flexão plantar)
JOELHO_FIM = 3.5           # flexão do joelho em pé (graus; joelho travado — o começo sai da busca: barra no chão)
W_JOELHO = 0.6             # o joelho estende (1 − W)·t + W·smoothstep(t): junto com o quadril até a barra passar os joelhos, sem o "cedo"
                           # do convencional, e mais depressa depois (ExRx "Extend knees when bar passes knees")
TRONCO = (50.0, 0.0)       # tronco à frente da vertical (graus): começo → em pé (o Levantamento Terra começa com 64°: Escamilla 2000, "at LO
                           # the sumo group maintained a more upright trunk", "5–10° greater vertical trunk")
P_TRONCO = 1.4             # t^P: o peito sobe desde o começo (ExRx "while pulling chest up"); no convencional, 2,5
PESCOCO = 0.35             # a cabeça volta essa fração da inclinação do tronco (olhar à frente: ExRx "Face forward"; free-exercise-db
                           # "looking forward with your head")
RETRAI = 8.0               # escápulas pra trás no fim (graus em volta do eixo do tronco; ExRx "drive shoulders back"; IPF "shoulders back")
T_RETRAI = 0.75            # a retração começa aqui


def angulos(t, joelho0):
    """(joelho, tronco) em graus, a fração do caminho do quadril que falta (1 → 0) e o alvo do joelho pra fora do plano do pé (m) no
    instante t, com a flexão do joelho do começo joelho0."""
    joelho = JOELHO_FIM + (joelho0 - JOELHO_FIM) * (1.0 - ((1.0 - W_JOELHO) * t + W_JOELHO * _suave(t)))
    tronco = TRONCO[0] + (TRONCO[1] - TRONCO[0]) * t ** P_TRONCO
    falta_y = 1.0 - _suave(max(0.0, (t - T_Y) / (1.0 - T_Y))) ** P_Y
    fora = JOELHO_FORA + (FORA_FIM - JOELHO_FORA) * _suave((t - T_FORA[0]) / (T_FORA[1] - T_FORA[0]))
    return joelho, tronco, falta_y, fora


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def _cil(a, rho, a0, meia, R):
    """Distância com sinal (m) até um cilindro de raio R e meia largura `meia` centrado em a0 no eixo."""
    qx, qy = rho - R, np.abs(a - a0) - meia
    return np.minimum(np.maximum(qx, qy), 0.0) + np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))


def sdf_pontas(P, M):
    """Distância com sinal (m, − = dentro) dos pontos P (N×3) até as pontas da barra (travas, anilhas e miolos), pela matriz de mundo M da
    raiz (eixo = X local), com as medidas da e3.barra (a conta do Agachamento Sumô com Barra)."""
    M = np.asarray(M, float)
    c, u = M[:3, 3], M[:3, 0] / np.linalg.norm(M[:3, 0])
    d = np.asarray(P, float) - c
    a = d @ u
    rho = np.linalg.norm(d - np.outer(a, u), axis=1)
    pontas = np.full(len(a), 1e9)
    xa = MEIA_TRAVAS + 0.03 + L_ANILHA / 2
    for s in (-1, 1):
        pontas = np.minimum(pontas, _cil(a, rho, s * xa, L_ANILHA / 2, R_ANILHA))
        pontas = np.minimum(pontas, _cil(a, rho, s * xa, (L_ANILHA + 0.012) / 2, 0.03))
        pontas = np.minimum(pontas, _cil(a, rho, s * (MEIA_TRAVAS + 0.012), 0.015, 0.026))
    return pontas


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

    # ── pés: tornozelos no lugar, sola chapada e ponta virada PONTA graus pra fora (em volta da vertical) ─────────────────────────
    pes, pernas, polos, tornozelos = {}, {}, {}, {}
    for lado, s in LADOS:
        th = math.radians(PONTA)
        f = Vector((s * math.sin(th), -math.cos(th), 0.0))
        n = Vector((s * math.cos(th), math.sin(th), 0.0))
        A = Vector((s * X_TORNOZELO, tz0.y, tz0.z))
        pes[lado] = dict(A=A, f=f, n=n)
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))   # nasce no tornozelo (alvo ≠ polo)
        polos[lado] = p3.vazio("polo_joelho_" + lado, A + f * 1.2 + Vector((0.0, 0.0, 0.45)))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos[lado])
        b = rig.data.bones[p3.P + lado + "Foot"]
        rot = p3.vazio("rot_" + lado + "Foot")
        rot.matrix_world = Matrix.Rotation(s * th, 4, "Z") @ (rig.matrix_world @ b.matrix_local)
        cn = PB[p3.P + lado + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = rot
        tornozelos[lado].location = A
    p3.atualizar()
    ya, za = tz0.y, tz0.z
    dx = X_TORNOZELO - meia_quadril                              # quadril → tornozelo, de lado (a base larga)
    pe = pes["Left"]

    # meio do pé (no meio entre o calcanhar e a base dos dedos, ao longo do pé): onde a barra cruza o pé (free-exercise-db "the bar
    # intersects the middle of the feet") — medido, não imposto
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 0)
    P_ = co[_mascara(nomes, dono, lambda nm: nm in ("LeftFoot", "LeftToeBase"))]
    ao_longo = (P_[:, :2] - np.array(pe["A"][:2])) @ np.array(pe["f"][:2])
    pe.update(calc=float(ao_longo.min()), base=float((c("LeftToeBase") - pe["A"]).dot(pe["f"])), ponta=float(ao_longo.max()))
    print("SUMO pé ao longo do tornozelo: calcanhar %.3f, base dos dedos %.3f, ponta %.3f m | coxa %.4f canela %.4f | meia quadril %.4f "
          "| tornozelo y %.4f z %.4f" % (pe["calc"], pe["base"], pe["ponta"], lt, ls, meia_quadril, ya, za), flush=True)

    def z_do_quadril(y, joelho):
        """Altura do meio das articulações do quadril com ele em y e o joelho dobrado `joelho` graus: a distância quadril → tornozelo sai da
        flexão (lei dos cossenos), com o afastamento de lado dx."""
        k = math.radians(joelho)
        d2 = ls * ls + lt * lt + 2 * ls * lt * math.cos(k)
        return za + math.sqrt(max(d2 - dx * dx - (y - ya) ** 2, 1e-6))

    def joelho_de(y, z):
        """Joelho esquerdo (no plano do pé quando dá) com o meio das articulações do quadril em (0, y, z)."""
        H = Vector((meia_quadril, y, z))
        return joelho_no_plano_do_pe(H, pe["A"], pe["f"], pe["n"], lt, ls, JOELHO_FORA)[0]

    def canela_de_lado(K):
        """Canela à frente da vertical vista de lado (graus): + = joelho à frente do tornozelo."""
        return math.degrees(math.atan2(pe["A"].y - K.y, K.z - pe["A"].z))

    def y_do_comeco(joelho):
        """y do meio das articulações do quadril no começo: a canela fica CANELA0 graus à frente da vertical (vista de lado) com o joelho
        dobrado `joelho` graus no plano do pé. Quadril mais pra trás = joelho mais pra trás (canela mais em pé): busca no y (com o joelho
        bem dobrado a canela só diminui com o y)."""
        lo, hi = ya - 0.10, ya + 0.55
        for _ in range(40):
            m = (lo + hi) / 2
            if canela_de_lado(joelho_de(m, z_do_quadril(m, joelho))) > CANELA0:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    estado = {}

    def corpo(t, joelho0):
        """Pelve e tronco (giram juntos: coluna neutra), joelhos na direção dos pés (IK com o polo no lugar do joelho), cabeça e escápulas.
        O quadril vai do y do começo (y_do_comeco) a Y_FIM atrás dos tornozelos; a altura sai da flexão do joelho."""
        for nome in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        joelho, tronco, falta_y, fora = angulos(t, joelho0)
        y0 = y_do_comeco(joelho0)
        y1 = ya + Y_FIM
        y = y1 + (y0 - y1) * falta_y
        z = z_do_quadril(y, joelho)
        p3.girar_osso(rig, "Hips", p3.rot_x(tronco), pivo=meio0, mover=Vector((0.0, y - meio0.y, z - meio0.z)))
        K = {}
        for lado, s in LADOS:
            H = Vector((s * meia_quadril, y, z))
            Kj, C, _ = joelho_no_plano_do_pe(H, pes[lado]["A"], pes[lado]["f"], pes[lado]["n"], lt, ls, fora)
            v = Kj - C
            polos[lado].location = Kj + (v.normalized() if v.length > 1e-6 else pes[lado]["f"]) * 0.6
            K[lado] = Kj
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-tronco * PESCOCO))
        g = RETRAI * _suave((t - T_RETRAI) / (1.0 - T_RETRAI)) if RETRAI else 0.0
        if g:
            cima = (c("Neck") - c("Hips")).normalized()
            for lado, s in LADOS:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * g), 3, cima))
        estado.update(canela=canela_de_lado(K["Left"]), joelho=joelho, tronco=tronco, K=K, y=y, z=z, fora=fora)

    def y_encostada(z):
        """y do eixo da barra o mais perto do corpo (fora as mãos, como na checagem) com a pele a RAIO_BARRA + FOLGA dele, com o eixo na
        altura z. Medido nos TRIÂNGULOS da malha posada (as bordas de cada um amostradas a cada ~1 mm), como no Levantamento Terra."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        mao = np.array([n.startswith(("LeftHand", "RightHand")) for n in nomes] + [False])[dono]
        r = RAIO_BARRA + FOLGA
        T = tri[~mao[tri].any(axis=1)]
        zs = co[T][:, :, 2]
        T = T[(zs.min(axis=1) < z + r) & (zs.max(axis=1) > z - r)]
        V = co[T]
        u = np.linspace(0.0, 1.0, 33)[:, None, None]
        P = np.concatenate([(V[:, k] + u * (V[:, (k + 1) % 3] - V[:, k])).reshape(-1, 3) for k in range(3)])
        dz = P[:, 2] - z
        perto = np.abs(dz) < r
        return float(np.min(P[perto, 1] - np.sqrt(r * r - dz[perto] ** 2)))

    PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")

    def folga_maos():
        """Menor distância com sinal (m, − = entra; pela normal, até 3 cm) da pele das 2 mãos (dedos e polegar) até a pele das pernas, na
        malha posada — a regra checagens.contatos da ficha mede o mesmo."""
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        mao = _mascara(nomes, dono, lambda nm: nm.startswith(("LeftHand", "RightHand")))
        pern = _mascara(nomes, dono, lambda nm: nm in PERNAS)
        tb = tri[pern[tri].all(axis=1)]
        lo, hi = co[pern].min(axis=0) - 0.05, co[pern].max(axis=0) + 0.05
        cand = np.where(mao & (co >= lo).all(axis=1) & (co <= hi).all(axis=1))[0]
        if not len(cand):
            return 1.0
        bvh = BVHTree.FromPolygons([tuple(p_) for p_ in co], [tuple(t_) for t_ in tb], all_triangles=True)
        menor = 1.0
        for i in cand:
            v = Vector(co[i])
            loc, nor, idx, dist = bvh.find_nearest(v)
            if loc is not None:
                menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
        return menor

    braco = (c("LeftForeArm") - c("LeftArm")).length
    antebraco = (c("LeftHand") - c("LeftForeArm")).length
    maos = Maos(bon, RAIO_BARRA, polegar_modo="volta")
    alc = {"v": braco + antebraco + maos.palma * 0.92}         # 1º palpite: braço e mão em linha reta (o montar() mede o de verdade)

    def lugar_da_barra(extra=0.0):
        """Eixo da barra (y, z): encostado nas pernas (mais `extra` m pra frente, pras mãos) e pendurado nos ombros pelo alcance dos braços
        (o vão de cada mão a GRIP_X do meio)."""
        S = c("LeftArm")
        z = S.z - alc["v"]
        y = None
        for _ in range(6):
            y_novo = y_encostada(z) - extra
            z = S.z - math.sqrt(max(alc["v"] ** 2 - (GRIP_X - S.x) ** 2 - (y_novo - S.y) ** 2, 1e-4))
            if y is not None and abs(y_novo - y) < 1e-5:
                y = y_novo
                break
            y = y_novo
        return y, z

    def pegar(centro):
        """As 2 mãos na barra com o eixo em `centro`; devolve quanto falta (m, ao longo do braço) pra mão que menos alcança chegar no vão
        (+ = falta: o braço já está todo esticado)."""
        falta = -1.0
        for lado, s in LADOS:
            S = c(lado + "Arm")
            g = centro + Vector((s * GRIP_X, 0.0, 0.0)) - PALMA_Q * 0.002   # vão 2 mm atrás do eixo (como no Levantamento Terra)
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S + Vector((s * POLO_COTOVELO.x, POLO_COTOVELO.y, POLO_COTOVELO.z)),
                         alinhar=0.5)
            vao = p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]
            falta = max(falta, (g - vao).dot((g - S).normalized()))
        return falta

    # ── começo: o joelho que deixa a barra no chão (as anilhas encostando) ────────────────────────────────────────────────────────────
    def z_da_barra(joelho0):
        corpo(0.0, joelho0)
        return lugar_da_barra()[1]

    def polo_dos_joelhos(joelho0):
        """pole_angle do IK de cada perna (o joelho no plano quadril–tornozelo–polo, do lado do polo), em 0,5°, com a perna do começo."""
        corpo(0.0, joelho0)
        for lado, _ in LADOS:
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            melhor = (1e9, None)
            for k in range(-10, 11):
                ang = e[1] + k * 0.5
                pernas[lado].pole_angle = math.radians(ang)
                p3.atualizar()
                melhor = min(melhor, ((c(lado + "Leg") - estado["K"][lado]).length, ang))
            pernas[lado].pole_angle = math.radians(melhor[1])
            p3.atualizar()
            print("polo joelho %s %.1f° | joelho a %.1f mm do alvo" % (lado, melhor[1], melhor[0] * 1000), flush=True)

    def busca():
        lo, hi = 50.0, 130.0                                   # mais joelho = quadril mais baixo = barra mais baixa
        for _ in range(16):
            m = (lo + hi) / 2
            if z_da_barra(m) > R_ANILHA:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    polo_dos_joelhos(90.0)
    joelho0 = busca()
    corpo(0.0, joelho0)                                        # alcance de verdade dos braços (todo esticado) no começo
    y, z = lugar_da_barra()
    falta = pegar(Vector((0.0, y, z)))
    alc["v"] -= falta + FOLGA_BRACO
    print("SUMO alcance ombro → vão %.4f m (faltavam %.1f mm com o braço e a mão em linha reta)" % (alc["v"], falta * 1000), flush=True)
    polo_dos_joelhos(joelho0)
    joelho0 = busca()
    print("SUMO joelho no começo %.2f° | barra z %.4f" % (joelho0, z_da_barra(joelho0)), flush=True)

    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=2 * MEIA_TRAVAS)
    barra.rotation_mode = "XYZ"
    barra.rotation_euler = (0, 0, 0)

    def pose(t):
        """t=0 barra no chão, t=1 em pé (barra na frente das coxas)."""
        corpo(t, joelho0)
        extra = 0.0
        for volta in range(6):
            y, z = lugar_da_barra(extra)
            subiu = 0.0
            for _ in range(4):
                z = max(z, R_ANILHA)                            # as anilhas nunca entram no chão
                centro = Vector((0.0, y, z))
                falta = pegar(centro)
                if falta < 0.0002:
                    break
                S = c("LeftArm")                               # a mão não chega: a barra sobe o que falta, encostada nas pernas
                dz = falta / max(0.5, (S.z - z) / alc["v"])
                z += dz
                subiu += dz
                y = y_encostada(z) - extra
            barra.location = centro
            p3.atualizar()
            for lado, _ in LADOS:                     # dedos e polegar fecham até a pele encostar na barra
                antes = pose.dedos.get(lado, {}).get("Thumb") if (t > 0 or volta > 0) else None
                pose.dedos[lado] = pg.fechar_em_volta(bon, lado, centro, Vector((1, 0, 0)), RAIO_BARRA, polegar_antes=antes)
            d = folga_maos()
            if d >= MAO_MIN or volta == 5:
                break
            extra += (MAO_MIN - d) + 0.0005               # a mão (polegar/dedos entre a barra e a coxa) chegou na coxa: a barra vai pra frente
        estado.update(barra=centro.copy(), subiu=subiu, falta=falta, t=t, extra=extra, folga_mao=d)

    pose.dedos = {}
    pose.estado = estado
    pose.joelho0 = joelho0

    pose(0.5)                                         # polo certo do cotovelo no meio do movimento
    for lado in ("Left", "Right"):
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e, flush=True)

    # ── medidas à parte (a checagem não vê): mão/antebraço/braço × pernas, anilhas × pés e canelas, ombro × barra, barra × meio do pé ───

    def _menor(co, tri, A, B, onde=None):
        """Menor distância com sinal (mm, − = dentro, pela normal, até 3 cm) dos vértices A até a superfície dos triângulos B; com `onde`
        (nomes, dono), devolve também o osso e a posição do vértice mais fundo."""
        tb = tri[B[tri].all(axis=1)]
        if not len(tb) or not A.any():
            return (9e3, "") if onde else 9e3
        bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t_) for t_ in tb], all_triangles=True)
        menor, im = 1e9, -1
        for i in np.where(A)[0]:
            v = Vector(co[i])
            loc, nor, idx, dist = bvh.find_nearest(v)
            if loc is None:
                continue
            d = -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist
            if d < menor:
                menor, im = d, i
        if onde:
            nomes_, dono_ = onde
            return menor * 1000, "%s (%.3f, %.3f, %.3f)" % (nomes_[dono_[im]] if im >= 0 and dono_[im] >= 0 else "?", *co[im])
        return menor * 1000

    def info():
        b = estado.get("barra", Vector())
        txt = ["%s | barra y %+.3f z %.3f (subiu %.1f mm, falta %.1f mm, à frente pras mãos %.1f mm; mão × pernas %+.1f mm) | canela %.1f° "
               "joelho %.1f° tronco %.1f° | quadril y %+.4f z %.4f" % (
                   maos.info(), b.y, b.z, estado.get("subiu", 0) * 1000, estado.get("falta", 0) * 1000, estado.get("extra", 0) * 1000,
                   estado.get("folga_mao", 0) * 1000, estado.get("canela", 0), estado.get("joelho", 0), estado.get("tronco", 0),
                   estado.get("y", 0), estado.get("z", 0))]
        S = (c("LeftArm") + c("RightArm")) / 2
        meio_pe = (pe["A"] + pe["f"] * ((pe["calc"] + pe["base"]) / 2)).y
        co0, tri0, _ = ck._avaliar(bon.corpo, 0)                # centro de massa: volume da malha posada (densidade uniforme) + barra
        v0, v1, v2 = co0[tri0[:, 0]], co0[tri0[:, 1]], co0[tri0[:, 2]]
        vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)) / 6.0
        V = float(vol.sum())
        cc = ((v0 + v1 + v2) / 4.0 * vol[:, None]).sum(axis=0) / V
        m_corpo = V * DENSIDADE
        cm_y = (cc[1] * m_corpo + b.y * M_BARRA) / (m_corpo + M_BARRA)
        txt.append("centro de massa (corpo %.0f kg + barra %.0f kg) %+.0f mm do meio do pé (corpo %+.0f; + = atrás; calcanhar %+.0f, base dos "
                   "dedos %+.0f)" % (m_corpo, M_BARRA, (cm_y - meio_pe) * 1000, (cc[1] - meio_pe) * 1000,
                                     ((pe["A"] + pe["f"] * pe["calc"]).y - meio_pe) * 1000, ((pe["A"] + pe["f"] * pe["base"]).y - meio_pe) * 1000))
        txt.append("ombro − barra (y) %+.0f mm (− = ombro à frente) | barra − meio do pé (y) %+.0f mm (− = à frente) | joelho z %.3f (barra "
                   "%+.0f mm)" % ((S.y - b.y) * 1000, (b.y - meio_pe) * 1000, c("LeftLeg").z, (b.z - c("LeftLeg").z) * 1000))
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        pernas_m = _mascara(nomes, dono, lambda nm: nm in PERNAS)
        partes = []
        for lado, s in LADOS:
            d, onde = _menor(co, tri, _mascara(nomes, dono, lambda nm, L=lado: nm in OSSOS_MAO[L]), pernas_m, (nomes, dono))
            partes.append("mão%s %+.1f [%s]" % (lado[0], d, onde))
            for rot, pred in (("antebraço", lambda nm, L=lado: nm == L + "ForeArm"), ("braço", lambda nm, L=lado: nm == L + "Arm")):
                partes.append("%s%s %+.1f" % (rot, lado[0], _menor(co, tri, _mascara(nomes, dono, pred), pernas_m)))
        M = np.array(barra.matrix_world)
        pont = sdf_pontas(co, M)
        nao_mao = ~_mascara(nomes, dono, lambda nm: nm.startswith(("LeftHand", "RightHand")))
        i = int(np.argmin(np.where(nao_mao, pont, 1e9)))
        maos_m = _mascara(nomes, dono, lambda nm: nm.startswith(("LeftHand", "RightHand")))
        txt.append("× pernas (mm, − = entra): %s | anilhas/travas × corpo (fora as mãos) %+.0f mm (%s), × mãos %+.0f mm | anilhas a %.1f mm do "
                   "chão" % (" ".join(partes), float(pont[i]) * 1000, nomes[dono[i]] if dono[i] >= 0 else "?",
                             float(pont[maos_m].min()) * 1000, (b.z - R_ANILHA) * 1000))
        Pp = co[pernas_m & (np.abs(co[:, 0]) < MEIA_TRAVAS)]              # a pele das pernas mais perto do eixo da barra (entre as travas)
        dd = np.hypot(Pp[:, 1] - b.y, Pp[:, 2] - b.z) - RAIO_BARRA
        ip = int(np.argmin(dd))
        im_ = np.where(pernas_m & (np.abs(co[:, 0]) < MEIA_TRAVAS))[0][ip]
        txt.append("barra × pele das pernas %.1f mm [%s (%.3f, %.3f, %.3f)]" % (dd[ip] * 1000, nomes[dono[im_]], *Pp[ip]))
        j = ck.medir_juntas(rig)
        txt.append("joelho %.0f/%.0f° | quadril %.0f/%.0f° | cotovelo %.0f/%.0f° | ombro %.0f/%.0f° | pescoço %.0f°" % (
            j["joelhoE"], j["joelhoD"], j["quadrilE"], j["quadrilD"], j["cotoveloE"], j["cotoveloD"], j["ombroE"], j["ombroD"], j["pescoco"]))
        return " | ".join(txt)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.0, 0.6),
                camera_video=((3.0, -3.2, 1.1), (0, 0.0, 0.62), 50), info=info)
