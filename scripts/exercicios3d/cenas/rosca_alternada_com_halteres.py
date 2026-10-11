# Rosca Alternada com Halteres — cena da fábrica 3D (lote 10, 10/10/2026).
# t = 0 braço direito em cima (cotovelo dobrado, halter na frente do ombro, palma virada pro ombro) e esquerdo embaixo (braço
# quase esticado ao lado do corpo, palma virada pra coxa) · t = 0,5 os dois embaixo · t = 1 esquerdo em cima e direito embaixo.
# O app toca 0 → 1 e volta 1 → 0: o direito desce, o esquerdo sobe; o esquerdo desce, o direito sobe — cada braço faz a
# repetição inteira (sobe e desce) enquanto o outro espera parado embaixo, como na Rosca Alternada Inclinada com Halteres.
# É a rosca de UM braço de cada vez, com a palma girando: a dos 2 braços juntos, com a palma pra frente do começo ao fim, é a
# Rosca Direta com Halteres.
# Técnica (fontes na ficha):
#   • em pé, tronco reto, um halter em cada mão, braços esticados ao lado do corpo com a palma virada pra coxa (free-exercise-db,
#     Dumbbell Alternate Bicep Curl — o "fonte_en" do catálogo: "Stand (torso upright) with a dumbbell in each hand held at arms
#     length. The elbows should be close to the torso and the palms of your hand should be facing your thighs."; ExRx, Dumbbell
#     Curl: "Position two dumbbells to sides, palms facing in, arms straight."; Marcolin 2018, rosca alternada em pé: "A standing
#     posture was maintained");
#   • sobe UM halter e, na subida, o antebraço gira até a palma ficar pra cima (supinação) — começa no começo da subida e acaba
#     antes do antebraço passar da horizontal (free-exercise-db: "curl the right weight as you rotate the palm of the hands until
#     they are facing forward"; ACE, Seated Biceps Curl, variação: "Turn your palms towards your sides and rotate them forward
#     (or up) during the upward phase before your forearms reach horizontal."; Marcolin 2018: "In the DC, the forearm is
#     semiproned at the initial phase of the repetition, after which it assumes a supine position at approximately 90° of elbow
#     flexion until the end of the concentric phase."), até o halter chegar no ombro com a palma virada pra ele (ExRx: "raise one
#     dumbbell and rotate forearm until forearm is vertical and palm faces shoulder"; free-exercise-db: "the dumbbells are at
#     shoulder level");
#   • desce até esticar o braço desvirando a palma pra coxa depois que o antebraço passa da horizontal (free-exercise-db: "Remember
#     to twist the palms back to the starting position (facing your thighs) as you come down."; ACE: "During the downward phase
#     rotate your forearms back inward as your forearms reach horizontal.") e só então sobe o outro (ExRx: "Lower to original
#     position and repeat with opposite arm. Continue to alternate between sides."; NSCA, Hammer curl: "Keep the other arm
#     stationary." / "Alternate arms with each rep.");
#   • o braço fica parado junto do tronco (free-exercise-db: "While holding the upper arm stationary" / "Tip: Only the forearms
#     should move."; ExRx: "With elbows to sides") e só no fim vai um pouco à frente (ExRx: "When elbow is fully flexed, it can
#     travel forward slightly, allowing forearms to be no more than vertical."); tronco parado (ACE, Bicep Curl: "Keep chest
#     still, using just the arms for the movement."), punho reto.
# Montagem: a da Rosca Direta com Halteres (braço e antebraço calculados — ALFA, TETA —, o cotovelo um pouco pra fora do ombro e o
# punho um pouco pra fora do cotovelo, que volta pra linha do braço perto do topo) com a alternância da Rosca Alternada Inclinada
# com Halteres (curl) e a palma girando em volta do eixo do antebraço: da neutra (pro meio do corpo, como na Rosca Martelo com
# Halteres) pra supinada (pro lado em que o antebraço sobe, como na Rosca Direta), conforme o antebraço sobe (_giro). O halter
# fica no vão da mão de referência, na linha dos nós dos dedos.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

ALFA = (6, 17)         # braço (ombro → cotovelo) à frente da vertical, graus: parado em ALFA[0] até o antebraço passar de
                       # VOLTA_TOPO[0] e só então vai até ALFA[1] em cima (ExRx: "When elbow is fully flexed, it can travel
                       # forward slightly"; Q&A "Elbow Drift": "they move the elbows forward slightly as the weight approaches
                       # the top") — o mesmo da Rosca Direta com Halteres
TETA = (20, 149)       # antebraço (cotovelo → punho) à frente da vertical, graus: embaixo → em cima. Cotovelo de ~14° (quase
                       # esticado: Oliveira 2009, "started from a slightly flexed position (around 20°)") a ~131° (o halter na
                       # altura do ombro, na frente dele), como na Rosca Direta com Halteres
GIRO_ATE = 85          # a palma termina de girar (supinada) com o antebraço a GIRO_ATE graus da vertical, um pouco antes da
                       # horizontal (ACE: "before your forearms reach horizontal"; Marcolin 2018: "at approximately 90° of
                       # elbow flexion"); começa a girar junto com a subida (free-exercise-db: "curl the right weight as you
                       # rotate the palm")
LARG_COT = 0.045       # cotovelo 4,5 cm pra fora do ombro: o braço fica ~10° aberto, ao lado do tronco, sem entrar no dorsal
FORA_PUNHO = 0.04      # punho 4 cm pra fora do cotovelo embaixo (o ângulo de carregamento do cotovelo)
VOLTA_TOPO = (95, 0.7) # do antebraço a 95° da vertical até em cima, o punho volta 70% pra linha do braço e o cotovelo vai à
                       # frente (ALFA)
RAIO = 0.0145          # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13        # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LADOS = (("Left", 1), ("Right", -1))


def curl(t, lado):
    """Quanto o braço `lado` está dobrado no quadro t (0 = embaixo, 1 = em cima): o direito desce de t=0 a 0,5 e o esquerdo
    sobe de 0,5 a 1 (a Rosca Alternada Inclinada com Halteres). O quadrado deixa o braço com velocidade zero embaixo (t=0,5, um
    para e o outro sai) e o app volta em t=0 e t=1 (em cima), também parado."""
    if lado == "Right":
        return (1 - 2 * t) ** 2 if t < 0.5 else 0.0
    return (2 * t - 1) ** 2 if t > 0.5 else 0.0


def ss(x):
    """Rampa suave 0 → 1 (smoothstep) com x preso em [0, 1]."""
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def giro(teta_graus):
    """Quanto a palma já girou da neutra (0, virada pra coxa) pra supinada (1, virada pro lado em que o antebraço sobe), com o
    antebraço a `teta_graus` da vertical: começa embaixo e acaba em GIRO_ATE. Na descida é a mesma conta (a palma desvira
    depois que o antebraço passa da horizontal)."""
    return ss((teta_graus - TETA[0]) / (GIRO_ATE - TETA[0]))


def montar(bon):
    pg.usar_polegar("volta")                           # polegar dando a volta no halter (exercícios novos, 05/10/2026)
    rig = bon.rig
    PB = rig.pose.bones
    for lado, _ in LADOS:                              # pés chapados (a pose de repouso já é em pé)
        p3.travar_rotacao(rig, lado + "Foot")
    punhos, polos, iks = {}, {}, {}
    for lado, _ in LADOS:                              # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA) for l, _ in LADOS}

    def _teta(f):
        return math.radians(p3.lerp(*TETA, f))

    def _topo(teta):
        """0 até o antebraço passar de VOLTA_TOPO[0] graus da vertical, 1 em cima (suave nas 2 pontas)."""
        return ss((math.degrees(teta) - VOLTA_TOPO[0]) / (TETA[1] - VOLTA_TOPO[0]))

    def _alvos(fs):
        """Cotovelo no ângulo ALFA (um pouco pra fora do ombro) e o punho no círculo do antebraço, no ângulo TETA de cada braço."""
        for lado, s in LADOS:
            teta = _teta(fs[lado])
            topo = _topo(teta)
            alfa = math.radians(p3.lerp(*ALFA, topo))
            E = S[lado] + Vector((s * LARG_COT, -math.sin(alfa) * Lb, -math.cos(alfa) * Lb)).normalized() * Lb
            dx = s * FORA_PUNHO * (1 - VOLTA_TOPO[1] * topo)
            rho = math.sqrt(La ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S[lado]).normalized()            # polo do lado em que o cotovelo calculado fica (rosca martelo)
            fora = (E - S[lado]) - eixo * (E - S[lado]).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()

    def _palma_quer(lado, s, teta, ax):
        """Pra onde a palma aponta (⟂ ao antebraço `ax`): da neutra — pro meio do corpo, virada pra coxa — pra supinada — pro
        lado em que o antebraço sobe —, girando `giro(teta)` do caminho curto entre as 2 (o da supinação: a palma passa pela
        frente, nunca por trás)."""
        neutra = Vector((-s, 0, 0))
        neutra = (neutra - ax * neutra.dot(ax)).normalized()
        sup = Vector((0, -math.cos(teta), math.sin(teta)))
        sup = (sup - ax * sup.dot(ax)).normalized()
        e2 = ax.cross(neutra)
        if e2.dot(sup) < 0:
            e2.negate()
        fim = math.atan2(sup.dot(e2), sup.dot(neutra))   # ~90°: da neutra até a supinada
        fi = giro(math.degrees(teta)) * fim
        return neutra * math.cos(fi) + e2 * math.sin(fi)

    def pose(t):
        """t=0 direito em cima e esquerdo embaixo, t=0,5 os dois embaixo, t=1 esquerdo em cima e direito embaixo."""
        fs = {l: curl(t, l) for l, _ in LADOS}
        _alvos(fs)
        for lado, s in LADOS:
            nomes = (lado + "Arm", lado + "ForeArm")       # congela o IK em FK pra girar o antebraço
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            teta = _teta(fs[lado])
            pg.mao_de_referencia(rig, lado)
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()                    # a palma gira em volta do eixo do antebraço
            quer = _palma_quer(lado, s, teta, ax)
            tem = pg._base(rig, lado)[0]
            tem = (tem - ax * tem.dot(ax)).normalized()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
            pg.mao_de_referencia(rig, lado)
            g, _ = pg.ponto_na_mao(bon, lado, RAIO)
            eixo = pg._base(rig, lado)[1]                  # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            # polegar perto do quadro anterior (sem salto); t=0 recomeça do zero (checagem e captura saem iguais)
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)
        pose.fs = fs

    pose.dedos = {}
    pose.fs = {}

    _alvos({"Left": 0.5, "Right": 0.5})                # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        j = ck.posicoes(rig)
        med = ck.medir_juntas(rig)
        pol = {l: pose.dedos.get(l, {}).get("Thumb") for l, _ in LADOS}
        volta = {l: isinstance(p, tuple) and len(p) > 10 and p[0] == "volta" and p[10] for l, p in pol.items()}
        vao = {l: (p[8] if volta[l] else float("nan")) for l, p in pol.items()}
        bf = ck.tc.braco_frente(j)
        pd = ck.tc.palma_dentro(j)
        pf = ck.tc.palma_frente(j)
        gi = {l: giro(math.degrees(_teta(pose.fs.get(l, 0.0)))) for l, _ in LADOS}
        hz = {l: halteres[l].location for l, _ in LADOS}
        return ("cotovelo E %.0f° D %.0f° | braço à frente E %.0f° D %.0f° | palma: giro E %.2f D %.2f, pro meio E %.0f° D %.0f°, "
                "× frente E %.0f° D %.0f° | halter E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) | polegar em volta E %s D %s, × falange "
                "média E %.1f D %.1f mm"
                % (med["cotoveloE"], med["cotoveloD"], bf[0], bf[1], gi["Left"], gi["Right"], pd[0], pd[1], pf[0], pf[1],
                   *hz["Left"], *hz["Right"], "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO",
                   vao["Left"], vao["Right"]))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((2.7, -4.0, 1.25), (0, 0, 1.0), 50), info=info)
