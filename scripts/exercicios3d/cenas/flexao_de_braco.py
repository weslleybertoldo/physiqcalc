# Flexão de Braço — cena da fábrica 3D (lote 7, 08/10/2026). Peso corporal, no chão (sem equipamento: o apoio é o chão).
# Técnica (ACE, Push-up): "positioning your hands shoulder-width apart with your fingers facing forward or turned slightly inward";
# "Slowly shift your weight forward until your shoulders are positioned directly over your hands"; "full extension of your body
# without any bend at the hips or knees"; "align your head with your spine"; "Place your feet together with your ankles dorsiflexed
# (toes pointed towards your shins)"; descida "until your chest or chin touch the mat/floor", "Allow your elbows to flare outwards
# during the lowering phase", "Do not allow your low back to sag or your hips to hike upwards"; subida "until the arms are fully
# extended at the elbows". ExRx (Push-up): "Lie prone with forefeet on floor and hands slightly wider than shoulder width"; "Both
# upper and lower body must be kept straight throughout movement". NASM (Push-Up): "hands positioned slightly wider than
# shoulder-width apart and feet together or hip-width apart"; "descending until your chest nearly touches the floor. Keep your elbows
# at approximately 45 degrees from your body"; "Avoid locking out your elbows at the top". Contreras et al. (Strength Cond J, NSCA,
# 2012): o corpo "in a straight line from head to feet while the shoulders and elbows flex and extend ... and the scapulae retract
# and protract". Calatayud et al. 2015 (a base da dica): mãos a 150% da largura biacromial, "feet at biacromial (shoulder) width",
# "Hip and spine were maintained neutral", ombro "abducted 45°", 2 s na descida. A dica do app: "Mãos um pouco mais abertas que os
# ombros, corpo reto da cabeça ao calcanhar. Desça até o peito quase tocar o chão e suba sem perder o alinhamento."
# t = 0 em cima: braços estendidos sem travar (cotovelo ~5°), a articulação do ombro bem em cima do punho, escápulas um pouco
# protraídas · t = 1 embaixo: peito a ~3,5 cm do chão, cotovelos dobrados (~127°) abrindo ~45° do tronco, escápulas retraídas.
# Como o rig faz: em pé, os joelhos esticam, as coxas fecham até os pés ficarem o mais juntos que der sem uma coxa entrar na outra, o
# quadril estende até o centro dele ficar na reta ombro → tornozelo e o pé faz flexão dorsal (canela × pé ~90°); o corpo todo gira em
# volta do eixo das bases dos dedos dos pés (cabeça do osso ToeBase) — o corpo é uma prancha rígida que gira na ponta dos pés — e os
# dedos dos pés voltam deitados no chão, pra frente. As mãos ficam PARADAS no chão, espalmadas (a palma e cada dedo encostando, ~1 mm
# dentro): o braço vai por IK do ombro até o punho parado, o antebraço gira pra palma e o punho põe os dedos pra frente (o jeito da
# Flexão Nórdica, lote 4). A clavícula gira em volta do eixo do tronco: protrai em cima e retrai embaixo (Contreras 2012).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
JOELHO = 1.5            # flexão do joelho (graus): estendido (ACE: "without any bend at the hips or knees"); em pé o boneco tem 7,5°
PES_X = 0.06            # tornozelos a ±6 cm do meio: pés juntos (ACE: "bring your feet together behind you"); em pé ficam a ±19,5 cm
COXAS_MM = 1.0          # ... mas sem uma coxa entrar na outra mais que isso (a checagem aceita 2 mm): se entrar, os pés afastam — no
                        # boneco musculoso ficam a ±14 cm (~1,3 × a distância entre os quadris; NASM: "feet together or hip-width
                        # apart"; Calatayud 2015: "feet at biacromial (shoulder) width")
TORNOZELO = 90          # canela × pé (tecnica3d.tornozelo; em pé ~76°): ~14° de flexão dorsal (ACE: "ankles dorsiflexed (toes
                        # pointed towards your shins)"); o limite da flexão dorsal é 20° (Alazzawi 2017) = ~96° no boneco
QUADRIL_LINHA = 0.0     # centro do quadril na reta ombro → tornozelo (mm, tecnica3d.quadril_linha_ombro_tornozelo), no meio do
                        # movimento (a escápula mexe o ombro: em cima e embaixo a reta muda uns mm)
AFUNDA_DEDOS = 0.001    # dedos dos pés apertando o chão
AFUNDA_MAO = 0.0008     # palma e dedos apertando o chão
PEGADA = 1.35           # base do dedo médio de uma mão à outra ÷ distância entre as cabeças do úmero: um pouco mais aberta que os
                        # ombros (no boneco ~1,2 = mãos na largura dos ombros)
DENTRO = 5              # dedos virados pra dentro (graus; ACE: "fingers facing forward or turned slightly inward")
COTOVELO_CIMA = 5       # flexão do cotovelo em cima (graus): estendido sem travar (ACE: "fully extended at the elbows"; NASM:
                        # "Avoid locking out your elbows at the top")
PEITO_CHAO = 0.035      # pele mais baixa do peito embaixo (m): quase toca o chão (dica; NASM: "until your chest nearly touches
                        # the floor"; ACE: "until your chest or chin touch"); com 30 mm o antebraço entrava 2,5 mm no braço
                        # (cotovelo 129°)
ESCAPULA = (5, -11)     # giro da clavícula em volta do eixo do tronco (graus): + protração em cima → − retração embaixo
ABRE = 45               # braço × tronco embaixo, vista de cima do tronco (tecnica3d.braco_abertura; Calatayud 2015: "shoulder
                        # abducted 45°"; ACE: "Allow your elbows to flare outwards")
PIVO_Y = 0.80           # o eixo das bases dos dedos dos pés fica em y = PIVO_Y: o corpo fica centrado perto de y = 0 (o alvo da
                        # câmera)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    dedos_repouso = {L: p3.mundo_osso(rig, L + "ToeBase").to_3x3() for L, _ in LADOS}

    # ── pernas: joelhos estendidos, pés o mais juntos que der, quadril na linha, flexão dorsal (em pé, antes de deitar) ────────
    for lado, _ in LADOS:
        Hq, K, A = (p3.cabeca(rig, lado + n) for n in ("UpLeg", "Leg", "Foot"))
        coxa, canela = (K - Hq).normalized(), (A - K).normalized()
        flex = math.degrees(coxa.angle(canela))
        quer = coxa.slerp(canela, JOELHO / flex) if flex > JOELHO else canela
        p3.girar_osso(rig, lado + "Leg", canela.rotation_difference(quer).to_matrix())
    coxas_soltas = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}

    def fechar_pernas(px):
        """Cada coxa fecha em volta do quadril até o tornozelo ficar a `px` m do meio; devolve quanto uma coxa entra na outra
        (mm)."""
        for lado, s in LADOS:
            PB[p3.P + lado + "UpLeg"].matrix_basis = coxas_soltas[lado].copy()
        p3.atualizar()
        for lado, s in LADOS:
            Hq, A = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Foot")
            v = A - Hq
            dx = s * px - Hq.x
            quer = Vector((dx, v.y, -math.sqrt(max(v.length ** 2 - dx ** 2 - v.y ** 2, 1e-6))))
            p3.girar_osso(rig, lado + "UpLeg", v.rotation_difference(quer).to_matrix())
        co, tri, (nomes, dono) = _malha(bon)
        return ck.corpo_x_corpo(co, tri, nomes, dono)[0]["coxaE×coxaD"]

    # pés o mais juntos que der sem uma coxa entrar na outra (o boneco musculoso não amassa a parte de dentro da coxa)
    px = PES_X
    if fechar_pernas(px) > COXAS_MM:
        lo, hi = PES_X, 0.20
        for _ in range(10):
            meio = (lo + hi) / 2
            if fechar_pernas(meio) > COXAS_MM:
                lo = meio
            else:
                hi = meio
        px = hi
    print("PÉS | tornozelos a ±%.3f m do meio (o mais junto sem uma coxa entrar na outra) | coxa × coxa %.1f mm" % (
        px, fechar_pernas(px)))

    def escapula(g):
        """Clavícula (osso Shoulder) girada `g` graus em volta do eixo do tronco: + = protração (o ombro vai pra frente do peito)."""
        cima = (p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).normalized()
        for lado, s in LADOS:
            PB[p3.P + lado + "Shoulder"].matrix_basis = Matrix()
            p3.atualizar()
            if g:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))

    escapula((ESCAPULA[0] + ESCAPULA[1]) / 2)
    g_q = 0.0
    for _ in range(4):                    # o quadril estende (+) ou dobra até o centro dele ficar na reta ombro → tornozelo
        m0 = tc.quadril_linha_ombro_tornozelo(ck.posicoes(rig))[0]
        if abs(m0 - QUADRIL_LINHA) < 0.2:
            break
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(0.5))
        m1 = tc.quadril_linha_ombro_tornozelo(ck.posicoes(rig))[0]
        passo = 0.5 * (QUADRIL_LINHA - m1) / (m1 - m0) if abs(m1 - m0) > 1e-6 else 0.0
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(passo))
        g_q += 0.5 + passo
    escapula(0.0)
    for lado, _ in LADOS:                 # tornozelo: o pé gira no plano canela-pé até canela × pé = TORNOZELO
        K, A, T = (p3.cabeca(rig, lado + n) for n in ("Leg", "Foot", "ToeBase"))
        canela, pe = (A - K).normalized(), (T - A).normalized()
        eixo = canela.cross(pe).normalized()
        p3.girar_osso(rig, lado + "Foot", Matrix.Rotation(math.radians(TORNOZELO - math.degrees(canela.angle(pe))), 3, eixo))
    j = ck.posicoes(rig)
    print("PERNAS | joelho %s | quadril estendeu %.2f° | pés base lateral %.2f | tornozelo %s | linha jqc %.1f° | quadril×tronco %s"
          % ("/".join("%.1f" % ck.medir_juntas(rig)["joelho" + l] for l in "ED"), g_q, tc.pes_base_lateral(j)[0],
             "/".join("%.1f" % a for a in tc.tornozelo(j)), tc.linha_joelho_quadril_cabeca(j)[0],
             "/".join("%.1f" % a for a in tc.quadril_sinal(j))))

    # ── deitado de bruços: o corpo gira em volta do eixo das bases dos dedos; os dedos dos pés voltam deitados no chão ────────────
    dedos_alvo = dict(dedos_repouso)     # orientação dos dedos dos pés no mundo (deitados no chão, pra frente)

    def dedos_no_lugar():
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "ToeBase", dedos_alvo[lado] @ p3.mundo_osso(rig, lado + "ToeBase").to_3x3().inverted())

    def pivo():
        return (p3.cabeca(rig, "LeftToeBase") + p3.cabeca(rig, "RightToeBase")) / 2

    PHI0 = 72.0
    p3.girar_osso(rig, "Hips", p3.rot_x(PHI0), pivo=pivo())
    dedos_no_lugar()
    pes = pele(("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))
    P0 = pivo()
    p3.girar_osso(rig, "Hips", Matrix.Identity(3),
                  mover=Vector((0, PIVO_Y - P0.y, -AFUNDA_DEDOS - float(pes[:, 2].min()))))
    dedos_no_lugar()
    for lado, _ in LADOS:                 # cada pé com os dedos encostando: o boneco não é simétrico ao milímetro (a Flexão Nórdica)
        g = 0.0
        while float(pele((lado + "ToeBase",))[:, 2].min()) > -AFUNDA_DEDOS and g < 15:
            p3.girar_osso(rig, lado + "ToeBase", p3.rot_x(0.25))     # + = a ponta dos dedos desce (em volta da base dos dedos)
            g += 0.25
        dedos_alvo[lado] = p3.mundo_osso(rig, lado + "ToeBase").to_3x3()
        print("DEDOS DO PÉ %s | descem %.2f° | dedos z min %.1f mm | pé (sem os dedos) z min %.1f mm" % (
            lado, g, float(pele((lado + "ToeBase",))[:, 2].min()) * 1000, float(pele((lado + "Foot",))[:, 2].min()) * 1000))
    P = pivo()
    CORPO_BASE = ("Hips",) + tuple(L + "ToeBase" for L, _ in LADOS)
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in CORPO_BASE}

    def inclinar(phi):
        """Corpo girado `phi` graus à frente a partir de em pé (em volta do eixo das bases dos dedos dos pés), dedos no chão."""
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        if phi != PHI0:
            p3.girar_osso(rig, "Hips", p3.rot_x(phi - PHI0), pivo=P)
        dedos_no_lugar()

    print("PIVÔ (bases dos dedos) (%.3f %.3f %.3f) | dedos dos pés z min %.1f mm" % (
        *P, float(pele(("LeftToeBase", "RightToeBase"))[:, 2].min()) * 1000))

    # ── braços: IK do ombro ao punho; a mão vira pela palma e pelos dedos (o jeito da Flexão Nórdica) ─────────────────────────────
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:                 # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, 0.3)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
        iks[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    MAO = {L: tuple(n for n in BRACO[L] if n.startswith(L + "Hand")) for L in BRACO}
    dedos_pose = {}
    polo_ok = {}

    def esticar_dedos(lado):
        """Dedos esticados no plano da palma e um pouco abertos, polegar deitado do lado do indicador (a mão de apoio da remada
        unilateral, lote 2, e da Flexão Nórdica, lote 4)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.5)
        for d in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, d, i)
                f = p3.ponta(rig, o) - p3.cabeca(rig, o)
                plano = f - palma * f.dot(palma)
                if d == "Thumb":
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def dedos_no_chao(lado):
        """Com a palma no chão: cada dedo (e o polegar) gira só na base, pro lado da palma, até a pele mais baixa dele encostar no
        chão (AFUNDA_MAO); sem passar disso (a Flexão Nórdica)."""
        palma, eixo_nos = pg._base(rig, lado)[:2]
        co, _, (nomes, dono) = _malha(bon)
        for d in p3.DEDOS + ("Thumb",):
            ossos = ["%sHand%s%d" % (lado, d, i) for i in ((1, 2, 3) if d != "Thumb" else (2, 3))]
            Pd = co[_grupo(nomes, dono, ossos)]
            h = p3.cabeca(rig, ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            eixo = eixo_nos if d != "Thumb" else f.cross(palma).normalized()
            sinal = 1 if eixo.cross(f).dot(palma) > 0 else -1          # + = gira pro lado da palma (pro chão)
            escolha = None
            z0 = float(Pd[:, 2].min())
            for g in np.arange(-25.0, 60.01, 0.5):                     # do mais esticado pro mais dobrado
                if pg._rot(Pd, np.array(h), eixo, g * sinal)[:, 2].min() <= -AFUNDA_MAO:
                    escolha = float(g)
                    break
            if escolha is None:
                print("  dedo %s %s não chega no chão" % (lado, d))
                continue
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo))
            print("  dedo %s %s: estava a %.1f mm do chão, base gira %+.1f°" % (lado, d, z0 * 1000, escolha))

    def por_mao(lado, W, dedos_q, palma_q, polo):
        """Punho em W, dedos pra `dedos_q` e palma pra `palma_q` (mundo), cotovelo do lado do `polo` (a Flexão Nórdica)."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        iks[lado].mute = False
        punhos[lado].location = W
        polos[lado].location = polo
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()                       # 1) antebraço gira (pronação/supinação) pra palma
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]             # 2) o resto no punho, pela base da PALMA (punho → nós, normal)
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        pq = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        F_quer = Matrix((dedos_q, pq, dedos_q.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (p3.cabeca(rig, lado + "Hand") - W).length

    DEDOS_Q = {L: Vector((-s * math.sin(math.radians(DENTRO)), -math.cos(math.radians(DENTRO)), 0.0)) for L, s in LADOS}
    PALMA_Q = Vector((0, 0, -1))
    # polo provisório (em cima; o de verdade sai da pose de baixo): pra trás, pra fora e pra cima do ombro, no referencial do tórax
    POLO_T = {L: Vector((s * 0.45, 0.30, 0.35)) for L, s in LADOS}

    def polo_mundo(lado):
        T = p3.mundo_osso(rig, "Spine2")
        return T @ POLO_T[lado]

    # ── em cima: a articulação do ombro bem em cima do punho (ACE) e o braço estendido (COTOVELO_CIMA) ───────────────────────────
    D_cima = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO_CIMA)))
    S0 = {L: p3.cabeca(rig, L + "Arm") for L, _ in LADOS}
    nos = 0.110                           # punho → base do dedo médio (m), medido no boneco
    W = {L: Vector((s * (PEGADA * abs(S0["Left"].x - S0["Right"].x) / 2 + nos * math.sin(math.radians(DENTRO))), 0.0, 0.03))
         for L, s in LADOS}
    phi_c = PHI0
    for volta in range(4):
        inclinar(phi_c)
        escapula(ESCAPULA[0])
        for lado, _ in LADOS:
            W[lado].y = p3.cabeca(rig, lado + "Arm").y
        # palma no chão com o corpo um pouco mais baixo (o braço dobra e o punho chega no alvo; com o braço esticado no limite o
        # punho parava antes e a conta da altura da palma afundava a mão 3 mm nos outros quadros)
        inclinar(phi_c + 8)
        escapula(ESCAPULA[0])
        for lado, _ in LADOS:
            if volta == 0:                # dedos esticados (pose local guardada, igual em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado))
                esticar_dedos(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
            for _ in range(3):            # o punho desce/sobe até a pele da palma (com a tenar) encostar
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado))
                W[lado].z += -AFUNDA_MAO - float(pele((lado + "Hand", lado + "HandThumb1"))[:, 2].min())
            if volta == 3:                # cada dedo dobra na base até encostar no chão (vale em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado))
                dedos_no_chao(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        lo, hi = 40.0, 89.0               # o corpo inclina até o braço ficar com o comprimento de COTOVELO_CIMA
        for _ in range(16):
            meio = (lo + hi) / 2
            inclinar(meio)
            escapula(ESCAPULA[0])
            d = max((p3.cabeca(rig, L + "Arm") - W[L]).length for L, _ in LADOS)
            if d > D_cima:
                lo = meio
            else:
                hi = meio
        phi_c = hi                        # o lado em que o braço alcança o punho (com o cotovelo a COTOVELO_CIMA)
        print("EM CIMA volta %d | corpo gira %.2f° | punho E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (
            volta, phi_c, *W["Left"], *W["Right"]))
    inclinar(phi_c)
    escapula(ESCAPULA[0])
    print("EM CIMA | punho a %.1f/%.1f mm do alvo" % tuple(
        por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado)) * 1000 for lado, _ in LADOS))

    # ── embaixo: o peito a PEITO_CHAO do chão ─────────────────────────────────────────────────────────────────────────────────
    CORPO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "LeftUpLeg", "RightUpLeg")

    def mais_baixo(quem=False):
        co, _, (nomes, dono) = _malha(bon)
        m = _grupo(nomes, dono, CORPO)
        i = np.where(m)[0][np.argmin(co[m][:, 2])]
        return (float(co[i, 2]), nomes[dono[i]]) if quem else float(co[i, 2])

    lo, hi = phi_c, 100.0
    for _ in range(16):
        meio = (lo + hi) / 2
        inclinar(meio)
        escapula(ESCAPULA[1])
        if mais_baixo() > PEITO_CHAO:
            lo = meio
        else:
            hi = meio
    phi_b = lo
    inclinar(phi_b)
    escapula(ESCAPULA[1])
    z_b, quem_b = mais_baixo(quem=True)
    print("EMBAIXO | corpo gira %.2f° (em cima %.2f°) | parte mais baixa (%s) a %.1f mm do chão" % (
        phi_b, phi_c, quem_b, z_b * 1000))

    # ── polo do cotovelo: embaixo, o cotovelo no ponto do círculo (ombro → punho) com o braço a ABRE° do tronco, vista de cima ────
    T_b = p3.mundo_osso(rig, "Spine2")
    j = ck.posicoes(rig)
    cima, lado_t, frente = (Vector(v) for v in tc.eixos_tronco(j))
    for lado, s in LADOS:
        S = p3.cabeca(rig, lado + "Arm")
        dv = W[lado] - S
        u = dv.normalized()
        a = (Lb ** 2 - La ** 2 + dv.length_squared) / (2 * dv.length)
        rho = math.sqrt(max(Lb ** 2 - a ** 2, 1e-8))
        e1 = (-frente - u * u.dot(-frente)).normalized()            # pras costas (pra cima, deitado)
        e2 = u.cross(e1).normalized()
        fora = -s * lado_t                                          # lado_t vai da esquerda pra direita; fora do lado s
        melhor = None
        for g in range(-180, 180):
            r = math.radians(g)
            E = S + u * a + (e1 * math.cos(r) + e2 * math.sin(r)) * rho
            b = E - S
            ab = math.degrees(math.atan2(b.dot(fora), b.dot(-cima)))
            alto = (E - S).dot(-frente)
            custo = abs(ab - ABRE) - 0.001 * alto
            if melhor is None or custo < melhor[0]:
                melhor = (custo, E, ab, g)
        _, E, ab, g = melhor
        C = S + u * a
        pol = E + (E - C).normalized() * 0.4
        POLO_T[lado] = T_b.inverted() @ pol
        polo_ok.pop(lado, None)
        print("POLO %s | cotovelo no círculo a %d° | braço %.1f° do tronco | cotovelo %.0f mm acima do ombro (pras costas)" % (
            lado, g, ab, (E - S).dot(-frente) * 1000))
    for lado, _ in LADOS:                 # acerta o ângulo do polo com o cotovelo bem dobrado (embaixo)
        por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado))

    def pose(t):
        """t=0 em cima (braços estendidos), t=1 embaixo (peito quase no chão)."""
        inclinar(phi_c + (phi_b - phi_c) * t)
        escapula(ESCAPULA[0] + (ESCAPULA[1] - ESCAPULA[0]) * t)
        for lado, _ in LADOS:
            por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado))

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        txt = []
        for L, s in LADOS:
            palma = G((L + "Hand",))
            dedos = {d: G(tuple("%sHand%s%d" % (L, d, i) for i in (1, 2, 3)))[:, 2].min() * 1000 for d in p3.DEDOS + ("Thumb",)}
            toca = G(MAO[L])
            toca = toca[toca[:, 2] < 0.0015]
            cx, cy = (toca[:, 0].mean(), toca[:, 1].mean()) if len(toca) else (float("nan"), float("nan"))
            ante = G((L + "ForeArm",))
            i = int(np.argmin(ante[:, 2]))
            txt.append("mão %s: punho a %.1f mm do alvo, palma %+.1f mm, dedos %s mm, contato (%.1f %.1f) mm, %d pontos, antebraço "
                       "%+.1f mm (a %.0f mm do punho)" % (
                           L[0], (p3.cabeca(rig, L + "Hand") - W[L]).length * 1000, palma[:, 2].min() * 1000,
                           "/".join("%+.1f" % dedos[d] for d in p3.DEDOS + ("Thumb",)), cx * 1000, cy * 1000, len(toca),
                           ante[i, 2] * 1000, (Vector(ante[i]) - p3.cabeca(rig, L + "Hand")).length * 1000))
        peito = G(("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))
        reta = (jj["LeftArm"] + jj["RightArm"]) / 2 - (jj["LeftFoot"] + jj["RightFoot"]) / 2     # tornozelo → ombro
        return ("cotovelo %.0f/%.0f° | punho %.0f/%.0f° | braço×tronco %s° | escápula %s mm | "
                "quadril × reta ombro-tornozelo %+.0f mm | quadril×tronco %s° | linha jqc %.1f° | joelho %.0f/%.0f° | "
                "tornozelo %s° | peito a %.0f mm do chão | cabeça a %.0f mm | corpo inclina %.1f° | %s" % (
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % a for a in tc.braco_abertura(jj)), "/".join("%+.0f" % a for a in tc.escapula_frente(jj)),
                    tc.quadril_linha_ombro_tornozelo(jj)[0], "/".join("%.1f" % a for a in tc.quadril_sinal(jj)),
                    tc.linha_joelho_quadril_cabeca(jj)[0], juntas["joelhoE"], juntas["joelhoD"],
                    "/".join("%.0f" % a for a in tc.tornozelo(jj)), peito[:, 2].min() * 1000, G(("Head",))[:, 2].min() * 1000,
                    math.degrees(math.atan2(float(reta[2]), float(np.linalg.norm(reta[:2])))),
                    " | ".join(txt)))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        co = _malha(bon)[0]
        print("t=%.2f | corpo y %.3f → %.3f, z até %.3f | %s" % (t, co[:, 1].min(), co[:, 1].max(), co[:, 2].max(), info()))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.1, 0.3),
                camera_video=((3.2, -2.4, 1.2), (0, -0.1, 0.3), 50), info=info)
