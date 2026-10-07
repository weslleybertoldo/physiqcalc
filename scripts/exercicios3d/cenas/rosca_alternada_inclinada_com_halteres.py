# Rosca Alternada Inclinada com Halteres — cena da fábrica 3D (lote 4, 06/10/2026).
# t = 0 braço direito em cima (cotovelo dobrado, halter na frente do ombro) e esquerdo embaixo · t = 0,5 os dois embaixo,
# pendurados e quase estendidos · t = 1 braço esquerdo em cima e direito embaixo. O app toca 0 → 1 e volta 1 → 0: o direito
# desce, o esquerdo sobe; o esquerdo desce, o direito sobe — cada braço faz a repetição inteira (sobe e desce) enquanto o
# outro espera embaixo, como no ExRx (Dumbbell Incline Curl): "raise one dumbbell [...] Lower to original position and
# repeat with opposite arm. Continue to alternate between sides."
# Banco a 45° (ExRx: "Sit back on 45-60 degree incline bench"; Zabaleta-Korta 2023: "lying supine on a bench with 45º
# inclination"), glúteo no assento, costas e cabeça no encosto, pés chapados. Braços pendurados na vertical (ExRx: "With
# arms hanging down straight"): com o encosto a 45° o braço fica ~45° atrás da linha do tronco — é essa extensão do ombro
# que alonga a cabeça longa do bíceps (Oliveira 2009: "seated with 50° of trunk hyperextension and the right arm hanging
# freely"; "In the IDC protocol the biceps brachii long head is initially lengthened"). Cotovelo parado ao lado do corpo
# (ExRx: "With elbows back to sides"): o braço não se mexe, só o cotovelo dobra. Pegada supinada o tempo todo
# (Zabaleta-Korta 2023: "keep the hand always completely supinated"): a palma fica pra frente embaixo, pra cima no meio e
# virada pro ombro em cima (ExRx: "palm faces shoulder"). Punho reto (a mão segue o antebraço).
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from cena import Cena

ANGULO = 45            # encosto, graus da horizontal (ExRx: 45–60°; Zabaleta-Korta 2023: 45°)
ASSENTO = 0.44         # topo do assento (m), o dos outros bancos da fábrica
PE_X = 0.18            # tornozelos a 18 cm do meio (pés a ~1,7× a largura do quadril). Com os 25 cm do supino inclinado
                       # as coxas abriam e a anilha de dentro do halter passava a 7 mm da coxa no meio da subida; com
                       # 18 cm, a ~16 mm (medido 06/10/2026)
TETA = (8, 137)        # antebraço × vertical (graus), embaixo → em cima. Embaixo o cotovelo fica a ~8° (quase esticado:
                       # Oliveira 2009, "started from a slightly flexed position (around 20°)"); em cima a ~134°, o
                       # máximo antes da pele do antebraço entrar na do bíceps (medido 06/10/2026: 136,6° → 4 mm além do
                       # vinco do cotovelo; o braço não pode ir pra frente, então o antebraço não chega à vertical)
LARG_COT = 0.06        # cotovelo 6 cm pra fora do ombro: braço ~14° aberto do tronco, ainda ao lado do corpo
FORA_PUNHO = 0.06      # punho 6 cm pra fora do cotovelo (o ângulo de carregamento do cotovelo supinado)
VOLTA_TOPO = (95, 0.7) # do antebraço a 95° da vertical (halter já acima do quadril) até em cima, o punho volta 70% pra linha
                       # do braço: em cima o halter fica na frente do ombro, não aberto pra fora dele
RAIO = 0.0145          # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13        # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LADOS = (("Left", 1), ("Right", -1))
# Halter × quadril (medido 06/10/2026): com o encosto a 45° e o braço na vertical, no meio da subida (cotovelo a ~70–85°)
# o halter passa do lado da articulação do quadril, onde a coxa é mais larga. Com o cotovelo 2 cm pra fora do ombro e o
# punho 5 cm pra fora do cotovelo a anilha de dentro entrava 37 mm na coxa; voltando o punho pra linha do braço já no meio
# da subida (o carregamento sumindo com a flexão), 45 mm; com o cotovelo 6 cm e o punho 6 cm pra fora ela passa a ~16 mm.


def curl(t, lado):
    """Quanto o braço `lado` está dobrado no quadro t (0 = embaixo, 1 = em cima): o direito desce de t=0 a 0,5 e o esquerdo
    sobe de 0,5 a 1. O quadrado deixa o braço com velocidade zero embaixo (t=0,5, um para e o outro sai) e o app volta em
    t=0 e t=1 (em cima), também parado."""
    if lado == "Right":
        return (1 - 2 * t) ** 2 if t < 0.5 else 0.0
    return (2 * t - 1) ** 2 if t > 0.5 else 0.0


def montar(bon):
    pg.usar_polegar("volta")                           # polegar dando a volta no halter (exercícios novos, 05/10/2026)
    rig = bon.rig
    PB = rig.pose.bones
    junta_y = dt.inclinar(bon, ANGULO, ASSENTO, pe_x=PE_X)
    banco = e3.banco_inclinado("banco", ANGULO, ASSENTO, junta_y)
    punhos, polos, iks = {}, {}, {}
    for lado, _ in LADOS:                              # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=RAIO_ANILHA) for l, _ in LADOS}
    print("GEOMETRIA junta do banco y %.3f | ombro E (%.3f %.3f %.3f) | braço %.3f antebraço %.3f | quadril E "
          "(%.3f %.3f %.3f)" % (junta_y, *S["Left"], Lb, La, *p3.cabeca(rig, "LeftUpLeg")), flush=True)

    def _teta(f):
        return math.radians(p3.lerp(*TETA, f))

    def _alvos(fs):
        """Cotovelo parado embaixo do ombro (braço na vertical) e o punho no círculo do antebraço, no ângulo do quadro."""
        for lado, s in LADOS:
            teta = _teta(fs[lado])
            E = S[lado] + Vector((s * LARG_COT, 0, -math.sqrt(Lb ** 2 - LARG_COT ** 2)))
            x = max(0.0, min(1.0, (math.degrees(teta) - VOLTA_TOPO[0]) / (TETA[1] - VOLTA_TOPO[0])))
            dx = s * FORA_PUNHO * (1 - VOLTA_TOPO[1] * x * x * (3 - 2 * x))
            rho = math.sqrt(La ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S[lado]).normalized()            # polo do lado em que o cotovelo calculado fica (rosca martelo)
            fora = (E - S[lado]) - eixo * (E - S[lado]).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()

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
            ax = (f1 - f0).normalized()                    # supinação: a palma vira pro lado em que o antebraço sobe
            quer = Vector((0, -math.cos(teta), math.sin(teta)))
            quer = (quer - ax * quer.dot(ax)).normalized()
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

    pose.dedos = {}

    _alvos({"Left": 0.5, "Right": 0.5})                # polo certo do cotovelo no meio do movimento
    for lado, _ in LADOS:
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        j = ck.posicoes(rig)
        med = ck.medir_juntas(rig)
        pol = {l: pose.dedos.get(l, {}).get("Thumb") for l, _ in LADOS}
        vao = {l: (p[8] if isinstance(p, tuple) and len(p) > 8 else float("nan")) for l, p in pol.items()}
        bf = ck.tc.braco_frente(j)
        return ("cotovelo E %.0f° D %.0f° | braço atrás do tronco E %.0f° D %.0f° | polegar × falange média E %.1f D %.1f mm"
                % (med["cotoveloE"], med["cotoveloD"], -bf[0], -bf[1], vao["Left"], vao["Right"]))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.1, 0.65),
                camera_video=((-2.6, -2.6, 1.5), (0, 0.1, 0.65), 50), info=info, apoios=[banco], afunda_apoio_mm=20)
