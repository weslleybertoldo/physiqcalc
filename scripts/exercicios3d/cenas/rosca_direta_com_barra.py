# Rosca Direta com Barra — cena da fábrica 3D. Movimento aprovado pelo Weslley em 03/10/2026 (rosca v3, "1").
# t = 0 braços quase estendidos (barra na frente das coxas) · t = 1 cotovelos dobrados (barra perto dos ombros).
import math
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

# Rosca v2 (03/10/2026, pedido dele: "a mão não está pegando no peso e o peso está entrando dentro do corpo"):
# braço um pouco à frente (a barra passa NA FRENTE das coxas), punhos na largura da pegada (barra rígida),
# antebraço girado pra palma ficar de frente (pegada supinada) e a barra no vão das 2 mãos.
ALFA = (9, 16)       # braço (ombro→cotovelo) à frente da vertical, graus: embaixo → em cima
TETA = (20, 150)     # antebraço (cotovelo→punho) à frente da vertical, graus: embaixo → em cima
LARG_COT = 0.03      # cotovelo um pouco pra fora do ombro (encostado no tronco)
PEGADA = 0.235       # meia distância entre os punhos (largura dos ombros)
RAIO_BARRA = 0.0145
COMPR_BARRA = 1.25


def montar(bon):
    rig = bon.rig
    for lado in ("Left", "Right"):                     # pés chapados (a pose de repouso já é em pé)
        p3.travar_rotacao(rig, lado + "Foot")

    # mãos fechadas ANTES do IK do braço; alvos nascem no punho de repouso (alvo = polo dá NaN)
    punhos, polos, iks = {}, {}, {}
    for lado in ("Left", "Right"):
        p3.fechar_mao(rig, lado, angulos=(60, 80, 60), polegar=(15, 35, 30))
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])

    PB = rig.pose.bones
    ombro = {l: p3.cabeca(rig, l + "Arm") for l in ("Left", "Right")}
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # ~0,25 m
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length  # ~0,26 m
    barra = e3.barra("barra", comprimento=COMPR_BARRA, raio_anilha=0.14, larg_anilha=0.035, pegada=0.95)

    def _palma(lado):
        s = 1 if lado == "Left" else -1
        m = p3.cabeca(rig, lado + "Hand")
        a = p3.cabeca(rig, lado + "HandIndex1") - m
        b = p3.cabeca(rig, lado + "HandPinky1") - m
        return (-(a.cross(b)) * s).normalized()

    def _alvos(t):
        """Alvos do IK: cotovelo e punho calculados (braço e antebraço com o comprimento exato)."""
        alfa = math.radians(p3.lerp(*ALFA, t))
        teta = math.radians(p3.lerp(*TETA, t))
        cots = {}
        for lado, s in (("Left", 1), ("Right", -1)):
            S = ombro[lado]
            E = S + Vector((s * LARG_COT, -math.sin(alfa) * braco, -math.cos(alfa) * braco)).normalized() * braco
            dx = s * PEGADA - E.x
            rho = math.sqrt(antebraco ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S).normalized()
            fora = (E - S) - eixo * (E - S).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
            cots[lado] = E
        p3.atualizar()
        return teta, cots

    def pose(t):
        """t=0 braços quase estendidos, t=1 cotovelos dobrados."""
        teta, cots = _alvos(t)
        for lado in ("Left", "Right"):
            # congela o IK em FK (pra girar o antebraço em volta do próprio eixo sem o IK desfazer)
            nomes = (lado + "Arm", lado + "ForeArm")
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            # supinação: a palma vira pro lado em que o antebraço sobe
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()
            quer = Vector((0, -math.cos(teta), math.sin(teta)))
            quer = (quer - ax * quer.dot(ax)).normalized()
            tem = _palma(lado)
            tem = (tem - ax * tem.dot(ax)).normalized()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
            pose.diag[lado] = (math.degrees(ang), (p3.cabeca(rig, lado + "ForeArm") - cots[lado]).length)
        for lado in ("Left", "Right"):                 # mão de verdade segurando cilindro (pg.ANGULOS_REF)
            pg.mao_de_referencia(rig, lado)
        gs = [pg.ponto_na_mao(bon, lado, RAIO_BARRA)[0] for lado in ("Left", "Right")]
        eixo_b = (gs[0] - gs[1]).normalized()
        barra.rotation_mode = "QUATERNION"
        barra.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo_b)
        barra.location = (gs[0] + gs[1]) / 2
        p3.atualizar()
        for lado in ("Left", "Right"):                 # dedos e polegar fecham até a pele encostar na barra
            # polegar perto do quadro anterior (sem salto); t=0 recomeça do zero (checagem e captura saem iguais)
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, barra.location, eixo_b, RAIO_BARRA, polegar_antes=antes)

    pose.diag = {}
    pose.dedos = {}

    _alvos(0.5)                                        # polo certo do cotovelo no meio do movimento
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    def info():
        d = pose.diag
        return "supinação E %.0f° D %.0f° | cotovelo fora do alvo E %.1f D %.1f mm" % (
            d["Left"][0], d["Right"][0], d["Left"][1] * 1000, d["Right"][1] * 1000)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=COMPR_BARRA / 2)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0, 1.0),
                camera_video=((2.7, -4.0, 1.25), (0, 0, 1.0), 50), info=info)
