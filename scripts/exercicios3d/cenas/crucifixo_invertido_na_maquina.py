# Crucifixo Invertido na Máquina — cena da fábrica 3D (lote 6, 07/10/2026). Máquina: equip3d.voador com tras=−1 — o MESMO voador do
# Crucifixo na Máquina, com a pessoa de frente pro encosto, que vira o apoio do peito (a coluna e a pilha ficam na frente dela, depois
# do encosto; as coxas passam embaixo dele).
# t = 0 braços na frente, na altura dos ombros, cotovelos levemente dobrados e apontando pros lados, as mãos perto uma da outra
# (pegada neutra no pegador vertical, o polegar pra cima), escápulas soltas · t = 1 braços abertos pros lados, as mãos na linha dos
# ombros e os cotovelos logo atrás das costas, escápulas aproximadas.
# Técnica: ExRx, Lever Seated Reverse Fly (parallel grip): "Sit on machine with chest against pad. Grasp parallel handles with thumbs
# up at shoulder height. Slightly bend elbows and internally rotate shoulders so elbows are also at height of shoulders." / "Keeping
# elbows pointed high, pull handles apart and to rear until elbows are just behind back. Return and repeat." / "Keep elbows raised at
# same height of shoulders to minimize Latissimus Dorsi involvement." eGym, M14 Butterfly Reverse: "Sit upright and forward with your
# chest against the chest pad, not with your glutes against the backrest." / "Hold the handles slightly below shoulder height with
# your elbows slightly bent." / "Start with the handles close together in front of the body." / "Open your arms outward and backward
# against the resistance until the handles are in line with the shoulders." / "Keep your shoulders lowered and elbows slightly
# bent." / "Return to the starting position in a controlled motion." Hoist HD-3900 Pec Fly/Rear Delt (Rear Delt): "Sit facing the
# machine in an upright position with your chest against the pad." / "swing your arms apart in a sweeping arc while exhaling." /
# "When your hands are straight out at your sides squeeze your shoulder blades together" / "while being careful not to lock your
# elbows." Schoenfeld e colegas (J Strength Cond Res 2013;27(10):2644-9): "performing exercise on the reverse fly machine with a
# neutral hand position significantly increases activity of the posterior deltoid and infraspinatus muscles compared with a PRO hand
# position."
# Como o rig faz: sentado com o tronco quase em pé, TRONCO° pra frente (o peito no encosto, que inclina ENCOSTO° pra frente; o encosto
# começa acima das coxas e vai até um pouco acima dos ombros, abaixo do queixo); coxas na horizontal e um pouco abertas, canelas em pé,
# pés chapados no chão. O braço todo é UMA peça, como no Crucifixo na Máquina: o braço BAIXA° abaixo da horizontal e o antebraço na
# horizontal, girado pra frente até o cotovelo dobrar COTOVELO° (o cotovelo aponta pro lado com o braço na frente e pra trás com o
# braço aberto), a palma virada pra onde o braço fecha (pegada neutra no pegador vertical, o polegar pra cima). A mão é posta no
# pegador no FIM (IK + mão fechada em volta dele, o polegar dando a volta) e o braço inteiro gira em volta da vertical do ombro até as
# mãos ficarem a VAO_MAOS uma da outra: é o COMEÇO. As escápulas fecham (clavícula girando RETRAI° pra trás em volta da vertical,
# mais no fim do movimento) e levam o ombro ~1,4 cm pra trás: o eixo de cada braço da máquina fica no ponto que leva o ombro do
# começo pro ombro do fim com o MESMO giro do braço (a ~9 mm dos 2, na vertical do ombro), e, quadro a quadro, a mão fica PRESA no
# pegador (dedos e polegar fechados uma vez, iguais em todos os quadros) e o braço chega nela pelo IK, com o cotovelo no plano que
# gira junto com o braço da máquina. Tronco, cabeça, quadril, pernas e pés não mexem.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TRONCO = 5.0              # tronco 5° pra frente da vertical, o peito encostado no encosto ("Sit upright and forward with your chest
                          # against the chest pad", eGym; "Sit facing the machine in an upright position with your chest against the
                          # pad", Hoist)
ENCOSTO = 5.0             # o encosto do voador, 5° da vertical pro lado da coluna (o mesmo do Crucifixo na Máquina)
ESP_ENCOSTO, LARG_ENCOSTO = 0.06, 0.24    # estofado de 60 mm; largura: no começo os braços passam ~1,5 cm por fora dele (escolha da
                                          # fábrica; com 0,26 m passavam a 5 mm)
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.38    # estofado de 60 mm; largura: escolha da fábrica
PROF_ASSENTO = 0.36       # profundidade do assento (a do Crucifixo na Máquina)
ENTRA_ASSENTO = 0.06      # o assento entra 6 cm embaixo do encosto (como no Crucifixo na Máquina)
AFUNDA = 0.002            # pele afundando no estofado do assento e do encosto
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril (juntas, as coxas se tocavam)
FOLGA_COXA = 0.035        # o encosto começa 3,5 cm acima das coxas (elas passam embaixo dele)
TOPO_ENCOSTO = 0.05       # o encosto sobe até 5 cm acima da articulação do ombro (o queixo fica acima dele)
COTOVELO = 20.0           # flexão do cotovelo ("Slightly bend elbows", ExRx; "elbows slightly bent", eGym; "being careful not to lock
                          # your elbows", Hoist)
BAIXA = 4.0               # braço 4° abaixo da horizontal e o antebraço na horizontal: o cotovelo e a mão ~2 cm abaixo da articulação do
                          # ombro ("internally rotate shoulders so elbows are also at height of shoulders", "Keep elbows raised at same
                          # height of shoulders", ExRx; "Hold the handles slightly below shoulder height", eGym)
VAO_MAOS = 0.050          # começo: 5 cm entre a pele das 2 mãos ("Start with the handles close together in front of the body", eGym);
                          # com menos, os pegadores passavam em cima do suporte do encosto
RETRAI = 6.0              # fim: clavícula 6° pra trás em volta da vertical — as escápulas aproximam e o ombro vai ~1,4 cm pra trás
                          # ("When your hands are straight out at your sides squeeze your shoulder blades together", Hoist)
RAIO = 0.0145             # pegador de 29 mm (o do Crucifixo na Máquina)
COMP_PEGADOR = 0.16
QUEDA = 0.68              # do topo do pegador até o cubo dos braços no alto (a do Crucifixo na Máquina)
FUNDO = 0.56              # do encosto (embaixo) até a coluna: a coluna fica ~7 cm além das pontas dos dedos no começo (com 0,50 m,
                          # 1,5 cm)
MAO = {L: tuple([L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]) for L, _ in LADOS}


def escapula_do_quadro(t):
    """Quanto as escápulas fecharam no quadro t (0 → 1): mais no fim (o "squeeze" com as mãos já do lado do corpo, Hoist)."""
    return t * t


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    Z = Vector((0.0, 0.0, 1.0))

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado: tronco TRONCO° pra frente, coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão ─────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    t_rep = cab("Neck") - cab("Hips")
    frente_rep = math.degrees(math.atan2(-t_rep.y, t_rep.z))   # o tronco do boneco em pé, no repouso, já inclina isso pra frente

    def sentar(inclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina - frente_rep), pivo=pivo0)
        for L, s in LADOS:
            h, k = cab(L + "UpLeg"), cab(L + "Leg")
            alvo = Vector((s * math.sin(math.radians(ABRE_COXA)), -math.cos(math.radians(ABRE_COXA)), 0.0))
            p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(alvo).to_matrix())
            k, a = cab(L + "Leg"), cab(L + "Foot")
            p3.girar_osso(rig, L + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
            f = cab(L + "ToeBase") - cab(L + "Foot")       # a canela gira em volta dela mesma até o pé apontar como no repouso
            giro = math.atan2(f_rep[L].x, -f_rep[L].y) - math.atan2(f.x, -f.y)
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation(giro, 3, (cab(L + "Foot") - cab(L + "Leg")).normalized()))
            F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
            p3.girar_osso(rig, L + "Foot", pe_rep[L] @ F.inverted())    # sola chapada, como em pé
        pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, -0.0005 - float(pes[:, 2].min()))))

    sentar(TRONCO)
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    tt = cab("Neck") - cab("Hips")
    S0 = {L: cab(L + "Arm") for L, _ in LADOS}                # articulação do ombro com as escápulas soltas (começo)

    # ── 2) encosto (apoio do peito): a face, inclinada ENCOSTO° pro lado da coluna (−Y), encosta no peito (a pele afunda AFUNDA);
    #    começa FOLGA_COXA acima das coxas e sobe até TOPO_ENCOSTO acima do ombro ───────────────────────────────────────────────
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0.0, math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo, +Y)
    nn = np.array(n_enc)
    z_topo = S0["Left"].z + TOPO_ENCOSTO
    T = pele(("Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck", "LeftArm", "RightArm"))
    C = pele(("LeftUpLeg", "RightUpLeg"))
    y_peito = float(T[(np.abs(T[:, 0]) < LARG_ENCOSTO / 2) & (T[:, 2] < z_topo)][:, 1].min())
    cx = C[(np.abs(C[:, 0]) < LARG_ENCOSTO / 2 + 0.02) & (C[:, 1] < y_peito + 0.06) & (C[:, 1] > y_peito - 0.16)]
    z_baixo = float(cx[:, 2].max()) + FOLGA_COXA
    zona = T[(np.abs(T[:, 0]) < LARG_ENCOSTO / 2) & (T[:, 2] > z_baixo) & (T[:, 2] < z_topo)]
    d_enc = float((zona @ nn).min()) + AFUNDA                 # face do encosto: n·p = d_enc
    contato = Vector(zona[(zona @ nn).argmin()])

    def y_da_face(z):
        return (d_enc - z * math.sin(a_enc)) / math.cos(a_enc)

    y_face = y_da_face(z_baixo)
    alt_enc = (z_topo - z_baixo) / math.cos(a_enc)
    # assento: entra ENTRA_ASSENTO embaixo do encosto e vai PROF_ASSENTO pra trás; o topo embaixo do glúteo (a pele mais baixa no
    # pedaço do assento afunda AFUNDA)
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    topo = float(G[:, 2].min()) + AFUNDA
    for _ in range(3):
        y_frente = y_da_face(topo) - ENTRA_ASSENTO
        y_tras = y_frente + PROF_ASSENTO
        Gs = G[(G[:, 1] > y_frente) & (G[:, 1] < y_tras) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2)]
        topo = float(Gs[:, 2].min()) + AFUNDA
    y_frente = y_da_face(topo) - ENTRA_ASSENTO
    y_tras = y_frente + PROF_ASSENTO
    print("SENTADO | tronco %.1f° pra frente (repouso %.1f°) | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f | glúteo "
          "atrás até y %.3f | encosto: face y %.4f em z %.3f (encosta no peito em (%.3f %.3f %.3f)), %.3f m até z %.3f | coxas "
          "embaixo até z %.3f" % (math.degrees(math.atan2(-tt.y, tt.z)), frente_rep, *H, topo, y_frente, y_tras, float(G[:, 1].max()),
                                  y_face, z_baixo, *contato, alt_enc, z_topo, z_baixo - FOLGA_COXA), flush=True)

    # ── 3) escápulas: cada clavícula gira em volta da vertical que passa na base dela (+ = pra trás: aproxima as escápulas) ──────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}

    def escapulas(graus):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        if graus:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * graus), 3, "Z"))

    escapulas(RETRAI)
    S1 = {L: cab(L + "Arm") for L, _ in LADOS}
    jj = ck.posicoes(rig)
    esc1 = tc.escapula_frente(jj)
    escapulas(0.0)
    jj = ck.posicoes(rig)
    print("ESCÁPULAS | soltas: escapula_frente %s mm | fechadas %.0f°: %s mm, o ombro E anda (%.1f %.1f %.1f) mm" % (
        "/".join("%.1f" % v for v in tc.escapula_frente(jj)), RETRAI, "/".join("%.1f" % v for v in esc1),
        *((S1["Left"] - S0["Left"]) * 1000)), flush=True)

    # ── 4) o braço como uma peça só (o do Crucifixo na Máquina): direção do braço, do antebraço e da palma em função do giro ──────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def modelo(s, psi):
        """Braço, antebraço e palma (mundo) do lado s com o braço girado psi graus a partir do lado (0 = braço apontando pro
        lado, 90 = pra frente), BAIXA° abaixo da horizontal; o antebraço na horizontal, girado pro lado em que o braço fecha até o
        cotovelo dobrar COTOVELO°, e a palma virada pra onde o braço fecha (horizontal, ⟂ ao antebraço)."""
        lat, fr = Vector((s, 0.0, 0.0)), Vector((0.0, -1.0, 0.0))
        ps, eb, fi = math.radians(psi), math.radians(BAIXA), math.radians(COTOVELO)
        h = lat * math.cos(ps) + fr * math.sin(ps)          # braço visto de cima
        f = -lat * math.sin(ps) + fr * math.cos(ps)         # pra onde o braço anda fechando (horizontal, ⟂ a h)
        b = h * math.cos(eb) - Z * math.sin(eb)
        ga = math.acos(min(1.0, math.cos(fi) / math.cos(eb)))   # ângulo, visto de cima, entre o braço e o antebraço
        a = h * math.cos(ga) + f * math.sin(ga)
        p = -h * math.sin(ga) + f * math.cos(ga)
        return b, a, p

    def juntas(L, s, psi):
        b, a, p = modelo(s, psi)
        E = S0[L] + b * Lb
        return b, a, p, E, E + a * La

    def polo(L, E, W, S):
        eixo = (W - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        return E + fora.normalized() * 0.4

    # referência: (1) quanto a mão gira em volta da normal da palma pra a linha dos nós dos dedos (onde passa o eixo do pegador)
    # ficar na VERTICAL (o pegador é vertical) — o giro fica no punho, de lado; (2) o vão da mão em relação ao punho, no referencial
    # da mão (dedos, palma, dedos × palma)
    giro, OFF = {}, {}
    for L, s in LADOS:
        b, a, p, E, W = juntas(L, s, -10.0)
        maos.segurar(L, W + a * 0.08, a, p, polo=polo(L, E, W, S0[L]))
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.segurar(L, W + a * 0.08, a, p, polo=polo(L, E, W, S0[L]))
        nos = pg._base(rig, L)[1]
        nos_p = (nos - p * nos.dot(p)).normalized()
        quer = Z if nos_p.dot(Z) > 0 else -Z
        giro[L] = math.atan2(nos_p.cross(quer).dot(p), nos_p.dot(quer))
        dq = Matrix.Rotation(giro[L], 3, p) @ a
        maos.segurar(L, W + dq * 0.08, dq, p, polo=polo(L, E, W, S0[L]))
        off = (W + dq * 0.08) - cab(L + "Hand")
        lat = dq.cross(p)
        OFF[L] = (off.dot(dq), off.dot(p), off.dot(lat))
        nos2 = pg._base(rig, L)[1]
        print("REF %s | polo erro %.3f ang %d | giro da mão %.1f° | nós × vertical antes %.1f° depois %.1f° | vão − punho no "
              "referencial da mão (%.3f %.3f %.3f)" % (L, e[0], e[1], math.degrees(giro[L]), math.degrees(nos.angle(quer)),
                                                      math.degrees(min(nos2.angle(Z), nos2.angle(-Z))), *OFF[L]), flush=True)

    def mao_no_pegador(L, s, psi):
        """Vão da mão (eixo do pegador), dedos e palma com o braço girado psi graus (escápulas soltas)."""
        b, a, p, E, W = juntas(L, s, psi)
        dq = Matrix.Rotation(giro[L], 3, p) @ a
        o = OFF[L]
        return W + dq * o[0] + p * o[1] + dq.cross(p) * o[2], dq, p, E, W

    # ── 5) fim: o giro em que o vão da mão fica na linha dos ombros ("until the handles are in line with the shoulders", eGym; "When
    #    your hands are straight out at your sides", Hoist) — com o cotovelo dobrado, o cotovelo fica atrás ("until elbows are just
    #    behind back", ExRx); a mão é posta no pegador ali (IK + dedos e polegar fechando em volta dele) ──────────────────────────
    PSI1 = {}
    for L, s in LADOS:
        lo, hi = -45.0, 30.0
        for _ in range(40):
            meio = (lo + hi) / 2
            if mao_no_pegador(L, s, meio)[0].y > S0[L].y:      # a mão ainda atrás da linha do ombro → fecha mais
                lo = meio
            else:
                hi = meio
        PSI1[L] = (lo + hi) / 2
    g_fim = {}
    for L, s in LADOS:
        g, dq, p, E, W = mao_no_pegador(L, s, PSI1[L])
        maos.segurar(L, g, dq, p, polo=polo(L, E, W, S0[L]))
        g_fim[L] = g
        print("MÃO %s no fim | braço %.1f° (de cima) | vão (%.4f %.4f %.4f), %.1f mm à frente do ombro | cotovelo fora do calculado "
              "%.1f mm | punho fora %.1f mm | %s" % (L, PSI1[L], *g, (S0[L].y - g.y) * 1000, (cab(L + "ForeArm") - E).length * 1000,
                                                    (cab(L + "Hand") - W).length * 1000, maos.info()), flush=True)
    dedos = {}
    for L, s in LADOS:
        dedos[L] = pg.fechar_em_volta(bon, L, g_fim[L], Z, RAIO)
        print("DEDOS %s | %s" % (L, dedos[L]), flush=True)
    DEDOS = {L: {pb.name: pb.matrix_basis.copy() for pb in PB
                 if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"} for L, _ in LADOS}

    # ── 6) começo: o braço inteiro gira em volta da vertical do ombro (o úmero na articulação, o antebraço e a mão juntos) até as mãos
    #    ficarem a VAO_MAOS uma da outra ─────────────────────────────────────────────────────────────────────────────────────────
    M_fim = {L: PB[p3.P + L + "Arm"].matrix.copy() for L, _ in LADOS}

    def bracos(graus):
        for L, _ in LADOS:
            PB[p3.P + L + "Arm"].matrix = M_fim[L]
        p3.atualizar()
        if graus:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Arm", Matrix.Rotation(math.radians(-s * graus), 3, "Z"), pivo=S0[L])

    def vao_maos():
        """Menor distância (m) entre a pele das 2 mãos."""
        co, _, (nomes, dono) = _malha(bon)
        A_, B_ = co[_grupo(nomes, dono, MAO["Left"])], co[_grupo(nomes, dono, MAO["Right"])]
        kd = KDTree(len(B_))
        for i, v in enumerate(B_):
            kd.insert(Vector(v), i)
        kd.balance()
        return min(kd.find(Vector(v))[2] for v in A_[::2])

    lo, hi = 60.0, 130.0
    for _ in range(14):
        meio = (lo + hi) / 2
        bracos(meio)
        if vao_maos() > VAO_MAOS:
            lo = meio
        else:
            hi = meio
    ARCO = (lo + hi) / 2
    bracos(ARCO)
    jj = ck.posicoes(rig)
    R0 = {L: Matrix.Rotation(math.radians(-s * ARCO), 3, "Z") for L, s in LADOS}
    g0, DQ0, P0, W0, E0, POLO0 = {}, {}, {}, {}, {}, {}
    for L, s in LADOS:
        g, dq, p, E, W = mao_no_pegador(L, s, PSI1[L])
        g0[L] = S0[L] + R0[L] @ (g - S0[L])
        DQ0[L], P0[L] = R0[L] @ dq, R0[L] @ p
        W0[L], E0[L] = cab(L + "Hand"), cab(L + "ForeArm")
        POLO0[L] = polo(L, E0[L], W0[L], S0[L])
    print("COMEÇO | giro dos braços %.1f° (braço de %.1f° a %.1f° visto de cima) | vão entre as mãos %.1f mm | braço_plano %s | "
          "pegada %.2f × ombros | vão E (%.4f %.4f %.4f)" % (ARCO, PSI1["Left"] + ARCO, PSI1["Left"], vao_maos() * 1000,
                                                            "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                                                            tc.pegada_largura(jj)[0], *g0["Left"]), flush=True)

    # ── 7) eixo de cada braço da máquina: o ponto que leva o ombro do começo (escápulas soltas) pro ombro do fim (fechadas) com o
    #    giro do braço (−ARCO): o braço chega no fim igual ao planejado e o eixo fica na vertical do ombro, a poucos mm dele ─────────
    A = {}
    for L, s in LADOS:
        R = Matrix.Rotation(math.radians(s * ARCO), 2)        # o giro de abrir (−ARCO) visto de cima, do lado s
        M = Matrix.Identity(2) - R
        A[L] = M.inverted() @ (S1[L].to_2d() - R @ S0[L].to_2d())
    dist_eixo = {L: max((S0[L].to_2d() - A[L]).length, (S1[L].to_2d() - A[L]).length) * 1000 for L, _ in LADOS}

    # ── 8) a máquina em volta do corpo: eixos, pegadores onde as mãos fecham no começo, assento e encosto ─────────────────────────
    vd = e3.voador("voador", eixos={s: (A[L].x, A[L].y) for L, s in LADOS}, pegadores={s: tuple(g0[L]) for L, s in LADOS},
                   assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                   encosto=(y_face, ENCOSTO, z_baixo, alt_enc, LARG_ENCOSTO, ESP_ENCOSTO), tras=-1, fundo=FUNDO,
                   pegador=(COMP_PEGADOR, RAIO), queda=QUEDA)
    print("VOADOR | eixos E (%.4f %.4f) D (%.4f %.4f), a até %.1f/%.1f mm do ombro | cubo dos braços z %.3f | pegador E (%.4f %.4f "
          "%.4f) a %.3f m do eixo" % (A["Left"].x, A["Left"].y, A["Right"].x, A["Right"].y, dist_eixo["Left"], dist_eixo["Right"],
                                      vd.eixos[1].z, *g0["Left"], (g0["Left"].to_2d() - A["Left"]).length), flush=True)

    # previsão do cotovelo em cada quadro (mão presa no pegador, ombro andando com a escápula): a distância ombro → punho
    def cotovelo_previsto(L, s, t):
        Rm = Matrix.Rotation(math.radians(s * ARCO * t), 3, "Z")   # braço da máquina girado −ARCO·t
        Ax = Vector((A[L].x, A[L].y, 0.0))
        W = Ax + Rm @ (W0[L] - Ax)
        base = cab(L + "Shoulder")
        Rs = Matrix.Rotation(math.radians(s * RETRAI * escapula_do_quadro(t)), 3, "Z")
        Sx = base + Rs @ (S0[L] - base)
        d = (W - Sx).length
        return math.degrees(math.acos(max(-1.0, min(1.0, (d * d - Lb * Lb - La * La) / (2 * Lb * La))))), (Sx.to_2d() - A[L]).length

    for L, s in LADOS:
        print("PREVISÃO %s | t: cotovelo° (ombro × eixo mm) | %s" % (L, " ".join(
            "%.2f: %.1f (%.1f)" % (t, *[(v if k == 0 else v * 1000) for k, v in enumerate(cotovelo_previsto(L, s, t))])
            for t in np.linspace(0, 1, 11))), flush=True)

    # ── 9) a pose de cada quadro: escápulas, braços da máquina, e o braço chega na mão PRESA no pegador (IK) ───────────────────────
    bracos(ARCO)
    DOBRADO = {L: {p3.P + n: PB[p3.P + n].matrix_basis.copy() for n in (L + "Arm", L + "ForeArm")} for L, _ in LADOS}

    def pose(t):
        """t=0 braços na frente (as mãos perto uma da outra), escápulas soltas; t=1 braços abertos (as mãos na linha dos ombros),
        escápulas aproximadas."""
        escapulas(RETRAI * escapula_do_quadro(t))
        fi = -ARCO * t
        vd.girar(fi)
        for L, s in LADOS:
            Rm = Matrix.Rotation(math.radians(-s * fi), 3, "Z")
            g, _ = vd.pegada(s)
            for n, M in DOBRADO[L].items():                 # o IK parte do braço do começo
                PB[n].matrix_basis = M.copy()
            p3.atualizar()
            Sx = cab(L + "Arm")
            maos.segurar(L, g, Rm @ DQ0[L], Rm @ P0[L], polo=Sx + Rm @ (POLO0[L] - S0[L]))
            for n, M in DEDOS[L].items():                   # mão presa no pegador: os dedos e o polegar fechados no fim, iguais
                PB[n].matrix_basis = M.copy()
            p3.atualizar()

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        c, _ = vd.pegada(1)
        cot = []                                         # pra onde o cotovelo aponta (o lado de fora da dobra), visto de cima
        cima_t, lado_t, frente_t = (Vector(v) for v in tc.eixos_tronco(jj))
        for L, s in LADOS:
            sh, el, wr = (Vector(jj[L + n]) for n in ("Arm", "ForeArm", "Hand"))
            ax = (wr - sh).normalized()
            pt = (el - sh) - ax * (el - sh).dot(ax)
            cot.append(math.degrees(math.atan2(pt.dot(frente_t), pt.dot(-s * lado_t))))
        eixo = []
        for L, s in LADOS:
            e = vd.eixos[s]
            eixo.append(Vector((cab(L + "Arm").x - e.x, cab(L + "Arm").y - e.y)).length * 1000)
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm abaixo do ombro | ombro × eixo %.1f/%.1f mm | cotovelo "
                "%.1f/%.1f° aponta %s° (0 = pro lado, −90 = pra trás) | braço plano %s° elevação %s° | braço × horizontal %s° | "
                "antebraço × horizontal %s° | punho %.0f/%.0f° | palma × cima %s° | palma pro meio %s° | pegada %.2f | tronco %.1f° | "
                "escápula %s mm | %s" % (
                    vd.angulo, *c, (cab("LeftArm").z - c.z) * 1000, *eixo, jt["cotoveloE"], jt["cotoveloD"],
                    "/".join("%.0f" % v for v in cot), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.1f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "ForeArm"]})),
                    "/".join("%.1f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    jt["punhoE"], jt["punhoD"], "/".join("%.0f" % v for v in tc.palma_cima(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)), maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(vd.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, vd.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.1, 1.0),
                camera_video=((-2.4, yq + 2.9, 2.0), (0, yq - 0.15, 0.9), 50), info=info, apoios=vd.apoios,
                afunda_apoio_mm=20)
