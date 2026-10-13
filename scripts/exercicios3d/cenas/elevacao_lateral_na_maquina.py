# Elevação Lateral na Máquina — cena da fábrica 3D (lote 14, 12/10/2026). Máquina nova: equip3d.elevacao_lateral_maquina (sentado DE
# FRENTE pra máquina, com o peito na almofada; 2 braços da máquina, cada um girando em volta da reta de frente pra trás que passa pela
# articulação do ombro do mesmo lado, com o rolo estofado logo acima do cotovelo e o pegador na frente, onde a mão fecha).
# t = 0 braços ao lado do corpo, cotovelos dobrados a 90° com os antebraços pra frente, os rolos encostados por fora dos braços logo
# acima dos cotovelos e as mãos nos pegadores (pegada neutra, o polegar pra cima) · t = 1 braços na horizontal (paralelos ao chão), os
# rolos em cima deles, os antebraços ainda pra frente e as palmas viradas pro chão (os polegares um pro outro).
# Técnica: ExRx, Lever Lateral Raise: "Sit in machine. Situate bent arms between padded lever and sides of body. Grasp handles if
# available." / "Raise arms to sides until upper arms are horizontal. Return and repeat." / "If necessary, lean forward slightly to keep
# elbows directly lateral to body." ACE, Lateral Shoulder Raise (a máquina de placas): "Sit facing the machine with the feet out in
# front and arms slightly bent and the pads resting just above the elbows. Keeping the arms bent at 90 degrees, lift the pads upward by
# pressing out through the elbows and raising the upper arms. Slowly return to the starting position." NSCA (Lateral Raises, halteres):
# "Let arms hang to the sides to the thighs, and pull shoulder blades back and down" / "Maintain a constant head, body, and arm position
# throughout the entire lift". Coratella 2020, LR-flexed: "abduct laterally the humerus up to 90°, with the elbow flexed at 90° and the
# humerus neutrally rotated (i.e., thumb-to-thumb)". Ludewig 2009 (escápula e clavícula com o braço subindo): "Little clavicular
# elevation occurred during the raising of the arm in healthy subjects."
# Como o rig faz: sentado de frente pra máquina, o tronco TRONCO° pra frente com o peito na almofada (inclinada PEITO°, de FOLGA_COXA
# acima das coxas até TOPO_PEITO acima do ombro), coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão (o mesmo
# sentar do Crucifixo Invertido na Máquina). O braço ELEVA0° da vertical, pelo lado, o cotovelo a COTOVELO° com o antebraço pra frente
# (paralelo ao eixo da máquina) e a mão reta no antebraço, a palma virada pro corpo; a mão fecha no pegador (IK + dedos e polegar em
# volta dele, o polegar dando a volta) e o pegador fica ao longo da linha dos nós dos dedos. O rolo encosta no lado de fora do braço,
# H_ROLO acima do centro do cotovelo (a espuma afunda AFUNDA_ROLO na pele). No movimento o braço da máquina gira ARCO° (de ELEVA0° a
# ELEVA1°) em volta do eixo e a clavícula sobe CLAV° junto (o ombro anda ~8 mm, quase todo pra cima): o eixo de cada braço da máquina
# fica no ponto que leva o ombro do começo pro ombro do fim com o MESMO giro (a ~7 mm dos 2, ~5 mm no meio) e, quadro a quadro, a mão
# fica PRESA no pegador (dedos e polegar fechados uma vez, iguais em todos os quadros) e o braço chega nela pelo IK, com o cotovelo
# girando junto com o braço da máquina. Tronco, cabeça, quadril, pernas e pés não mexem.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
TRONCO = 5.0              # tronco 5° pra frente da vertical, o peito na almofada ("If necessary, lean forward slightly to keep elbows
                          # directly lateral to body", ExRx; "Sit facing the machine", ACE)
PEITO = 5.0               # almofada do peito 5° da vertical pro lado da máquina (paralela ao tronco)
ESP_PEITO, LARG_PEITO = 0.06, 0.24        # estofado de 60 mm; largura: os antebraços passam por fora dela (escolha da fábrica)
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.36    # estofado de 60 mm; largura: escolha da fábrica
PROF_ASSENTO = 0.34       # profundidade do assento (escolha da fábrica)
ENTRA_ASSENTO = 0.06      # o assento entra 6 cm embaixo da almofada do peito (como no Crucifixo Invertido na Máquina)
AFUNDA = 0.002            # pele afundando no estofado do assento e da almofada do peito
ABRE_COXA = 5.0           # coxas abertas 5° pra fora (juntas, as coxas se tocavam)
FOLGA_COXA = 0.035        # a almofada do peito começa 3,5 cm acima das coxas
TOPO_PEITO = 0.03         # a almofada do peito sobe até 3 cm acima da articulação do ombro (embaixo do queixo)
ELEVA0 = 15.0             # começo: braço 15° da vertical, pelo lado ("Situate bent arms between padded lever and sides of body", ExRx;
                          # "Let arms hang to the sides", NSCA) — o rolo afasta o cotovelo do corpo
ELEVA1 = 90.0             # fim: braço na horizontal ("Raise arms to sides until upper arms are horizontal", ExRx; "abduct laterally the
                          # humerus up to 90°", Coratella 2020)
COTOVELO = 90.0           # flexão do cotovelo, parada ("Keeping the arms bent at 90 degrees", ACE; "Situate bent arms", ExRx)
CLAV = 3.0                # a clavícula sobe 3° até o braço chegar na horizontal (Ludewig 2009: "elevation (an increase of 6°, from 11° to
                          # 17°)" no arco inteiro até o braço lá em cima; "Little clavicular elevation occurred during the raising of the
                          # arm in healthy subjects"); as escápulas não encolhem (NSCA: "pull shoulder blades back and down")
H_ROLO = 0.065            # centro do rolo 6,5 cm acima do centro do cotovelo, ao longo do braço ("the pads resting just above the elbows",
                          # ACE)
RAIO_ROLO, COMP_ROLO = 0.055, 0.22        # rolo de 11 cm × 22 cm (escolha da fábrica; "arm roller pads", Nautilus)
Y_ROLO = 0.0              # centro do rolo na linha do braço (de frente pra trás)
AFUNDA_ROLO = 0.002       # a espuma do rolo afunda isso na pele do braço
RAIO, COMP_PEGADOR = 0.0145, 0.13         # pegador de 29 mm (o cilindro da mão de referência) e 13 cm
FOLGA_CUBO = 0.045        # o braço da máquina (plano dos cubos) passa 4,5 cm na frente da frente da mão fechada
VIGA = 0.05               # seção da viga dos braços da máquina
FOLGA_PILHA = 0.05        # a torre da pilha fica do lado direito, na frente, com a face de dentro 5 cm pra fora do cotovelo direito em
                          # cima (fora do caminho do braço da máquina e sem tapar o corpo de frente; a HS-LR tem a torre na frente e de lado)
MAO = {L: tuple([L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]) for L, _ in LADOS}


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    Y = Vector((0.0, 1.0, 0.0))

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
    S0 = {L: cab(L + "Arm") for L, _ in LADOS}                # articulação do ombro no começo (clavícula parada)
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length

    # ── 2) almofada do peito (apoio): a face, inclinada PEITO° pro lado da máquina (−Y), encosta no peito (a pele afunda AFUNDA);
    #    começa FOLGA_COXA acima das coxas e sobe até TOPO_PEITO acima do ombro ────────────────────────────────────────────────────
    a_p = math.radians(PEITO)
    n_p = Vector((0.0, math.cos(a_p), math.sin(a_p)))         # normal da face da almofada (pro corpo, +Y)
    nn = np.array(n_p)
    z_topo = S0["Left"].z + TOPO_PEITO
    T = pele(("Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck", "LeftArm", "RightArm"))
    C = pele(("LeftUpLeg", "RightUpLeg"))
    y_peito = float(T[(np.abs(T[:, 0]) < LARG_PEITO / 2) & (T[:, 2] < z_topo)][:, 1].min())
    cx = C[(np.abs(C[:, 0]) < LARG_PEITO / 2 + 0.02) & (C[:, 1] < y_peito + 0.06) & (C[:, 1] > y_peito - 0.16)]
    z_baixo = float(cx[:, 2].max()) + FOLGA_COXA
    zona = T[(np.abs(T[:, 0]) < LARG_PEITO / 2) & (T[:, 2] > z_baixo) & (T[:, 2] < z_topo)]
    d_p = float((zona @ nn).min()) + AFUNDA                   # face da almofada: n·p = d_p
    contato = Vector(zona[(zona @ nn).argmin()])

    def y_da_face(z):
        return (d_p - z * math.sin(a_p)) / math.cos(a_p)

    y_face = y_da_face(z_baixo)
    alt_p = (z_topo - z_baixo) / math.cos(a_p)
    # assento: entra ENTRA_ASSENTO embaixo da almofada do peito e vai PROF_ASSENTO pra trás; o topo embaixo do glúteo (a pele mais
    # baixa no pedaço do assento afunda AFUNDA)
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    topo = float(G[:, 2].min()) + AFUNDA
    for _ in range(3):
        y_frente = y_da_face(topo) - ENTRA_ASSENTO
        y_tras = y_frente + PROF_ASSENTO
        Gs = G[(G[:, 1] > y_frente) & (G[:, 1] < y_tras) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2)]
        topo = float(Gs[:, 2].min()) + AFUNDA
    y_frente = y_da_face(topo) - ENTRA_ASSENTO
    y_tras = y_frente + PROF_ASSENTO
    PES = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    print("SENTADO | tronco %.1f° pra frente (repouso %.1f°) | quadril (%.4f %.4f %.4f) | ombros E (%.4f %.4f %.4f) D (%.4f %.4f "
          "%.4f) | assento topo %.4f, y %.3f → %.3f | glúteo atrás até y %.3f | peito: face y %.4f em z %.3f (encosta em (%.3f %.3f "
          "%.3f)), %.3f m até z %.3f | coxas embaixo até z %.3f | pontas dos pés y %.3f | braço %.4f antebraço %.4f m" % (
              math.degrees(math.atan2(-tt.y, tt.z)), frente_rep, *H, *S0["Left"], *S0["Right"], topo, y_frente, y_tras,
              float(G[:, 1].max()), y_face, z_baixo, *contato, alt_p, z_topo, z_baixo - FOLGA_COXA, float(PES[:, 1].min()), Lb, La),
          flush=True)

    # ── 3) clavículas: cada uma gira em volta da reta de frente pra trás que passa na base dela (+ = sobe) ─────────────────────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}

    def clavicula(graus):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        if graus:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * graus), 3, "Y"))

    clavicula(CLAV)
    S1 = {L: cab(L + "Arm") for L, _ in LADOS}
    clavicula(0.0)
    print("CLAVÍCULA | %.1f° pra cima: o ombro E anda (%.1f %.1f %.1f) mm, o D (%.1f %.1f %.1f) mm" % (
        CLAV, *((S1["Left"] - S0["Left"]) * 1000), *((S1["Right"] - S0["Right"]) * 1000)), flush=True)

    # ── 4) o braço no começo: braço ELEVA0° da vertical pelo lado (no plano de lado a lado), antebraço pra frente (cotovelo a 90°), mão
    #    reta no antebraço com a palma virada pro corpo (o lado de dentro do braço) ──────────────────────────────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    fr = Vector((0.0, -1.0, 0.0))

    def modelo(s, graus):
        """Braço (ombro → cotovelo), antebraço e palma (mundo) do lado s com o braço `graus` da vertical, pelo lado."""
        th = math.radians(graus)
        b = Vector((s * math.sin(th), 0.0, -math.cos(th)))
        fi = math.radians(COTOVELO)
        a = (b * math.cos(fi) + fr * math.sin(fi)).normalized()  # antebraço: dobra pra frente
        p = -Vector((s * math.cos(th), 0.0, math.sin(th)))        # palma: pro lado de dentro do braço (⟂ ao braço e ao antebraço)
        p = (p - a * p.dot(a)).normalized()
        return b, a, p

    def juntas(L, s, graus):
        b, a, p = modelo(s, graus)
        E = S0[L] + b * Lb
        return b, a, p, E, E + a * La

    def polo(E, W, S):
        eixo = (W - S).normalized()
        fora = (E - S) - eixo * (E - S).dot(eixo)
        return E + fora.normalized() * 0.4

    # referência: o vão da mão em relação ao punho, no referencial da mão (dedos, palma, dedos × palma)
    OFF = {}
    for L, s in LADOS:
        b, a, p, E, W = juntas(L, s, ELEVA0)
        maos.segurar(L, W + a * 0.08, a, p, polo=polo(E, W, S0[L]), zerar=True)
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.segurar(L, W + a * 0.08, a, p, polo=polo(E, W, S0[L]), zerar=True)
        off = (W + a * 0.08) - cab(L + "Hand")
        OFF[L] = (off.dot(a), off.dot(p), off.dot(a.cross(p)))
        print("REF %s | polo erro %.3f ang %d | vão − punho no referencial da mão (%.4f %.4f %.4f)" % (L, e[0], e[1], *OFF[L]),
              flush=True)

    # a mão no pegador no começo: o vão onde o punho fica no lugar do modelo; o pegador ao longo da linha dos nós dos dedos
    g0, u0, DQ0, P0, POLO0 = {}, {}, {}, {}, {}
    for L, s in LADOS:
        b, a, p, E, W = juntas(L, s, ELEVA0)
        o = OFF[L]
        g = W + a * o[0] + p * o[1] + a.cross(p) * o[2]
        maos.segurar(L, g, a, p, polo=polo(E, W, S0[L]), zerar=True)
        g0[L], DQ0[L], P0[L], POLO0[L] = g, a, p, polo(E, W, S0[L])
        u0[L] = pg._base(rig, L)[1]
        print("MÃO %s no começo | vão (%.4f %.4f %.4f) | pegador ao longo de (%.3f %.3f %.3f) | cotovelo fora do calculado %.1f mm | "
              "punho fora %.1f mm | %s" % (L, *g, *u0[L], (cab(L + "ForeArm") - E).length * 1000, (cab(L + "Hand") - W).length * 1000,
                                         maos.info()), flush=True)
    DEDOS = {}
    for L, s in LADOS:
        d = pg.fechar_em_volta(bon, L, g0[L], u0[L], RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, d), flush=True)

    # ── 5) eixo de cada braço da máquina: o ponto (no plano de lado a lado) que leva o ombro do começo pro ombro do fim (clavícula
    #    em cima) com o giro do braço (ARCO): o braço chega no fim igual ao começo, girado, e o eixo fica a poucos mm do ombro ───────
    ARCO = ELEVA1 - ELEVA0
    A = {}
    for L, s in LADOS:
        al = math.radians(-s * ARCO)                         # giro em volta do +Y: (x, z) → (x cos + z sen, −x sen + z cos)
        R = Matrix(((math.cos(al), math.sin(al)), (-math.sin(al), math.cos(al))))
        a0, a1 = Vector((S0[L].x, S0[L].z)), Vector((S1[L].x, S1[L].z))
        A[L] = (Matrix.Identity(2) - R).inverted() @ (a1 - R @ a0)
    dist_eixo = {L: max((Vector((S0[L].x, S0[L].z)) - A[L]).length, (Vector((S1[L].x, S1[L].z)) - A[L]).length) * 1000
                 for L, _ in LADOS}

    # ── 6) o rolo: eixo paralelo ao Y, H_ROLO acima do centro do cotovelo, encostado no lado de fora do braço (a espuma afunda
    #    AFUNDA_ROLO na pele do braço e do antebraço, a mais perto dele) ─────────────────────────────────────────────────────────────
    rolos = {}
    co, _, (nomes, dono) = _malha(bon)
    for L, s in LADOS:
        Ec = cab(L + "ForeArm")
        ab = Ec - S0[L]
        ab = Vector((ab.x, 0.0, ab.z)).normalized()            # ao longo do braço (no plano de lado a lado)
        lat = Vector((s * -ab.z, 0.0, s * ab.x))               # pra fora do braço (⟂ a ele, no plano de lado a lado)
        if lat.x * s < 0:
            lat = -lat
        Cr = Ec - ab * H_ROLO
        y_r = S0[L].y + Y_ROLO
        V = co[_grupo(nomes, dono, (L + "Arm", L + "ForeArm"))]
        V = V[np.abs(V[:, 1] - y_r) <= COMP_ROLO / 2]
        qa = (V - np.array(Cr)) @ np.array(ab)
        ql = (V - np.array(Cr)) @ np.array(lat)
        lo, hi = 0.0, 0.25
        for _ in range(40):                                    # o rolo sai de lado até a pele ficar a −AFUNDA_ROLO da espuma
            meio = (lo + hi) / 2
            if float(np.sqrt(qa ** 2 + (ql - meio) ** 2).min()) - RAIO_ROLO < -AFUNDA_ROLO:
                lo = meio
            else:
                hi = meio
        c_l = (lo + hi) / 2
        Rc = Vector((Cr.x, y_r, Cr.z)) + lat * c_l
        rolos[1 if L == "Left" else -1] = (Rc, COMP_ROLO, RAIO_ROLO)
        print("ROLO %s | centro (%.4f %.4f %.4f), %.1f mm pra fora da linha do braço, %.0f mm acima do centro do cotovelo" % (
            L, *Rc, c_l * 1000, H_ROLO * 1000), flush=True)

    # ── 7) a máquina em volta do corpo: eixos, plano dos cubos (na frente das mãos), rolos, pegadores, assento e almofada do peito ───
    M_ = co[_grupo(nomes, dono, MAO["Left"] + MAO["Right"])]
    y_cubo = float(M_[:, 1].min()) - FOLGA_CUBO - VIGA / 2
    y_col = min(y_cubo - 0.10 - 0.12, float(PES[:, 1].min()) - 0.10)
    x_pilha = A["Right"].x - Lb - FOLGA_PILHA - 0.16
    maq = e3.elevacao_lateral_maquina("elevacao_lateral", eixos={s: (A[L].x, A[L].y) for L, s in LADOS}, y_cubo=y_cubo,
                                      rolos=rolos, pegadores={s: (g0[L], u0[L]) for L, s in LADOS},
                                      assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                                      peito=(y_face, PEITO, z_baixo, alt_p, LARG_PEITO, ESP_PEITO), y_coluna=y_col,
                                      pegador=(COMP_PEGADOR, RAIO), viga=VIGA, x_pilha=x_pilha)
    print("MÁQUINA | eixos E (x %.4f z %.4f) D (x %.4f z %.4f), a até %.1f/%.1f mm do ombro (começo e fim) | plano dos cubos y %.3f | "
          "coluna y %.3f | pilha x %.3f | medidas %s" % (A["Left"].x, A["Left"].y, A["Right"].x, A["Right"].y, dist_eixo["Left"],
                                                       dist_eixo["Right"], y_cubo, y_col, x_pilha, maq.medidas), flush=True)

    # ── 8) a pose de cada quadro: clavícula, braços da máquina, e o braço chega na mão PRESA no pegador (IK) ─────────────────────────
    def eixo3(L, y):
        return Vector((A[L].x, y, A[L].y))

    def pose(t):
        """t=0 braços ao lado do corpo, t=1 braços na horizontal (a clavícula sobe CLAV° junto)."""
        clavicula(CLAV * t)
        fi = ARCO * t
        maq.girar(fi)
        for L, s in LADOS:
            Rm = Matrix.Rotation(math.radians(-s * fi), 3, "Y")
            g, _ = maq.pegada(s)
            Ax = eixo3(L, POLO0[L].y)
            maos.segurar(L, g, Rm @ DQ0[L], Rm @ P0[L], polo=Ax + Rm @ (POLO0[L] - Ax), zerar=True)
            for n, M in DEDOS[L].items():                   # mão presa no pegador: os dedos e o polegar fechados no começo, iguais
                PB[n].matrix_basis = M.copy()
            p3.atualizar()

    # posição do rolo no braço (no referencial do osso do braço) no começo: o rolo não pode escorregar
    pose(0.0)
    ROLO_NO_BRACO = {L: p3.mundo_osso(rig, L + "Arm").inverted() @ maq.rolo(s)[0] for L, s in LADOS}

    def rolo_x_pele(L, s, co, nomes, dono):
        """Menor distância (mm) da pele do braço e do antebraço até a espuma do rolo (− = a espuma afundou na pele)."""
        c, u = maq.rolo(s)
        V = co[_grupo(nomes, dono, (L + "Arm", L + "ForeArm", L + "Hand"))] - np.array(c)
        ax = V @ np.array(u)
        ok = np.abs(ax) <= COMP_ROLO / 2
        rad = np.linalg.norm(V[ok] - np.outer(ax[ok], np.array(u)), axis=1)
        return (float(rad.min()) - RAIO_ROLO) * 1000

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        eixo, rolo, desliza, ante = [], [], [], []
        for L, s in LADOS:
            S = cab(L + "Arm")
            eixo.append((Vector((S.x, S.z)) - A[L]).length * 1000)
            rolo.append(rolo_x_pele(L, s, co, nomes, dono))
            desliza.append((p3.mundo_osso(rig, L + "Arm").inverted() @ maq.rolo(s)[0] - ROLO_NO_BRACO[L]).length * 1000)
            f = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
            ante.append(math.degrees(f.angle(fr)))
        return ("braços da máquina %.1f° | ombro × eixo %.1f/%.1f mm | rolo × pele %.1f/%.1f mm, desliza no braço %.1f/%.1f mm | "
                "cotovelo %.1f/%.1f° | braço elevação %s° plano %s° | braço × horizontal %s° | antebraço × frente %s° | punho %.0f/%.0f° "
                "| palma pro meio %s° palma × cima %s° | tronco %.1f° | escápula %s mm | ombros nível %.1f° | %s" % (
                    maq.angulo, *eixo, *rolo, *desliza, jt["cotoveloE"], jt["cotoveloD"],
                    "/".join("%.1f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.1f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "ForeArm"]})),
                    "/".join("%.1f" % v for v in ante), jt["punhoE"], jt["punhoD"],
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), "/".join("%.0f" % v for v in tc.palma_cima(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)), tc.ombros_nivel(jj)[0], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(maq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, maq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.1, 1.0),
                camera_video=((1.9, yq + 3.0, 2.0), (0, yq - 0.1, 0.9), 50), info=info, apoios=maq.apoios,
                afunda_apoio_mm=20)
