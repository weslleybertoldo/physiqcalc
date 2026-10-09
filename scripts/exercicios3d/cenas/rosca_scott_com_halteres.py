# Rosca Scott com Halteres — cena da fábrica 3D (lote 8, 09/10/2026; exercício dos treinos prontos do app). Peça nova: equip3d.banco_scott
# (banco Scott livre: assento afinando pra frente, almofada dos braços inclinada com o recorte do peito, tubos laterais, base e os ganchos
# da barra) — o mesmo banco serve à Rosca Scott com Barra.
# t = 0 braço direito quase esticado (~15°, sem travar) na almofada, o halter embaixo, depois da borda de baixo dela · t = 1 cotovelo
# dobrado até o antebraço ficar na vertical, o halter em cima, na frente do ombro. O app faz a volta (desce até quase esticar de novo).
# Técnica (UM braço por vez, o direito — o do estudo da dica; a outra mão descansa na almofada):
#   • ExRx, Dumbbell Preacher Curl: "Grasp dumbbell and sit on preacher bench. With arm bent and palm facing shoulder, place back of arm
#     down on pad." / "Lower dumbbell until arm is fully extended. Raise dumbbell until forearm is vertical. Repeat. Continue with opposite
#     arm." / "Seat should be adjusted to allow armpit to rest near top of pad. Back of upper arm should remain on pad throughout movement."
#   • Oliveira et al. 2009 (o estudo da dica): "IDC – seated with trunk in vertical position and right shoulder flexed at 50°" (a sigla
#     saiu "IDC" por engano no texto: a figura 1 e a introdução — "in DPC the shoulder is flexed" — mostram que é a rosca Scott, a DPC).
#   • ACE, Seated Biceps Curl (a rosca Scott na máquina; o ACE não tem a de halter): "Your elbows should be extended, but not fully
#     locked." / "Grasp the handles firmly with a full grip (thumbs clasped around the handles) and maintain a neutral wrist position
#     (wrists aligned with your forearms)." / "Align your head with your spine, and depress and retract your scapulae" / "This exercise can
#     be performed unilaterally (one arm at a time)"; a dica do catálogo: "desça até quase estender e suba sem tirar o braço do apoio".
# Como o rig faz: em pé, as escápulas vão um pouco pra trás e pra baixo e a cabeça fica na linha do tronco; senta com o tronco INCLINA° pra
# frente (o quadril dobra, a coluna fica reta), as coxas um pouco abertas e descendo DESCE_COXA° pro joelho, as canelas em pé e os pés
# chapados no chão; o assento fica embaixo do glúteo. Os 2 braços vão FLEX_OMBRO° à frente do tronco (no plano sagital dele, paralelos, na
# largura dos ombros) e ficam parados. O direito: antebraço COT0° dobrado embaixo (um pouco aberto pra fora, o ângulo de carregamento),
# a mão supinada com o punho reto no halter (o halter no vão da mão, a pegada fecha uma vez só). O esquerdo descansa: a mesma posição do
# direito embaixo, com a mão solta (palma pra baixo, o punho caindo um pouco) depois da borda de baixo da almofada — no vídeo da ExRx o
# outro braço fica deitado de través em cima da almofada, mas aqui o meio da borda de cima é o recorte (o peito fica nele). A face da
# almofada, GIRO_ALMOFADA° mais deitada que o braço, encosta na parte de trás dos 2 braços (o tríceps afunda AFUNDA perto da borda de cima,
# que fica perto da axila) e tem o recorte do peito no meio (com o ombro dobrado ~50° o peito do boneco passa da frente da face entre os
# braços: a borda de cima inteira entraria nele). Em cima o cotovelo dobra até o antebraço ficar na vertical (ExRx), sem o halter chegar
# a FOLGA_HALTER do rosto, do pescoço e do peito. No movimento só o cotovelo direito mexe: o antebraço (com a mão fechada no halter) e o
# halter giram o MESMO ângulo em volta do eixo do cotovelo; braços, tronco, quadril, pernas e pés não mexem.
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
TRABALHA, S_T = "Right", -1               # o braço que trabalha (o direito, −X; Oliveira 2009: "right shoulder flexed at 50°")
LIVRE = "Left"
INCLINA = 8.0             # tronco um pouco à frente, dobrando no quadril (Oliveira 2009: "trunk in vertical position"; Yessis: "a fairly
                          # erect position"; no vídeo da ExRx o tronco vai mais à frente, apoiado na almofada)
FLEX_OMBRO = 50.0         # braço × tronco: o ombro dobrado 50° com o braço na almofada (Oliveira 2009: "right shoulder flexed at 50°")
COT0, COT1_MAX = 15.0, 140.0   # flexão do cotovelo embaixo (quase esticado, sem travar) e o teto em cima; o de cima de verdade (COT1) é o
                          # que deixa o antebraço na vertical (ExRx: "Raise dumbbell until forearm is vertical"), se o halter deixa
FOLGA_HALTER = 0.04       # em cima o halter fica a pelo menos 4 cm do rosto, do pescoço e do peito
CABECA = -2.0             # cabeça na linha do tronco (tecnica3d.cabeca_tronco; o boneco em pé mede ~−11°): ACE "Align your head with your
                          # spine"
CARREGA = 4.0             # o antebraço abre um pouco pra fora do plano do braço (ângulo de carregamento)
ABRE_COXA = 8.0           # coxas abertas 8° pra fora (juntas, as coxas se tocavam)
DESCE_COXA = 15.0         # coxas descendo 15° do quadril pro joelho (assento mais alto que os joelhos, ~52 cm do chão, no alto dos
                          # 16"–20,5" do Titan V3): os joelhos ficam mais longe embaixo da almofada, que passa mais do cotovelo
AFUNDA = 0.002            # pele afundando no estofado (assento e almofada)
AFUNDA_ANTEBRACO = 0.005  # a almofada para antes do antebraço (embaixo, t=0) afundar mais que 5 mm nela (ACE: "the backs of your forearms
                          # make light contact with the incline pad"; Yessis prefere o cotovelo solto: "The elbows should be free of the
                          # support pad")
AFUNDA_COXA = 0.008       # a frente do assento para onde a pele das coxas afundaria mais que 8 mm nele
RAIO = 0.016              # pegada do halter de 32 mm (o halter() padrão)
PEGADA_H = 0.13           # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055       # anilhas do halter (como os outros halteres da fábrica)
ESP_ALMOFADA = 0.065      # estofado de 65 mm (Precor DBR0202: "Total thickness is 2.5 inches (65 mm)")
LARG_ALMOFADA = 0.59      # almofada de 23,25" (Titan Preacher Curl Bench V3: "Pad Dimensions 14-in x 23.25-in x 2-in.")
PASSA_MAX = 0.22          # a almofada passa até 22 cm do centro do cotovelo (ao longo dela), se o antebraço, o halter e as coxas deixam
ESP_ASSENTO = 0.05        # assento de 2" (Titan V3: "Bench Dimensions 11-in x 12-in x 2-in.")
LARG_ASSENTO, LARG_FRENTE, PROF_ASSENTO = 0.31, 0.20, 0.30   # 12" atrás, afinando pra frente (Precor: "tapered seat"); até 30 cm de fundo
                          # (a frente para antes das coxas, que descem pro joelho, afundarem mais que AFUNDA_COXA)
X_RECORTE = 0.175         # recorte do meio da almofada (|x| < 17,5 cm): o peito e a barriga ficam nele, as abas por baixo dos braços (com
                          # 16 cm a borda de cima das abas parava 4 cm abaixo da axila, no lado do tórax)
GIRO_ALMOFADA = 8.0       # a face da almofada 8° mais deitada que o braço: o tríceps (grosso) encosta em cima e o cotovelo chega perto
                          # embaixo (com 10° o antebraço afundava nela logo depois do cotovelo e a almofada ficava curta)
RETRAI, DESCE = 4.0, 5.0  # escápulas pra trás e pra baixo (graus de giro da clavícula; ACE: "depress and retract your scapulae")
PUNHO = 0.0               # punho reto (ACE: "maintain a neutral wrist position (wrists aligned with your forearms)")
QUEDA_PUNHO = 15.0        # a mão solta do braço que descansa cai 15° pro lado da palma (punho relaxado)
X_GANCHO = 0.36           # ganchos da barra a 72 cm um do outro (Titan V3: "Rack Width 28.5-in."): por fora do halter
ANG_TUBO = 20.0           # os tubos laterais descem 20° da vertical, da parte de baixo da almofada até o trilho do chão, do lado dos pés:
                          # na vista da câmera (pela direita) o tubo não atravessa a coxa
X = Vector((1.0, 0.0, 0.0))


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no halter (padrão dos exercícios novos)
    pg.usar_cilindro(RAIO * 2000)     # mão de referência da pegada de 32 mm
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (feito em pé, antes de sentar; como na Rosca Scott na Máquina) ───
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    ombro_antes = cab("RightArm")
    for L, s in LADOS:
        p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro D andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (cab("RightArm") - ombro_antes).dot(-frente0) * 1000, -(cab("RightArm") - ombro_antes).dot(cima0) * 1000),
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
    Lb = (cab("RightForeArm") - cab("RightArm")).length
    La = (cab("RightHand") - cab("RightForeArm")).length
    E = {L: S[L] + u_b * Lb for L, _ in LADOS}
    ang_alm = math.degrees(math.atan2(-u_b.y, -u_b.z))           # braço × vertical
    n = Vector((0.0, -math.cos(math.radians(ang_alm)), math.sin(math.radians(ang_alm))))   # ⟂ ao braço, pro lado da flexão
    print("BRAÇOS | ombro D (%.4f %.4f %.4f) | braço %.4f antebraço %.4f | cotovelo D (%.4f %.4f %.4f), %.0f mm abaixo e %.0f mm à "
          "frente do ombro | braço a %.1f° da vertical" % (
              *S["Right"], Lb, La, *E["Right"], (S["Right"].z - E["Right"].z) * 1000, (S["Right"].y - E["Right"].y) * 1000, ang_alm),
          flush=True)

    # ── 4) a mão direita no halter: vão − punho no referencial da mão (dedos, palma), como na Rosca Scott na Máquina ─────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def antebraco(s, graus):
        """Direção do antebraço (cotovelo → punho) com o cotovelo dobrado `graus`: o braço girado em volta do X pro lado da flexão
        (pra cima), um pouco aberto pra fora (CARREGA)."""
        f = Matrix.Rotation(math.radians(-graus), 3, "X") @ u_b
        return (f * math.cos(math.radians(CARREGA)) + X * (s * math.sin(math.radians(CARREGA)))).normalized()

    def orientacao(f):
        """Dedos ao longo do antebraço sem a parte de lado (⟂ ao halter, que fica ao longo do X), PUNHO° de extensão; palma pro lado
        em que o antebraço dobra (pegada supinada: ExRx "palm facing shoulder")."""
        d = Vector((0.0, f.y, f.z)).normalized()
        dobra = Matrix.Rotation(-math.pi / 2, 3, "X") @ d     # pra onde o antebraço vai quando o cotovelo dobra
        p = math.radians(PUNHO)
        dq = (d * math.cos(p) - dobra * math.sin(p)).normalized()
        pq = (dobra - dq * dobra.dot(dq)).normalized()
        return dq, pq

    L, s = TRABALHA, S_T
    f_r = antebraco(s, 30.0)
    dq_r, pq_r = orientacao(f_r)
    g_r = E[L] + f_r * (La + 0.07)
    maos.segurar(L, g_r, dq_r, pq_r, polo=E[L] + (E[L] - (S[L] + g_r) / 2).normalized() * 0.4)
    off = g_r - cab(L + "Hand")
    OFF = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
    print("MÃO D | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
        OFF[0] * 1000, OFF[1] * 1000, OFF[2] * 1000, maos.erro[L] * 1000), flush=True)
    f0 = antebraco(s, COT0)
    dq0, pq0 = orientacao(f0)
    gs = E[L] + f0 * La + dq0 * OFF[0] + pq0 * OFF[1] + dq0.cross(pq0) * OFF[2]
    W = E[L] + f0 * La
    polo = E[L] + (E[L] - (S[L] + W) / 2).normalized() * 0.4
    maos.segurar(L, gs, dq0, pq0, polo=polo)
    maos.iks[L].mute = False
    p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
    maos.segurar(L, gs, dq0, pq0, polo=polo)
    halter = e3.halter("halter", pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA)
    halter.location = gs                                  # ao longo do X, no vão da mão
    p3.atualizar()
    dedos = pg.fechar_em_volta(bon, L, gs, X, RAIO)       # dedos e polegar fecham uma vez só: a mão não mexe no halter
    Er = cab(L + "ForeArm")                               # cotovelo de verdade (onde o IK pôs)
    print("MÃO D | %s | cotovelo D %.1f° | cotovelo fora do calculado %.1f mm | halter em (%.4f %.4f %.4f) | polegar %s" % (
        maos.info(), ck.medir_juntas(rig)["cotoveloD"], (Er - E[L]).length * 1000, *gs, dedos.get("Thumb")), flush=True)

    # ── 5) o braço esquerdo descansa na almofada: a mesma posição do direito embaixo (cotovelo COT0°), com a mão solta depois da borda
    #    de baixo — palma pra baixo (pro lado da almofada), o punho caindo QUEDA_PUNHO° e os dedos relaxados ──────────────────────────
    Ll, sl = LIVRE, 1
    f_l = antebraco(sl, COT0)
    W_l = E[Ll] + f_l * La
    for nm in ("Arm", "ForeArm", "Hand"):
        PB[p3.P + Ll + nm].matrix_basis = Matrix()
    maos.iks[Ll].mute = False
    maos.punhos[Ll].location = W_l
    maos.polos[Ll].location = E[Ll] + (E[Ll] - (S[Ll] + W_l) / 2).normalized() * 0.4
    p3.atualizar()
    p3.acertar_polo(rig, maos.iks[Ll], Ll + "ForeArm", Ll + "Arm", Ll + "Hand")
    mats = [PB[p3.P + Ll + nm].matrix.copy() for nm in ("Arm", "ForeArm")]
    maos.iks[Ll].mute = True
    for nm, M in zip(("Arm", "ForeArm"), mats):
        PB[p3.P + Ll + nm].matrix = M
        p3.atualizar()
    a0_, a1_ = cab(Ll + "ForeArm"), cab(Ll + "Hand")
    ax_ = (a1_ - a0_).normalized()
    pra_baixo = -Vector((0.0, -math.cos(math.radians(ang_alm + GIRO_ALMOFADA)), math.sin(math.radians(ang_alm + GIRO_ALMOFADA))))
    quer = (pra_baixo - ax_ * pra_baixo.dot(ax_)).normalized()   # palma pro lado da almofada (pronada)
    tem = pg._base(rig, Ll)[0]
    tem = (tem - ax_ * tem.dot(ax_)).normalized()
    p3.girar_osso(rig, Ll + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax_), tem.dot(quer)), 3, ax_))
    h0 = cab(Ll + "Hand")                                 # a mão cai QUEDA_PUNHO° pro lado da palma (punho um pouco dobrado)
    y_m = (p3.ponta(rig, Ll + "Hand") - h0).normalized()
    n_m = pg._base(rig, Ll)[0]
    n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
    q = math.radians(QUEDA_PUNHO)
    dq_l = (ax_ * math.cos(q) + quer * math.sin(q)).normalized()
    pq_l = (quer * math.cos(q) - ax_ * math.sin(q)).normalized()
    F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
    F_quer = Matrix((dq_l, pq_l, dq_l.cross(pq_l))).transposed()
    p3.girar_osso(rig, Ll + "Hand", F_quer @ F_tem.transposed())
    p3.soltar_dedos(rig, Ll)
    pg.juntar_dedos(rig, Ll, 0.7)
    p3.fechar_mao(rig, Ll, angulos=(35, 50, 25), polegar=(10, 20, 12))   # mão solta, relaxada: dedos meio dobrados
    jt = ck.medir_juntas(rig)
    print("BRAÇO E (descansa) | cotovelo E %.1f° | punho E %.0f° | palma E %.0f° do lado da almofada | cotovelo E fora do calculado "
          "%.1f mm" % (jt["cotoveloE"], jt["punhoE"], math.degrees(pg._base(rig, Ll)[0].angle(pra_baixo)),
                       (cab(Ll + "ForeArm") - E[Ll]).length * 1000), flush=True)

    # ── 6) a almofada: a face fica GIRO_ALMOFADA° mais deitada que o braço e encosta na parte de trás dos 2 braços (o tríceps em cima,
    #    perto da borda, e o cotovelo mais perto dela embaixo; a pele mais funda afunda AFUNDA). Com o ombro dobrado ~50° o peito do
    #    boneco passa da frente da face entre os braços: ela vira um U — 2 abas por baixo dos braços (|x| > X_RECORTE), subindo até onde
    #    o tronco deixa (perto da axila), e a base inteira embaixo; a de baixo passa do cotovelo o quanto os antebraços (embaixo), as
    #    coxas e os joelhos (embaixo dela) e as anilhas do halter (depois da borda de baixo) deixam ──────────────────────────────────
    co, _, (nomes, dono) = _malha(bon)
    Sm = Vector((0.0, (S["Left"].y + S["Right"].y) / 2, (S["Left"].z + S["Right"].z) / 2))
    b_ = math.radians(GIRO_ALMOFADA)
    u_f = (u_b * math.cos(b_) + n * math.sin(b_)).normalized()     # descendo pela face (mais deitada que o braço)
    n_f = (n * math.cos(b_) - u_b * math.sin(b_)).normalized()     # normal da face (pros braços)
    ang_face = ang_alm + GIRO_ALMOFADA
    rel = co - np.array(Sm)
    al = rel @ np.array(u_f)                              # ao longo da face, a partir dos ombros
    nn = rel @ np.array(n_f)                              # pra fora da face (pros braços)
    Er_ = {Lx: cab(Lx + "ForeArm") for Lx, _ in LADOS}
    ye, ze = (Er_["Left"].y + Er_["Right"].y) / 2, (Er_["Left"].z + Er_["Right"].z) / 2
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
    # coxas e dos joelhos chegarem a 2 cm da chapa e 2 cm antes das anilhas do halter (embaixo, t=0) chegarem perto da face
    afunda_ab = ante_v & (al > a_E) & (w > AFUNDA_ANTEBRACO)
    perto_coxa = coxa_v & (al > a_E - 0.05) & (w > -0.02) & (w < ESP_ALMOFADA + 0.016 + 0.02)   # 2 cm atrás da chapa
    hv = np.concatenate([ck._avaliar_simples(o)[0] for o in halter.children if o.type == "MESH"])
    h_al = (hv - np.array(Sm)) @ np.array(u_f)
    h_w = c - (hv - np.array(Sm)) @ np.array(n_f)
    perto_halter = h_w > -0.03                             # anilhas a menos de 3 cm da face (ou abaixo dela)
    lim = [a_E + PASSA_MAX]
    if afunda_ab.any():
        lim.append(float(al[afunda_ab].min()) - 0.005)
    if perto_coxa.any():
        lim.append(float(al[perto_coxa].min()) - 0.01)
    if perto_halter.any():
        lim.append(float(h_al[perto_halter].min()) - 0.02)
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
          "atrás do estofado | anilhas (t=0) a %s mm da face, começando %.0f mm depois do cotovelo | topo da face (%.4f %.4f)" % (
              ang_face, GIRO_ALMOFADA, a_top * 1000, ("%s em (%.3f %.3f %.3f)" % (nomes[dono[ka]], *co[ka])) if ka >= 0 else "livre",
              a_base * 1000, ("%s em (%.3f %.3f %.3f)" % (nomes[dono[kb]], *co[kb])) if kb >= 0 else "livre", (a_fim - a_E) * 1000,
              "/".join("%.0f" % ((x - a_E) * 1000) for x in lim), comp_alm, "/".join("%.1f" % v for v in vao),
              (n_f.dot(Vector((0.0, ye, ze)) - Sm) - c) * 1000,
              ("%.1f" % (-w[m_ab].max() * 1000)) if m_ab.any() else "-",
              ("%.1f" % ((w[m_cx] - ESP_ALMOFADA).min() * 1000)) if m_cx.any() else "-",
              ("%.1f" % (-h_w.max() * 1000)), (float(h_al.min()) - a_E) * 1000, Q.y, Q.z), flush=True)

    # ── 7) até onde o cotovelo dobra: o antebraço até a vertical (ExRx), sem o halter chegar a FOLGA_HALTER do rosto, do pescoço, do
    #    peito e do ombro (nem passar de COT1_MAX) ─────────────────────────────────────────────────────────────────────────────────
    co, tri, (nomes, dono) = _malha(bon)
    fixo = ~_grupo(nomes, dono, tuple(TRABALHA + nm for nm in ("ForeArm", "Hand")) +
                   tuple("%sHand%s%d" % (TRABALHA, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)))
    t_fixo = tri[fixo[tri].all(axis=1)]
    bvh_corpo = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(t) for t in t_fixo], all_triangles=True)
    hv0 = hv[::3]

    def girado(graus):
        R = np.array(Matrix.Rotation(math.radians(-(graus - COT0)), 3, "X"))
        return (hv0 - np.array(Er)) @ R.T + np.array(Er)

    def folga_halter(graus):
        return min(bvh_corpo.find_nearest(Vector(p))[3] for p in girado(graus))

    def antebraco_vertical(graus):
        f = Matrix.Rotation(math.radians(-(graus - COT0)), 3, "X") @ f0
        a_ = math.degrees(f.angle(Vector((0.0, 0.0, 1.0))))
        return a_

    COT1, melhor = COT0, 1e9
    for g in np.arange(COT0, COT1_MAX + 0.01, 0.5):
        if folga_halter(g) < FOLGA_HALTER:
            break
        v = antebraco_vertical(g)
        if v < melhor:
            COT1, melhor = float(g), v
    print("TOPO | cotovelo até %.1f° (antebraço %.1f° da vertical) | halter a %.0f mm do corpo em cima" % (
        COT1, antebraco_vertical(COT1), folga_halter(COT1) * 1000), flush=True)

    # ── 8) o banco Scott em volta do corpo ─────────────────────────────────────────────────────────────────────────────────────────
    z_gancho = float(hv[:, 2].min()) - 0.12                # ganchos da barra por fora do halter, 12 cm abaixo dele embaixo (com 6 cm o
                                                           # gancho parecia encostar no halter e na mão solta nos closes)
    bs = e3.banco_scott("banco_scott", almofada=(Q.y, Q.z, ang_face, comp_alm, LARG_ALMOFADA, ESP_ALMOFADA), recorte=recorte,
                        assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO, LARG_FRENTE), y_frente=y_dedos - 0.12,
                        s_tubo=comp_alm - 0.05, ang_tubo=ANG_TUBO, suporte=(gs.y, z_gancho), x_suporte=X_GANCHO)
    print("BANCO | assento topo %.3f | almofada %.1f° × %.3f × %.2f m (recorte %s) | frente da base y %.3f | ganchos em "
          "(±%.2f %.3f %.3f)" % (topo, ang_face, comp_alm, LARG_ALMOFADA, recorte, y_dedos - 0.12, X_GANCHO, gs.y, z_gancho), flush=True)

    # ── 9) pose: o antebraço direito (com a mão fechada no halter) e o halter giram o mesmo ângulo em volta do eixo do cotovelo ───────
    base_ab = PB[p3.P + TRABALHA + "ForeArm"].matrix_basis.copy()
    M_halter = halter.matrix_world.copy()

    def pose(t):
        """t=0 cotovelo quase esticado (halter embaixo), t=1 antebraço na vertical (halter em cima, na frente do ombro)."""
        g = p3.lerp(COT0, COT1, t) - COT0
        PB[p3.P + TRABALHA + "ForeArm"].matrix_basis = base_ab.copy()
        p3.atualizar()
        R = Matrix.Rotation(math.radians(-g), 3, "X")
        p3.girar_osso(rig, TRABALHA + "ForeArm", R, pivo=Er)
        halter.matrix_world = Matrix.Translation(Er) @ R.to_4x4() @ Matrix.Translation(-Er) @ M_halter
        p3.atualizar()

    def _bvh(vs, ts):
        return BVHTree.FromPolygons([tuple(p) for p in vs], [tuple(t) for t in ts], all_triangles=True)

    def _com_sinal(bvh, pts):
        """Menor distância com sinal dos pontos até a superfície fechada (− = dentro)."""
        menor = 1e9
        for p in pts:
            v = Vector(p)
            loc, nor, _, d = bvh.find_nearest(v)
            if loc is not None:
                menor = min(menor, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
        return menor

    def folgas_extra():
        """Folgas medidas à parte (mm): halter × pernas e × antebraço direito (a checagem ignora o que fica DENTRO da mão), mão
        direita × anilhas (a pele da mão até a face de dentro das anilhas) e as 2 mãos × almofada."""
        co_, tri_, (nomes_, dono_) = _malha(bon)
        pernas = _grupo(nomes_, dono_, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
        b_pernas = _bvh(co_, tri_[pernas[tri_].all(axis=1)])
        ante = _grupo(nomes_, dono_, (TRABALHA + "ForeArm",))
        b_ante = _bvh(co_, tri_[ante[tri_].all(axis=1)])
        hv_ = np.concatenate([ck._avaliar_simples(o)[0] for o in halter.children if o.type == "MESH" and "anilha" in o.name])
        h_pernas = min(b_pernas.find_nearest(Vector(p))[3] for p in hv_[::2])
        h_ante = min(b_ante.find_nearest(Vector(p))[3] for p in hv_[::2])
        maoD = co_[np.array([nm.startswith(TRABALHA + "Hand") for nm in nomes_] + [False])[dono_]]
        anis = [o for o in halter.children if o.type == "MESH" and "anilha" in o.name]
        mao_anilha = min(_com_sinal(_bvh(*ck._avaliar_simples(o)), maoD[::2]) for o in anis)
        maoE = co_[np.array([nm.startswith(LIVRE + "Hand") for nm in nomes_] + [False])[dono_]]
        alm = [_bvh(*ck._avaliar_simples(o)) for o in bs.raizes["almofada"].children_recursive if o.type == "MESH"]
        maoD_alm = min(_com_sinal(b, maoD[::2]) for b in alm)
        maoE_alm = min(_com_sinal(b, maoE[::2]) for b in alm)
        est = [_bvh(*ck._avaliar_simples(o)) for o in bs.raizes["estrutura"].children_recursive if o.type == "MESH"]
        maoD_est = min(_com_sinal(b, maoD[::2]) for b in est)       # a checagem do peso × corpo não olha as mãos
        maoE_est = min(_com_sinal(b, maoE[::2]) for b in est)
        return (h_pernas * 1000, h_ante * 1000, mao_anilha * 1000, maoD_alm * 1000, maoE_alm * 1000, maoD_est * 1000,
                maoE_est * 1000)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        hc = halter.matrix_world.to_translation()
        return ("cotovelo D %.1f° (E %.1f°) | antebraço D %.1f° da vertical | halter %.0f mm acima e %.0f mm à frente do ombro D | "
                "halter × pernas %.0f mm, × antebraço D %.0f mm | mão D × anilhas %.1f mm | mãos × almofada D %.0f E %.0f mm | "
                "mãos × estrutura do banco D %.0f E %.0f mm | "
                "braço × tronco %s° | abertura %s° | tronco %.1f° | coluna %.1f° | cabeça %.1f° | punho %s° | palma %s° | %s" % (
                    juntas["cotoveloD"], juntas["cotoveloE"], tc.antebraco_vertical(jj)[1], (hc.z - S["Right"].z) * 1000,
                    (S["Right"].y - hc.y) * 1000, *folgas_extra(), "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(TRABALHA, ck.Barra(halter, raio=RAIO, meio_compr=PEGADA_H / 2))]
    yq = float(H.y)
    return Cena(pose, [halter] + bs.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.25, 0.8),
                camera_video=((-2.6, yq - 2.6, 1.30), (0, yq - 0.25, 0.80), 50), info=info, apoios=bs.apoios,
                afunda_apoio_mm=20)
