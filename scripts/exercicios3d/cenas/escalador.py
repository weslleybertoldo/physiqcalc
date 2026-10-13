# Escalador — cena da fábrica 3D (lote 13, 12/10/2026). Peso corporal, no chão (sem equipamento: o apoio é o chão), sem colchonete
# (o Coice em Quatro Apoios, o 1º dos 4 de chão do lote, decidiu o chão; as 4 fontes com foto — free-exercise-db, ACE, NSCA, FM 7-22 —
# fazem no chão). CÍCLICO (como a Corrida na Esteira): t = 0 → 1 é UM ciclo — o joelho esquerdo volta e vem, o direito vem e volta —
# e a pose em t = 1 é IGUAL à de t = 0; a ficha tem "ciclo": true e o app repete o clipe.
# t = 0: o pé ESQUERDO na frente, embaixo do corpo, e a perna direita esticada atrás (FM 7-22: "Starting Position: Front leaning rest
# position with the left foot below the chest and between the arms"; a ACE também começa com a esquerda) · troca (os 2 pés no ar) ·
# t = 0,5: o direito na frente e a esquerda atrás · troca · t = 1 = t = 0.
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha):
#  · free-exercise-db, Mountain Climbers (o fonte_en): "Begin in a pushup position, with your weight supported by your hands and toes.
#    Flexing the knee and hip, bring one leg until the knee is approximately under the hip." · "Explosively reverse the positions of
#    your legs, extending the bent leg until the leg is straight and supported by the toe, and bringing the other foot up with the hip
#    and knee flexed."
#  · ExRx, Mountain Climber: "Place hands on floor, slightly wider than shoulder width. On forefeet, position one leg forward bent
#    underbody and extend other leg back." · "While holding upper body in place, alternate leg positions by pushing hips up while
#    immediately extending forward leg back and pulling rear leg forward underbody, landing on both forefeet simultaneously."
#  · ACE, Mountain Climbers (#258): "fingers pointing forwards"; "fully extending your right leg behind you, with your foot in dorsi
#    flexion, (toes pointing towards your shins, heel up)"; "Both feet leave the ground as your drive your right knee forward and
#    extend your left leg back."
#  · NSCA (Kinetic Select, Football-Specific Speed Drills): "the athlete flexes one leg at the knee and hip and positions that foot on
#    the ground under the hips. The hips do not rise away from the ground." · "The hips should not bounce or rise during this
#    movement." · "The back is flat, head neutral, and hips and knees fully extended" · "keep the drive knee between the arms".
#  · U.S. Army FM 7-22 (2012), Mountain Climber: "The hands are directly below the shoulders with the fingers spread (middle fingers
#    pointing straight ahead) with the elbows straight, not locked." · "Do not raise the hips and buttocks when moving throughout the
#    exercise." · "Align the head with the spine" · "Throughout the exercise, remain on the balls of the feet." · "Move the legs
#    straight forward and backward, not at angles." · "Cadence: MODERATE" e "MODERATE–80 counts per minute" (1 troca por contagem).
#  · NASM: "Make sure the shoulders stay over the wrists and the core stays tight, keeping the back flat." · "Keep the feet light and
#    trunk movement minimal."
# Decisões: a mão, o braço e a escápula são os da Flexão de Braço em cima (mãos um pouco mais abertas que os ombros, ombro bem em cima
# do punho, cotovelo a 5°), mas com os dedos pra frente (ACE #258, FM 7-22) e PARADOS o ciclo todo — aqui os braços não dobram. O
# QUADRIL fica na altura dos ombros, com as costas retas perto da horizontal, e PARADO: não dá pra ficar na reta da prancha da flexão
# (quadril a 0,42 m) — na troca a coxa que vem pra frente passa pela vertical embaixo do quadril, e com a coxa de 0,42 m do boneco o
# joelho bateria no chão; e o pé da frente não pousaria embaixo do corpo sem passar do limite do quadril. As fotos da NSCA (fig. 2.1 e
# 2.2), do FM 7-22 (fig. 9-4) e da ACE (258-1 e 258-3) mostram o mesmo: as costas retas, quase horizontais, com o quadril na altura dos
# ombros. O pé da frente pousa na bola do pé, embaixo do corpo, uns 20 cm atrás da articulação do quadril, quase em pé (na ponta dos
# dedos) — a NSCA ("positions that foot on the ground under the hips"); a coxa no peito da ACE e o pé embaixo do peito do FM 7-22 passam
# do limite do quadril (a ficha diz por quê). A perna de trás fica esticada, na bola do pé, com o tornozelo dobrado (a da Flexão). As
# 2 pernas trocam JUNTAS e rápido (0,30 s), com os 2 pés no ar, e pousam juntas; entre as trocas os 2 pés ficam parados no chão.
# Como o rig faz: o tronco (osso Hips) gira à frente em volta da linha dos quadris até as costas ficarem quase horizontais, com o centro
# dos quadris a QUADRIL_Z do chão, e as escápulas um pouco protraídas (a Flexão em cima); os braços vão por IK do ombro ao punho parado
# no chão e a mão vira pela palma e pelos dedos, espalmada no chão (o jeito da Flexão de Braço: palma e cada dedo encostando ~1 mm
# dentro). O tronco, os braços e a cabeça ficam PARADOS; só as pernas mexem. Cada perna vai por IK do quadril ao tornozelo (polo do
# joelho à frente e embaixo), com o pé e os dedos girados no mundo (travas de rotação): no apoio a bola do pé fica num ponto do chão e
# os dedos deitados nele; na troca o tornozelo vai de uma posição de apoio à outra numa curva lisa (sobe uns cm no meio) e o pé gira
# junto.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
# ── mãos, braços e escápulas: a prancha alta da Flexão de Braço, em cima ───────────────────────────────────────────────────────────
PEGADA = 1.35           # base do dedo médio de uma mão à outra ÷ distância entre as cabeças do úmero: um pouco mais aberta que os
                        # ombros (ExRx, Mountain Climber: "Place hands on floor, slightly wider than shoulder width"); no boneco ~1,2 =
                        # mãos na largura dos ombros
DENTRO = 0.0            # dedos pra frente (ACE #258: "fingers pointing forwards"; FM 7-22: "middle fingers pointing straight ahead")
COTOVELO = 5.0          # flexão do cotovelo (graus): esticado sem travar (FM 7-22: "with the elbows straight, not locked")
ESCAPULA = 5.0          # giro da clavícula em volta do eixo do tronco (graus, + = protração): a da Flexão de Braço em cima (ExRx,
                        # Mountain Climber: "Static: Scapula & Clavicle Protraction")
AFUNDA_MAO = 0.0008     # palma e dedos apertando o chão
# ── tronco ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
QUADRIL_Z = 0.505       # altura do centro das articulações do quadril (m): na altura dos ombros (~0,52), as costas quase horizontais
QUADRIL_Y = 0.05        # o quadril fica em y = QUADRIL_Y: o corpo fica centrado perto de y = 0 (o alvo da câmera)
# ── pernas ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
X_PE = 0.14             # tornozelos a ±X_PE do meio, nas 2 posições: as pernas vão e voltam retas (FM 7-22: "Move the legs straight
                        # forward and backward, not at angles"), na largura do quadril (ACE #258: "knees and feet hip-width apart")
JOELHO_TRAS = 3.0       # flexão do joelho da perna de trás (graus): esticada (NSCA: "hips and knees fully extended")
TORNOZELO_TRAS = 90.0   # canela × pé da perna de trás (tecnica3d.tornozelo; em pé ~76°): flexão dorsal, o calcanhar pra cima (ACE
                        # #258: "with your foot in dorsi flexion, (toes pointing towards your shins, heel up)"); a da Flexão de Braço
BOLA_ATRAS = 0.21       # a bola do pé da frente pousa a isso ATRÁS do centro das articulações do quadril (m): embaixo do corpo (NSCA:
                        # "positions that foot on the ground under the hips")
TORNOZELO_FRENTE = 93.0 # canela × pé da perna da frente: quase no limite da flexão dorsal (20° = ~96° no boneco, Alazzawi 2017) — o pé
                        # quase em pé, na bola do pé (FM 7-22: "remain on the balls of the feet")
AFUNDA_PE = 0.001       # bola do pé e dedos apertando o chão
# ── ciclo (ficha: ida_s = CICLO_S) ───────────────────────────────────────────────────────────────────────────────────────────────
CICLO_S = 1.5           # s por ciclo (2 trocas): FM 7-22, "Cadence: MODERATE" = "80 counts per minute", 1 troca por contagem
TROCA = 0.20            # fração do ciclo de cada troca (0,30 s, os 2 pés no ar); o resto (0,45 s) os 2 pés parados no chão
LEVANTA = {"vem": 0.045, "vai": 0.045}    # o tornozelo sobe até LEVANTA a mais no meio da troca (m), rápido na saída (os dedos saem do
                                        # chão logo no 1º quadro) e no pouso (descem por cima do ponto de apoio)
DOBRA = {"vem": 25.0, "vai": 20.0}      # o joelho dobra isso a mais no meio da troca (graus): o pé que vem pra frente sobe (o calcanhar
                                        # vai pro glúteo) e o que vai pra trás passa por cima do chão
DOBRA_PICO = {"vem": 0.4, "vai": 0.5}   # quando (fração da troca) o joelho dobra mais: antes do meio no pé de trás que sai (o quadril
                                        # dobrando com a perna quase esticada levaria o pé pro chão); no meio no que vai pra trás
RELAXA_TORNOZELO = 15.0 # no meio da troca a canela × pé solta isso (o pé no ar fica perto do neutro, ~76° no boneco)
RELAXA_DEDOS = 30.0     # no meio da troca os dedos soltam isso (voltam pra linha do pé) e se esticam de novo pro pouso


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def fase(t, lado):
    """Fase da perna no quadro t: ("frente", 0) / ("tras", 0) no apoio, ("vai", u) frente → trás e ("vem", u) trás → frente na troca
    (u de 0 a 1). A esquerda fica na frente em t = 0; a direita, meio ciclo depois."""
    a = (0.5 - TROCA) / 2                        # meia largura do apoio
    x = (t + (0.0 if lado == "Left" else 0.5)) % 1.0
    if x <= a + 1e-9 or x >= 1 - a - 1e-9:
        return "frente", 0.0
    if x < a + TROCA:
        return "vai", (x - a) / TROCA
    if x <= 1 - a - TROCA + 1e-9:
        return "tras", 0.0
    return "vem", (x - (1 - a - TROCA)) / TROCA


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos (aqui não há pegador: as mãos ficam abertas, espalmadas)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length
    L1 = (c("LeftLeg") - c("LeftUpLeg")).length
    L2 = (c("LeftFoot") - c("LeftLeg")).length
    # pé e dedos no repouso: ângulo abaixo da horizontal (apontando pra frente, −Y) e a bola do pé em relação ao tornozelo
    SIG_PE0, SIG_DEDO0, BOLA_REL = {}, {}, {}
    for L, _ in LADOS:
        A0, T0, Tp = c(L + "Foot"), c(L + "ToeBase"), p3.ponta(rig, L + "ToeBase")
        SIG_PE0[L] = math.degrees(math.atan2(-(T0 - A0).z, -(T0 - A0).y))
        SIG_DEDO0[L] = math.degrees(math.atan2(-(Tp - T0).z, -(Tp - T0).y))
        BOLA_REL[L] = T0 - A0
    S0 = {L: c(L + "Arm") for L, _ in LADOS}

    # ── tronco: gira à frente em volta da linha dos quadris; o centro dos quadris fica em (0, QUADRIL_Y, QUADRIL_Z) ──────────────
    hips0 = PB[p3.P + "Hips"].matrix_basis.copy()

    def escapula(g):
        """Clavícula (osso Shoulder) girada `g` graus em volta do eixo do tronco: + = protração (a Flexão de Braço)."""
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            PB[p3.P + lado + "Shoulder"].matrix_basis = Matrix()
            p3.atualizar()
            if g:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))

    def tronco(phi):
        PB[p3.P + "Hips"].matrix_basis = hips0.copy()
        p3.atualizar()
        Q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(phi), pivo=Q, mover=Vector((-Q.x, QUADRIL_Y - Q.y, QUADRIL_Z - Q.z)))
        escapula(ESCAPULA)

    # ── braços: IK do ombro ao punho; a mão vira pela palma e pelos dedos (o jeito da Flexão de Braço) ────────────────────────────
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
        """Dedos esticados no plano da palma e um pouco abertos, polegar deitado do lado do indicador (a mão de apoio da Flexão de
        Braço e do Coice em Quatro Apoios)."""
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
        chão (AFUNDA_MAO); sem passar disso (a Flexão de Braço)."""
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
        """Punho em W, dedos pra `dedos_q` e palma pra `palma_q` (mundo), cotovelo do lado do `polo` (a Flexão de Braço)."""
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
        # linha dos nós (indicador → mínimo) da mão no fim: de lado (s · dedos × palma); o antebraço gira (pronação) até ela ficar
        # nessa direção e o punho depois só estende, sem torcer (conserto de 11/10/2026 da Flexão de Braço)
        nos_q = dedos_q.cross(palma_q) * (1 if lado == "Left" else -1)
        ax = (f1 - f0).normalized()
        quer = nos_q - ax * nos_q.dot(ax)
        tem = pg._base(rig, lado)[1]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        n_m, _, y_m = pg._base(rig, lado)[:3]             # o resto no punho, pela base da PALMA (punho → nós, normal)
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

    def polo_mundo(lado, s):
        """Polo do cotovelo a partir do ombro: pra trás (pros pés), pra fora e pra baixo (o do Coice em Quatro Apoios)."""
        return c(lado + "Arm") + Vector((s * 0.25, 0.45, -0.25))

    # ── tronco inclinado até os ombros ficarem bem em cima dos punhos com os braços esticados (COTOVELO) ────────────────────────
    D = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO)))
    nos = 0.110                           # punho → base do dedo médio (m), medido no boneco (a Flexão de Braço)
    W = {L: Vector((s * (PEGADA * abs(S0["Left"].x - S0["Right"].x) / 2 + nos * math.sin(math.radians(DENTRO))), 0.0, 0.018))
         for L, s in LADOS}

    def resolver_phi():
        """Giro do tronco (graus, a partir de em pé) em que o braço chega no punho (W, embaixo do ombro) com o cotovelo a COTOVELO."""
        lo, hi = 60.0, 110.0
        for _ in range(18):
            meio = (lo + hi) / 2
            tronco(meio)
            d = max(math.hypot(c(L + "Arm").x - W[L].x, c(L + "Arm").z - W[L].z) for L, _ in LADOS)
            if d > D:
                lo = meio
            else:
                hi = meio
        return hi

    for volta in range(4):
        phi = resolver_phi()
        tronco(phi)
        for lado, _ in LADOS:
            W[lado].y = c(lado + "Arm").y
        # a palma assenta com o corpo um pouco mais baixo (o braço dobra e o punho chega no alvo; com o braço no limite o punho parava
        # antes e a conta da altura da palma errava — a Flexão de Braço)
        tronco(phi + 6.0)
        for lado, s in LADOS:
            if volta == 0:                # dedos esticados (pose local guardada, igual em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
                esticar_dedos(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
            for _ in range(3):            # o punho desce/sobe até a pele da palma (com a tenar) encostar
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
                W[lado].z += -AFUNDA_MAO - float(pele((lado + "Hand", lado + "HandThumb1"))[:, 2].min())
            if volta == 3:                # cada dedo dobra na base até encostar no chão (vale em todo quadro)
                por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
                dedos_no_chao(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        print("TRONCO volta %d | gira %.2f° | punho E (%.4f %.4f %.4f) D (%.4f %.4f %.4f)" % (volta, phi, *W["Left"], *W["Right"]))
    phi = resolver_phi()
    tronco(phi)
    for lado, s in LADOS:
        W[lado].y = c(lado + "Arm").y
        e = por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, polo_mundo(lado, s))
        print("MÃO %s | punho a %.1f mm do alvo | palma %.1f mm | dedos %s mm" % (
            lado, e * 1000, float(pele((lado + "Hand",))[:, 2].min()) * 1000,
            "/".join("%.1f" % (float(pele(tuple("%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)))[:, 2].min()) * 1000)
                     for d in p3.DEDOS + ("Thumb",))))
    Q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    v = c("Neck") - c("Hips")
    print("TRONCO | gira %.2f° | quadris (%.3f %.3f %.3f) | ombros z %.3f | tronco (quadril → pescoço) %.1f° acima da horizontal" % (
        phi, *Q, (c("LeftArm").z + c("RightArm").z) / 2, math.degrees(math.atan2(v.z, math.hypot(v.x, v.y)))))

    # ── pernas: IK do quadril ao tornozelo; pé e dedos com o giro posto no mundo (travas de rotação) ───────────────────────────────
    alvos, polos_j, iks_p, rot_pe, rot_dedo = {}, {}, {}, {}, {}
    for L, s in LADOS:
        alvos[L] = p3.vazio("tornozelo_" + L, c(L + "Foot"))
        polos_j[L] = p3.vazio("polo_joelho_" + L, Vector((s * X_PE, QUADRIL_Y - 0.8, -0.9)))
        iks_p[L] = p3.ik(rig, L + "Leg", alvos[L], polos_j[L])
        rot_pe[L] = p3.travar_rotacao(rig, L + "Foot")
        rot_dedo[L] = p3.travar_rotacao(rig, L + "ToeBase")
    M_pe0 = {L: rot_pe[L].matrix_world.copy() for L, _ in LADOS}
    M_dedo0 = {L: rot_dedo[L].matrix_world.copy() for L, _ in LADOS}

    def rot_x(graus):
        return Matrix.Rotation(math.radians(graus), 4, "X")

    def por_perna(L, A, sp, sd):
        """Tornozelo em A (alvo do IK), o pé apontando sp graus abaixo da horizontal (pra frente) e os dedos sd graus."""
        alvos[L].location = A
        rot_pe[L].matrix_world = rot_x(sp - SIG_PE0[L]) @ M_pe0[L]
        rot_dedo[L].matrix_world = rot_x(sd - SIG_DEDO0[L]) @ M_dedo0[L]
        p3.atualizar()

    def bola(L, A, sp):
        return A + rot_x(sp - SIG_PE0[L]).to_3x3() @ BOLA_REL[L]

    def lado_i(L):
        return 0 if L == "Left" else 1

    def contato_pe(L):
        """Pele mais baixa do pé (Foot + ToeBase), z em m: a do pé inteiro, a da bola do pé (até 1,2 cm à frente da base dos dedos) e a
        da ponta dos dedos (de 3 cm em diante). A região sai da POSIÇÃO de cada vértice ao longo dos dedos, não do dono: a pele dos
        dedos do pé ESQUERDO do boneco é presa quase toda no osso do pé (de 0,5 a 3,5 cm à frente da base ela acompanha só 17–40% de um
        giro dos dedos; no direito, 22–78%) e o dono do vértice muda de um pé pro outro."""
        co, _, (nomes, dono) = _malha(bon)
        P = co[_grupo(nomes, dono, (L + "Foot", L + "ToeBase"))]
        T = c(L + "ToeBase")
        u = (p3.ponta(rig, L + "ToeBase") - T).normalized()
        al = (P - np.array(T)) @ np.array(u)
        return float(P[:, 2].min()), float(P[al <= 0.012][:, 2].min()), float(P[al >= 0.030][:, 2].min())

    def pe_pelo_tornozelo(L, A, beta):
        """Ângulo do pé (graus abaixo da horizontal, apontando pra frente) com o tornozelo em A e canela × pé = beta, no plano da perna
        (YZ): o joelho sai do IK; o pé é a canela girada −beta (pra frente e pra baixo)."""
        alvos[L].location = A
        p3.atualizar()
        cn = A - c(L + "Leg")
        b = math.radians(beta)
        fy, fz = cn.y * math.cos(-b) - cn.z * math.sin(-b), cn.y * math.sin(-b) + cn.z * math.cos(-b)
        return math.degrees(math.atan2(-fz, -fy))

    def dedos_encostam(L, A, sp):
        """Os dedos do pé giram (em volta da base, no mundo) até a pele da ponta deles encostar no chão (−AFUNDA_PE); devolve o
        ângulo dos dedos (graus abaixo da horizontal)."""
        lo, hi = -30.0, 70.0                          # mais = a ponta dos dedos desce
        for _ in range(14):
            meio = (lo + hi) / 2
            por_perna(L, A, sp, meio)
            if contato_pe(L)[2] > -AFUNDA_PE:
                lo = meio
            else:
                hi = meio
        por_perna(L, A, sp, hi)
        return hi

    # polo dos joelhos: acerta o ângulo numa pose de frente (joelho bem dobrado)
    for L, s in LADOS:
        A = Vector((s * X_PE, Q.y + BOLA_ATRAS + 0.01, 0.18))
        por_perna(L, A, 88.0, 5.0)
        e = p3.acertar_polo(rig, iks_p[L], L + "Leg", L + "UpLeg", L + "Foot")
        print("polo joelho %s erro %.3f ang %d" % (L, e[0], e[1]))

    def mostrar(rotulo, L, sp, sd, extra=""):
        zmin, zbola, zded = contato_pe(L)
        jj = ck.posicoes(rig)
        print("%s %s | pé %.2f° | dedos %.2f° | pele: pé %.2f, bola %.2f, ponta dos dedos %.2f mm | tornozelo %.2f° | joelho %.1f° | "
              "bola do pé %+.1f mm do quadril%s" % (rotulo, L, sp, sd, zmin * 1000, zbola * 1000, zded * 1000,
                                                  tc.tornozelo(jj)[lado_i(L)], ck.medir_juntas(rig)["joelho" + ("E" if L == "Left" else "D")],
                                                  tc.bola_do_pe_quadril(jj)[lado_i(L)], extra))
        return zmin

    # ── apoio da FRENTE: a bola do pé BOLA_ATRAS atrás do quadril, canela × pé = TORNOZELO_FRENTE; a pele mais baixa do pé e a ponta
    # dos dedos encostando no chão ─────────────────────────────────────────────────────────────────────────────────────────────────
    FRENTE, TRAS = {}, {}
    for L, s in LADOS:
        sp, zb = 90.0, 0.025
        for volta in range(16):
            B = Vector((s * X_PE, Q.y + BOLA_ATRAS, zb))
            A = B - rot_x(sp - SIG_PE0[L]).to_3x3() @ BOLA_REL[L]
            sp_novo = pe_pelo_tornozelo(L, A, TORNOZELO_FRENTE)
            sd = dedos_encostam(L, A, sp_novo)
            zmin = mostrar("FRENTE volta %d" % volta, L, sp_novo, sd)
            erro = -AFUNDA_PE - zmin
            if abs(erro) < 0.0002 and abs(sp_novo - sp) < 0.02:
                sp = sp_novo
                break
            zb += 0.8 * erro
            sp = sp_novo
        FRENTE[L] = dict(A=A.copy(), sp=sp, sd=sd, beta=TORNOZELO_FRENTE, mtp=sp - sd)

    # ── apoio de TRÁS: perna esticada (JOELHO_TRAS), canela × pé = TORNOZELO_TRAS; a pele mais baixa do pé e a ponta dos dedos
    # encostando no chão ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
    d_tras = math.sqrt(L1 ** 2 + L2 ** 2 + 2 * L1 * L2 * math.cos(math.radians(JOELHO_TRAS)))
    for L, s in LADOS:
        H = c(L + "UpLeg")
        dx = s * X_PE - H.x
        r = math.sqrt(d_tras ** 2 - dx ** 2)
        psi = 23.0
        for volta in range(16):
            A = Vector((s * X_PE, H.y + r * math.cos(math.radians(psi)), H.z - r * math.sin(math.radians(psi))))
            sp = pe_pelo_tornozelo(L, A, TORNOZELO_TRAS)
            sd = dedos_encostam(L, A, sp)
            zmin = mostrar("TRÁS volta %d" % volta, L, sp, sd, " | perna %.2f° abaixo da horizontal" % psi)
            erro = -AFUNDA_PE - zmin
            if abs(erro) < 0.0002:
                break
            psi += 0.8 * math.degrees(-erro / (r * math.cos(math.radians(psi))))
        TRAS[L] = dict(A=A.copy(), sp=sp, sd=sd, beta=TORNOZELO_TRAS, mtp=sp - sd)

    # ângulos de cada apoio no plano da perna (vista de lado): coxa × vertical (+ = à frente), flexão do joelho e a direção quadril →
    # tornozelo (graus abaixo da horizontal, pra trás)
    def flexao_joelho(d):
        return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, (L1 ** 2 + L2 ** 2 - d ** 2) / (2 * L1 * L2)))))

    def dist_joelho(kap):
        return math.sqrt(L1 ** 2 + L2 ** 2 + 2 * L1 * L2 * math.cos(math.radians(kap)))

    def fk_teta(phi, kap):
        """Direção (graus abaixo da horizontal, pra trás) do quadril ao tornozelo com a coxa phi graus à frente da vertical e o joelho
        dobrado kap, na vista de lado (a canela gira pra trás a partir da coxa)."""
        ky, kz = -L1 * math.sin(math.radians(phi)), -L1 * math.cos(math.radians(phi))
        cc = phi - kap
        ay, az = ky - L2 * math.sin(math.radians(cc)), kz - L2 * math.cos(math.radians(cc))
        return math.degrees(math.atan2(-az, ay))

    for L, _ in LADOS:
        H = c(L + "UpLeg")
        for P_ in (FRENTE[L], TRAS[L]):
            por_perna(L, P_["A"], P_["sp"], P_["sd"])
            K, A = c(L + "Leg"), P_["A"]
            P_["phi"] = math.degrees(math.atan2(-(K.y - H.y), -(K.z - H.z)))
            P_["kap"] = flexao_joelho((A - H).length)
            P_["teta"] = math.degrees(math.atan2(-(A.z - H.z), A.y - H.y))
            P_["corr"] = P_["teta"] - fk_teta(P_["phi"], P_["kap"])     # o FK de lado × o apoio de verdade (a perna não fica no plano YZ)
            P_["B"] = bola(L, P_["A"], P_["sp"])
            print("APOIO %s | coxa %.1f° à frente da vertical | joelho %.1f° | quadril → tornozelo %.1f° abaixo da horizontal (FK %+.2f°)" % (
                L, P_["phi"], P_["kap"], P_["teta"], P_["corr"]))

    def perna(L, t):
        """Tornozelo, ângulo do pé e dos dedos (graus abaixo da horizontal) da perna L no quadro t, e a fase. Na troca a perna vai de um
        apoio ao outro pelos ÂNGULOS (como numa corrida): a coxa gira em volta do quadril e o joelho dobra DOBRA a mais no meio (o pé
        sobe, o calcanhar vai pro glúteo), o tornozelo sobe até LEVANTA (os dedos saem do chão logo no começo e pousam por cima),
        a canela × pé solta RELAXA_TORNOZELO no meio (o pé no ar fica perto do neutro) e os dedos soltam RELAXA_DEDOS (voltam pra linha
        do pé) e se esticam de novo pro pouso. Os ângulos começam e acabam devagar (a perna sai e chega parada)."""
        f, u = fase(t, L)
        if f in ("frente", "tras"):
            P_ = FRENTE[L] if f == "frente" else TRAS[L]
            return P_["A"], P_["sp"], P_["sd"], f, u
        de, para = (FRENTE[L], TRAS[L]) if f == "vai" else (TRAS[L], FRENTE[L])
        e = _suave(u)
        solta = math.sin(math.pi * u) ** 2
        lin = lambda k: de[k] + (para[k] - de[k]) * e
        phi = lin("phi")
        kap = lin("kap") + DOBRA[f] * math.sin(math.pi * u ** (math.log(0.5) / math.log(DOBRA_PICO[f]))) ** 2
        teta = fk_teta(phi, kap) + lin("corr")
        H = c(L + "UpLeg")
        s = 1 if L == "Left" else -1
        dx = s * X_PE - H.x
        r = math.sqrt(max(dist_joelho(kap) ** 2 - dx ** 2, 1e-6))
        sobe = math.sin(math.pi * u) * (2.0 - math.sin(math.pi * u))     # sobe rápido na saída e desce rápido no pouso (o dobro do sin)
        A = Vector((s * X_PE, H.y + r * math.cos(math.radians(teta)), H.z - r * math.sin(math.radians(teta)) + LEVANTA[f] * sobe))
        beta = lin("beta") - RELAXA_TORNOZELO * solta
        mtp = lin("mtp") - RELAXA_DEDOS * solta
        sp = pe_pelo_tornozelo(L, A, beta)
        return A, sp, sp - mtp, f, u

    estado = {"t": 0.0}

    def pose(t):
        """t = 0: o pé esquerdo na frente; t = 0,5: o direito; t = 1 igual a t = 0 (ciclo)."""
        estado["t"] = t
        for L, _ in LADOS:
            A, sp, sd, _, _ = perna(L, t)
            por_perna(L, A, sp, sd)

    BOLAS = {L: {"frente": bola(L, FRENTE[L]["A"], FRENTE[L]["sp"]), "tras": bola(L, TRAS[L]["A"], TRAS[L]["sp"])} for L, _ in LADOS}

    def info():
        t = estado["t"]
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        txt = []
        for L, s in LADOS:
            f, u = fase(t, L)
            i = lado_i(L)
            k = "E" if L == "Left" else "D"
            K = c(L + "Leg")
            perto = G((L + "UpLeg", L + "Leg"))
            perto = perto[np.linalg.norm(perto - np.array(K), axis=1) < 0.09]
            b = c(L + "ToeBase")
            desliza = ""
            if f in BOLAS[L]:
                desliza = " desliza %.2f mm" % ((b - BOLAS[L][f]).length * 1000)
            zmin, zbola, zded = contato_pe(L)
            txt.append("%s %s%s: bola do pé %+.1f mm do quadril, z %.1f mm%s | pele: pé %+.1f bola %+.1f ponta dos dedos %+.1f mm | joelho "
                       "%.0f° (centro z %.0f, pele %+.0f mm) | quadril %.0f° | tornozelo %.0f°" % (
                           k, f, (" u %.2f" % u) if f in ("vai", "vem") else "", tc.bola_do_pe_quadril(jj)[i], b.z * 1000, desliza,
                           zmin * 1000, zbola * 1000, zded * 1000, juntas["joelho" + k], K.z * 1000, perto[:, 2].min() * 1000,
                           juntas["quadril" + k], tc.tornozelo(jj)[i]))
        maos = []
        for L, _ in LADOS:
            dedos = "/".join("%+.1f" % (G(tuple("%sHand%s%d" % (L, d, i) for i in (1, 2, 3)))[:, 2].min() * 1000)
                             for d in p3.DEDOS + ("Thumb",))
            maos.append("mão %s: punho a %.1f mm do alvo, palma %+.1f mm, dedos %s mm" % (
                L[0], (c(L + "Hand") - W[L]).length * 1000, G((L + "Hand",))[:, 2].min() * 1000, dedos))
        q = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        return ("quadril z %.1f mm | reta ombro→tornozelo E/D %+.0f/%+.0f mm | costas %.1f° da vertical | coluna %.1f° | cabeça × tronco "
                "%.1f° | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | pélvis (pele) z min %.1f mm | %s | %s" % (
                    q.z * 1000, *tc.quadril_linha_ombro_tornozelo_lado(jj),
                    math.degrees((c("Neck") - c("Hips")).angle(Vector((0, 0, 1)))), tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0],
                    juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"], G(("Hips",))[:, 2].min() * 1000,
                    " | ".join(txt), " | ".join(maos)))

    for t in (0.0, 0.15, 0.20, 0.25, 0.30, 0.35, 0.5):
        pose(t)
        co = _malha(bon)[0]
        print("t=%.2f | corpo x %.3f → %.3f, y %.3f → %.3f, z %.3f → %.3f | %s" % (
            t, co[:, 0].min(), co[:, 0].max(), co[:, 1].min(), co[:, 1].max(), co[:, 2].min(), co[:, 2].max(), info()))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.05, 0.35),
                camera_video=((3.4, -1.9, 1.1), (0, 0.05, 0.32), 50), info=info)
