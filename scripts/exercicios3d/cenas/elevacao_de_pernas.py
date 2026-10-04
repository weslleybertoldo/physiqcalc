# Elevação de Pernas — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 deitado de costas no colchonete, pernas estendidas logo acima do chão · t = 1 pernas estendidas na vertical
# (quadril a ~90°, ExRx Lying Straight Leg Raise). Lombar no chão (Workman 2008), mãos ao lado do tronco com as
# palmas pra baixo (Kim 2016), cabeça apoiada. Quem levanta as pernas são os flexores do quadril (iliopsoas e reto
# femoral) e o abdômen segura a pelve (Andersson 1997) — por isso o alvo é o abdômen inteiro, não a "porção
# inferior", que não se sustenta (Lehman & McGill 2001).
import math
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import deitado3d as dt
from cena import Cena

TOPO = 0.012                   # colchonete de 12 mm no chão
AFUNDA = 0.004                 # pele das costas dentro do colchonete
QUADRIL = (8, 88)              # flexão do quadril (graus): pernas logo acima do chão → na vertical
MAO_FORA = 0.13                # punho por fora do ombro (m), mão ao lado do quadril (0,08: braço entrava no tronco)


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    colchonete = e3.caixa("colchonete", (0, -0.03, TOPO / 2), (0.62, 1.95, TOPO), e3.mat_estofado(), chanfro=0.004)
    # deitado de costas com as pernas estendidas (sem IK: elas giram inteiras em volta do quadril)
    pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3),
                  mover=Vector((0, 0, TOPO - AFUNDA - dt.malha(bon, dt.TRONCO)[:, 2].min())))
    pescoco = 0                                # cabeça apoiada: estende o pescoço até a nuca encostar
    while dt.malha(bon, ("Head",))[:, 2].min() > TOPO - 0.002 and pescoco < 30:
        p3.girar_osso(rig, "Neck", p3.rot_x(-1))
        pescoco += 1

    # mãos ao lado do tronco, palmas pra baixo: IK até o punho no colchonete → congela em FK → gira o antebraço
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    for lado, s in dt.LADOS:
        S = p3.cabeca(rig, lado + "Arm")
        dz = TOPO + 0.02 - S.z
        dy = math.sqrt(max(((braco + antebraco) * 0.985) ** 2 - MAO_FORA ** 2 - dz ** 2, 0.01))
        alvo = p3.vazio("punho_" + lado, S + Vector((s * MAO_FORA, -dy, dz)))
        polo = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.4, 0, 0.15)))
        ik = p3.ik(rig, lado + "ForeArm", alvo, polo)
        p3.atualizar()
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        ik.mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        ax = (p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")).normalized()
        quer = Vector((0, 0, -1))
        quer = (quer - ax * quer.dot(ax)).normalized()
        tem = pg._base(rig, lado)[0]
        tem = (tem - ax * tem.dot(ax)).normalized()
        p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
    # as pernas ficam um pouco afastadas, como em repouso: fechando 3° as coxas já entravam 4 mm uma na outra perto
    # da virilha (checagem de 04/10/2026)
    print("DEITADO | pescoço estendido %d° | punho E (%.3f %.3f %.3f)" % (pescoco, *p3.cabeca(rig, "LeftHand")))

    def pose(t):
        """t=0 pernas logo acima do chão, t=1 pernas na vertical."""
        q = p3.lerp(*QUADRIL, t)
        for lado, _ in dt.LADOS:
            PB[p3.P + lado + "UpLeg"].matrix_basis = Matrix()
        p3.atualizar()
        for lado, _ in dt.LADOS:
            p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(-q))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.15, 0.3),
                camera_video=((3.8, -1.9, 1.2), (0, -0.15, 0.35), 50), apoios=[colchonete],
                afunda_apoio_mm=20)
