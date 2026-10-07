# Flexão Nórdica — cena da fábrica 3D (lote 4, 06/10/2026).
# Técnica da NSCA (Exercise Technique Manual for Resistance Training, 4ª ed., Nordic Hamstring Curl): ajoelhado numa almofada,
# "ankles flexed and toes into the floor", com "a partner or piece of equipment" segurando os tornozelos; tronco ereto, "hips
# extended and gluteals contracted" e "a straight line between the ear, hip, and knee". t = 0 ajoelhado ereto (joelho ~90°) ·
# t = 1 embaixo: o corpo desce reto, girando só no joelho ("allowing the knees to extend to slowly fall forward toward the
# floor", segurando com os isquiotibiais) e, perto do chão, as mãos apoiam e amortecem ("As the body nears the floor, reach
# forward and place the hands on the floor to decelerate the body during the last part of the lowering phase, as if doing a
# push-up. Lower the body to within 2 inches (5 cm) of the floor."). A volta (o app faz sozinho) é a subida da NSCA: "performing
# a push-up motion" e "contract the hamstrings to pull the fixed torso back toward the starting position".
# Mãos: abertas à frente do peito, cotovelos dobrados (Soga et al., IJSPT 2023: "with their elbows bent and hands open in front of
# them"; ExRx, Self-assisted Inverse Leg Curl: "Position hands forward, ready to push body weight back up off of surface"),
# enquanto os isquiotibiais seguram a descida. Elas começam a ir pro chão perto do ponto em que os isquiotibiais param de
# segurar (o "break-point": 58,7 ± 11,2° de flexão do joelho nos atletas de Soga 2023, "approximately 50° even in trained soccer
# players") — aqui com o joelho a ~57° — e encostam no chão com ele a ~31°, o braço quase estendido e um pouco à frente do
# ombro ("reach forward"); daí amortecem como numa flexão de braço (ACE, Push-up: "Position your hands shoulder-width apart with
# your fingers facing forward or turned slightly inward"; "Allow your elbows to flare outwards during the lowering phase").
# Como o rig faz: com o boneco em pé, as coxas estendem um pouco no quadril até joelho → quadril → orelha ficar em linha; cada
# canela gira pra trás em volta do eixo do joelho até ficar quase deitada, o pé fica quase em pé (tornozelo em flexão dorsal) e
# os dedos voltam pra orientação de repouso — deitados no chão, apontando pra frente; o corpo desce até os dedos encostarem no
# chão. A almofada fica embaixo dos joelhos e das canelas e os rolos em cima do tendão de Aquiles (equip3d.apoio_nordico, montado
# em volta do corpo). A descida: a pelve (osso Hips, raiz) gira em volta do eixo dos 2 joelhos e as canelas giram o contrário —
# elas, os pés e os dedos não saem do lugar e do joelho pra cima o corpo não dobra. Braços por IK em cada quadro: a mão segue o
# tronco (à frente do peito), vai pro ponto do chão e fica parada nele (espalmada) enquanto o corpo termina de descer e o cotovelo
# dobra.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
CHAPA = 0.012             # chapa de aço no chão, embaixo da almofada
ALMOFADA = 0.0762         # almofada dos joelhos de 3" (Freak Athlete Nordic Mini Pro: "3″ thickness, 18″ x 24″")
LARG_ALMOFADA = 0.457     # 18"
AFUNDA_JOELHO = 0.004     # pele do joelho/canela dentro da almofada
AFUNDA_DEDOS = 0.001      # dedos dos pés apertando o chão
TORNOZELO = 92            # canela × pé (tecnica3d.tornozelo; em pé, no repouso, ~76°): ~16° de flexão dorsal, o pé quase em pé
                          # e os dedos dobrados no chão (NSCA: "ankles flexed and toes into the floor"); o limite da flexão dorsal
                          # é 20° (Alazzawi et al., World J Orthop 2017, tabela 5) = ~96° no boneco
FRENTE_ALMOFADA = 0.025   # a almofada passa só 2,5 cm à frente do centro do joelho: embaixo a coxa desce livre na frente dela
                          # (com ela mais comprida a coxa afundava 5 cm no estofado embaixo)
RAIO_ROLO, COMPR_ROLO = 0.055, 0.15     # rolos de 4,33" × 5,9" (Nord Ex: ankle pads "5.9″L x 4.33″D")
ROLO_ACIMA = 0.035        # rolo em cima do tendão de Aquiles, 3,5 cm acima do tornozelo (ao longo da canela)
AFUNDA_ROLO = 0.003
FOLGA_PE_ALMOFADA = 0.012 # a almofada termina 1,2 cm antes do peito do pé e dos dedos (que ficam no chão, atrás dela)
CHAO_EMBAIXO = 0.05       # embaixo o corpo fica a 5 cm do chão (NSCA: "Lower the body to within 2 inches (5 cm) of the floor")
LINHA = 1.5               # joelho → quadril → orelha quase em linha reta (tecnica3d.linha_joelho_quadril_cabeca; no repouso o
                          # boneco mede 7°, com o joelho 3,5 cm à frente do quadril): as coxas estendem no quadril até ela
# mãos prontas à frente do peito (com o boneco ajoelhado ereto): punho 27 cm à frente do ombro e 13 cm abaixo dele, 2 cm pra
# dentro; palma pra frente e um pouco pro chão, dedos pra cima, um pouco pra frente e pra fora; cotovelo pra baixo, um pouco
# pra fora e pra trás
PRONTA = Vector((-0.02, -0.27, -0.13))  # punho − ombro (x vezes o lado)
DEDOS_PRONTA = Vector((0.20, -0.40, 1.0))
POLO_PRONTA = Vector((0.35, 0.25, -1.0))
# mãos no chão: o braço quase estendido (ALCANCE do comprimento) chega ao chão BRACO_FRENTE graus à frente da vertical — a NSCA
# manda "reach forward" — com o punho a LAT_PUNHO do meio (mãos um pouco mais abertas que os ombros); dedos pra frente e um
# pouco pra dentro (ACE); a mão fica parada ali até embaixo, com o cotovelo pra trás e pra fora (ACE: "flare outwards")
LAT_PUNHO = 0.25
BRACO_FRENTE = 18
DENTRO = 10               # dedos virados pra dentro (graus)
POLO_CHAO = Vector((0.55, 0.75, 0.35))
ALCANCE = 0.93            # o braço encosta a mão no chão com ~93% do comprimento (cotovelo quase estendido; ~95% depois de a
                          # palma assentar no chão)
ARCO_ALCANCE = 26         # a mão sai do peito e vai pro chão em 26° de descida do corpo: sai com o joelho a ~57° (o break-point
                          # dos atletas de Soga 2023 foi 58,7 ± 11,2°) e encosta com ele a ~31°; em 20° os dedos andavam 84 mm
                          # entre 2 quadros no meio do caminho (limite 80)
AFUNDA_MAO = 0.0008       # palma e dedos apertando o chão
ALCANCE_MAX = 0.96        # no caminho pro chão o punho fica no máximo a 96% do braço (cotovelo ~30° dobrado): na reta da mão do
                          # peito até o chão o braço travava esticado (0°) e o punho chegava a 76° de extensão
ALINHA = 0.3              # no meio do caminho os dedos seguem 30% do antebraço (punho menos dobrado); 0 no peito e no chão


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos (aqui não há pegador: as mãos ficam abertas)
    rig = bon.rig
    PB = rig.pose.bones

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── corpo reto dos joelhos à cabeça: as coxas estendem no quadril até joelho → quadril → orelha ficar em linha ────────
    dedos_repouso = {L: p3.mundo_osso(rig, L + "ToeBase").to_3x3() for L, _ in LADOS}
    for _ in range(2):
        g = tc.linha_joelho_quadril_cabeca(ck.posicoes(rig))[0] - LINHA
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(g))         # + = o joelho vai pra trás (extensão do quadril)
    jl = ck.posicoes(rig)
    print("CORPO RETO | linha joelho-quadril-cabeça %.1f° | quadril (com sinal) %s" % (
        tc.linha_joelho_quadril_cabeca(jl)[0], "/".join("%.1f" % q for q in tc.quadril_sinal(jl))))

    # ── ajoelhado: canela pra trás (subindo beta), pé quase em pé, dedos deitados no chão ───────────────────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length

    def ajoelhar(beta, ajuste=None):
        """Canelas subindo `beta` graus pra trás (+ `ajuste[lado]` em cada uma: o boneco não é simétrico ao milímetro e um pé
        ficava 5 mm acima do chão), pés quase em pé e dedos deitados no chão."""
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        for lado, _ in LADOS:
            b = beta + (ajuste or {}).get(lado, 0.0)
            v = p3.cabeca(rig, lado + "Foot") - p3.cabeca(rig, lado + "Leg")
            p3.girar_osso(rig, lado + "Leg", p3.rot_x(b - math.degrees(math.atan2(v.z, v.y))))   # canela: giro no joelho
            # pé: canela × pé = TORNOZELO → o pé aponta pra baixo, inclinado (90 + b − TORNOZELO)° pra trás
            f = p3.cabeca(rig, lado + "ToeBase") - p3.cabeca(rig, lado + "Foot")
            p3.girar_osso(rig, lado + "Foot", p3.rot_x(b - TORNOZELO - math.degrees(math.atan2(f.z, f.y))))
            # dedos de volta à orientação de repouso no mundo: deitados no chão, pra frente
            p3.girar_osso(rig, lado + "ToeBase", dedos_repouso[lado] @ p3.mundo_osso(rig, lado + "ToeBase").to_3x3().inverted())
        dedos = pele(("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, -AFUNDA_DEDOS - dedos[:, 2].min())))

    def contato_joelho():
        """Pele mais baixa da canela perto do joelho (onde ele apoia na almofada)."""
        K = p3.cabeca(rig, "LeftLeg")
        P = pele(("LeftLeg", "RightLeg"))
        return float(P[P[:, 1] < K.y + 0.15][:, 2].min())

    topo = CHAPA + ALMOFADA
    beta = 5.0
    for _ in range(6):                     # beta até o joelho apoiar na almofada de 3" (com os dedos no chão)
        ajoelhar(beta)
        erro = contato_joelho() + AFUNDA_JOELHO - topo
        if abs(erro) < 0.0003:
            break
        beta += math.degrees(erro / (canela * math.cos(math.radians(beta))))
    ajoelhar(beta)
    ajuste = {}
    for lado, _ in LADOS:                  # cada pé com os dedos no chão: a canela de cada lado sobe/desce o que falta
        z = float(pele((lado + "Foot", lado + "ToeBase"))[:, 2].min()) + AFUNDA_DEDOS
        ajuste[lado] = -math.degrees(z / (canela * math.cos(math.radians(beta))))
    ajoelhar(beta, ajuste)
    print("PÉS | ajuste da canela E %+.2f° D %+.2f° | dedos E %.1f D %.1f mm" % (
        ajuste["Left"], ajuste["Right"], *(float(pele((L + "Foot", L + "ToeBase"))[:, 2].min()) * 1000 for L, _ in LADOS)))
    K = (p3.cabeca(rig, "LeftLeg") + p3.cabeca(rig, "RightLeg")) / 2
    j = ck.posicoes(rig)
    print("AJOELHADO | canela sobe %.1f° | joelho (%.3f %.3f %.3f) | tornozelo %s | joelho %s | contato %.4f (topo %.4f)" % (
        beta, *K, "/".join("%.0f" % a for a in tc.tornozelo(j)),
        "/".join("%.0f" % a for a in (ck.medir_juntas(rig)["joelhoE"], ck.medir_juntas(rig)["joelhoD"])),
        contato_joelho(), topo))
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}

    def inclinar(alfa):
        """Corpo do joelho pra cima inclinado `alfa` graus à frente: a pelve gira em volta do eixo dos joelhos e as canelas
        giram o contrário (pés e dedos não saem do lugar)."""
        for n, M in base.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        if alfa:
            p3.girar_osso(rig, "Hips", p3.rot_x(alfa), pivo=K)
            for lado, _ in LADOS:
                p3.girar_osso(rig, lado + "Leg", p3.rot_x(-alfa))

    # ── embaixo: o corpo (fora mãos, braços e o que fica na almofada) a CHAO_EMBAIXO do chão ─────────────────────────
    CORPO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftUpLeg", "RightUpLeg", "LeftShoulder", "RightShoulder")

    def mais_baixo(quem=False):
        co, _, (nomes, dono) = _malha(bon)
        m = _grupo(nomes, dono, CORPO) & (co[:, 1] < K.y - FRENTE_ALMOFADA - 0.01)   # o que passa da frente da almofada
        i = np.where(m)[0][np.argmin(co[m][:, 2])]
        return (float(co[i, 2]), nomes[dono[i]]) if quem else float(co[i, 2])

    lo, hi = 60.0, 95.0
    for _ in range(12):
        meio = (lo + hi) / 2
        inclinar(meio)
        if mais_baixo() > CHAO_EMBAIXO:
            lo = meio
        else:
            hi = meio
    alfa_b = lo
    inclinar(alfa_b)
    z_b, quem_b = mais_baixo(quem=True)
    print("EMBAIXO | corpo inclina %.1f° | parte mais baixa (%s) a %.1f mm do chão" % (alfa_b, quem_b, z_b * 1000))
    inclinar(0.0)

    # ── braços: IK do ombro ao punho; a mão vira pela palma e pelos dedos (o jeito do maos3d.Maos.segurar) ──────────────
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    punhos, polos, iks = {}, {}, {}
    for lado, s in LADOS:                 # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, -0.3)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
        iks[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    dedos_pose = {}
    angulo_polo = {}

    def esticar_dedos(lado):
        """Dedos esticados no plano da palma e um pouco abertos, polegar deitado do lado do indicador (a mão de apoio da
        remada unilateral, lote 2)."""
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
        """Com a palma no chão: cada dedo (e o polegar) gira só na base, pro lado da palma, até a pele mais baixa dele
        encostar no chão (AFUNDA_MAO); sem passar disso."""
        palma, eixo_nos = pg._base(rig, lado)[:2]
        co, _, (nomes, dono) = _malha(bon)
        for d in p3.DEDOS + ("Thumb",):
            # dedos giram na base (MCP); o polegar no osso do meio (a base dele é a eminência tenar, que já apoia com a palma)
            ossos = ["%sHand%s%d" % (lado, d, i) for i in ((1, 2, 3) if d != "Thumb" else (2, 3))]
            P = co[_grupo(nomes, dono, ossos)]
            h = p3.cabeca(rig, ossos[0])
            f = (p3.ponta(rig, ossos[0]) - h).normalized()
            eixo = eixo_nos if d != "Thumb" else f.cross(palma).normalized()
            sinal = 1 if eixo.cross(f).dot(palma) > 0 else -1          # + = gira pro lado da palma (pro chão)
            escolha = None
            for g in np.arange(-25.0, 30.01, 0.5):                     # do mais esticado pro mais dobrado
                if pg._rot(P, np.array(h), eixo, g * sinal)[:, 2].min() <= -AFUNDA_MAO:
                    escolha = float(g)
                    break
            if escolha is None:
                print("  dedo %s %s não chega no chão" % (lado, d))
                continue
            if escolha:
                p3.girar_osso(rig, ossos[0], p3.rot_eixo(escolha * sinal, eixo))
            print("  dedo %s %s: base gira %+.1f°" % (lado, d, escolha))

    def por_mao(lado, W, dedos_q, palma_q, polo, alinhar=0.0):
        """Punho em W, dedos pra `dedos_q` e palma pra `palma_q` (mundo), cotovelo do lado do `polo`. alinhar (0–1): quanto
        os dedos seguem o antebraço em vez de `dedos_q` (punho menos dobrado no meio do caminho pro chão; o jeito do
        maos3d.Maos.segurar)."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        iks[lado].mute = False
        punhos[lado].location = W
        polos[lado].location = polo
        p3.atualizar()
        if lado not in angulo_polo:
            angulo_polo[lado] = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
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
        # 2) o resto no punho, pela base da PALMA (punho → base dos dedos, normal da palma): o osso da mão sai um pouco do
        # plano dela e, alinhando o osso, a palma ficava inclinada no chão (os dedos ~25° no ar)
        n_m, _, y_m = pg._base(rig, lado)[:3]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        dq = (dedos_q * (1 - alinhar) + ax * alinhar).normalized()
        pq = (palma_q - dq * palma_q.dot(dq)).normalized()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        if lado in dedos_pose:
            for n, M in dedos_pose[lado].items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (p3.cabeca(rig, lado + "Hand") - W).length

    # mãos prontas à frente do peito, com o boneco ajoelhado ereto: guardadas no referencial do tórax (Spine2)
    T0 = p3.mundo_osso(rig, "Spine2")
    T0i = T0.inverted()
    R0i = T0.to_3x3().inverted()
    pronta = {}
    for lado, s in LADOS:
        S = p3.cabeca(rig, lado + "Arm")
        W = S + Vector((s * PRONTA.x, PRONTA.y, PRONTA.z))
        d = Vector((s * DEDOS_PRONTA.x, DEDOS_PRONTA.y, DEDOS_PRONTA.z)).normalized()
        pl = Vector((0, -1, 0))
        pol = S + Vector((s * POLO_PRONTA.x, POLO_PRONTA.y, POLO_PRONTA.z))
        pronta[lado] = (T0i @ W, R0i @ d, R0i @ pl, T0i @ pol)
    for lado, s in LADOS:                 # dedos esticados (pose local guardada, igual em todo quadro)
        por_mao(lado, T0 @ pronta[lado][0], T0.to_3x3() @ pronta[lado][1], T0.to_3x3() @ pronta[lado][2],
                T0 @ pronta[lado][3])
        esticar_dedos(lado)
        dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}

    def alvo_pronta(lado):
        T = p3.mundo_osso(rig, "Spine2")
        W, d, pl, pol = pronta[lado]
        return T @ W, T.to_3x3() @ d, T.to_3x3() @ pl, T @ pol

    # ── mãos no chão: o corpo inclinado em que o braço quase estendido (ALCANCE) chega ao chão BRACO_FRENTE° à frente da
    # vertical ("reach forward", NSCA); a mão espalma ali e fica parada até embaixo ─────────────────────────────────────────
    MAO = {L: tuple(n for n in BRACO[L] if n.startswith(L + "Hand")) for L, _ in LADOS}
    PUNHO_Z = 0.03                         # altura do punho com a palma no chão (chute; acertada pela pele abaixo)

    def ponto_no_chao(alfa, lado, s, z=PUNHO_Z):
        inclinar(alfa)
        S = p3.cabeca(rig, lado + "Arm")
        return S, Vector((s * LAT_PUNHO, S.y - (S.z - z) * math.tan(math.radians(BRACO_FRENTE)), z))

    alfa_c = {}
    for lado, s in LADOS:
        lo, hi = 20.0, alfa_b
        for _ in range(14):
            meio = (lo + hi) / 2
            S, W = ponto_no_chao(meio, lado, s)
            if (W - S).length > ALCANCE * (Lb + La):
                lo = meio
            else:
                hi = meio
        alfa_c[lado] = hi
    alfa_c = min(alfa_c.values())
    alfa_r = alfa_c - ARCO_ALCANCE
    chao, ombro_c = {}, {}
    for lado, s in LADOS:
        d = Vector((-s * math.sin(math.radians(DENTRO)), -math.cos(math.radians(DENTRO)), 0.0))
        pl = Vector((0, 0, -1))
        S, W = ponto_no_chao(alfa_c, lado, s)
        pol = S + Vector((s * POLO_CHAO.x, POLO_CHAO.y, POLO_CHAO.z))
        for _ in range(4):                 # palma no chão: o punho desce/sobe até a pele da palma (com a tenar) encostar
            por_mao(lado, W, d, pl, pol)
            W.z += -AFUNDA_MAO - float(pele((lado + "Hand", lado + "HandThumb1"))[:, 2].min())
        por_mao(lado, W, d, pl, pol)
        dedos_no_chao(lado)                # cada dedo dobra na base até a polpa encostar; a pose dos dedos vale em todo quadro
        dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        chao[lado] = (W.copy(), d, pl)
        ombro_c[lado] = S.copy()
        H = pele(MAO[lado])
        print("MÃO %s no chão | punho (%.3f %.3f %.3f) | ombro (%.3f %.3f %.3f) | braço %.3f de %.3f | mão z %.1f..%.1f mm" % (
            lado, *W, *S, (W - S).length, Lb + La, H[:, 2].min() * 1000, H[:, 2].max() * 1000))
    print("MÃOS | saem do peito com o corpo a %.1f°, encostam no chão a %.1f° e ficam até %.1f° (t %.3f → %.3f)" % (
        alfa_r, alfa_c, alfa_b, alfa_r / alfa_b, alfa_c / alfa_b))

    def bracos(alfa):
        w = _suave((alfa - alfa_r) / (alfa_c - alfa_r))
        for lado, s in LADOS:
            Wp, dp, plp, polp = alvo_pronta(lado)
            Wc, dc, plc = chao[lado]
            S = p3.cabeca(rig, lado + "Arm")
            polc = S + Vector((s * POLO_CHAO.x, POLO_CHAO.y, POLO_CHAO.z))
            if w <= 0:
                por_mao(lado, Wp, dp, plp, polp)
                continue
            # o braço vai abrindo aos poucos: o punho anda no referencial do ombro, da posição pronta (à frente do peito) pra
            # do toque no chão (girando a direção e alongando a distância), e no fim cola no ponto do chão sem velocidade —
            # com a mão indo em linha reta do peito pro chão o braço esticava de repente e os dedos andavam 93 mm num quadro
            vp, vc = Wp - S, Wc - ombro_c[lado]
            Q = S + vp.normalized().slerp(vc.normalized(), w) * (vp.length + (vc.length - vp.length) * w)
            W = Q.lerp(Wc, w ** 4)            # Q já chega no ponto do chão; isto só zera a velocidade no toque (puxar antes
                                              # pro ponto do chão, que ainda está fora do alcance, esticava o braço cedo)
            d = W - S                       # segurança: o punho nunca passa de ALCANCE_MAX do braço (cotovelo travado)
            if d.length > ALCANCE_MAX * (Lb + La):
                W = S + d * (ALCANCE_MAX * (Lb + La) / d.length)
            M = _quat(dp, plp).slerp(_quat(dc, plc), w).to_matrix()   # base da mão (dedos, palma) da pronta pra do chão
            pol = polp.lerp(polc, w)
            por_mao(lado, W, M.col[0], M.col[1], pol, alinhar=ALINHA * math.sin(math.pi * w))

    def pose(t):
        """t=0 ajoelhado ereto, t=1 embaixo (corpo a 5 cm do chão, mãos espalmadas no chão)."""
        alfa = alfa_b * t
        inclinar(alfa)
        bracos(alfa)

    # ── apoio nórdico montado em volta do corpo (canelas, pés e dedos não mexem) ─────────────────────────────────────
    inclinar(0.0)
    bracos(0.0)
    co, _, (nomes, dono) = _malha(bon)
    pes = co[_grupo(nomes, dono, ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))]
    baixo = pes[pes[:, 2] < topo + 0.01]
    y1 = float(baixo[:, 1].min()) - FOLGA_PE_ALMOFADA             # a almofada termina antes do peito do pé e dos dedos
    y0 = K.y - FRENTE_ALMOFADA
    # rolos: em cima do tendão de Aquiles, ROLO_ACIMA acima do tornozelo ao longo da canela
    rolos_z, rolos_x = [], []
    for lado, s in LADOS:
        A = p3.cabeca(rig, lado + "Foot")
        Kl = p3.cabeca(rig, lado + "Leg")
        u = (Kl - A).normalized()
        c = A + u * ROLO_ACIMA
        P = pele((lado + "Leg", lado + "Foot"))
        Q = P[(np.abs(P[:, 1] - c.y) < RAIO_ROLO) & (np.abs(P[:, 0] - c.x) < COMPR_ROLO / 2)]
        # centro do rolo: o mais baixo em que nenhum ponto da pele entra mais que AFUNDA_ROLO nele (círculo no plano YZ)
        dy = Q[:, 1] - c.y
        zc = float((Q[:, 2] + np.sqrt(np.maximum(RAIO_ROLO ** 2 - dy ** 2, 0))).max()) - AFUNDA_ROLO
        rolos_z.append(zc)
        rolos_x.append(abs(c.x))
    y_r = float(np.mean([p3.cabeca(rig, L + "Foot").y for L, _ in LADOS])) - ROLO_ACIMA
    # os 2 rolos estão no mesmo eixo: na altura do lado mais baixo, pros 2 tornozelos ficarem presos (o outro afunda uns mm a
    # mais na espuma; na altura do mais alto o tornozelo direito ficava 2,4 mm solto embaixo do rolo)
    z_rolos = min(rolos_z)
    pecas = e3.apoio_nordico("apoio_nordico", almofada=(y0, y1, ALMOFADA, LARG_ALMOFADA), chapa=CHAPA,
                             rolos=(y_r, z_rolos, RAIO_ROLO, COMPR_ROLO, float(np.mean(rolos_x))))
    p3.atualizar()
    almofada, rolos, estrutura = pecas["almofada"], pecas["rolos"], pecas["estrutura"]
    print("APOIO | almofada y %.3f → %.3f (topo %.4f) | rolos y %.3f z %.3f (E %.3f D %.3f) x ±%.3f" % (
        y0, y1, topo, y_r, z_rolos, rolos_z[0], rolos_z[1], float(np.mean(rolos_x))))

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        maos = {L: G(tuple(n for n in BRACO[L] if n.startswith(L + "Hand"))) for L, _ in LADOS}
        return ("joelho %.0f/%.0f° | quadril (com sinal) %.0f/%.0f° | linha joelho-quadril-cabeça %.0f° | tronco %.0f° | "
                "coluna %.0f° | cabeça × tronco %.0f° | tronco a %.0f mm do chão | cabeça a %.0f mm | mãos a %.0f/%.0f mm | "
                "cotovelo %.0f/%.0f° | punho %.0f/%.0f°" % (
                    juntas["joelhoE"], juntas["joelhoD"], *tc.quadril_sinal(jj), tc.linha_joelho_quadril_cabeca(jj)[0],
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], G(("Spine", "Spine1", "Spine2"))[:, 2].min() * 1000,
                    G(("Head",))[:, 2].min() * 1000, maos["Left"][:, 2].min() * 1000, maos["Right"][:, 2].min() * 1000,
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"]))

    for t in (0.0, alfa_r / alfa_b, alfa_c / alfa_b, 1.0):
        pose(t)
        print("t=%.3f | %s" % (t, info()))

    return Cena(pose, [estrutura], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.35, 0.55),
                camera_video=((3.8, -1.6, 1.1), (0, -0.35, 0.55), 50), info=info, apoios=[almofada, rolos],
                afunda_apoio_mm=20)


def _quat(dedos, palma):
    """Orientação (quaternion) da base dedos/palma/lado da mão."""
    d = Vector(dedos).normalized()
    p = Vector(palma)
    p = (p - d * p.dot(d)).normalized()
    return Matrix((d, p, d.cross(p))).transposed().to_quaternion()
