# Alongamento de Posterior em Pé — cena da fábrica 3D (lote 15, 13/10/2026; exercício NOVO do catálogo de 12/10, categoria "Alongamento
# e mobilidade", sem fonte_en). Peso corporal, ALONGAMENTO PARADO, em pé no chão (sem peça nem colchonete: em pé, o chão normal — a foto
# 1 do free-exercise-db tem um colchonete fino embaixo dos pés, que em pé não muda nada).
# Ciclo (regra do lote 15 por coerência com a Prancha — fica pra validação final do Weslley): CÍCLICO ("ciclo": true, t = 1 igual a
# t = 0; o app repete): t = 0 é o ALONGAMENTO SEGURADO (a foto parada do app: o tronco dobrado à frente, a coluna solta, a cabeça
# pendurada e as pontas dos dedos encostando nos dedos dos pés); segura; no meio do ciclo volta devagar pra em pé (t = 0,5 é o meio do
# tempo em pé, com os braços soltos ao lado do corpo — a foto 0 do free-exercise-db) e desce de novo.
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha e em lote4/alongamento_de_posterior_em_pe/fontes.md):
#  · free-exercise-db, Standing Toe Touches (a decisiva: "hamstrings" / "calves", os 2 do subgrupo do catálogo): "Stand with some space
#    in front and behind you." · "Bend at the waist, keeping your legs straight, until you can relax and let your upper body hang down in
#    front of you. Let your arms and hands hang down naturally. Hold for 10 to 20 seconds." Fotos: os pés juntos, as costas em arco, a
#    cabeça pendurada e as pontas dos dedos encostando nos dedos dos pés.
#  · ExRx, Standing Hamstring Stretch: "Stand and bend over with knees straight." · "Reach toward toes or floor or bring torso toward
#    legs. Hold stretch." · "Keep knees straight by tensing Quadriceps. Spine may be kept straight. Pelvis may be tilted forward to
#    intensify stretch." Foto: os dedos das mãos em cima dos dedos dos pés.
#  · Mayo: "Don't bounce." · "Breathe normally"; ACE (Seated Toe Touches): "slowly bend forward from your hips" · "do not bounce";
#    ACSM: "Holding a static stretch for 10-30s is recommended for most adults".
#  · Esola et al. 1996 (dobra máxima à frente em pé): "111 degrees: 41.6 degrees from the lumbar spine and 69.4 degrees from the hips";
#    razão lombar/quadril 1,9 → 0,9 → 0,4 do começo ao fim da descida. McClure et al. 1997 (a volta): 0,26 → 0,61 → 0,81 → 2,3 (o
#    quadril estende primeiro e a lombar por último). Tafazzol et al. 2014: tórax 121 ± 9,9° na flexão máxima em pé.
# Decisões (as divergências das fontes; o detalhe no relatório):
#  · COLUNA SOLTA e arredondada (a decisiva: "relax and let your upper body hang down"; as 2 fotos), não a reta opcional do ExRx ("Spine
#    may be kept straight") nem a das costas retas da ACE e da NSCA, que são do alongamento SENTADO: lombar 41,6° (Esola), torácica 28°.
#  · CABEÇA PENDURADA (as fotos; o pescoço dobra ~10° sobre a torácica), não "aligned with your spine" (ACE, sentado).
#  · MÃOS: os braços PENDEM ("Let your arms and hands hang down naturally") e as pontas dos dedos ENCOSTAM nos dedos dos pés, sem entrar
#    e sem segurar (as 2 fotos; o nome em inglês é "toe touch"). O tronco desce até elas encostarem: no boneco a pelve inclina ~73° (a
#    coxa × a pelve dá ~83°, com as pernas ~10° pra trás), um pouco além dos 69,4° médios do Esola — com a média as mãos ficavam ~8 cm
#    acima dos dedos dos pés. As escápulas vão pra frente (protração 20°) e pro lado da cabeça (12°) com o peso dos braços pendurados (as
#    fotos: os ombros caídos, perto das orelhas).
#  · JOELHOS ESTICADOS sem travar (3°): "keeping your legs straight" · "knees straight" · "tensing Quadriceps" (o boneco em pé, no
#    repouso, mede 7,5°). PÉS JUNTOS (as fotos), a ±9,5 cm do meio: o mais junto sem uma coxa entrar na outra; chapados o ciclo todo.
#  · EQUILÍBRIO: o quadril vai pra trás até o centro de massa do corpo (volume da malha posada) ficar em cima do meio do pé em pé e 2 cm
#    atrás dele no alongamento ("peso nos calcanhares", o pedido; a conta do Stiff com Halteres): o quadril fica ~12 cm atrás dos
#    calcanhares e as pernas inclinam ~10° pra trás (as fotos).
#  · TEMPOS: segura 5 s (a Prancha; a prescrição de verdade, 10–30 s, é a do app), volta em 3,0 s, 1,0 s em pé, desce em 3,0 s
#    (nenhuma fonte dá os segundos: "slowly", "gently", "at a self-selected speed").
# Diferente dos prontos de dobra do quadril em pé (Stiff com Halteres, Levantamento Terra Romeno (Stiff), Bom Dia com Barra): sem peso,
# os joelhos esticados (3° × 12–20° deles), a coluna e a cabeça SOLTAS (× a coluna neutra e a cabeça na linha deles), o tronco desce
# mais (tronco 118° × 74° do Stiff), os braços pendurados com as mãos nos pés e o movimento SEGURA parado (× sobe e desce sem pausa).
# Como o rig faz: os tornozelos ficam parados a ±X_PE do meio, com a sola chapada (a orientação do repouso) e os joelhos por IK (polo na
# frente); a pelve (osso Hips) gira em volta do meio das articulações do quadril e anda até o meio delas ficar no y do equilíbrio, na
# altura que a perna (joelho a JOELHO graus) alcança; a lombar gira nos pivôs Spine e Spine1 e a torácica no Spine1 e no Spine2 (os 3
# pivôs do Alongamento de Extensão da Coluna), o pescoço no Neck, as clavículas em volta do eixo do tórax (protração) e do eixo clavícula
# × tórax (elevação). O braço fica pendurado com a orientação de em pé no MUNDO (gravidade): em pé ele é posto uma vez a partir do
# repouso (aberto ABRE graus, cotovelo a COTOVELO graus, dedos soltos e juntos) e em cada quadro só gira o mínimo pra apontar do ombro
# pro alvo em cima dos dedos do pé (no alongamento) — no caminho, a direção vai de em pé até essa, com a dobra. A dobra do alongamento
# sai de uma busca: a pelve inclina até as pontas dos dedos encostarem nos dedos dos pés (a pele da mão × a pele do pé, −0,5 mm).
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)

# ── pés e pernas ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_PE = 0.095            # tornozelos a ±9,5 cm do meio: pés juntos (fotos do free-exercise-db e do ExRx) — o mais junto sem uma coxa entrar na
                        # outra (a ±9 cm, as coxas encostavam 2,2 mm em pé; a Mobilidade de Ombro com Bastão ficou a ±9 cm)
JOELHO = 3.0            # flexão dos joelhos (graus), parada o ciclo todo: esticados sem travar (free-exercise-db "keeping your legs
                        # straight"; ExRx "Keep knees straight by tensing Quadriceps."); o boneco em pé, no repouso, mede 7,5°
# ── o alongamento (fim da dobra à frente) ────────────────────────────────────────────────────────────────────────────────────────
LOMBAR = 41.6           # flexão da lombar no alongamento (graus): Esola 1996, "41.6 degrees from the lumbar spine" na dobra máxima em pé
TORACICA = 28.0         # flexão da torácica no alongamento (graus): as costas em arco das fotos ("relax and let your upper body hang
                        # down"); com a lombar, 70° — dentro dos 80° de flexão toracolombar da AAOS (Norkin & White)
LOMBAR_DIV = (0.6, 0.4)     # como a lombar se divide entre os pivôs Spine (~L4–L5) e Spine1 (~T12) (a Prancha e a Extensão da Coluna;
                            # passar mais pro Spine1 quase não muda a dobra do quadril: varredura do rascunho, v01.log)
TORACICA_DIV = (0.5, 0.5)   # entre o Spine1 e o Spine2 (~T7) (a Extensão da Coluna)
PESCOCO = 10.0          # flexão do pescoço sobre a torácica no alongamento (graus): a cabeça pendurada (as fotos); com a torácica enrolada
                        # a cabeça × a reta quadril → pescoço fica ~−45° e o "pescoço" da checagem ~45° (teto 50°)
ESCAPULA = 20.0         # protração das escápulas no alongamento (graus, giro da clavícula em volta do eixo do tórax): os braços
                        # pendurados puxam os ombros pra frente (as fotos: os ombros caídos); o lado que alcança mais fica um pouco menos
ELEVA = 12.0            # elevação das escápulas no alongamento (graus): pro lado da cabeça, que está embaixo (o peso dos braços; as fotos:
                        # os ombros perto das orelhas)
QUADRIL_FAIXA = (60.0, 95.0)   # onde a busca procura a inclinação da pelve (graus, osso Hips × vertical) que faz as mãos encostarem
# ── braços ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ABRE = 7.0              # em pé: o braço pendurado aberto do tronco (graus), pra não encostar no corpo (a foto 0 do free-exercise-db)
FRENTE = 2.0            # em pé: o braço um pouco à frente (graus)
COTOVELO = 8.0          # flexão do cotovelo (graus), parada: o braço solto, quase esticado ("hang down naturally")
JUNTA_DEDOS = 0.7       # dedos das mãos lado a lado (fração do leque do repouso do MakeHuman que fecha): a mão solta
DEDOS_SOLTOS = (5, 10, 6)   # flexão de cada falange dos dedos (graus): soltos, um pouco dobrados (com mais dobra, a pelve precisava ir
                            # mais longe pras pontas dos dedos chegarem)
POLEGAR_SOLTO = (4, 8, 6)   # o polegar solto, ao lado do indicador
DX_DEDO = 0.01          # alvo das pontas dos dedos das mãos: em cima do meio dos dedos dos pés, 1 cm pra fora (os braços caem quase retos
                        # dos ombros, que ficam mais abertos que os pés juntos)
R_PONTA = 0.006         # pele da ponta do dedo da mão além do fim do osso (m): o 1º palpite da busca; o refino acerta pela pele de verdade
ENCOSTA = -0.0003       # pele da mão × pele do pé no alongamento (m): encostando, sem entrar (o pedido)
# ── equilíbrio ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
RUMO_CALCANHAR = 0.02   # m: o centro de massa sai do meio do pé (em pé) e fica 2 cm atrás dele no alongamento ("peso nos calcanhares",
                        # o pedido; NSCA, Romanian Deadlift: "begins to move toward the heel"; o Stiff com Halteres)
DENSIDADE = 1000.0      # kg/m³: o volume da malha do boneco × isso = a massa do corpo (só a posição do centro importa)
# ── tempos (o ciclo) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
SEGURA_S = 5.0          # s segurando o alongamento por ciclo (a segurada da Prancha no clipe; free-exercise-db "Hold for 10 to 20
                        # seconds", ACSM "10-30s", Mayo "about 30 seconds" — o tempo de verdade vai na prescrição, séries × segundos)
SOBE_S = 3.0            # s voltando pra em pé (devagar; ACE "relax by returning to your starting position"; McClure: "self-selected speed")
EMPE_S = 1.0            # s em pé, entre as saídas (o meio dele cai em t = 0,5)
DESCE_S = 3.0           # s descendo de novo (ACE "slowly bend forward from your hips"; Mayo "Keep stretches gentle and slow")
CICLO_S = SEGURA_S + SOBE_S + EMPE_S + DESCE_S
T_SOBE = (0.5 - (EMPE_S / 2 + SOBE_S) / CICLO_S, 0.5 - EMPE_S / 2 / CICLO_S)
T_DESCE = (0.5 + EMPE_S / 2 / CICLO_S, 0.5 + (EMPE_S / 2 + DESCE_S) / CICLO_S)
# ── ritmo lombopélvico ─────────────────────────────────────────────────────────────────────────────────────────────────────────
ESOLA = ((30.0, 1.9), (60.0, 0.9), (90.0, 0.4), (math.inf, 0.0))   # descida: razão lombar/quadril por faixa da dobra total (graus):
                        # Esola 1996, 1,9 (0–30°), 0,9 (30–60°) e 0,4 (60–90°); depois dos 90° a lombar já chegou nos 41,6° (conta
                        # minha com as razões) e só o quadril continua
ESOLA_TOTAL = 111.0     # a dobra total do Esola (graus): as faixas valem na fração da dobra
MCCLURE = (0.26, 0.61, 0.81, 2.3)   # volta: razão lombar/quadril em cada quarto da extensão (McClure 1997)
N_GRADE = 12            # o equilíbrio (y do quadril) é calculado em 13 pontos da dobra, na descida e na volta, e interpolado

MAO = lambda L: (lambda nm: nm.startswith(L + "Hand"))
PE = lambda L: (lambda nm: nm in (L + "Foot", L + "ToeBase"))
PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")


def _integral(bandas, x):
    tot, ini = 0.0, 0.0
    for fim, r in bandas:
        if x <= ini:
            break
        tot += (min(x, fim) - ini) * r / (1.0 + r)
        ini = fim
    return tot


def lombar_descendo(f):
    return _integral(ESOLA, f * ESOLA_TOTAL) / _integral(ESOLA, ESOLA_TOTAL)


_MCC = tuple(((i + 1) * 0.25, r) for i, r in enumerate(MCCLURE))


def lombar_subindo(f):
    return 1.0 - _integral(_MCC, 1.0 - f) / _integral(_MCC, 1.0)


def fase(t):
    """(f, subindo): f = fração da dobra (0 em pé, 1 no alongamento)."""
    if t <= T_SOBE[0] or t >= T_DESCE[1]:
        return 1.0, False
    if t < T_SOBE[1]:
        return 1.0 - p3.suave((t - T_SOBE[0]) / (T_SOBE[1] - T_SOBE[0])), True
    if t <= T_DESCE[0]:
        return 0.0, False
    return p3.suave((t - T_DESCE[0]) / (T_DESCE[1] - T_DESCE[0])), False


def _pele(bon, niveis=1):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
    return co, tri, nomes, dono


def _mascara(nomes, dono, pred):
    return np.array([bool(pred(n)) for n in nomes] + [False])[dono]


def distancia_com_sinal(co, tri, a, b):
    """Menor distância (m) com sinal da pele `a` (máscara de vértices) até a superfície `b` (máscara): − = entrou (a conta do
    checagem3d.contatos)."""
    bt = tri[b[tri].all(axis=1)]
    if not len(bt) or not a.any():
        return math.inf, -1
    bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in bt], all_triangles=True)
    menor, onde = math.inf, -1
    idx = np.where(a)[0]
    for i in idx:
        v = Vector(co[i])
        loc, nor, _, dist = bvh.find_nearest(v)
        if loc is None:
            continue
        d = -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist
        if d < menor:
            menor, onde = d, i
    return menor, onde


def montar(bon):
    pg.usar_polegar("volta")
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    lt = (c("LeftLeg") - c("LeftUpLeg")).length
    ls = (c("LeftFoot") - c("LeftLeg")).length
    meio0 = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    meia_quadril = (c("LeftUpLeg") - c("RightUpLeg")).length / 2
    tz0 = c("LeftFoot")

    # ── pés ──
    pernas = {}
    for lado, s in LADOS:
        alvo = p3.vazio("tornozelo_" + lado, Vector((s * X_PE, tz0.y, tz0.z)))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.12, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    p3.atualizar()

    def z_quadril(y, flexao=JOELHO):
        d = math.sqrt(lt * lt + ls * ls + 2 * lt * ls * math.cos(math.radians(flexao)))
        dx, dy = meia_quadril - X_PE, y - tz0.y
        return tz0.z + math.sqrt(max(d * d - dx * dx - dy * dy, 1e-4))

    TRONCO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")
    estado = {}

    def corpo(y, H, L, T, C, E):
        for n in TRONCO:
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(H), pivo=meio0, mover=Vector((0.0, y - meio0.y, z_quadril(y) - meio0.z)))
        giros = {"Spine": L * LOMBAR_DIV[0], "Spine1": L * LOMBAR_DIV[1] + T * TORACICA_DIV[0], "Spine2": T * TORACICA_DIV[1]}
        for n in ("Spine", "Spine1", "Spine2"):
            if giros[n]:
                p3.girar_osso(rig, n, p3.rot_x(giros[n]))
        if C:
            p3.girar_osso(rig, "Neck", p3.rot_x(C))
        cima = (c("Neck") - c("Spine2")).normalized()
        for lado, s in LADOS:
            if E[lado]:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * E[lado]), 3, cima))
                if ELEVA:                       # a escápula desliza pro lado da cabeça (pro chão) com o peso do braço pendurado
                    clav = (c(lado + "Arm") - c(lado + "Shoulder")).normalized()
                    p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(ELEVA * E[lado] / ESCAPULA), 3,
                                                                           clav.cross(cima).normalized()))
        estado.update(y=y, z=z_quadril(y), H=H, L=L, T=T, C=C, E=E)

    # ── em pé, os joelhos no ângulo e os polos acertados ──
    corpo(meio0.y, 0, 0, 0, 0, {"Left": 0.0, "Right": 0.0})
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho %s erro %.3f ang %d" % (lado, *e), flush=True)

    def _coxa_pelve0():
        lado = (c("RightUpLeg") - c("LeftUpLeg")).normalized()
        baixo = c("Hips") - c("Spine")
        baixo = (baixo - lado * baixo.dot(lado)).normalized()
        out = []
        for L, _ in LADOS:
            k = c(L + "Leg") - c(L + "UpLeg")
            k = (k - lado * k.dot(lado)).normalized()
            out.append(math.degrees(math.atan2(-lado.dot(baixo.cross(k)), baixo.dot(k))))
        return out

    CP0 = _coxa_pelve0()

    # ── braços pendurados em pé (FK a partir do repouso) ──
    for lado, s in LADOS:
        S, Ec = c(lado + "Arm"), c(lado + "ForeArm")
        quer = Vector((s * math.sin(math.radians(ABRE)), -math.sin(math.radians(FRENTE)), -1.0)).normalized()
        p3.girar_osso(rig, lado + "Arm", (Ec - S).normalized().rotation_difference(quer).to_matrix())
        S, Ec, W = c(lado + "Arm"), c(lado + "ForeArm"), c(lado + "Hand")
        a, f_ = (Ec - S).normalized(), (W - Ec).normalized()
        flex = math.degrees(a.angle(f_))
        eixo = a.cross(f_).normalized()
        p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.radians(COTOVELO - flex), 3, eixo))
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, JUNTA_DEDOS)
        p3.fechar_mao(rig, lado, angulos=DEDOS_SOLTOS, polegar=POLEGAR_SOLTO)
    R0 = {L: p3.mundo_osso(rig, L + "Arm").to_3x3() for L, _ in LADOS}
    V0 = {L: p3.ponta(rig, L + "HandMiddle3") - c(L + "Arm") for L, _ in LADOS}
    D = {}

    def bracos(f):
        for L, s in LADOS:
            Dq = V0[L].normalized().slerp(D[L], f) if L in D else V0[L].normalized()
            R = V0[L].normalized().rotation_difference(Dq).to_matrix() @ R0[L]
            S = c(L + "Arm")
            PB[p3.P + L + "Arm"].matrix = Matrix.Translation(S) @ R.to_4x4()
        p3.atualizar()

    # ── pés: meio do pé e alvo das pontas dos dedos (em cima dos dedos dos pés, x simétrico) ──
    co, _, nomes, dono = _pele(bon)
    pes, y_meio, pele_pe, xm = {}, [], {}, {}
    for lado, s in LADOS:
        P = co[_mascara(nomes, dono, PE(lado))]
        Td = co[_mascara(nomes, dono, lambda nm, L=lado: nm == L + "ToeBase")]
        calc, ponta, base = float(P[:, 1].max()), float(P[:, 1].min()), c(lado + "ToeBase").y
        pes[lado] = dict(calc=calc, ponta=ponta, base=base, ankle=c(lado + "Foot").copy())
        y_meio.append((calc + base) / 2)
        pele_pe[lado] = P
        xm[lado] = abs(float(Td[:, 0].mean()))
    Y_ALVO = sum(y_meio) / 2
    X_ALVO = (xm["Left"] + xm["Right"]) / 2 + DX_DEDO
    Y_REF = (pes["Left"]["ponta"] + pes["Left"]["base"]) / 2

    def z_pele_pe(lado, x, y):
        P = pele_pe[lado]
        perto = P[(np.abs(P[:, 0] - x) < 0.008) & (np.abs(P[:, 1] - y) < 0.008)]
        return float(perto[:, 2].max()) if len(perto) else 0.0

    print("PÉS | meio do pé y %.4f | dedos: meio |x| E %.3f D %.3f → alvo x ±%.3f, y %.3f (ponta %.3f, base %.3f) | pele em cima E %.4f D %.4f" % (
        Y_ALVO, xm["Left"], xm["Right"], X_ALVO, Y_REF, pes["Left"]["ponta"], pes["Left"]["base"],
        z_pele_pe("Left", X_ALVO, Y_REF), z_pele_pe("Right", -X_ALVO, Y_REF)), flush=True)

    def centro_de_massa():
        co_, tri_, _ = ck._avaliar(bon.corpo, 0)
        v0, v1, v2 = co_[tri_[:, 0]], co_[tri_[:, 1]], co_[tri_[:, 2]]
        vol = np.einsum("ij,ij->i", v0, np.cross(v1, v2)) / 6.0
        V = float(vol.sum())
        return Vector(((v0 + v1 + v2) / 4.0 * vol[:, None]).sum(axis=0) / V)

    def alvo_cm(f):
        return Y_ALVO + RUMO_CALCANHAR * f

    pose_estado = {}
    cfg = {"H1": 70.0}
    E1 = {L: ESCAPULA for L, _ in LADOS}

    def postura(y, f, subindo):
        lam = lombar_subindo(f) if subindo else lombar_descendo(f)
        L = lam * LOMBAR
        H = f * (cfg["H1"] + LOMBAR) - L
        corpo(y, H, L, lam * TORACICA, lam * PESCOCO, {k: f * v for k, v in E1.items()})
        bracos(f)
        pose_estado.update(f=f, subindo=subindo, lam=lam)

    def y_equilibrio(f, subindo, y0):
        def erro(y):
            postura(y, f, subindo)
            return centro_de_massa().y - alvo_cm(f)
        ya, ea = y0, erro(y0)
        yb = y0 + 0.01
        eb = erro(yb)
        for _ in range(12):
            if abs(eb) < 2e-4 or abs(eb - ea) < 1e-9:
                break
            yn = yb - eb * (yb - ya) / (eb - ea)
            ya, ea = yb, eb
            yb, eb = yn, erro(yn)
        estado["erro_cm"] = eb
        return yb

    # ── o alongamento: a pelve inclina até as pontas dos dedos, com os braços pendurados mirando em cima dos dedos dos pés, encostarem;
    #    a busca anda na conta lisa do osso (fim do osso do médio → pele do dedo do pé, na reta do braço, menos a pele da ponta do dedo) e
    #    a pele de verdade (mão × pé) acerta essa pele da ponta; o lado que chega antes encosta pela pelve e o outro, pela escápula ──
    P0 = {L: Vector((s * X_ALVO, Y_REF, z_pele_pe(L, s * X_ALVO, Y_REF))) for L, s in LADOS}
    r_ponta = {L: R_PONTA for L, _ in LADOS}

    def contatos():
        co_, tri_, nomes_, dono_ = _pele(bon)
        return {L: distancia_com_sinal(co_, tri_, _mascara(nomes_, dono_, MAO(L)), _mascara(nomes_, dono_, PE(L)))[0] for L, _ in LADOS}

    def folga_osso(H, y):
        """Por lado: (ombro → pele do dedo do pé) − alcance do braço − pele da ponta do dedo (m), com a postura do alongamento posta."""
        cfg["H1"] = H
        D.clear()
        postura(y, 1.0, False)
        for L, _ in LADOS:
            D[L] = (P0[L] - c(L + "Arm")).normalized()
        bracos(1.0)
        return {L: (P0[L] - c(L + "Arm")).length - V0[L].length - r_ponta[L] for L, _ in LADOS}

    y1 = meio0.y + 0.15
    for volta in range(6):
        for _ in range(2):
            for L, _ in LADOS:
                E1[L] = ESCAPULA
            lo, hi = QUADRIL_FAIXA
            if max(folga_osso(hi, y1).values()) > ENCOSTA:
                print("NÃO CHEGA: com a pelve a %.0f° falta %s" % (hi, folga_osso(hi, y1)), flush=True)
                lo = hi
            for _ in range(18):
                m = (lo + hi) / 2
                if max(folga_osso(m, y1).values()) > ENCOSTA:
                    lo = m
                else:
                    hi = m
            g = folga_osso((lo + hi) / 2, y1)
            fundo = min(g, key=g.get)             # o lado que sobra alcance: menos protração até ficar igual
            a, b = ESCAPULA - 10.0, ESCAPULA
            for _ in range(16):
                E1[fundo] = (a + b) / 2
                if folga_osso(cfg["H1"], y1)[fundo] < ENCOSTA:
                    b = E1[fundo]
                else:
                    a = E1[fundo]
            E1[fundo] = (a + b) / 2
            y1 = y_equilibrio(1.0, False, y1)
        g = folga_osso(cfg["H1"], y1)
        dl = contatos()
        print("ALONGAMENTO volta %d | pelve %.2f° | escápula E %.2f D %.2f | quadril y %+.4f | conta do osso E %.2f D %.2f | mão × pé E %.2f D %.2f mm "
              "(pele da ponta %.1f/%.1f mm)" % (volta, cfg["H1"], E1["Left"], E1["Right"], y1, g["Left"] * 1000, g["Right"] * 1000,
                                                dl["Left"] * 1000, dl["Right"] * 1000, r_ponta["Left"] * 1000, r_ponta["Right"] * 1000),
              flush=True)
        if all(abs(dl[L] - ENCOSTA) < 0.0003 for L, _ in LADOS):
            break
        for L, _ in LADOS:
            r_ponta[L] += ENCOSTA - dl[L]

    # ── a grade do equilíbrio (y do quadril por f, na descida e na subida) ──
    grade = {False: [], True: []}
    for subindo in (False, True):
        y = meio0.y
        for k in range(N_GRADE + 1):
            f = k / N_GRADE
            y = y_equilibrio(f, subindo, y)
            grade[subindo].append(y)
    print("GRADE descida %s" % " ".join("%+.3f" % v for v in grade[False]), flush=True)
    print("GRADE subida  %s" % " ".join("%+.3f" % v for v in grade[True]), flush=True)

    def y_da_grade(f, subindo):
        x = f * N_GRADE
        k = min(int(x), N_GRADE - 1)
        a = x - k
        g = grade[subindo]
        return g[k] * (1 - a) + g[k + 1] * a

    def pose(t):
        f, subindo = fase(t)
        postura(y_da_grade(f, subindo), f, subindo)
        estado["t"] = t

    def coxa_pelve():
        """Quadril de verdade: coxa (quadril → joelho) × pelve (osso Hips: da cabeça dele à cabeça do Spine, pra baixo), no plano de lado,
        graus [E, D] (a medida "quadril" do checagem3d usa a reta quadril → pescoço, que leva junto a coluna enrolada). O repouso mede o
        ângulo da pelve parada, então sai como diferença dele."""
        lado = (c("RightUpLeg") - c("LeftUpLeg")).normalized()
        baixo = c("Hips") - c("Spine")
        baixo = (baixo - lado * baixo.dot(lado)).normalized()
        out = []
        for L, _ in LADOS:
            k = c(L + "Leg") - c(L + "UpLeg")
            k = (k - lado * k.dot(lado)).normalized()
            out.append(math.degrees(math.atan2(-lado.dot(baixo.cross(k)), baixo.dot(k))))
        return out

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        cm = centro_de_massa()
        co, tri, nomes, dono = _pele(bon)
        cp = coxa_pelve()
        txt = ["f %.3f (%s, lombar %.2f) | pelve %.1f° lombar %.1f° torácica %.1f° pescoço %.1f° escápula %.1f/%.1f° | quadril y %+.4f z %.4f | "
               "centro de massa %+.1f mm do meio do pé (alvo %+.1f; calcanhar %+.0f, base dos dedos %+.0f)" % (
                   pose_estado["f"], "subindo" if pose_estado["subindo"] else "descendo", pose_estado["lam"], estado["H"], estado["L"],
                   estado["T"], estado["C"], estado["E"]["Left"], estado["E"]["Right"], estado["y"], estado["z"], (cm.y - Y_ALVO) * 1000,
                   (alvo_cm(pose_estado["f"]) - Y_ALVO) * 1000, (pes["Left"]["calc"] - Y_ALVO) * 1000, (pes["Left"]["base"] - Y_ALVO) * 1000)]
        med = []
        for L, s in LADOS:
            m = _mascara(nomes, dono, MAO(L))
            d_pe, i_pe = distancia_com_sinal(co, tri, m, _mascara(nomes, dono, PE(L)))
            med.append("mão %s × pé %.1f mm (%s)" % (L[0], d_pe * 1000, nomes[dono[i_pe]] if i_pe >= 0 else "-"))
        txt.append(" | ".join(med))
        txt.append("coxa × pelve (quadril de verdade) %.1f/%.1f° (repouso %.1f/%.1f) | tronco %.1f° | coluna_sinal %.1f | cabeca_tronco %.1f | "
                   "juntas: joelho %.1f/%.1f quadril %.1f/%.1f pescoço %.1f ombro %.0f/%.0f cotovelo %.0f/%.0f punho %.0f/%.0f | tornozelo %s | "
                   "canela %s | braco_lado %s | escapula_frente %s | palma_dentro %s" % (
                       cp[0] - CP0[0], cp[1] - CP0[1], CP0[0], CP0[1], math.degrees((c("Neck") - c("Hips")).angle(Vector((0, 0, 1)))),
                       tc.coluna_sinal(jj)[0], tc.cabeca_tronco(jj)[0], jt["joelhoE"], jt["joelhoD"], jt["quadrilE"], jt["quadrilD"],
                       jt["pescoco"], jt["ombroE"], jt["ombroD"], jt["cotoveloE"], jt["cotoveloD"], jt["punhoE"], jt["punhoD"],
                       "/".join("%.0f" % v for v in tc.tornozelo(jj)), "/".join("%.1f" % v for v in tc.canela_sinal(jj)),
                       "/".join("%.0f" % v for v in tc.braco_lado(jj)), "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                       "/".join("%.0f" % v for v in tc.palma_dentro(jj))))
        return " | ".join(txt)

    for t in (0.0, 0.5):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)
    pose.estado = estado
    return Cena(pose, [], foco_luz=(0, 0.0, 0.6), camera_video=((3.8, -2.4, 1.0), (0, 0.0, 0.6), 50), info=info)
