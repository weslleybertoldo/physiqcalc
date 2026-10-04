# Rosca Martelo com Halteres — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 braços quase estendidos ao lado do corpo · t = 1 cotovelos dobrados, halteres perto dos ombros.
# Pegada neutra (palmas viradas uma pra outra, polegar pra cima) do começo ao fim; cotovelos junto ao tronco.
# Igual à rosca direta (cena aprovada): braço e antebraço calculados, mão de referência e o halter no vão da mão.
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

ALFA = (5, 14)       # braço (ombro→cotovelo) à frente da vertical, graus: embaixo → em cima
TETA = (12, 135)     # antebraço (cotovelo→punho) à frente da vertical, graus: embaixo → em cima
LARG_COT = 0.06      # cotovelo um pouco pra fora do ombro (halter passa por fora da coxa)
FORA_PUNHO = 0.05    # punho um pouco pra fora do cotovelo (ângulo de carregamento ~10°): o halter passa por fora
                     # da coxa
RAIO = 0.0145        # pegada do halter: 29 mm, o cilindro da mão de referência (com 32 mm a mão não fechava:
                     # a barra não cabia no vão e ficava 9 mm longe dos dedos)
PEGADA_H = 0.13      # comprimento da pegada do halter (entre as anilhas)


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

    def _alvos(t):
        alfa = math.radians(p3.lerp(*ALFA, t))
        teta = math.radians(p3.lerp(*TETA, t))
        for lado, s in (("Left", 1), ("Right", -1)):
            S = ombro[lado]
            E = S + Vector((s * LARG_COT, -math.sin(alfa) * braco, -math.cos(alfa) * braco)).normalized() * braco
            dx = s * FORA_PUNHO
            rho = math.sqrt(antebraco ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S).normalized()                # polo do lado em que o cotovelo calculado fica (igual à
            fora = (E - S) - eixo * (E - S).dot(eixo)  # rosca direta): com polo fixo o cotovelo abria até 45°
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()

    def pose(t):
        """t=0 braços quase estendidos, t=1 cotovelos dobrados."""
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
            quer = Vector((-s, 0, 0))                     # pegada neutra: palma pro meio do corpo
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
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((2.7, -4.0, 1.25), (0, 0, 1.0), 50))
