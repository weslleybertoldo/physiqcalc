# Prancha — cena da fábrica 3D (lote 13, 12/10/2026). Peso corporal, ISOMÉTRICO, no chão (sem equipamento nem colchonete: o apoio é o
# chão — o Coice em Quatro Apoios, o 1º dos 4 de chão do lote, decidiu o chão e o Escalador seguiu).
# Caminho A (decisão do Weslley, 11/10/2026, "1"): entra na posição, segura e sai. CÍCLICO ("ciclo": true na ficha, t = 1 igual a t = 0;
# o app repete): t = 0 é a PRANCHA MONTADA (a foto parada do app); segura; o QUADRIL desce até a barriga, a pelve e as coxas encostarem no
# chão, com os antebraços, os ombros e as pontas dos pés parados (t = 0,5 é o meio do tempo embaixo); o quadril sobe de novo até o corpo
# ficar reto e segura até o fim do ciclo (que emenda com a segurada do começo).
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha):
#  · free-exercise-db, Plank (o fonte_en): "Get into a prone position on the floor, supporting your weight on your toes and your forearms.
#    Your arms are bent and directly below the shoulder." · "Keep your body straight at all times, and hold this position as long as
#    possible."
#  · ExRx, Front Plank: "Lie prone on mat. Place forearms on mat, elbows under shoulders. Place legs together with forefeet on floor." ·
#    "Raise body upward by straightening body in straight line. Hold position." · "Muscles are exercised isometrically."
#  · ACE, Front Plank (#32): "Lie prone (on your stomach) on an exercise mat or floor with your elbows close to your sides and directly
#    under your shoulders, palms down and hands facing forward." · "dorsiflex your ankles (pull toes towards your shins)" · "Slowly lift
#    your entire torso off the floor or mat, maintaining a stiff torso and legs. Avoid any arching (sagging) in your low back, hiking
#    (upwards) in your hips or bending in the knees. Avoid shrugging your shoulder and keep your shoulders positioned directly over your
#    elbows with your palms facing down." · "Downward Phase: While maintaining a stiff torso and extended knees, gently lower your body
#    back towards the mat or floor before relaxing."
#  · NSCA (Basics of Strength and Conditioning Manual, 6b. Elbow Planks): "Elbows should be directly under shoulders"; "Head remains in a
#    neutral position to keep the body in line"; "Avoid letting hips sag and arching lower back"; "Keep elbows directly under shoulders
#    throughout the entire exercise".
#  · MuscleWiki, Forearm Plank (vídeo antigo de lado, 4,68 s, cópia do Internet Archive de 06/09/2023): deitado com a barriga, a pelve e
#    as coxas no chão e o tronco apoiado nos antebraços (cotovelo embaixo do ombro), o quadril sobe até o corpo ficar reto (~0,7 s),
#    segura e desce de novo até o chão (~1,3 s); os antebraços, os ombros e as pontas dos pés não saem do lugar.
# Decisões: a entrada e a saída são as do ExRx, da ACE e do vídeo antigo do MuscleWiki — deitado de bruços com os antebraços já no lugar
# (cotovelo embaixo do ombro) e o quadril subindo. Descer o corpo INTEIRO reto até deitar com o peito no chão não fecha com os antebraços
# e as pontas dos pés parados (o ombro preso em cima do cotovelo e a ponta do pé presa: a reta ombro → pé não encurta; o peito só chega
# no chão se os cotovelos ou os pés escorregarem): embaixo o corpo fica deitado em cima das coxas, com o tronco apoiado nos antebraços e o
# peito no ar — o "Lie prone ... elbows under shoulders" do ExRx e da ACE. A coxa musculosa do boneco não amassa: o meio dela encosta no
# chão e a pelve e os joelhos ficam ~3 cm acima (a pele de perto do quadril e a de perto do joelho na mesma altura: a coxa deitada).
# Os antebraços ficam PARALELOS, apontando pra frente, com as
# palmas chapadas no chão (ACE: "palms down and hands facing forward"; Strand et al. 2014: "hands were directly in front of the
# elbows"), o braço em pé (Strand 2014: "the humerus formed a perpendicular line to the horizontal plane, directly beneath the
# shoulders"; Lehman et al. 2005: "upper arms perpendicular to the floor") e o cotovelo a ~90°.
# Como o rig faz: em pé, os joelhos esticam, os pés ficam o mais juntos que der sem uma coxa entrar na outra, o quadril fica na reta
# ombro → tornozelo e o pé faz flexão dorsal (a Flexão de Braço); o corpo todo gira em volta do eixo das bases dos dedos dos pés até o
# ombro ficar na altura em que o braço, EM PÉ, leva o cotovelo até o chão com a pele do antebraço encostando (~1 mm dentro); os dedos dos
# pés voltam deitados no chão, pra frente. O braço vai por IK do ombro ao punho (o cotovelo bem embaixo do ombro e o antebraço deitado
# pra frente) e a mão vira pela palma e pelos dedos, espalmada no chão (o jeito da Flexão de Braço: palma e cada dedo encostando ~1 mm
# dentro, o antebraço girando só até a linha dos nós dos dedos ficar de lado). Na descida os ombros (o meio das cabeças do úmero) ficam
# PARADOS: o tronco gira em volta deles (o quadril desce), a lombar estende um pouco (o tórax fica mais em pé que a pelve, como de bruços
# apoiado nos cotovelos), o joelho dobra — mais no fim da descida (a ACE desce "with extended knees") — até a coxa deitar no chão, e cada
# perna se ajeita com a bola do pé PARADA no chão (o
# tornozelo vai pela interseção das 2 esferas: a do quadril, com o comprimento da perna, e a da bola do pé, com o do pé); o braço refaz o
# IK pro mesmo punho com o mesmo polo (o antebraço e a mão não mexem) e o pescoço compensa parte do giro (a cabeça continua olhando pro
# chão).
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
# ── pernas e pés: os da Flexão de Braço ────────────────────────────────────────────────────────────────────────────────────────────
JOELHO = 1.5            # flexão do joelho na prancha (graus): estendido (ACE: "Contract your quadriceps to extend your legs"; "Avoid ...
                        # bending in the knees"); em pé o boneco tem 7,5°
PES_X = 0.06            # tornozelos a ±6 cm do meio: pés juntos (ExRx: "Place legs together"; MuscleWiki: "Your feet should be together")
COXAS_MM = 1.0          # ... mas sem uma coxa entrar na outra mais que isso (a checagem aceita 2 mm): se entrar, os pés afastam (no
                        # boneco musculoso ficam perto da largura do quadril, como na Flexão de Braço)
TORNOZELO = 90.0        # canela × pé (tecnica3d.tornozelo; em pé ~76°): ~14° de flexão dorsal (ACE: "dorsiflex your ankles (pull toes
                        # towards your shins)"); o limite da flexão dorsal é 20° (Alazzawi 2017) = ~96° no boneco
QUADRIL_LINHA = 0.0     # centro do quadril na reta ombro → tornozelo (mm, tecnica3d.quadril_linha_ombro_tornozelo): o corpo reto
AFUNDA_DEDOS = 0.001    # dedos dos pés apertando o chão
PIVO_Y = 0.90           # o eixo das bases dos dedos dos pés fica em y = PIVO_Y: o corpo fica centrado perto de y = 0
# ── braços e mãos ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
AFUNDA_ANTEBRACO = 0.0008   # pele de baixo do antebraço (perto do cotovelo) apertando o chão
AFUNDA_MAO = 0.0008     # palma e dedos apertando o chão
PERTO_COTOVELO = 0.13   # a parte do antebraço "perto do cotovelo" (m, a partir do centro do cotovelo): é onde o peso apoia
DENTRO = 0.0            # dedos das mãos pra frente (ACE: "palms down and hands facing forward")
ESCAPULA = 3.0          # giro da clavícula em volta do eixo do tronco (graus, + = protração): as escápulas um pouco afastadas, sem
                        # encolher os ombros (ACE: "Avoid shrugging your shoulder"; ExRx: serrátil anterior e peitoral menor
                        # estabilizadores; trapézio médio e inferior e romboides estabilizadores antagonistas)
# ── descida e subida (Caminho A) ───────────────────────────────────────────────────────────────────────────────────────────────────
SEGURA_S = 5.0          # s na prancha montada por ciclo (ACE: "Continue to breath while holding this position for a specified time (5+
                        # seconds)"; o app repete o ciclo)
DESCE_S = 1.3           # s descendo (vídeo antigo do MuscleWiki: ~1,3 s; ACE: "gently lower your body")
EMBAIXO_S = 0.5         # s com o quadril no chão (vídeo antigo do MuscleWiki: ~0,5 s; ACE: "before relaxing")
SOBE_S = 0.8            # s subindo (vídeo antigo do MuscleWiki: ~0,7 s; ACE: "Slowly lift your entire torso")
CICLO_S = SEGURA_S + DESCE_S + EMBAIXO_S + SOBE_S
LOMBAR = 1.1            # embaixo, a extensão da lombar ÷ o giro do tronco em volta dos ombros (o tórax fica mais em pé que a pelve)
LOMBAR_DIV = (0.6, 0.4)  # como a extensão da lombar se divide entre os ossos Spine e Spine1
AFUNDA_PELVE = 0.001    # embaixo: a pele mais baixa da barriga, da pelve e das coxas (o meio da coxa) encostando no chão
PESCOCO = 0.7           # o pescoço desfaz essa fração do giro do tórax na descida (a cabeça continua olhando pro chão)

# janela de cada fase no ciclo (t de 0 a 1): o meio do tempo embaixo fica em t = 0,5 (os prints de t = 0,5 mostram o quadril no chão)
T_DESCE = (0.5 - (EMBAIXO_S / 2 + DESCE_S) / CICLO_S, 0.5 - EMBAIXO_S / 2 / CICLO_S)
T_SOBE = (0.5 + EMBAIXO_S / 2 / CICLO_S, 0.5 + (EMBAIXO_S / 2 + SOBE_S) / CICLO_S)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def descida(t):
    """Quanto o quadril já desceu no quadro t (0 = prancha montada, 1 = embaixo), com saída e chegada suaves (seno)."""
    if t <= T_DESCE[0] or t >= T_SOBE[1]:
        return 0.0
    if t < T_DESCE[1]:
        return p3.suave((t - T_DESCE[0]) / (T_DESCE[1] - T_DESCE[0]))
    if t <= T_SOBE[0]:
        return 1.0
    return p3.suave((T_SOBE[1] - t) / (T_SOBE[1] - T_SOBE[0]))


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos (aqui não há pegador: as mãos ficam abertas, espalmadas)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    def quadril_pelve():
        """Coxa × pelve (osso Hips: cabeça → cabeça do Spine), no plano de lado a lado dos quadris, graus [E, D]: + = flexão."""
        lado = (c("RightUpLeg") - c("LeftUpLeg")).normalized()
        up = (c("Spine") - c("Hips"))
        up = (up - lado * up.dot(lado)).normalized()
        out = []
        for L, _ in LADOS:
            t_ = c(L + "Leg") - c(L + "UpLeg")
            t_ = (t_ - lado * t_.dot(lado)).normalized()
            out.append(math.degrees(math.atan2(-lado.dot((-up).cross(t_)), (-up).dot(t_))))
        return out

    print("REPOUSO | quadril × pelve %s" % "/".join("%.1f" % a for a in quadril_pelve()))
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length
    dedos_repouso = {L: p3.mundo_osso(rig, L + "ToeBase").to_3x3() for L, _ in LADOS}

    # ── pernas: joelhos estendidos, pés o mais juntos que der, quadril na linha, flexão dorsal (em pé, antes de deitar) ────────
    for lado, _ in LADOS:
        Hq, K, A = (c(lado + n) for n in ("UpLeg", "Leg", "Foot"))
        coxa, canela = (K - Hq).normalized(), (A - K).normalized()
        flex = math.degrees(coxa.angle(canela))
        quer = coxa.slerp(canela, JOELHO / flex) if flex > JOELHO else canela
        p3.girar_osso(rig, lado + "Leg", canela.rotation_difference(quer).to_matrix())
    coxas_soltas = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}

    def fechar_pernas(px):
        """Cada coxa fecha em volta do quadril até o tornozelo ficar a `px` m do meio; devolve quanto uma coxa entra na outra
        (mm). (a Flexão de Braço)"""
        for lado, s in LADOS:
            PB[p3.P + lado + "UpLeg"].matrix_basis = coxas_soltas[lado].copy()
        p3.atualizar()
        for lado, s in LADOS:
            Hq, A = c(lado + "UpLeg"), c(lado + "Foot")
            v = A - Hq
            dx = s * px - Hq.x
            quer = Vector((dx, v.y, -math.sqrt(max(v.length ** 2 - dx ** 2 - v.y ** 2, 1e-6))))
            p3.girar_osso(rig, lado + "UpLeg", v.rotation_difference(quer).to_matrix())
        co, tri, (nomes, dono) = _malha(bon)
        return ck.corpo_x_corpo(co, tri, nomes, dono)[0]["coxaE×coxaD"]

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
        """Clavícula (osso Shoulder) girada `g` graus em volta do eixo do tronco: + = protração (a Flexão de Braço)."""
        cima = (c("Neck") - c("Hips")).normalized()
        for lado, s in LADOS:
            PB[p3.P + lado + "Shoulder"].matrix_basis = Matrix()
            p3.atualizar()
            if g:
                p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(-s * g), 3, cima))

    escapula(ESCAPULA)
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
    for lado, _ in LADOS:                 # tornozelo: o pé gira no plano canela-pé até canela × pé = TORNOZELO
        K, A, T = (c(lado + n) for n in ("Leg", "Foot", "ToeBase"))
        canela, pe = (A - K).normalized(), (T - A).normalized()
        eixo = canela.cross(pe).normalized()
        p3.girar_osso(rig, lado + "Foot", Matrix.Rotation(math.radians(TORNOZELO - math.degrees(canela.angle(pe))), 3, eixo))
    j = ck.posicoes(rig)
    print("PERNAS | joelho %s | quadril estendeu %.2f° | pés base lateral %.2f | tornozelo %s | quadril × reta %+.1f mm" % (
        "/".join("%.1f" % ck.medir_juntas(rig)["joelho" + l] for l in "ED"), g_q, tc.pes_base_lateral(j)[0],
        "/".join("%.1f" % a for a in tc.tornozelo(j)), tc.quadril_linha_ombro_tornozelo(j)[0]))

    # ── de bruços: o corpo gira em volta do eixo das bases dos dedos; os dedos dos pés voltam deitados no chão ────────────────────
    dedos_alvo = dict(dedos_repouso)

    def dedos_no_lugar():
        for lado, _ in LADOS:
            p3.girar_osso(rig, lado + "ToeBase", dedos_alvo[lado] @ p3.mundo_osso(rig, lado + "ToeBase").to_3x3().inverted())

    def pivo():
        return (c("LeftToeBase") + c("RightToeBase")) / 2

    PHI0 = 80.0
    p3.girar_osso(rig, "Hips", p3.rot_x(PHI0), pivo=pivo())
    dedos_no_lugar()
    pes = pele(("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))
    P0 = pivo()
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((-P0.x, PIVO_Y - P0.y, -AFUNDA_DEDOS - float(pes[:, 2].min()))))
    dedos_no_lugar()
    for lado, _ in LADOS:                 # cada pé com os dedos encostando (o boneco não é simétrico ao milímetro)
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

    # ── braços: IK do ombro ao punho; a mão vira pela palma e pelos dedos (o jeito da Flexão de Braço) ─────────────────────────────
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
        Braço)."""
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
        # nessa direção e o punho depois só acerta a palma, sem torcer (conserto de 11/10/2026 da Flexão de Braço)
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

    def antebraco_z(lado):
        """Pele mais baixa do antebraço (z, m): a da parte perto do cotovelo (até PERTO_COTOVELO do centro do cotovelo) e a do resto."""
        co, _, (nomes, dono) = _malha(bon)
        A = co[_grupo(nomes, dono, (lado + "ForeArm",))]
        perto = np.linalg.norm(A - np.array(c(lado + "ForeArm")), axis=1) <= PERTO_COTOVELO
        return float(A[perto][:, 2].min()), float(A[~perto][:, 2].min())

    # ── a prancha: o braço EM PÉ (o cotovelo bem embaixo do ombro) e o antebraço deitado pra frente; o corpo inclina até a pele do
    # antebraço perto do cotovelo encostar no chão, e o antebraço desce na ponta (ALFA) até a palma encostar ────────────────────────
    ALFA = {L: 4.0 for L, _ in LADOS}     # antebraço descendo pra frente (graus abaixo da horizontal, do cotovelo ao punho)
    POLO = {}

    def braco_no_lugar(lado):
        S = c(lado + "Arm")
        E = S - Vector((0, 0, Lb))
        a = math.radians(ALFA[lado])
        W = E + Vector((0, -math.cos(a), -math.sin(a))) * La
        polo = E + Vector((0, 0.40, -0.30))
        return W, polo

    def bracos(phi):
        inclinar(phi)
        for lado, _ in LADOS:
            W, polo = braco_no_lugar(lado)
            por_mao(lado, W, DEDOS_Q[lado], PALMA_Q, polo)

    def resolver_phi():
        """Giro do corpo (graus, a partir de em pé) em que a pele do antebraço perto do cotovelo encosta no chão (−AFUNDA_ANTEBRACO),
        com o braço em pé: mais giro = ombro mais baixo."""
        lo, hi = 75.0, 92.0
        for _ in range(16):
            meio = (lo + hi) / 2
            bracos(meio)
            z = min(antebraco_z(L)[0] for L, _ in LADOS)
            if z > -AFUNDA_ANTEBRACO:
                lo = meio
            else:
                hi = meio
        return lo

    def palma_z(lado):
        return float(pele((lado + "Hand", lado + "HandThumb1"))[:, 2].min())

    for volta in range(4):
        phi = resolver_phi()
        bracos(phi)
        for lado, _ in LADOS:
            if volta == 0:                # dedos esticados (pose local guardada, igual em todo quadro)
                W, polo = braco_no_lugar(lado)
                por_mao(lado, W, DEDOS_Q[lado], PALMA_Q, polo)
                esticar_dedos(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
            lo, hi = -6.0, 20.0           # o antebraço desce na ponta até a palma (com a tenar) encostar
            for _ in range(12):
                ALFA[lado] = (lo + hi) / 2
                W, polo = braco_no_lugar(lado)
                por_mao(lado, W, DEDOS_Q[lado], PALMA_Q, polo)
                if palma_z(lado) > -AFUNDA_MAO:
                    lo = ALFA[lado]
                else:
                    hi = ALFA[lado]
            ALFA[lado] = hi               # o 1º em que a palma encosta (≤ −AFUNDA_MAO)
            if volta == 3:                # cada dedo dobra na base até encostar no chão (vale em todo quadro)
                W, polo = braco_no_lugar(lado)
                por_mao(lado, W, DEDOS_Q[lado], PALMA_Q, polo)
                dedos_no_chao(lado)
                dedos_pose[lado] = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        print("PRANCHA volta %d | corpo gira %.3f° | antebraço desce %.2f/%.2f° | antebraço perto/longe do cotovelo E %s D %s mm | "
              "palma %.1f/%.1f mm" % (volta, phi, ALFA["Left"], ALFA["Right"],
                                      "/".join("%.1f" % (z * 1000) for z in antebraco_z("Left")),
                                      "/".join("%.1f" % (z * 1000) for z in antebraco_z("Right")),
                                      palma_z("Left") * 1000, palma_z("Right") * 1000))
    PHI_P = phi
    inclinar(PHI_P)

    # ── cada pé com a pele de baixo (a bola do pé) e a ponta dos dedos encostando (~1 mm dentro): o boneco não é simétrico ao milímetro
    # (deitado assim, a planta do pé esquerdo entrava 3 mm no chão e a do direito ficava 5 mm acima) — o joelho dobra uns décimos de
    # grau a mais ou a menos (o tornozelo sobe ou desce) e os dedos giram na base até encostar ────────────────────────────────────
    def dedos_encostam(lado):
        M0 = PB[p3.P + lado + "ToeBase"].matrix_basis.copy()

        def girar(g):
            PB[p3.P + lado + "ToeBase"].matrix_basis = M0.copy()
            p3.atualizar()
            if g:
                p3.girar_osso(rig, lado + "ToeBase", p3.rot_x(g))      # + = a ponta dos dedos desce (em volta da base dos dedos)
        lo, hi = -15.0, 15.0
        for _ in range(11):
            meio = (lo + hi) / 2
            girar(meio)
            if float(pele((lado + "ToeBase",))[:, 2].min()) > -AFUNDA_DEDOS:
                lo = meio
            else:
                hi = meio
        girar(hi)
        dedos_alvo[lado] = p3.mundo_osso(rig, lado + "ToeBase").to_3x3()
        return hi

    for lado, _ in LADOS:
        K0 = PB[p3.P + lado + "Leg"].matrix_basis.copy()

        def ajusta(dk):
            PB[p3.P + lado + "Leg"].matrix_basis = K0.copy()
            p3.atualizar()
            if dk:
                p3.girar_osso(rig, lado + "Leg", p3.rot_x(dk))           # + = o joelho dobra (o tornozelo sobe)
            dedos_no_lugar()
        lo, hi = -1.4, 3.0                # a pele da bola do pé é presa em parte nos dedos: os dedos encostam DENTRO de cada tentativa
        for _ in range(9):
            meio = (lo + hi) / 2
            ajusta(meio)
            dedos_encostam(lado)
            if float(pele((lado + "Foot",))[:, 2].min()) < -AFUNDA_DEDOS:
                lo = meio
            else:
                hi = meio
        ajusta(hi)
        g = dedos_encostam(lado)
        print("PÉ %s | joelho dobra %+.2f° | planta (sem os dedos) z %.2f mm | dedos giram %+.2f° e ficam a %.2f mm" % (
            lado, hi, float(pele((lado + "Foot",))[:, 2].min()) * 1000, g, float(pele((lado + "ToeBase",))[:, 2].min()) * 1000))
    W = {}
    for lado, _ in LADOS:
        W[lado], POLO[lado] = braco_no_lugar(lado)
        e = por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, POLO[lado])
        print("MÃO %s | punho a %.1f mm do alvo | palma %.1f mm | dedos %s mm | antebraço %s mm" % (
            lado, e * 1000, palma_z(lado) * 1000,
            "/".join("%.1f" % (float(pele(tuple("%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)))[:, 2].min()) * 1000)
                     for d in p3.DEDOS + ("Thumb",)), "/".join("%.1f" % (z * 1000) for z in antebraco_z(lado))))
    jj = ck.posicoes(rig)
    S0 = (c("LeftArm") + c("RightArm")) / 2
    print("PRANCHA | corpo gira %.3f° | ombros (%.3f %.3f %.3f) | quadril × reta ombro-tornozelo %+.1f mm | braço × horizontal %s | "
          "cotovelo %s | coluna %.1f | cabeça × tronco %.1f | escápula %s mm | tornozelo %s" % (
              PHI_P, *S0, tc.quadril_linha_ombro_tornozelo(jj)[0],
              "/".join("%.1f" % ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "ForeArm"]})[i] for i in (0, 1)),
              "/".join("%.1f" % ck.medir_juntas(rig)["cotovelo" + l] for l in "ED"), tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0],
              "/".join("%+.0f" % a for a in tc.escapula_frente(jj)), "/".join("%.1f" % a for a in tc.tornozelo(jj))))

    # ── descida: os ombros parados, o tronco gira em volta deles, a lombar estende, o joelho dobra e o pé se ajeita na bola ────────
    MEXE = ("Hips", "Spine", "Spine1", "Neck") + tuple(L + n for L, _ in LADOS for n in ("UpLeg", "Leg", "Foot", "ToeBase"))
    prancha = {n: PB[p3.P + n].matrix_basis.copy() for n in MEXE}
    Q_PRANCHA = quadril_pelve()
    BOLA = {L: c(L + "ToeBase") for L, _ in LADOS}                 # a bola do pé (cabeça do ToeBase): parada no chão
    R_PE = {L: (c(L + "ToeBase") - c(L + "Foot")).length for L, _ in LADOS}
    TORN0 = {L: c(L + "Foot") for L, _ in LADOS}
    estado = {"t": 0.0, "u": 0.0}

    def pose_descida(giro, lombar, joelho):
        """Tronco girado `giro` graus em volta dos ombros (+ = o quadril desce), lombar estendida `lombar` graus, joelhos a `joelho`
        graus de flexão; os pés com a bola parada e os dedos deitados; o pescoço desfaz PESCOCO do giro do tórax; braços no lugar."""
        for n, M in prancha.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        if lombar:                        # extensão da lombar: o tórax sobe em relação à pelve (giro em volta do eixo de lado a lado)
            for n, f in zip(("Spine", "Spine1"), LOMBAR_DIV):
                p3.girar_osso(rig, n, p3.rot_x(-lombar * f))
        Sc = (c("LeftArm") + c("RightArm")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(-giro), pivo=Sc, mover=S0 - Sc)
        if PESCOCO and (giro or lombar):
            p3.girar_osso(rig, "Neck", p3.rot_x(PESCOCO * (giro + lombar)))
        for L, s in LADOS:
            if joelho > JOELHO:           # o joelho dobra (a canela sobe pras costas) em volta do eixo de lado a lado
                p3.girar_osso(rig, L + "Leg", p3.rot_x(joelho - JOELHO))
            H, A = c(L + "UpLeg"), c(L + "Foot")
            d = (A - H).length
            B = BOLA[L]
            hb = B - H
            n = hb.normalized()
            a = (d * d - R_PE[L] ** 2 + hb.length_squared) / (2 * hb.length)
            rho = math.sqrt(max(d * d - a * a, 1e-10))
            C = H + n * a
            ref = TORN0[L] - C
            e = (ref - n * ref.dot(n)).normalized()
            An = C + e * rho                                          # o tornozelo novo: na perna e no pé, do lado de antes
            p3.girar_osso(rig, L + "UpLeg", (A - H).rotation_difference(An - H).to_matrix())
            T = c(L + "ToeBase")
            p3.girar_osso(rig, L + "Foot", (T - An).rotation_difference(B - An).to_matrix())
        dedos_no_lugar()
        for lado, _ in LADOS:
            por_mao(lado, W[lado], DEDOS_Q[lado], PALMA_Q, POLO[lado])

    def baixo_z(quem=False):
        """Pele mais baixa (z, m) da parte de PERTO do quadril (Hips, Spine e a coxa até 18 cm da articulação do quadril), da de perto
        do JOELHO (coxa e perna até 10 cm do centro do joelho) e da barriga + pelve + coxas + joelhos inteiros; quem=True devolve também
        o osso da pele mais baixa do corpo todo (fora mãos, antebraços e pés) e a altura dela."""
        co, _, (nomes, dono) = _malha(bon)
        zq, zj = [float(co[_grupo(nomes, dono, ("Hips", "Spine"))][:, 2].min())], []
        for L, _ in LADOS:
            H, K = np.array(c(L + "UpLeg")), np.array(c(L + "Leg"))
            Pc = co[_grupo(nomes, dono, (L + "UpLeg",))]
            zq.append(float(Pc[np.linalg.norm(Pc - H, axis=1) < 0.18][:, 2].min()))
            Pj = co[_grupo(nomes, dono, (L + "UpLeg", L + "Leg"))]
            zj.append(float(Pj[np.linalg.norm(Pj - K, axis=1) < 0.10][:, 2].min()))
        todo = float(co[_grupo(nomes, dono, ("Hips", "Spine", "LeftUpLeg", "RightUpLeg"))][:, 2].min())
        out = (min(zq), min(zj), min(todo, min(zj)))
        if not quem:
            return out
        m = _grupo(nomes, dono, tuple(n for n in nomes if not n.startswith(("LeftHand", "RightHand", "LeftForeArm", "RightForeArm",
                                                                               "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"))))
        i = np.where(m)[0][np.argmin(co[m][:, 2])]
        return out + (nomes[dono[i]], float(co[i, 2]))

    # ── embaixo: deitado em cima das coxas — a pele de perto do quadril (pelve e começo da coxa) e a de perto do joelho na mesma
    # altura (a coxa deitada) e a mais baixa das 2 encostando no chão. A lombar estende LOMBAR × o giro do tronco em volta dos ombros ─
    def joelho_deita(giro):
        """Flexão do joelho em que a coxa fica deitada: a pele de perto do joelho na altura da de perto do quadril."""
        lo, hi = JOELHO, 60.0
        for _ in range(11):
            meio = (lo + hi) / 2
            pose_descida(giro, LOMBAR * giro, meio)
            zq, zj, _ = baixo_z()
            if zj > zq:
                lo = meio
            else:
                hi = meio
        return lo

    lo, hi = 0.0, 24.0
    for _ in range(11):
        meio = (lo + hi) / 2
        jb = joelho_deita(meio)
        pose_descida(meio, LOMBAR * meio, jb)
        if baixo_z()[2] > -AFUNDA_PELVE:
            lo = meio
        else:
            hi = meio
    GIRO_B = lo
    LOMBAR_B = LOMBAR * GIRO_B
    JOELHO_B = joelho_deita(GIRO_B)
    pose_descida(GIRO_B, LOMBAR_B, JOELHO_B)
    zp, zk, _, quem, zq = baixo_z(quem=True)
    jj = ck.posicoes(rig)
    print("EMBAIXO | a pele mais baixa (fora mãos, antebraços e pés) é de %s a %.1f mm" % (quem, zq * 1000))
    print("EMBAIXO | tronco gira %.2f° em volta dos ombros, lombar estende %.2f°, joelho %.2f° | perto do quadril z %.1f mm, joelho z %.1f mm, peito "
          "z %.1f mm | quadril × pelve %s (na prancha %s) | quadril_sinal %s | coluna_sinal %.1f | tornozelo %s | cabeça × tronco %.1f | "
          "centros z: quadril %.0f joelho %.0f tornozelo %.0f mm" % (
              GIRO_B, LOMBAR_B, JOELHO_B, zp * 1000, zk * 1000, float(pele(("Spine1", "Spine2"))[:, 2].min()) * 1000,
              "/".join("%.1f" % a for a in quadril_pelve()), "/".join("%.1f" % a for a in Q_PRANCHA),
              "/".join("%.1f" % a for a in tc.quadril_sinal(jj)), tc.coluna_sinal(jj)[0],
              "/".join("%.1f" % a for a in tc.tornozelo(jj)), tc.cabeca_tronco(jj)[0],
              c("LeftUpLeg").z * 1000, c("LeftLeg").z * 1000, c("LeftFoot").z * 1000))
    pose_descida(0.0, 0.0, JOELHO)

    def pose(t):
        """t = 0 (e 1): prancha montada; o quadril desce no meio do ciclo (t = 0,5 embaixo) e sobe."""
        u = descida(t)
        estado["t"], estado["u"] = t, u
        pose_descida(GIRO_B * u, LOMBAR_B * u, JOELHO + (JOELHO_B - JOELHO) * u * u)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        co, _, (nomes, dono) = _malha(bon)
        G = lambda partes: co[_grupo(nomes, dono, partes)]
        txt = []
        for L, s in LADOS:
            dedos = "/".join("%+.1f" % (G(tuple("%sHand%s%d" % (L, d, i) for i in (1, 2, 3)))[:, 2].min() * 1000)
                             for d in p3.DEDOS + ("Thumb",))
            zp, zl = antebraco_z(L)
            txt.append("%s: punho a %.1f mm do alvo, cotovelo (%.1f %.1f %.1f) mm, palma %+.1f, dedos %s, antebraço perto/longe do "
                       "cotovelo %+.1f/%+.1f mm, bola do pé desliza %.2f mm" % (
                           L[0], (c(L + "Hand") - W[L]).length * 1000, *(c(L + "ForeArm") * 1000), G((L + "Hand",))[:, 2].min() * 1000,
                           dedos, zp * 1000, zl * 1000, (c(L + "ToeBase") - BOLA[L]).length * 1000)
                       + ", pé: planta %+.1f dedos %+.1f mm" % (G((L + "Foot",))[:, 2].min() * 1000, G((L + "ToeBase",))[:, 2].min() * 1000))
        zp, zk, _ = baixo_z()
        return ("u %.3f | quadril × reta ombro-tornozelo %+.0f mm | quadril_sinal %s | coluna %.1f (sinal %+.1f) | cabeça × tronco %.1f | "
                "joelho %.0f/%.0f° | tornozelo %s | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | braço × horizontal %s | escápula %s mm | "
                "pelve z %.1f mm | joelho (pele) z %.1f mm | %s" % (
                    estado["u"], tc.quadril_linha_ombro_tornozelo(jj)[0], "/".join("%.1f" % a for a in tc.quadril_sinal(jj)),
                    tc.coluna(jj)[0], tc.coluna_sinal(jj)[0], tc.cabeca_tronco(jj)[0], juntas["joelhoE"], juntas["joelhoD"],
                    "/".join("%.0f" % a for a in tc.tornozelo(jj)), juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"],
                    juntas["punhoD"],
                    "/".join("%.1f" % a for a in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["Arm", "ForeArm"]})),
                    "/".join("%+.0f" % a for a in tc.escapula_frente(jj)), zp * 1000, zk * 1000, " | ".join(txt)))

    for t in (0.0, T_DESCE[0], (T_DESCE[0] + T_DESCE[1]) / 2, 0.5, (T_SOBE[0] + T_SOBE[1]) / 2, 1.0):
        pose(t)
        co = _malha(bon)[0]
        print("t=%.3f | corpo x %.3f → %.3f, y %.3f → %.3f, z %.3f → %.3f | %s" % (
            t, co[:, 0].min(), co[:, 0].max(), co[:, 1].min(), co[:, 1].max(), co[:, 2].min(), co[:, 2].max(), info()))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.1, 0.25),
                camera_video=((3.4, -1.9, 1.0), (0, -0.1, 0.22), 50), info=info)
