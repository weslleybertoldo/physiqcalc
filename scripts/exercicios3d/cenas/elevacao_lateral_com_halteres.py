# Elevação Lateral com Halteres — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 braços pendurados ao lado do corpo · t = 1 braços na altura dos ombros.
# O braço sobe pelo lado, um pouco à frente (20°), com o úmero sem girar (polegar pra frente), o cotovelo levemente dobrado e
# parado, a palma virada pro corpo embaixo e pra baixo em cima, o tronco parado. A mão não passa do cotovelo.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

ELEVA = (12, 88)     # braço × tronco, graus: pendurado (halter por fora da coxa) → na altura do ombro, sem passar
PLANO = 20           # o braço sobe 20° à frente do lado (entre o lateral do estudo e o plano da escápula)
COTOVELO = 12        # cotovelo levemente dobrado, o mesmo do começo ao fim (graus)
RAIO = 0.0145        # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13      # comprimento da pegada do halter (entre as anilhas)
BAIXO = Vector((0, 0, -1))
FRENTE = Vector((0, -1, 0))   # o boneco olha pra −Y


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    for lado in ("Left", "Right"):                     # pés chapados (a pose de repouso já é em pé)
        p3.travar_rotacao(rig, lado + "Foot")
    punhos, polos, iks = {}, {}, {}
    for lado in ("Left", "Right"):                     # alvos nascem no punho de repouso (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    ombro = {l: p3.cabeca(rig, l + "Arm") for l in ("Left", "Right")}
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=0.055) for l in ("Left", "Right")}
    p = math.radians(PLANO)

    def direcoes(t, s):
        """Braço, antebraço e palma (mundo) no instante t, lado s (+1 esquerdo, −1 direito)."""
        th = math.radians(p3.lerp(*ELEVA, t))
        lat = Vector((s * math.cos(p), -math.sin(p), 0))
        arm = (BAIXO * math.cos(th) + lat * math.sin(th)).normalized()
        frente = (FRENTE - arm * FRENTE.dot(arm)).normalized()      # o antebraço dobra pra frente, não pra cima
        fi = math.radians(COTOVELO)
        ante = (arm * math.cos(fi) + frente * math.sin(fi)).normalized()
        w = min(1.0, th / (math.pi / 2))
        palma = BAIXO * w + Vector((-s, 0, 0)) * (1 - w)          # pro corpo embaixo → pra baixo em cima
        return arm, ante, palma.normalized()

    def _alvos(t):
        for lado, s in (("Left", 1), ("Right", -1)):
            S = ombro[lado]
            arm, ante, _ = direcoes(t, s)
            E = S + arm * braco
            W = E + ante * antebraco
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S).normalized()                # polo do lado em que o cotovelo calculado fica
            fora = (E - S) - eixo * (E - S).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()

    def pose(t):
        """t=0 braços pendurados, t=1 braços na altura dos ombros."""
        _alvos(t)
        for lado, s in (("Left", 1), ("Right", -1)):
            nomes = (lado + "Arm", lado + "ForeArm")       # congela o IK em FK pra girar o antebraço
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            pg.mao_de_referencia(rig, lado)
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()
            quer = direcoes(t, s)[2]
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
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    _alvos(0.5)                                        # polo certo do cotovelo no meio do movimento
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l in ("Left", "Right")]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.1),
                camera_video=((1.6, -4.4, 1.35), (0, 0, 1.1), 50))
