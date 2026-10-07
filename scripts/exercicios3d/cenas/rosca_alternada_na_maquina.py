# Rosca Alternada na Máquina — cena da fábrica 3D (lote 5, 07/10/2026). A MESMA máquina da Rosca Scott na Máquina (equip3d.rosca_scott:
# almofada dos braços inclinada, assento, eixo nos cotovelos), com os 2 braços da alavanca INDEPENDENTES (independentes=True): cada
# braço gira sozinho e tem a sua manopla, sem a barra do meio (Panatta, Alternate Curling Machine: "the machine features a Scott bench
# to replicate the classic curl exercise"; "The independent levers also allow mono- and bilateral working."; TuffStuff PPL-920:
# "Unilateral arm movement, in which each lever arm moves independently").
# t = 0 braço direito em cima (cotovelo dobrado, o antebraço passando um pouco da vertical) e o esquerdo embaixo (quase esticado) ·
# t = 0,5 os dois embaixo · t = 1 esquerdo em cima e direito embaixo. O app toca 0 → 1 e volta 1 → 0: o direito desce, o esquerdo
# sobe; o esquerdo desce, o direito sobe — cada braço faz a repetição inteira (sobe e desce) enquanto o outro espera embaixo, esticado,
# como manda o ExRx (Lever Alternating Curl: "Raise lever on handle until elbow is fully flexed with back of upper arm remaining on
# pad. Lower handle until arm is fully extended. Repeat with opposite arm. Continue to alternate movement between sides."; o vídeo
# dele mostra um braço parado embaixo enquanto o outro sobe e desce) — o mesmo jeito da Rosca Alternada Inclinada com Halteres.
# Postura igual à da Rosca Scott na Máquina (a mesma máquina): ExRx, Lever Preacher Curl: "Sit on curl machine placing back of arms on
# pad. Grasp lever handles with underhand grip. Align elbows at same pivot point as fulcrum of lever."; ACE, Seated Biceps Curl:
# "Adjust the seat height until the middle of your elbows aligns with the axis of rotation (fulcrum) of the moving lever (part) of the
# machine." / "Grasp the handles firmly with a full grip (thumbs clasped around the handles) and maintain a neutral wrist position
# (wrists aligned with your forearms)." / "Your elbows should be extended, but not fully locked." / "Align your head with your spine,
# and depress and retract your scapulae" / "Continue curling the bar upwards until your elbows can flex (bend) no further." / "the
# backs of your forearms make light contact with the incline pad" / "This exercise can be performed unilaterally (one arm at a time)";
# eGym, M15 Bicep Curl: "Sit on the seat and lean your upper body forward so your upper arms rest on the pad." / "Keep your arms
# against the pad and your shoulders lowered."; Dr. Yessis, Preacher Curl: "Raise the bar at a moderate rate of speed until the
# forearms are vertical or slightly beyond." Ombro dobrado ~50° (Attarieh et al. 2025: "Preacher (PREA; shoulder flexed 50°)").
# Sem a barra do meio (que na Scott passava na frente do rosto e parava o antebraço 6° antes da vertical), aqui o antebraço vai até
# passar PASSA_VERTICAL° da vertical, se a mão e a manopla ficam FOLGA_CORPO longe da cabeça, do pescoço, dos ombros e do peito.
# Como o rig faz (o mesmo da Scott): em pé, as escápulas vão um pouco pra trás e pra baixo e a cabeça fica na linha do tronco; senta
# com o tronco INCLINA° pra frente, as coxas um pouco abertas e descendo DESCE_COXA° pro joelho, as canelas em pé e os pés chapados;
# cada braço vai FLEX_OMBRO° à frente do tronco e o eixo da alavanca passa pelos 2 cotovelos; a mão supinada fecha UMA vez na manopla
# do seu lado. No movimento só o cotovelo de um lado mexe por vez: o antebraço (com a mão fechada na manopla) e o braço da alavanca do
# mesmo lado giram o MESMO ângulo em volta do eixo — a mão não escorrega no pegador; o outro braço, o tronco e as pernas não mexem.
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
INCLINA = 3.0             # tronco quase em pé, um pouco pra frente (eGym M15: "lean your upper body forward so your upper arms rest on
                          # the pad"; Yessis: "Adjust the pad height so that you have a fairly erect position") — como na Scott
FLEX_OMBRO = 52.0         # braço × tronco: o ombro dobrado ~50° com o braço na almofada (Attarieh 2025: "shoulder flexed 50°"; Pedrosa
                          # 2023: 45°; Nunes 2020: 60°) — como na Scott
COT0 = 12.0               # flexão do cotovelo embaixo: quase esticado, sem travar (ACE: "extended, but not fully locked")
PASSA_VERTICAL = 3.0      # em cima o antebraço passa 3° da vertical (Yessis: "until the forearms are vertical or slightly beyond";
                          # ExRx: "until elbow is fully flexed"; Pedrosa 2023: "until 135° of elbow flexion (forearm perpendicular to
                          # the ground)"; Attarieh 2025: "10°–140° range of motion")
FOLGA_CORPO = 0.03        # em cima a mão e a manopla ficam a 3 cm ou mais da cabeça, do pescoço, dos ombros e do peito
CABECA = -2.0             # cabeça na linha do tronco (tecnica3d.cabeca_tronco; ACE: "Align your head with your spine")
CARREGA = 4.0             # o antebraço abre um pouco pra fora do plano do braço (ângulo de carregamento): mãos na largura dos ombros
ABRE_COXA = 8.0           # coxas abertas 8° pra fora: pés um pouco mais abertos que o quadril
DESCE_COXA = 8.0          # coxas descendo 8° do quadril pro joelho (o assento um pouco acima dos joelhos)
AFUNDA = 0.002            # pele afundando no estofado (assento e almofada)
RAIO = 0.016              # manopla de 32 mm (Titan Bicep Tricep Curl Machine: "Hand Grip Diameter: 32mm")
COMP_PEGADOR = 0.127      # manopla de 5" (Titan: "Handle Grip Length: 5-in. (each)")
ESP_ALMOFADA, LARG_ALMOFADA = 0.06, 0.54   # estofado de 60 mm (como na Scott); largura: escolha da fábrica
PASSA_MAX = 0.12          # a almofada passa até 12 cm do centro do cotovelo (ao longo dela), se o antebraço e as coxas deixam
ESP_ASSENTO, LARG_ASSENTO, PROF_ASSENTO = 0.06, 0.36, 0.34   # assento: escolha da fábrica
X_BRACO = 0.34            # plano dos braços da alavanca: por fora das mãos e da almofada
X_RECORTE = 0.16          # recorte do meio da almofada (|x| < X_RECORTE): o tronco fica nele, as abas ficam por baixo dos braços
GIRO_ALMOFADA = 10.0      # a face da almofada 10° mais deitada que o braço (o tríceps encosta em cima, o cotovelo fica um pouco acima)
RETRAI, DESCE = 4.0, 5.0  # escápulas pra trás e pra baixo (ACE: "depress and retract your scapulae"; eGym: "your shoulders lowered")
PUNHO = 0.0               # punho reto (ACE: "maintain a neutral wrist position (wrists aligned with your forearms)")
X = Vector((1.0, 0.0, 0.0))


def curl(t, lado):
    """Quanto o braço `lado` está dobrado no quadro t (0 = embaixo, 1 = em cima): o direito desce de t=0 a 0,5 e o esquerdo sobe de 0,5
    a 1 (como a Rosca Alternada Inclinada). Com o tempo da exportação (t = p3.suave(s) = (1 − cos πs)/2 no quadro s = k/NQ), o braço
    que mexe faz cos² πs: sai parado de cima, anda mais rápido no meio e para embaixo em s = 0,5, quando o outro sai — e o app volta em
    s = 0 e 1, em cima."""
    if lado == "Right":
        return (1 - 2 * t) ** 2 if t < 0.5 else 0.0
    return (2 * t - 1) ** 2 if t > 0.5 else 0.0


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na manopla (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)     # mão de referência da manopla de 32 mm
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (feito em pé, antes de sentar; como na Scott) ─────────────────────
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    ombro_antes = cab("LeftArm")
    for L, s in LADOS:
        p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro E andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (cab("LeftArm") - ombro_antes).dot(-frente0) * 1000, -(cab("LeftArm") - ombro_antes).dot(cima0) * 1000),
        flush=True)

    # ── 2) sentado: tronco INCLINA° pra frente (dobra no quadril), coxas quase na horizontal e um pouco abertas, canelas em pé, pés
    #    chapados ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    for n, M in repouso.items():
        PB[p3.P + n].matrix_basis = M.copy()
    p3.atualizar()
    p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=pivo0)
    for L, s in LADOS:
        h, k = cab(L + "UpLeg"), cab(L + "Leg")
        dc = math.radians(DESCE_COXA)
        alvo = Vector((s * math.sin(math.radians(ABRE_COXA)) * math.cos(dc), -math.cos(math.radians(ABRE_COXA)) * math.cos(dc),
                       -math.sin(dc)))
        p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(alvo).to_matrix())
        k, a = cab(L + "Leg"), cab(L + "Foot")
        p3.girar_osso(rig, L + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
        f = cab(L + "ToeBase") - cab(L + "Foot")           # a canela gira em volta dela mesma até o pé apontar como no repouso
        giro = math.atan2(f_rep[L].x, -f_rep[L].y) - math.atan2(f.x, -f.y)
        p3.girar_osso(rig, L + "Leg", Matrix.Rotation(giro, 3, (cab(L + "Foot") - cab(L + "Leg")).normalized()))
        F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
        p3.girar_osso(rig, L + "Foot", pe_rep[L] @ F.inverted())    # sola chapada, como em pé
    pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, -0.0005 - float(pes[:, 2].min()))))
    cab0 = tc.cabeca_tronco(ck.posicoes(rig))[0]          # cabeça na linha do tronco: o pescoço estende o que falta
    p3.girar_osso(rig, "Neck", Matrix.Rotation(math.radians(-(CABECA - cab0)), 3, "X"))
    print("CABEÇA | %.1f° → %.1f° (linha do tronco)" % (cab0, tc.cabeca_tronco(ck.posicoes(rig))[0]), flush=True)
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    tras_gluteo = float(G[G[:, 2] < H.z - 0.03][:, 1].max())
    y_tras = tras_gluteo + 0.02
    y_frente = y_tras - PROF_ASSENTO
    Gs = G[(G[:, 1] > y_frente) & (G[:, 1] < y_tras) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2)]
    topo = float(Gs[:, 2].min()) + AFUNDA
    pes = pele(("LeftToeBase", "RightToeBase"))
    y_dedos = float(pes[:, 1].min())
    jl = ck.posicoes(rig)
    print("SENTADO | inclina %.1f° | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f (glúteo até y %.3f) | dedos y %.3f | "
          "tronco %.1f° | quadril %s° | joelho %s°" % (
              INCLINA, *H, topo, y_frente, y_tras, tras_gluteo, y_dedos,
              math.degrees(math.atan2(math.hypot(*(jl["Neck"][:2] - jl["Hips"][:2])), jl["Neck"][2] - jl["Hips"][2])),
              "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("quadrilE", "quadrilD")),
              "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("joelhoE", "joelhoD"))), flush=True)

    # ── 3) braços: FLEX_OMBRO° à frente do tronco, no plano sagital dele (paralelos, na largura dos ombros); o cotovelo no fim ─────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    f_o = math.radians(FLEX_OMBRO)
    u_b = (-cima * math.cos(f_o) + frente * math.sin(f_o))
    u_b = Vector((0.0, u_b.y, u_b.z)).normalized()
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    E = {L: S[L] + u_b * Lb for L, _ in LADOS}
    ang_alm = math.degrees(math.atan2(-u_b.y, -u_b.z))           # braço × vertical
    n = Vector((0.0, -math.cos(math.radians(ang_alm)), math.sin(math.radians(ang_alm))))   # normal da face (pros braços)
    print("BRAÇOS | ombro E (%.4f %.4f %.4f) | braço %.4f antebraço %.4f | cotovelo E (%.4f %.4f %.4f), %.0f mm abaixo e %.0f mm à "
          "frente do ombro | braço a %.1f° da vertical" % (
              *S["Left"], Lb, La, *E["Left"], (S["Left"].z - E["Left"].z) * 1000, (S["Left"].y - E["Left"].y) * 1000, ang_alm),
          flush=True)

    # ── 4) a mão na manopla: vão − punho no referencial da mão (dedos, palma), como na Scott ──────────────────────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def antebraco(s, graus):
        """Direção do antebraço (cotovelo → punho) com o cotovelo dobrado `graus`: o braço girado em volta do X pro lado da flexão
        (pra cima), um pouco aberto pra fora (CARREGA)."""
        f = Matrix.Rotation(math.radians(-graus), 3, "X") @ u_b
        return (f * math.cos(math.radians(CARREGA)) + X * (s * math.sin(math.radians(CARREGA)))).normalized()

    def orientacao(f):
        """Dedos ao longo do antebraço sem a parte de lado (⟂ à manopla, que fica ao longo do X), PUNHO° de extensão; palma pro lado
        em que o antebraço dobra (pegada supinada)."""
        d = Vector((0.0, f.y, f.z)).normalized()
        dobra = Matrix.Rotation(-math.pi / 2, 3, "X") @ d     # pra onde o antebraço vai quando o cotovelo dobra
        p = math.radians(PUNHO)
        dq = (d * math.cos(p) - dobra * math.sin(p)).normalized()
        pq = (dobra - dq * dobra.dot(dq)).normalized()
        return dq, pq

    OFF = {}
    for L, s in LADOS:
        f_r = antebraco(s, 30.0)
        dq_r, pq_r = orientacao(f_r)
        g_r = E[L] + f_r * (La + 0.07)
        maos.segurar(L, g_r, dq_r, pq_r, polo=E[L] + (E[L] - (S[L] + g_r) / 2).normalized() * 0.4)
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    gs = {}
    for L, s in LADOS:
        f0 = antebraco(s, COT0)
        dq, pq = orientacao(f0)
        o = OFF[L]
        gs[L] = E[L] + f0 * La + dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]
    y_p = (gs["Left"].y + gs["Right"].y) / 2
    z_p = (gs["Left"].z + gs["Right"].z) / 2
    x_p = (gs["Left"].x - gs["Right"].x) / 2
    print("PEGADOR | centro das manoplas em x ±%.4f y %.4f z %.4f (E/D diferem %.1f mm) | %.0f mm do eixo" % (
        x_p, y_p, z_p, (gs["Left"] - Vector((-gs["Right"].x, gs["Right"].y, gs["Right"].z))).length * 1000,
        math.hypot(y_p - E["Left"].y, z_p - E["Left"].z) * 1000), flush=True)

    dedos = {}
    for L, s in LADOS:
        f0 = antebraco(s, COT0)
        dq, pq = orientacao(f0)
        g = Vector((s * x_p, y_p, z_p))
        W = E[L] + f0 * La
        polo = E[L] + (E[L] - (S[L] + W) / 2).normalized() * 0.4
        maos.segurar(L, g, dq, pq, polo=polo)
        maos.iks[L].mute = False
        p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.segurar(L, g, dq, pq, polo=polo)
    for L, s in LADOS:                                   # dedos e polegar fecham uma vez só: a mão não mexe na manopla
        dedos[L] = pg.fechar_em_volta(bon, L, Vector((s * x_p, y_p, z_p)), X, RAIO)
    Er = {L: cab(L + "ForeArm") for L, _ in LADOS}       # cotovelo de verdade (onde o IK pôs)
    ye, ze = (Er["Left"].y + Er["Right"].y) / 2, (Er["Left"].z + Er["Right"].z) / 2
    juntas0 = ck.medir_juntas(rig)
    print("MÃOS | %s | cotovelo %s° | cotovelo fora do calculado E %.1f D %.1f mm | polegar E %s | D %s" % (
        maos.info(), "/".join("%.1f" % juntas0[k] for k in ("cotoveloE", "cotoveloD")),
        (Er["Left"] - E["Left"]).length * 1000, (Er["Right"] - E["Right"]).length * 1000, dedos["Left"].get("Thumb"),
        dedos["Right"].get("Thumb")), flush=True)

    # ── 5) a almofada (a mesma conta da Scott): a face fica GIRO_ALMOFADA° mais deitada que o braço e encosta na parte de trás dos 2
    #    braços; vira um U — 2 abas por baixo dos braços (|x| > X_RECORTE), subindo até onde o tronco deixa, e a base inteira embaixo,
    #    com a barriga perto do fundo do recorte; a de baixo passa do cotovelo até perto do antebraço embaixo (ACE: "the backs of your
    #    forearms make light contact with the incline pad"), longe das coxas ───────────────────────────────────────────────────────
    co, _, (nomes, dono) = _malha(bon)
    Sm = Vector((0.0, (S["Left"].y + S["Right"].y) / 2, (S["Left"].z + S["Right"].z) / 2))
    b_ = math.radians(GIRO_ALMOFADA)
    u_f = (u_b * math.cos(b_) + n * math.sin(b_)).normalized()     # descendo pela face (mais deitada que o braço)
    n_f = (n * math.cos(b_) - u_b * math.sin(b_)).normalized()     # normal da face (pros braços)
    ang_face = ang_alm + GIRO_ALMOFADA
    rel = co - np.array(Sm)
    al = rel @ np.array(u_f)                              # ao longo da face, a partir dos ombros
    nn = rel @ np.array(n_f)                              # pra fora da face (pros braços)
    a_E = float((Vector((0.0, ye, ze)) - Sm).dot(u_f))    # o cotovelo ao longo da face
    ax = np.abs(co[:, 0])
    perto_x = np.abs(ax - S["Left"].x) < 0.045
    braco_v = _grupo(nomes, dono, ("LeftArm", "RightArm")) & perto_x
    ante_v = _grupo(nomes, dono, ("LeftForeArm", "RightForeArm")) & perto_x
    tronco_v = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "Head"))
    coxa_v = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")) & (ax < LARG_ALMOFADA / 2 + 0.02)
    na_placa = ax < LARG_ALMOFADA / 2 + 0.01
    a_top = 0.05

    def face(a0):
        """c da face (n_f·(p − Sm) = c) encostada na parte de trás dos braços de a0 até o cotovelo: a pele mais funda afunda AFUNDA."""
        m = (braco_v & (al > a0) & (al < a_E + 0.02)) | (ante_v & (al > a_E - 0.04) & (al < a_E + 0.02))
        return float(nn[m].min()) + AFUNDA

    for _ in range(40):                                   # a borda de cima das abas só desce: a face ajusta no braço que sobra
        c = face(a_top)
        w = c - nn                                        # profundidade dentro da almofada (0 = na face, + = dentro)
        dentro = tronco_v & na_placa & (w > 0.0) & (w < ESP_ALMOFADA + 0.016 + 0.008)   # estofado + chapa de aço + folga
        aba = dentro & (ax > X_RECORTE - 0.005)
        novo = max(0.04, float(al[aba].max()) + 0.004) if aba.any() else 0.04
        if novo <= a_top + 1e-4:
            break
        a_top = novo
    perna_aba = coxa_v & (ax > X_RECORTE - 0.01) & (w > -0.005) & (w < ESP_ALMOFADA + 0.015) & (al < a_E)
    if perna_aba.any():
        print("   ALERTA almofada: perna embaixo das abas, de a %.0f a %.0f mm (|x| %.3f–%.3f)" % (
            al[perna_aba].min() * 1000, al[perna_aba].max() * 1000, ax[perna_aba].min(), ax[perna_aba].max()), flush=True)
    a_base = max(a_top, float(al[dentro].max()) + 0.004) if dentro.any() else a_top
    afunda_ab = ante_v & (al > a_E) & (w > AFUNDA)
    perto_coxa = coxa_v & (al > a_E - 0.05) & (w > -0.02) & (w < ESP_ALMOFADA + 0.02)
    lim = [a_E + PASSA_MAX]
    if afunda_ab.any():
        lim.append(float(al[afunda_ab].min()) - 0.005)
    if perto_coxa.any():
        lim.append(float(al[perto_coxa].min()) - 0.01)
    a_fim = max(a_base + 0.06, min(lim))
    ka = int(np.argmax(np.where(aba, al, -1e9))) if aba.any() else -1
    kb = int(np.argmax(np.where(dentro, al, -1e9))) if dentro.any() else -1
    m_ab = ante_v & (al > a_E) & (al < a_fim)
    m_cx = coxa_v & (al > a_top - 0.02) & (al < a_fim + 0.02) & (w > -0.05) & ((ax > X_RECORTE - 0.01) | (al > a_base - 0.01))
    vao = [float((nn[braco_v & (np.abs(al - a) < 0.01)]).min() - c) * 1000 for a in (a_top + 0.01, (a_top + a_E) / 2, a_E - 0.02)]
    comp_alm = a_fim - a_top
    recorte = (X_RECORTE, a_base - a_top) if a_base > a_top + 0.01 else None
    Q = Sm + u_f * a_top + n_f * c                        # meio da borda de cima da face (n_f·(p − Sm) = c)
    print("ALMOFADA | face a %.1f° da vertical (%.0f° mais deitada que o braço) | abas até %.0f mm do ombro ao longo dela (%s) | base "
          "inteira desde %.0f mm (%s) | de baixo %.0f mm depois do cotovelo | comprimento %.3f m | face × braço: %s mm (perto da borda, "
          "meio, perto do cotovelo) | cotovelo %.0f mm acima da face | antebraço (t=0) %s mm da face | coxas %s mm atrás do estofado | "
          "topo da face (%.4f %.4f)" % (
              ang_face, GIRO_ALMOFADA, a_top * 1000, ("%s em (%.3f %.3f %.3f)" % (nomes[dono[ka]], *co[ka])) if ka >= 0 else "livre",
              a_base * 1000, ("%s em (%.3f %.3f %.3f)" % (nomes[dono[kb]], *co[kb])) if kb >= 0 else "livre", (a_fim - a_E) * 1000,
              comp_alm, "/".join("%.1f" % v for v in vao), (n_f.dot(Vector((0.0, ye, ze)) - Sm) - c) * 1000,
              ("%.1f" % (-w[m_ab].max() * 1000)) if m_ab.any() else "-",
              ("%.1f" % ((w[m_cx] - ESP_ALMOFADA).min() * 1000)) if m_cx.any() else "-", Q.y, Q.z), flush=True)

    # ── 5b) até onde o cotovelo dobra em cima: cada manopla é só do seu braço (sem a barra do meio passando na frente do rosto), então o
    #    antebraço vai até passar PASSA_VERTICAL° da vertical — se a mão e a manopla ficam FOLGA_CORPO longe da cabeça, do pescoço, dos
    #    ombros e do peito ───────────────────────────────────────────────────────────────────────────────────────────────────────────
    from mathutils.kdtree import KDTree
    co, _, (nomes, dono) = _malha(bon)
    corpo_v = co[_grupo(nomes, dono, ("Head", "Neck", "Spine2", "Spine1", "LeftShoulder", "RightShoulder"))]
    arv = KDTree(len(corpo_v))
    for i, v in enumerate(corpo_v):
        arv.insert(Vector(v), i)
    arv.balance()
    mao_v = {L: co[np.array([nm.startswith(L + "Hand") for nm in nomes] + [False])[dono]] for L, _ in LADOS}
    peg_v = {}                                            # pontos da manopla (superfície) de cada lado, na montagem
    for L, s in LADOS:
        xs = np.linspace(s * (x_p - COMP_PEGADOR / 2 - 0.012), s * (x_p + COMP_PEGADOR / 2), 12)
        angs = np.radians(np.arange(0, 360, 30))
        peg_v[L] = np.array([(x, y_p + (RAIO + 0.004) * math.cos(a), z_p + (RAIO + 0.004) * math.sin(a)) for x in xs for a in angs])
    COT1_MAX = 180.0 - ang_alm + PASSA_VERTICAL

    def folga_corpo(L, graus):
        """Menor distância (m) da pele da mão e da manopla do lado L até a cabeça, o pescoço, os ombros e o peito, com o cotovelo
        dobrado `graus` (o antebraço e a alavanca giram juntos em volta do eixo, a partir de COT0)."""
        a_ = math.radians(-(graus - COT0))
        R = np.array(((1, 0, 0), (0, math.cos(a_), -math.sin(a_)), (0, math.sin(a_), math.cos(a_))))
        cen = np.array((0.0, ye, ze))
        P = np.concatenate([mao_v[L], peg_v[L]])
        P = (P - cen) @ R.T + cen
        return min(arv.find(Vector(p))[2] for p in P[::2])

    COT1, limitado = {}, False
    for L, _ in LADOS:
        COT1[L] = COT0
        for g in list(np.arange(COT0, COT1_MAX, 0.5)) + [COT1_MAX]:
            if folga_corpo(L, g) < FOLGA_CORPO:
                limitado = True
                break
            COT1[L] = float(g)
    COT1 = min(COT1.values())                             # os 2 lados sobem o mesmo tanto
    print("TOPO | cotovelo até %.1f° (antebraço %.1f° além da vertical; %s) | mão e manopla a %.0f/%.0f mm da cabeça, pescoço, ombros "
          "e peito" % (COT1, ang_alm + COT1 - 180.0, "limitado pela folga do corpo" if limitado else "o máximo",
                       folga_corpo("Left", COT1) * 1000, folga_corpo("Right", COT1) * 1000), flush=True)

    # ── 6) a máquina em volta do corpo: os 2 braços da alavanca independentes, cada um com a sua manopla ──────────────────────────────
    mq = e3.rosca_scott("scott", eixo=(ye, ze), almofada=(Q.y, Q.z, ang_face, comp_alm, LARG_ALMOFADA, ESP_ALMOFADA), recorte=recorte,
                        assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                        pegadores=(y_p, z_p, x_p, COMP_PEGADOR, RAIO), x_braco=X_BRACO, independentes=True, lado=-1,
                        y_poste=y_dedos - 0.08)
    print("MÁQUINA | eixo (0 %.4f %.4f) | assento topo %.3f | almofada %.1f° × %.3f × %.2f m | pegador x ±%.3f, %.0f mm do eixo | "
          "poste y %.3f | braços independentes" % (ye, ze, topo, ang_face, comp_alm, LARG_ALMOFADA, x_p,
                                                  math.hypot(y_p - ye, z_p - ze) * 1000, y_dedos - 0.08), flush=True)

    # ── 7) pose: de cada lado, o antebraço (com a mão fechada na manopla) e o braço da alavanca giram o mesmo ângulo em volta do eixo
    #    dos cotovelos; um lado de cada vez (curl) ─────────────────────────────────────────────────────────────────────────────────────
    base_ab = {L: PB[p3.P + L + "ForeArm"].matrix_basis.copy() for L, _ in LADOS}

    def pose(t):
        """t=0 direito em cima e esquerdo embaixo, t=0,5 os dois embaixo, t=1 esquerdo em cima e direito embaixo."""
        for L, _ in LADOS:
            PB[p3.P + L + "ForeArm"].matrix_basis = base_ab[L].copy()
        p3.atualizar()
        for L, s in LADOS:
            g = (COT1 - COT0) * curl(t, L)
            if g:
                p3.girar_osso(rig, L + "ForeArm", Matrix.Rotation(math.radians(-g), 3, "X"), pivo=Er[L])
            mq.girar(g, lado=s)

    def mao_corpo():
        """Menor distância (mm) da pele de cada mão até a cabeça, o pescoço, os ombros e o peito."""
        co_, _, (nomes_, dono_) = _malha(bon)
        alvo_v = co_[_grupo(nomes_, dono_, ("Head", "Neck", "Spine2", "Spine1", "LeftShoulder", "RightShoulder"))]
        arv_ = KDTree(len(alvo_v))
        for i, v in enumerate(alvo_v):
            arv_.insert(Vector(v), i)
        arv_.balance()
        out = []
        for L, _ in LADOS:
            m = np.array([nm.startswith(L + "Hand") for nm in nomes_] + [False])[dono_]
            out.append(min(arv_.find(Vector(v))[2] for v in co_[m][::2]) * 1000)
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        eixo_mm = []
        for L, s in LADOS:
            M = mq.raizes["braco_esq" if s > 0 else "braco_dir"].matrix_world
            c0, ux = M.to_translation(), (M.to_3x3() @ X).normalized()
            v = cab(L + "ForeArm") - c0
            eixo_mm.append((v - ux * v.dot(ux)).length * 1000)
        return ("cotovelo %.1f/%.1f° | cotovelo × eixo %.1f/%.1f mm | alavanca E %.1f° D %.1f° | mão × cabeça/ombros %.0f/%.0f mm | "
                "antebraço × vertical %s° | braço × tronco %s° | abertura %s° | tronco %.1f° | coluna %.1f° | punho %s° | palma %s° | "
                "pegada %.2f | %s" % (
                    juntas["cotoveloE"], juntas["cotoveloD"], *eixo_mm, mq.angulos[1], mq.angulos[-1], *mao_corpo(),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0], maos.info()))

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.25, 0.8),
                camera_video=((3.0, yq - 2.5, 1.40), (0, yq - 0.25, 0.80), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
