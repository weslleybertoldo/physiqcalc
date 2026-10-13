# Rosca Direta com Halteres — cena da fábrica 3D (lote 10, 10/10/2026).
# t = 0 em pé, os braços quase esticados ao lado do corpo, um halter em cada mão com a palma virada pra frente · t = 1 os 2
# cotovelos dobrados, os 2 halteres juntos na frente dos ombros, com a palma virada pro ombro. O app faz a volta (os 2 descem
# juntos). É a rosca dos 2 braços JUNTOS (simultânea): a alternada é a Rosca Alternada com Halteres.
# Técnica (fontes na ficha):
#   • em pé, um halter em cada mão, braços esticados ao lado do corpo, palmas pra frente (free-exercise-db, Dumbbell Bicep Curl —
#     a lista aberta de onde o catálogo tirou o nome: "Stand up straight with a dumbbell in each hand at arm's length. Keep your
#     elbows close to your torso and rotate the palms of your hands until they are facing forward."; Catalyst Athletics, Dumbbell
#     Curl: "Stand with a dumbbell in each hand at arm's length and the palms facing forward.");
#   • pegada supinada do começo ao fim — a palma pra frente embaixo, pra cima no meio e virada pro ombro em cima (Catalyst:
#     "Curl the weights up in front of yourself, then lower under control, keeping the palms facing forward."; ExRx, Dumbbell
#     Curl: "palm faces shoulder" em cima). Começar com a palma virada pro corpo e girar na subida é a ALTERNADA da ExRx e do
#     free-exercise-db ("Dumbbell Alternate Bicep Curl": "the palms of your hand should be facing your thighs") e, no ACE (Seated
#     Biceps Curl com halteres), uma variação ("Turn your palms towards your sides and rotate them forward (or up)");
#   • os 2 sobem juntos (free-exercise-db: "curl the weights"; ACE, Seated Biceps Curl: "bend each elbow in unison"), com os
#     cotovelos parados junto do tronco (free-exercise-db: "keeping the upper arms stationary"; ExRx: "With elbows to sides";
#     NSCA: "Keep your torso and upper arms stationary.") — só no fim o cotovelo vai um pouco à frente (ExRx: "When elbow is fully
#     flexed, it can travel forward slightly, allowing forearms to be no more than vertical.");
#   • sobe até o halter chegar na altura do ombro (free-exercise-db: "Continue to raise the weights until your biceps are fully
#     contracted and the dumbbells are at shoulder level.") e desce até quase esticar (Oliveira 2009: os movimentos começavam
#     "from a slightly flexed position (around 20°)");
#   • tronco parado (ACE, Bicep Curl: "Keep chest still, using just the arms for the movement."), punho reto (ACE, Seated Biceps
#     Curl: "Maintain a neutral wrist position").
# Montagem (a da Rosca Martelo com Halteres + a supinação da Rosca Alternada Inclinada com Halteres): braço e antebraço
# calculados (ALFA, TETA), o cotovelo um pouco pra fora do ombro (LARG_COT) e o punho um pouco pra fora do cotovelo — o ângulo de
# carregamento do cotovelo supinado (FORA_PUNHO) —, que some perto do topo (VOLTA_TOPO: em cima o halter fica na frente do ombro,
# não aberto pra fora dele); o antebraço gira em volta do próprio eixo pra palma ir pro lado em que ele sobe (supinada) e o
# halter fica no vão da mão de referência, na linha dos nós dos dedos.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

ALFA = (6, 17)         # braço (ombro → cotovelo) à frente da vertical, graus: parado em ALFA[0] até o antebraço passar de
                       # VOLTA_TOPO[0] e só então vai até ALFA[1] em cima (ExRx, Q&A "Elbow Drift": "they move the elbows
                       # forward slightly as the weight approaches the top")
TETA = (20, 149)       # antebraço (cotovelo → punho) à frente da vertical, graus: embaixo → em cima. Cotovelo de ~14° (quase
                       # esticado) a ~131°: em cima o antebraço fica a ~31° da vertical e o halter na altura do ombro, na
                       # frente dele (a pele do antebraço encosta na do bíceps sem entrar além do vinco)
LARG_COT = 0.045       # cotovelo 4,5 cm pra fora do ombro: o braço fica ~10° aberto, ao lado do tronco, sem entrar no dorsal
FORA_PUNHO = 0.04      # punho 4 cm pra fora do cotovelo embaixo (o ângulo de carregamento do cotovelo supinado, ~9°): a anilha
                       # de dentro passa na frente da borda de fora da coxa, a ~35 mm dela (com 6 + 5 cm, a ~52 mm, mas os
                       # halteres ficavam abertos demais)
VOLTA_TOPO = (95, 0.7) # do antebraço a 95° da vertical até em cima, o punho volta 70% pra linha do braço e o cotovelo vai à
                       # frente (ALFA)
RAIO = 0.0145          # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13        # comprimento da pegada do halter (entre as anilhas)
RAIO_ANILHA = 0.055
LADOS = (("Left", 1), ("Right", -1))


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

    def _teta(t):
        return math.radians(p3.lerp(*TETA, t))

    def _topo(t):
        """0 até o antebraço passar de VOLTA_TOPO[0] graus da vertical, 1 em cima (suave nas 2 pontas)."""
        x = max(0.0, min(1.0, (math.degrees(_teta(t)) - VOLTA_TOPO[0]) / (TETA[1] - VOLTA_TOPO[0])))
        return x * x * (3 - 2 * x)

    def _alvos(t):
        """Cotovelo no ângulo ALFA (um pouco pra fora do ombro) e o punho no círculo do antebraço, no ângulo TETA."""
        teta = _teta(t)
        topo = _topo(t)
        alfa = math.radians(p3.lerp(*ALFA, topo))
        for lado, s in LADOS:
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

    def pose(t):
        """t=0 braços quase esticados com as palmas pra frente, t=1 cotovelos dobrados com os halteres na frente dos ombros."""
        _alvos(t)
        teta = _teta(t)
        for lado, _ in LADOS:
            nomes = (lado + "Arm", lado + "ForeArm")       # congela o IK em FK pra girar o antebraço
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
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

    _alvos(0.5)                                        # polo certo do cotovelo no meio do movimento
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
        hz = {l: halteres[l].location for l, _ in LADOS}
        return ("cotovelo E %.0f° D %.0f° | braço à frente E %.0f° D %.0f° | palma pro meio E %.0f° D %.0f° | halter E (%.3f %.3f "
                "%.3f) D (%.3f %.3f %.3f) | polegar em volta E %s D %s, × falange média E %.1f D %.1f mm"
                % (med["cotoveloE"], med["cotoveloD"], bf[0], bf[1], pd[0], pd[1], *hz["Left"], *hz["Right"],
                   "sim" if volta["Left"] else "NÃO", "sim" if volta["Right"] else "NÃO", vao["Left"], vao["Right"]))

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((2.7, -4.0, 1.25), (0, 0, 1.0), 50), info=info)
