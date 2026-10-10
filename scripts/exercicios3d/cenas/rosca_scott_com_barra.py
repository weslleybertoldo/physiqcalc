# Rosca Scott com Barra — cena da fábrica 3D (lote 8, 09/10/2026; um dos 61 novos: 0 usos nos treinos prontos, 3 como troca
# equivalente). Sem peça nova: o banco Scott livre da Rosca Scott com Halteres (equip3d.banco_scott, commitado no 551f181) e a barra
# curta de rosca (e3.barra, a mesma da Rosca Direta com Barra).
# t = 0 cotovelos quase esticados (~15°, sem travar), a parte de trás dos 2 braços na almofada e a barra embaixo, depois da borda de
# baixo dela · t = 1 cotovelos dobrados até o antebraço chegar perto da vertical, a barra em cima, na frente do rosto, sem chegar
# perto dele. O app faz a volta (desce até quase esticar de novo).
# Técnica (os 2 braços juntos, na barra reta):
#   • ExRx, Barbell Preacher Curl: "Sit on preacher bench placing back of arms on pad. Grasp curl bar with shoulder width underhand
#     grip." / "Raise bar until forearms are vertical. Lower barbell until arms are fully extended. Repeat." / "Seat should be adjusted
#     to allow armpit to rest near top of pad. Back of upper arm should remain on pad throughout movement." (a ExRx usa a "curl bar",
#     a barra W; aqui vai a barra reta — a W é peça do lote 13)
#   • Pinto et al. 2012 (JSCR, a revista da NSCA), a rosca Scott com barra dos 2 braços: "subjects were seated with both feet on the
#     floor. The height of the preacher curl bench was adjusted for each subject so the trunk was straight, whereas the back of the arm
#     and the axillae were rested on the pad." / "full (0° to 130° of elbow flexion – 0° full elbow extension) ROM"
#   • Nunes et al. 2020 (rosca Scott com barra): "participants were instructed to hold the straight handle (or the bar) with hands
#     supinated and shoulder-width apart"; NSCA (Achievable CSCS), Barbell biceps curl: "Grasp the bar with a closed, supinated grip
#     (shoulder-width)." / "Keep your torso and upper arms stationary."
#   • ACE, Seated Biceps Curl (a rosca Scott na máquina; o ACE não tem a de barra): "Your elbows should be extended, but not fully
#     locked." / "Grasp the handles firmly with a full grip (thumbs clasped around the handles) and maintain a neutral wrist position
#     (wrists aligned with your forearms)." / "Align your head with your spine, and depress and retract your scapulae"
#   • Yessis, Preacher Curl: "The arms should be fairly straight but have a slight bend in the elbows." / "Raise the bar at a moderate
#     rate of speed until the forearms are vertical or slightly beyond." / "Adjust the pad height so that you have a fairly erect
#     position." (ele também usa a barra W: "Hold an E-Z curl bar (or dumbbells)")
#   • Ombro dobrado ~50° com o braço na almofada (Oliveira et al. 2009: "right shoulder flexed at 50°"; Attarieh et al. 2025:
#     "Preacher (PREA; shoulder flexed 50°)").
# Como o rig faz: em pé, as escápulas vão um pouco pra trás e pra baixo e a cabeça fica na linha do tronco; senta com o tronco INCLINA° pra
# frente (o quadril dobra, a coluna fica reta), as coxas um pouco abertas e descendo DESCE_COXA° pro joelho, as canelas em pé e os pés
# chapados no chão; o assento fica embaixo do glúteo. Os 2 braços vão FLEX_OMBRO° à frente do tronco (no plano sagital dele, paralelos, na
# largura dos ombros) e ficam parados. Cada antebraço fica COT0° dobrado embaixo (um pouco aberto pra fora, o ângulo de carregamento), a
# mão supinada com o punho reto, as 2 mãos fechadas na barra (a barra no vão das 2 mãos, a pegada fecha uma vez só). A face da almofada,
# GIRO_ALMOFADA° mais deitada que o braço, encosta na parte de trás dos 2 braços (o tríceps afunda AFUNDA perto da borda de cima, que fica
# perto da axila) e tem o recorte do peito no meio (com o ombro dobrado ~50° o peito do boneco passa da frente da face entre os braços).
# Em cima o cotovelo dobra até o antebraço chegar o mais perto da vertical que a barra deixa: ela passa na frente do rosto e para a
# FOLGA_ROSTO dele (e do pescoço, do peito e do cabelo). No movimento só os cotovelos mexem: os 2 antebraços (com as mãos fechadas na barra)
# e a barra giram o MESMO ângulo em volta da reta que passa pelos 2 cotovelos — a mão não escorrega na barra; braços, tronco, quadril,
# pernas e pés não mexem.
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

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
INCLINA = 4.0             # tronco quase em pé, um pouco à frente, dobrando no quadril (Pinto 2012: "the trunk was straight"; Oliveira
                          # 2009: "trunk in vertical position"; Yessis: "a fairly erect position"); mais à frente o rosto chega na barra
FLEX_OMBRO = 50.0         # braço × tronco: o ombro dobrado 50° com os braços na almofada (Oliveira 2009; Attarieh 2025)
COT0, COT1_MAX = 15.0, 140.0   # flexão do cotovelo embaixo (quase esticado, sem travar) e o teto em cima; o de cima de verdade (COT1) é o
                          # que deixa o antebraço mais perto da vertical (ExRx: "Raise bar until forearms are vertical") com a barra
                          # FOLGA_ROSTO longe do rosto
FOLGA_ROSTO = 0.045       # em cima a barra fica a pelo menos 4,5 cm do rosto, do pescoço, do peito e do cabelo (como na Rosca Scott na
                          # Máquina: a pessoa não encosta a barra na cara)
CABECA = -2.0             # cabeça na linha do tronco (tecnica3d.cabeca_tronco; o boneco em pé mede ~−11°): ACE "Align your head with your
                          # spine"
CARREGA = 4.0             # o antebraço abre um pouco pra fora do plano do braço (ângulo de carregamento): mãos na largura dos ombros
ABRE_COXA = 8.0           # coxas abertas 8° pra fora (juntas, as coxas se tocavam)
DESCE_COXA = 15.0         # coxas descendo 15° do quadril pro joelho (o assento mais alto que os joelhos, como na Rosca Scott com Halteres):
                          # os joelhos ficam mais longe embaixo da almofada
AFUNDA = 0.002            # pele afundando no estofado (assento e almofada)
AFUNDA_ANTEBRACO = 0.005  # a almofada para antes do antebraço (embaixo, t=0) afundar mais que 5 mm nela (ACE: "the backs of your forearms
                          # make light contact with the incline pad")
AFUNDA_COXA = 0.008       # a frente do assento para onde a pele das coxas afundaria mais que 8 mm nele
RAIO = 0.0145             # eixo da barra de 29 mm (e3.barra): a mão de referência padrão da pegada3d (sem usar_cilindro)
COMPR_BARRA, R_ANILHA, L_ANILHA, PEGADA_BARRA = 1.25, 0.14, 0.035, 0.95   # a barra curta de rosca da Rosca Direta com Barra
ESP_ALMOFADA = 0.065      # estofado de 65 mm (Precor DBR0202: "Total thickness is 2.5 inches (65 mm)")
LARG_ALMOFADA = 0.59      # almofada de 23,25" (Titan Preacher Curl Bench V3: "Pad Dimensions 14-in x 23.25-in x 2-in.")
PASSA_MAX = 0.22          # a almofada passa até 22 cm do centro do cotovelo (ao longo dela), se os antebraços, a barra e as coxas deixam
ESP_ASSENTO = 0.05        # assento de 2" (Titan V3: "Bench Dimensions 11-in x 12-in x 2-in.")
LARG_ASSENTO, LARG_FRENTE, PROF_ASSENTO = 0.31, 0.20, 0.30   # 12" atrás, afinando pra frente (Precor: "tapered seat"); até 30 cm de fundo
X_RECORTE = 0.175         # recorte do meio da almofada (|x| < 17,5 cm): o peito e a barriga ficam nele, as abas por baixo dos braços
GIRO_ALMOFADA = 8.0       # a face da almofada 8° mais deitada que o braço: o tríceps (grosso) encosta em cima e o cotovelo chega perto
                          # embaixo
RETRAI, DESCE = 4.0, 5.0  # escápulas pra trás e pra baixo (graus de giro da clavícula; ACE: "depress and retract your scapulae")
PUNHO = 0.0               # punho reto (ACE: "maintain a neutral wrist position (wrists aligned with your forearms)")
X_GANCHO = 0.36           # ganchos da barra a 72 cm um do outro (Titan V3: "Rack Width 28.5-in."): entre as mãos e as travas
DESCE_GANCHO = 0.12       # o V dos ganchos (onde a barra descansa) 12 cm abaixo da barra embaixo (t=0): a barra passa por cima, sem encostar
ANG_TUBO = 20.0           # os tubos laterais descem 20° da vertical, da parte de baixo da almofada até o trilho do chão (como na Rosca Scott
                          # com Halteres: o tubo não atravessa a coxa na vista de 3/4)
X = Vector((1.0, 0.0, 0.0))


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _pontos_da_barra(barra, passo=0.01):
    """Pontos na superfície de todas as peças da barra (eixo, travas, miolos e anilhas), no mundo: o eixo só tem vértice nas pontas."""
    return np.concatenate([ck._amostras(*ck._avaliar_simples(o), passo) for o in barra.children if o.type == "MESH"])


def _menor(bvh, pts, lim):
    """Menor distância (m) dos pontos até a malha, até `lim` (mais longe = lim): a busca com teto é rápida."""
    m = lim
    for p in pts:
        r = bvh.find_nearest(Vector(p), lim)
        if r[0] is not None and r[3] < m:
            m = r[3]
    return m


def _com_sinal(bvh, pts, lim=0.5):
    """Menor distância com sinal dos pontos até a superfície fechada (− = dentro), até `lim`."""
    menor = lim
    for p in pts:
        v = Vector(p)
        loc, nor, _, d = bvh.find_nearest(v, lim)
        if loc is not None:
            menor = min(menor, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
    return menor


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos); barra de 29 mm = mão padrão
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (feito em pé, antes de sentar; como nas outras roscas Scott) ────
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

    # ── 2) sentado: tronco INCLINA° pra frente (dobra no quadril), coxas descendo e um pouco abertas, canelas em pé, pés chapados ─────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}

    def sentar(inclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), pivo=pivo0)
        for L, s in LADOS:
            h, k = cab(L + "UpLeg"), cab(L + "Leg")
            dc = math.radians(DESCE_COXA)
            alvo = Vector((s * math.sin(math.radians(ABRE_COXA)) * math.cos(dc), -math.cos(math.radians(ABRE_COXA)) * math.cos(dc),
                           -math.sin(dc)))
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

    sentar(INCLINA)
    cab0 = tc.cabeca_tronco(ck.posicoes(rig))[0]          # cabeça na linha do tronco: o pescoço estende o que falta
    p3.girar_osso(rig, "Neck", Matrix.Rotation(math.radians(-(CABECA - cab0)), 3, "X"))
    print("CABEÇA | %.1f° → %.1f° (linha do tronco)" % (cab0, tc.cabeca_tronco(ck.posicoes(rig))[0]), flush=True)
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    tras_gluteo = float(G[G[:, 2] < H.z - 0.03][:, 1].max())
    y_tras = tras_gluteo + 0.02
    # topo do assento: a pele mais baixa do glúteo (até 6 cm à frente das articulações do quadril, longe dos chanfros) afunda AFUNDA; a
    # frente vai até PROF_ASSENTO, parando onde a pele das coxas (que descem pro joelho) afundaria mais que AFUNDA_COXA nele
    Gg = G[(G[:, 1] > H.y - 0.06) & (G[:, 1] < y_tras - 0.02) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2 - 0.02)]
    topo = float(Gg[:, 2].min()) + AFUNDA
    fundo_coxa = G[(np.abs(G[:, 0]) < LARG_ASSENTO / 2) & (G[:, 2] < topo - AFUNDA_COXA)]
    y_frente = max(y_tras - PROF_ASSENTO, float(fundo_coxa[:, 1].max()) + 0.01 if len(fundo_coxa) else -9.0)
    pes = pele(("LeftToeBase", "RightToeBase"))
    y_dedos = float(pes[:, 1].min())
    jl = ck.posicoes(rig)
    print("SENTADO | inclina %.1f° | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f (glúteo até y %.3f) | dedos y %.3f | "
          "tronco %.1f° | quadril %s° | joelho %s°" % (
              INCLINA, *H, topo, y_frente, y_tras, tras_gluteo, y_dedos,
              math.degrees(math.atan2(math.hypot(*(jl["Neck"][:2] - jl["Hips"][:2])), jl["Neck"][2] - jl["Hips"][2])),
              "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("quadrilE", "quadrilD")),
              "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("joelhoE", "joelhoD"))), flush=True)

    # ── 3) braços: FLEX_OMBRO° à frente do tronco, no plano sagital dele (paralelos, na largura dos ombros); o cotovelo no fim ────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    f_o = math.radians(FLEX_OMBRO)
    u_b = (-cima * math.cos(f_o) + frente * math.sin(f_o))
    u_b = Vector((0.0, u_b.y, u_b.z)).normalized()
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    E = {L: S[L] + u_b * Lb for L, _ in LADOS}
    ang_alm = math.degrees(math.atan2(-u_b.y, -u_b.z))           # braço × vertical
    n = Vector((0.0, -math.cos(math.radians(ang_alm)), math.sin(math.radians(ang_alm))))   # ⟂ ao braço, pro lado da flexão
    print("BRAÇOS | ombro E (%.4f %.4f %.4f) | braço %.4f antebraço %.4f | cotovelo E (%.4f %.4f %.4f), %.0f mm abaixo e %.0f mm à "
          "frente do ombro | braço a %.1f° da vertical" % (
              *S["Left"], Lb, La, *E["Left"], (S["Left"].z - E["Left"].z) * 1000, (S["Left"].y - E["Left"].y) * 1000, ang_alm),
          flush=True)

    # ── 4) as 2 mãos na barra: vão − punho no referencial da mão (dedos, palma), como na Rosca Scott na Máquina; a barra no vão das 2 ───
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def antebraco(s, graus):
        """Direção do antebraço (cotovelo → punho) com o cotovelo dobrado `graus`: o braço girado em volta do X pro lado da flexão
        (pra cima), um pouco aberto pra fora (CARREGA)."""
        f = Matrix.Rotation(math.radians(-graus), 3, "X") @ u_b
        return (f * math.cos(math.radians(CARREGA)) + X * (s * math.sin(math.radians(CARREGA)))).normalized()

    def orientacao(f):
        """Dedos ao longo do antebraço sem a parte de lado (⟂ à barra, que fica ao longo do X), PUNHO° de extensão; palma pro lado
        em que o antebraço dobra (pegada supinada: ExRx "underhand grip")."""
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
    print("BARRA | mãos em x ±%.4f (vão a vão %.0f mm) | eixo da barra y %.4f z %.4f (E/D diferem %.1f mm) | %.0f mm do cotovelo" % (
        x_p, 2 * x_p * 1000, y_p, z_p, (gs["Left"] - Vector((-gs["Right"].x, gs["Right"].y, gs["Right"].z))).length * 1000,
        math.hypot(y_p - E["Left"].y, z_p - E["Left"].z) * 1000), flush=True)
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
    barra = e3.barra("barra", comprimento=COMPR_BARRA, raio_anilha=R_ANILHA, larg_anilha=L_ANILHA, pegada=PEGADA_BARRA)
    for o in barra.children:              # o eixo de 1,25 m em anéis (mesma forma e nomes): a checagem espalhava ~400 mil pontos nos
        if o.name == "barra_eixo":        # triângulos compridos dele (README: "passe a malha por equip3d._em_aneis(obj)")
            e3._em_aneis(o)
    barra.location = Vector((0.0, y_p, z_p))              # ao longo do X, no vão das 2 mãos
    p3.atualizar()
    dedos = {}
    for L, s in LADOS:                                   # dedos e polegar fecham uma vez só: a mão não mexe na barra
        dedos[L] = pg.fechar_em_volta(bon, L, Vector((s * x_p, y_p, z_p)), X, RAIO)
    Er = {L: cab(L + "ForeArm") for L, _ in LADOS}       # cotovelos de verdade (onde o IK pôs)
    juntas0 = ck.medir_juntas(rig)
    print("MÃOS | %s | cotovelo %s° | cotovelo fora do calculado E %.1f D %.1f mm | cotovelos E/D diferem %.1f mm (y/z) | polegar E %s | "
          "D %s" % (maos.info(), "/".join("%.1f" % juntas0[k] for k in ("cotoveloE", "cotoveloD")),
                    (Er["Left"] - E["Left"]).length * 1000, (Er["Right"] - E["Right"]).length * 1000,
                    math.hypot(Er["Left"].y - Er["Right"].y, Er["Left"].z - Er["Right"].z) * 1000, dedos["Left"].get("Thumb"),
                    dedos["Right"].get("Thumb")), flush=True)

    # ── 5) a almofada: a face fica GIRO_ALMOFADA° mais deitada que o braço e encosta na parte de trás dos 2 braços (o tríceps em cima,
    #    perto da borda, e o cotovelo mais perto dela embaixo; a pele mais funda afunda AFUNDA). Com o ombro dobrado ~50° o peito do
    #    boneco passa da frente da face entre os braços: ela vira um U — 2 abas por baixo dos braços (|x| > X_RECORTE), subindo até onde
    #    o tronco deixa (perto da axila), e a base inteira embaixo; a de baixo passa do cotovelo o quanto os antebraços (embaixo), as
    #    coxas e os joelhos (embaixo dela) e a barra (depois da borda de baixo) deixam (o mesmo jeito da Rosca Scott com Halteres) ─────
    co, _, (nomes, dono) = _malha(bon)
    Sm = Vector((0.0, (S["Left"].y + S["Right"].y) / 2, (S["Left"].z + S["Right"].z) / 2))
    b_ = math.radians(GIRO_ALMOFADA)
    u_f = (u_b * math.cos(b_) + n * math.sin(b_)).normalized()     # descendo pela face (mais deitada que o braço)
    n_f = (n * math.cos(b_) - u_b * math.sin(b_)).normalized()     # normal da face (pros braços)
    ang_face = ang_alm + GIRO_ALMOFADA
    rel = co - np.array(Sm)
    al = rel @ np.array(u_f)                              # ao longo da face, a partir dos ombros
    nn = rel @ np.array(n_f)                              # pra fora da face (pros braços)
    ye, ze = (Er["Left"].y + Er["Right"].y) / 2, (Er["Left"].z + Er["Right"].z) / 2
    a_E = float((Vector((0.0, ye, ze)) - Sm).dot(u_f))    # o cotovelo ao longo da face
    ax = np.abs(co[:, 0])
    perto_x = np.abs(ax - S["Left"].x) < 0.045
    braco_v = _grupo(nomes, dono, ("LeftArm", "RightArm")) & perto_x & (ax > X_RECORTE + 0.015)   # em cima das abas (fora do recorte)
    ante_v = _grupo(nomes, dono, ("LeftForeArm", "RightForeArm")) & perto_x
    tronco_v = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "Head"))
    coxa_v = _grupo(nomes, dono, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")) & (ax < LARG_ALMOFADA / 2 + 0.02)
    na_placa = ax < LARG_ALMOFADA / 2 + 0.01
    a_top = 0.05

    def face(a0):
        """c da face (n_f·(p − Sm) = c) encostada na parte de trás dos braços de a0 até o cotovelo: a pele mais funda afunda AFUNDA."""
        m = (braco_v & (al > a0 + 0.012) & (al < a_E + 0.02)) | (ante_v & (al > a_E - 0.04) & (al < a_E + 0.02))   # fora do chanfro
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
    a_base = max(a_top, float(al[dentro].max()) + 0.004) if dentro.any() else a_top
    # a de baixo: até PASSA_MAX depois do cotovelo, parando antes dos antebraços afundarem mais que AFUNDA_ANTEBRACO, 1 cm antes das
    # coxas e dos joelhos chegarem a 2 cm da chapa e 2 cm antes da barra (embaixo, t=0; só o pedaço na largura da almofada) chegar perto
    # da face
    afunda_ab = ante_v & (al > a_E) & (w > AFUNDA_ANTEBRACO)
    perto_coxa = coxa_v & (al > a_E - 0.05) & (w > -0.02) & (w < ESP_ALMOFADA + 0.016 + 0.02)   # 2 cm atrás da chapa
    bv = _pontos_da_barra(barra, 0.01)
    bv_alm = bv[np.abs(bv[:, 0]) < LARG_ALMOFADA / 2 + 0.02]
    b_al = (bv_alm - np.array(Sm)) @ np.array(u_f)
    b_w = c - (bv_alm - np.array(Sm)) @ np.array(n_f)
    perto_barra = b_w > -0.03                              # barra a menos de 3 cm da face (ou abaixo dela)
    lim = [a_E + PASSA_MAX]
    if afunda_ab.any():
        lim.append(float(al[afunda_ab].min()) - 0.005)
    if perto_coxa.any():
        lim.append(float(al[perto_coxa].min()) - 0.01)
    if perto_barra.any():
        lim.append(float(b_al[perto_barra].min()) - 0.02)
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
          "inteira desde %.0f mm (%s) | de baixo %.0f mm depois do cotovelo (limites: %s) | comprimento %.3f m | face × braço: %s mm "
          "(perto da borda, meio, perto do cotovelo) | cotovelo %.0f mm acima da face | antebraços (t=0) %s mm da face | coxas %s mm "
          "atrás do estofado | barra (t=0) a %.1f mm da face, começando %.0f mm depois do cotovelo | topo da face (%.4f %.4f)" % (
              ang_face, GIRO_ALMOFADA, a_top * 1000, ("%s em (%.3f %.3f %.3f)" % (nomes[dono[ka]], *co[ka])) if ka >= 0 else "livre",
              a_base * 1000, ("%s em (%.3f %.3f %.3f)" % (nomes[dono[kb]], *co[kb])) if kb >= 0 else "livre", (a_fim - a_E) * 1000,
              "/".join("%.0f" % ((x - a_E) * 1000) for x in lim), comp_alm, "/".join("%.1f" % v for v in vao),
              (n_f.dot(Vector((0.0, ye, ze)) - Sm) - c) * 1000,
              ("%.1f" % (-w[m_ab].max() * 1000)) if m_ab.any() else "-",
              ("%.1f" % ((w[m_cx] - ESP_ALMOFADA).min() * 1000)) if m_cx.any() else "-",
              -b_w.max() * 1000, (float(b_al.min()) - a_E) * 1000, Q.y, Q.z), flush=True)

    # ── 6) até onde o cotovelo dobra: o antebraço até a vertical (ExRx), sem a barra chegar a FOLGA_ROSTO do rosto, do pescoço, do
    #    peito, dos ombros e do cabelo (nem passar de COT1_MAX) ────────────────────────────────────────────────────────────────────────
    co, tri, (nomes, dono) = _malha(bon)
    mexem = tuple(L + nm for L, _ in LADOS for nm in ("ForeArm", "Hand")) + tuple(
        "%sHand%s%d" % (L, d, i) for L, _ in LADOS for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3))
    fixo = ~_grupo(nomes, dono, mexem)
    t_fixo = tri[fixo[tri].all(axis=1)]
    bvh_corpo = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in t_fixo], all_triangles=True)
    bvh_cabelo = ck._bvh(*ck._avaliar_simples(bon.cabelo))
    eixo_cot = (Er["Left"] - Er["Right"]).normalized()   # reta dos 2 cotovelos: os antebraços e a barra giram em volta dela
    P0 = Er["Left"]
    bv0 = bv[(np.abs(bv[:, 0]) < 0.45)][::3]              # o eixo até perto das travas (as anilhas ficam 30 cm pro lado da cabeça)
    f_esq = antebraco(1, COT0)                            # o antebraço esquerdo embaixo (o direito é o espelho dele)

    def girado(graus):
        R = np.array(Matrix.Rotation(math.radians(-(graus - COT0)), 3, eixo_cot))
        return (bv0 - np.array(P0)) @ R.T + np.array(P0)

    def folga_barra(graus):
        pts = girado(graus)
        corpo = _menor(bvh_corpo, pts, 0.15)
        cabelo = _menor(bvh_cabelo, pts, 0.15)
        return min(corpo, cabelo), corpo, cabelo

    def antebraco_vertical(graus):
        f = Matrix.Rotation(math.radians(-(graus - COT0)), 3, eixo_cot) @ f_esq
        a_ = math.degrees(f.angle(Vector((0.0, 0.0, 1.0))))
        return a_

    COT1, melhor, limite = COT0, 1e9, "o antebraço na vertical"
    for g in np.arange(COT0, COT1_MAX + 0.01, 0.5):
        if g > 60.0 and folga_barra(g)[0] < FOLGA_ROSTO:   # embaixo a barra fica longe do corpo (a folga das pernas sai no info)
            limite = "a barra a %.0f mm do rosto" % (FOLGA_ROSTO * 1000)
            break
        v = antebraco_vertical(g)
        if v < melhor:
            COT1, melhor = float(g), v
    fb = folga_barra(COT1)
    print("TOPO | cotovelo até %.1f° (antebraço %.1f° da vertical; limite: %s) | barra a %.0f mm do corpo e %.0f mm do cabelo em cima" % (
        COT1, antebraco_vertical(COT1), limite, fb[1] * 1000, fb[2] * 1000), flush=True)

    # ── 7) o banco Scott em volta do corpo (os ganchos da barra embaixo dela, entre as mãos e as travas) ────────────────────────────
    z_gancho = z_p - DESCE_GANCHO
    bs = e3.banco_scott("banco_scott", almofada=(Q.y, Q.z, ang_face, comp_alm, LARG_ALMOFADA, ESP_ALMOFADA), recorte=recorte,
                        assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO, LARG_FRENTE), y_frente=y_dedos - 0.12,
                        s_tubo=comp_alm - 0.05, ang_tubo=ANG_TUBO, suporte=(y_p, z_gancho), x_suporte=X_GANCHO, raio_barra=RAIO)
    print("BANCO | assento topo %.3f | almofada %.1f° × %.3f × %.2f m (recorte %s) | frente da base y %.3f | ganchos em "
          "(±%.2f %.3f %.3f)" % (topo, ang_face, comp_alm, LARG_ALMOFADA, recorte, y_dedos - 0.12, X_GANCHO, y_p, z_gancho), flush=True)

    # ── 8) pose: os 2 antebraços (com as mãos fechadas na barra) e a barra giram o mesmo ângulo em volta da reta dos cotovelos ───────
    base_ab = {L: PB[p3.P + L + "ForeArm"].matrix_basis.copy() for L, _ in LADOS}
    M_barra = barra.matrix_world.copy()

    def pose(t):
        """t=0 cotovelos quase esticados (barra embaixo), t=1 antebraços perto da vertical (barra em cima, na frente do rosto)."""
        g = p3.lerp(COT0, COT1, t) - COT0
        for L, _ in LADOS:
            PB[p3.P + L + "ForeArm"].matrix_basis = base_ab[L].copy()
        p3.atualizar()
        R = Matrix.Rotation(math.radians(-g), 3, eixo_cot)
        for L, _ in LADOS:
            p3.girar_osso(rig, L + "ForeArm", R, pivo=Er[L])
        barra.matrix_world = Matrix.Translation(P0) @ R.to_4x4() @ Matrix.Translation(-P0) @ M_barra
        p3.atualizar()

    def _bvh(vs, ts):
        return BVHTree.FromPolygons([tuple(p) for p in vs], [tuple(t) for t in ts], all_triangles=True)

    pecas_barra = {o.name: o for o in barra.children if o.type == "MESH"}
    # pontos da barra no referencial dela (t=0): o eixo amostrado a cada 1 cm e os vértices das travas, miolos e anilhas
    pts_loc = np.concatenate([ck._amostras(*ck._avaliar_simples(pecas_barra["barra_eixo"]), 0.01)] + [
        ck._avaliar_simples(o)[0] for nm, o in pecas_barra.items() if nm != "barra_eixo"])
    M0i = np.array(M_barra.inverted())
    pts_loc = pts_loc @ M0i[:3, :3].T + M0i[:3, 3]

    def folgas_extra():
        """Folgas medidas à parte (mm, até 300): barra × pernas, × antebraços e × rosto/pescoço (a checagem ignora o que fica DENTRO
        da mão); mão × eixo da barra fora da pegada (a pele a mais de 3,5 cm do meio da mão, ao longo da barra); mãos × travas, miolos e
        anilhas; mãos × almofada; mãos × estrutura do banco."""
        co_, tri_, (nomes_, dono_) = _malha(bon)
        Mb = np.array(barra.matrix_world)
        pts_b = pts_loc @ Mb[:3, :3].T + Mb[:3, 3]
        out = {}
        for chave, partes in (("pernas", ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")), ("antebracos", ("LeftForeArm", "RightForeArm")),
                              ("rosto", ("Head", "Neck"))):
            m = _grupo(nomes_, dono_, partes)
            b = _bvh(co_, tri_[m[tri_].all(axis=1)])
            out[chave] = _menor(b, pts_b[::2], 0.30) * 1000
        M = barra.matrix_world
        c0, ux = np.array(M.to_translation()), np.array((M.to_3x3() @ X).normalized())
        fora, travas, anel = [], [], []
        mao_pts = {}
        for L, s in LADOS:
            mv = co_[np.array([nm.startswith(L + "Hand") for nm in nomes_] + [False])[dono_]]
            mao_pts[L] = mv
            d = mv - c0
            a = d @ ux
            rad = np.linalg.norm(d - np.outer(a, ux), axis=1) - RAIO
            a_c = float(np.median(a[rad < 0.01])) if (rad < 0.01).any() else s * x_p
            longe = np.abs(a - a_c) > 0.035                # as beiradas da mão (lado do indicador e do mínimo)
            fora.append(float(rad[longe].min()) * 1000 if longe.any() else 9e3)
            tv = [ck._avaliar_simples(pecas_barra["barra_%s%+d" % (k, s)]) for k in ("trava", "anilha", "miolo")]
            travas.append(min(_com_sinal(_bvh(*t), mv[::2]) for t in tv) * 1000)
        alm = [_bvh(*ck._avaliar_simples(o)) for o in bs.raizes["almofada"].children_recursive if o.type == "MESH"]
        est = [_bvh(*ck._avaliar_simples(o)) for o in bs.raizes["estrutura"].children_recursive if o.type == "MESH"]
        for L, _ in LADOS:
            anel.append((min(_com_sinal(b, mao_pts[L][::2]) for b in alm) * 1000, min(_com_sinal(b, mao_pts[L][::2]) for b in est) * 1000))
        out.update(fora=fora, travas=travas, alm=[a for a, _ in anel], est=[e for _, e in anel])
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        bc = barra.matrix_world.to_translation()
        f = folgas_extra()
        return ("cotovelo %.1f/%.1f° | antebraço %s° da vertical | barra %.0f mm acima e %.0f mm à frente dos ombros | barra × pernas %.0f mm, "
                "× antebraços %.0f mm, × rosto/pescoço %.0f mm | mão × barra fora da pegada E %.1f D %.1f mm | mão × travas/anilhas E %.0f "
                "D %.0f mm | mãos × almofada E %.0f D %.0f mm | mãos × estrutura do banco E %.0f D %.0f mm | braço × tronco %s° | abertura "
                "%s° | tronco %.1f° | coluna %.1f° | cabeça %.1f° | punho %s° | desvio do punho %s° | palma %s° | pegada %.2f | %s" % (
                    juntas["cotoveloE"], juntas["cotoveloD"], "/".join("%.1f" % v for v in tc.antebraco_vertical(jj)),
                    (bc.z - Sm.z) * 1000, (Sm.y - bc.y) * 1000, f["pernas"], f["antebracos"], f["rosto"], *f["fora"], *f["travas"],
                    *f["alm"], *f["est"], "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    tc.pegada_largura(jj)[0], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(barra, raio=RAIO, meio_compr=COMPR_BARRA / 2)
    yq = float(H.y)
    return Cena(pose, [barra] + bs.equipamentos, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, yq - 0.25, 0.8),
                camera_video=((2.6, yq - 2.6, 1.30), (0, yq - 0.25, 0.80), 50), info=info, apoios=bs.apoios,
                afunda_apoio_mm=20)
