# Remada Curvada com Barra — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 braços estendidos, barra pendurada embaixo dos ombros · t = 1 barra perto do abdômen, cotovelos pra trás.
# Tronco inclinado 45° e joelhos levemente dobrados, parados o movimento todo (trabalham braços e escápulas).
from mathutils import Vector, Matrix
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO_BARRA = 0.0145
GRIP_X = 0.26                    # meia pegada pronada (um pouco mais aberta que os ombros)
INCLINA = 45                     # tronco à frente, graus da vertical
RECUA, DESCE = 0.15, -0.07       # quadril pra trás e pra baixo (joelhos levemente dobrados)
BARRIGA = 0.15                   # do osso Spine até o eixo da barra em t = 1 (pele + raio + folga ~3 cm)
PALMA_Q = Vector((0, 1, 0))      # pegada pronada: palma virada pro corpo
DEDOS_Q = Vector((0, 0, -1))     # antebraço na vertical, dedos pra baixo


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    pernas = {}
    for lado, s in (("Left", 1), ("Right", -1)):      # tornozelos fixos, joelhos pra frente
        alvo = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polo = p3.vazio("polo_joelho_" + lado, (s * 0.25, -1.2, 0.55))
        pernas[lado] = p3.ik(rig, lado + "Leg", alvo, polo)
        p3.travar_rotacao(rig, lado + "Foot")
    maos = Maos(bon, RAIO_BARRA)
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=0.2, pegada=1.32)
    R = p3.rot_x(INCLINA)
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    alcance = braco + antebraco + maos.palma * 0.92    # ombro → vão da mão com o braço estendido

    def tronco():
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", R, mover=Vector((0, RECUA, DESCE)))
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-INCLINA * 0.45))   # cabeça na linha do tronco, olhar à frente

    def pose(t):
        """t=0 braços estendidos, t=1 barra no abdômen."""
        tronco()
        S = {l: p3.cabeca(rig, l + "Arm") for l in ("Left", "Right")}
        meio = (S["Left"] + S["Right"]) / 2
        c0 = Vector((0, meio.y, meio.z - alcance * 0.96))
        c1 = p3.cabeca(rig, "Spine") + R @ Vector((0, -BARRIGA, 0.03))
        c1.x = 0
        centro = c0.lerp(c1, t)
        barra.rotation_mode = "XYZ"
        barra.rotation_euler = (0, 0, 0)
        barra.location = centro
        p3.atualizar()
        for lado, s in (("Left", 1), ("Right", -1)):
            g = centro + Vector((s * GRIP_X, 0, 0))
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S[lado] + Vector((s * 0.30, 0.45, 0.55)), alinhar=0.5)
        for lado in ("Left", "Right"):               # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, centro, Vector((1, 0, 0)), RAIO_BARRA,
                                                  polegar_antes=antes)

    pose.dedos = {}

    pose(0.5)                                         # polo certo do cotovelo no meio do movimento
    for lado in ("Left", "Right"):
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        print("polo joelho", lado, "erro %.3f ang %d" % e)

    bk = ck.Barra(barra, raio=RAIO_BARRA, meio_compr=1.0)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.0, 0.85),
                camera_video=((4.0, -2.83, 1.16), (0, 0.0, 0.8), 50), info=maos.info)
