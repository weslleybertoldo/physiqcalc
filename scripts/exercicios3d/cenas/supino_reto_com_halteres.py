# Supino Reto com Halteres — cena da fábrica 3D (lote 1, 04/10/2026).
# t = 0 braços estendidos, halteres em cima dos ombros (perto um do outro, sem encostar) · t = 1 halteres ao lado
# do peito, antebraço na vertical e cotovelo a ~55° do tronco. Deitado de costas no banco reto (cabeça, costas e
# glúteo no estofado), pés chapados no chão, pegada pronada (palmas pros pés), halter na linha dos nós dos dedos.
import math
from mathutils import Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
from maos3d import Maos
from cena import Cena

RAIO = 0.0145                  # pegada do halter: 29 mm, o cilindro da mão de referência
PEGADA_H = 0.13                # comprimento da pegada do halter (entre as anilhas)
TOPO = 0.44                    # altura do estofado (m)
BANCO_Y = (-0.28, 0.92)        # pé e cabeceira do banco
ABRE = 55                      # cotovelo × tronco embaixo, vista de cima do peito (graus; 90 = em T)
ACIMA_PEITO = 0.02             # pegada do halter embaixo: 2 cm acima da pele mais alta do peito (ao lado dele)
COTOVELO_CIMA = 10             # flexão do cotovelo em cima (estendido sem travar)
PUNHO = 14                     # mão inclinada pra cabeça (extensão do punho): o halter fica em cima do antebraço
DEDOS_Q = Vector((0, math.sin(math.radians(PUNHO)), math.cos(math.radians(PUNHO))))
PALMA_Q = Vector((0, -math.cos(math.radians(PUNHO)), math.sin(math.radians(PUNHO))))   # palma pros pés


def montar(bon):
    rig = bon.rig
    dt.deitar(bon, TOPO)
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=0.055) for l, _ in dt.LADOS}
    maos = Maos(bon, RAIO)
    S = {l: p3.cabeca(rig, l + "Arm") for l, _ in dt.LADOS}
    Lb = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length       # braço
    La = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length      # antebraço

    off = {}                     # vão da mão − punho com a mão nessa orientação (fixa o movimento todo)
    for lado, s in dt.LADOS:
        g = S[lado] + Vector((s * 0.15, 0, 0.55))
        maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S[lado] + Vector((s * 0.5, -0.3, -0.3)))
        off[lado] = g - p3.cabeca(rig, lado + "Hand")

    # caminho com o antebraço SEMPRE na vertical (com os halteres indo em linha reta de cima até embaixo ele deitava
    # 32° no meio): o braço gira em volta do ombro, na direção de ABRE° do tronco, e o punho fica em cima do cotovelo.
    # Em cima o braço sobe até faltar COTOVELO_CIMA° pra esticar; embaixo desce até a pegada ficar 2 cm acima do peito.
    def maos_no_angulo(fi):
        """Pegada de cada mão com o braço `fi` graus acima da horizontal e o antebraço na vertical."""
        g = {}
        for lado, s in dt.LADOS:
            a = math.radians(ABRE)
            cot = S[lado] + Vector((s * math.sin(a) * math.cos(math.radians(fi)), -math.cos(a) * math.cos(math.radians(fi)),
                                    math.sin(math.radians(fi)))) * Lb
            g[lado] = cot + Vector((0, 0, La)) + off[lado]
        return g

    fi0 = 90 - COTOVELO_CIMA
    fi1 = 0.0
    for _ in range(6):                           # desce até a pegada chegar 2 cm acima do peito, ao lado dele
        g1 = maos_no_angulo(fi1)
        y1 = (g1["Left"].y + g1["Right"].y) / 2
        sobra = g1["Left"].z - (dt.peito(bon, y1) + ACIMA_PEITO)
        fi1 -= math.degrees(math.asin(max(-1.0, min(1.0, sobra / Lb))))
    g1 = maos_no_angulo(fi1)
    print("HALTERES braço de %.0f° a %.0f° da horizontal | em cima E (%.3f %.3f %.3f) embaixo E (%.3f %.3f %.3f)"
          " | ombro E (%.3f %.3f %.3f)" % (fi0, fi1, *maos_no_angulo(fi0)["Left"], *g1["Left"], *S["Left"]))

    def pose(t):
        """t=0 braços estendidos em cima, t=1 halteres embaixo, ao lado do peito."""
        gs = maos_no_angulo(p3.lerp(fi0, fi1, t))
        for lado, _ in dt.LADOS:
            g = gs[lado]
            maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=dt.polo_cotovelo_baixo(S[lado], g - off[lado], Lb, La))
            eixo = pg._base(rig, lado)[1]                   # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    pose(1.0)                                    # polo certo do cotovelo na pose de baixo
    for lado, _ in dt.LADOS:
        maos.iks[lado].mute = False
        e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l, _ in dt.LADOS]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.2, 0.6),
                camera_video=((2.9, -2.3, 1.55), (0, 0.2, 0.6), 50), info=maos.info, apoios=[banco],
                afunda_apoio_mm=20)
